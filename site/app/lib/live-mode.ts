import {
  D1PublicAdmissionStore,
  PUBLIC_ADMISSION_BINDING,
  inspectD1DatabaseBinding,
  type PublicAdmissionStore,
} from "./public-admission";
import {
  consolePublicLiveDiagnosticSink,
  noopPublicLiveDiagnosticSink,
  reportPublicLiveDiagnostic,
  type PublicLiveDiagnosticSink,
} from "./public-live-diagnostics";

export const LIVE_MODE_ENVIRONMENT_FLAG = "SISYPHUS_LIVE_ENABLED";
export const OPERATOR_LIVE_ENVIRONMENT_FLAG =
  "SISYPHUS_OPERATOR_LIVE_ENABLED";
export const OPENAI_KEY_ENVIRONMENT_NAME = "OPENAI_API_KEY";

export function isLiveAnalysisEnabled(
  value: string | undefined,
): boolean {
  return value?.trim().toLowerCase() === "true";
}

export async function getServerEnvironmentValue(
  name: string,
): Promise<string | undefined> {
  try {
    const runtime = await import("cloudflare:workers");
    const value = (runtime.env as unknown as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  } catch {
    // Unit tests and non-Worker scripts intentionally use the process fallback.
  }
  return process.env[name];
}

export async function getServerEnvironmentBinding(
  name: string,
): Promise<unknown> {
  return (await resolveServerEnvironmentBinding(name)).value;
}

export interface ServerEnvironmentBindingResolution {
  value: unknown;
  workerEnvironmentImportSucceeded: boolean;
}

export async function resolveServerEnvironmentBinding(
  name: string,
): Promise<ServerEnvironmentBindingResolution> {
  try {
    const runtime = await import("cloudflare:workers");
    return {
      value: (runtime.env as unknown as Record<string, unknown>)[name],
      workerEnvironmentImportSucceeded: true,
    };
  } catch {
    return {
      value: undefined,
      workerEnvironmentImportSucceeded: false,
    };
  }
}

export async function isLiveAnalysisEnabledOnServer(): Promise<boolean> {
  return isLiveAnalysisEnabled(
    await getServerEnvironmentValue(LIVE_MODE_ENVIRONMENT_FLAG),
  );
}

export interface PublicLiveRuntime {
  operatorLiveEnabled: boolean;
  liveEnabled: boolean;
  apiKey: string | undefined;
  admission: PublicAdmissionStore | null;
  diagnostics?: PublicLiveRuntimeDiagnostics;
}

export interface PublicLiveRuntimeDiagnostics {
  sink: PublicLiveDiagnosticSink;
  workerEnvironmentImportSucceeded: boolean;
  dbBindingPresent: boolean;
  prepareCallable: boolean;
  batchCallable: boolean;
}

export interface PublicLiveRuntimeDependencies {
  diagnostics?: PublicLiveDiagnosticSink;
  readEnvironmentValue?: (name: string) => Promise<string | undefined>;
  resolveEnvironmentBinding?: (
    name: string,
  ) => Promise<ServerEnvironmentBindingResolution>;
}

export async function getPublicLiveRuntime(
  dependencies: PublicLiveRuntimeDependencies = {},
): Promise<PublicLiveRuntime> {
  const diagnostics =
    dependencies.diagnostics ?? consolePublicLiveDiagnosticSink;
  const readEnvironmentValue =
    dependencies.readEnvironmentValue ?? getServerEnvironmentValue;
  const resolveEnvironmentBinding =
    dependencies.resolveEnvironmentBinding ?? resolveServerEnvironmentBinding;
  const operatorLiveEnabled = isLiveAnalysisEnabled(
    await readEnvironmentValue(OPERATOR_LIVE_ENVIRONMENT_FLAG),
  );
  if (!operatorLiveEnabled) {
    return {
      operatorLiveEnabled: false,
      liveEnabled: false,
      apiKey: undefined,
      admission: null,
      diagnostics: {
        sink: diagnostics,
        workerEnvironmentImportSucceeded: false,
        dbBindingPresent: false,
        prepareCallable: false,
        batchCallable: false,
      },
    };
  }
  const liveEnabled = isLiveAnalysisEnabled(
    await readEnvironmentValue(LIVE_MODE_ENVIRONMENT_FLAG),
  );
  if (!liveEnabled) {
    return {
      operatorLiveEnabled: true,
      liveEnabled: false,
      apiKey: undefined,
      admission: null,
      diagnostics: {
        sink: diagnostics,
        workerEnvironmentImportSucceeded: false,
        dbBindingPresent: false,
        prepareCallable: false,
        batchCallable: false,
      },
    };
  }

  const apiKey = await readEnvironmentValue(OPENAI_KEY_ENVIRONMENT_NAME);
  const bindingResolution = await resolveEnvironmentBinding(
    PUBLIC_ADMISSION_BINDING,
  );
  const bindingShape = inspectD1DatabaseBinding(bindingResolution.value);
  return {
    operatorLiveEnabled,
    liveEnabled,
    apiKey,
    admission: bindingShape.database
      ? new D1PublicAdmissionStore(bindingShape.database)
      : null,
    diagnostics: {
      sink: diagnostics,
      workerEnvironmentImportSucceeded:
        bindingResolution.workerEnvironmentImportSucceeded,
      dbBindingPresent: bindingShape.bindingPresent,
      prepareCallable: bindingShape.prepareCallable,
      batchCallable: bindingShape.batchCallable,
    },
  };
}

export async function isPublicLiveReady(
  runtime: PublicLiveRuntime,
  diagnostics: PublicLiveDiagnosticSink =
    runtime.diagnostics?.sink ?? noopPublicLiveDiagnosticSink,
): Promise<boolean> {
  if (reportPublicLiveRuntimePrerequisiteFailure(runtime, diagnostics)) {
    return false;
  }
  const ready = await runtime.admission!.isReady();
  if (!ready) {
    reportPublicLiveDiagnostic(diagnostics, "schema_probe_failed");
    return false;
  }
  reportPublicLiveDiagnostic(
    diagnostics,
    "runtime_ready",
    runtimeDiagnosticFacts(runtime),
  );
  return true;
}

export async function isPublicLiveReadyOnServer(): Promise<boolean> {
  return isOperatorSponsoredLiveReadyOnServer();
}

export async function isOperatorSponsoredLiveReadyOnServer(): Promise<boolean> {
  return isPublicLiveReady(await getPublicLiveRuntime());
}

export function reportPublicLiveRuntimePrerequisiteFailure(
  runtime: PublicLiveRuntime,
  diagnostics: PublicLiveDiagnosticSink =
    runtime.diagnostics?.sink ?? noopPublicLiveDiagnosticSink,
): boolean {
  if (!runtime.operatorLiveEnabled) {
    reportPublicLiveDiagnostic(diagnostics, "operator_live_flag_disabled", {
      operatorLiveEnabled: false,
    });
    return true;
  }
  if (!runtime.liveEnabled) {
    reportPublicLiveDiagnostic(diagnostics, "live_flag_disabled", {
      operatorLiveEnabled: true,
      liveFlagEnabled: false,
    });
    return true;
  }
  if (!runtime.apiKey?.trim()) {
    reportPublicLiveDiagnostic(diagnostics, "api_key_missing", {
      operatorLiveEnabled: true,
      liveFlagEnabled: true,
      apiKeyPresent: false,
    });
    return true;
  }
  if (!runtime.admission) {
    const facts = runtimeDiagnosticFacts(runtime);
    const invalidShape = runtime.diagnostics?.dbBindingPresent
      && (!runtime.diagnostics.prepareCallable
        || !runtime.diagnostics.batchCallable);
    reportPublicLiveDiagnostic(
      diagnostics,
      invalidShape ? "db_binding_invalid_shape" : "db_binding_missing",
      facts,
    );
    return true;
  }
  return false;
}

function runtimeDiagnosticFacts(runtime: PublicLiveRuntime) {
  return {
    operatorLiveEnabled: runtime.operatorLiveEnabled,
    liveFlagEnabled: runtime.liveEnabled,
    apiKeyPresent: Boolean(runtime.apiKey?.trim()),
    workerEnvironmentImportSucceeded:
      runtime.diagnostics?.workerEnvironmentImportSucceeded,
    dbBindingPresent: runtime.diagnostics?.dbBindingPresent,
    prepareCallable: runtime.diagnostics?.prepareCallable,
    batchCallable: runtime.diagnostics?.batchCallable,
  };
}

export function operatorSponsoredLiveDisabledResponse(): Response {
  return Response.json(
    {
      mode: "unavailable",
      status: "error",
      error: {
        code: "operator_sponsored_live_disabled",
        message:
          "Operator-sponsored live investigation is not enabled. The prepared investigation and user relay path remain available.",
      },
      canonical_mutation: "none",
    },
    { status: 503 },
  );
}

export function liveAnalysisDisabledResponse(): Response {
  return Response.json(
    {
      mode: "unavailable",
      status: "error",
      error: {
        code: "live_analysis_disabled",
        message:
          "Live analysis is disabled. The prepared community case remains available.",
      },
      canonical_mutation: "none",
    },
    { status: 503 },
  );
}
