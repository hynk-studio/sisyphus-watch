export const PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE =
  "sisyphus_public_live_runtime";

export const PUBLIC_LIVE_DIAGNOSTIC_STAGES = [
  "operator_live_flag_disabled",
  "live_flag_disabled",
  "api_key_missing",
  "db_binding_missing",
  "db_binding_invalid_shape",
  "schema_probe_failed",
  "runtime_ready",
  "runtime_resolution_failed",
  "reserve_entered",
  "reserve_failed",
  "reserve_succeeded",
  "settlement_failed",
] as const;

export type PublicLiveDiagnosticStage =
  (typeof PUBLIC_LIVE_DIAGNOSTIC_STAGES)[number];

export interface PublicLiveDiagnosticEvent {
  event: typeof PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE;
  stage: PublicLiveDiagnosticStage;
  operator_live_enabled?: boolean;
  live_flag_enabled?: boolean;
  api_key_present?: boolean;
  worker_environment_import_succeeded?: boolean;
  db_binding_present?: boolean;
  prepare_callable?: boolean;
  batch_callable?: boolean;
  reservation_admitted?: boolean;
  error_name?: string;
  error_code?: string | number;
}

export type PublicLiveDiagnosticSink = (
  event: Readonly<PublicLiveDiagnosticEvent>,
) => void;

export interface PublicLiveDiagnosticFacts {
  operatorLiveEnabled?: boolean;
  liveFlagEnabled?: boolean;
  apiKeyPresent?: boolean;
  workerEnvironmentImportSucceeded?: boolean;
  dbBindingPresent?: boolean;
  prepareCallable?: boolean;
  batchCallable?: boolean;
  reservationAdmitted?: boolean;
  error?: unknown;
}

export const noopPublicLiveDiagnosticSink: PublicLiveDiagnosticSink = () => {};

export const consolePublicLiveDiagnosticSink: PublicLiveDiagnosticSink =
  (event) => {
    console.info(JSON.stringify(event));
  };

export function createPublicLiveDiagnosticEvent(
  stage: PublicLiveDiagnosticStage,
  facts: PublicLiveDiagnosticFacts = {},
): PublicLiveDiagnosticEvent {
  const event: PublicLiveDiagnosticEvent = {
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage,
  };

  copyBoolean(
    event,
    "operator_live_enabled",
    facts.operatorLiveEnabled,
  );
  copyBoolean(event, "live_flag_enabled", facts.liveFlagEnabled);
  copyBoolean(event, "api_key_present", facts.apiKeyPresent);
  copyBoolean(
    event,
    "worker_environment_import_succeeded",
    facts.workerEnvironmentImportSucceeded,
  );
  copyBoolean(event, "db_binding_present", facts.dbBindingPresent);
  copyBoolean(event, "prepare_callable", facts.prepareCallable);
  copyBoolean(event, "batch_callable", facts.batchCallable);
  copyBoolean(event, "reservation_admitted", facts.reservationAdmitted);

  const errorMetadata = sanitizedErrorMetadata(facts.error);
  if (errorMetadata.errorName !== undefined) {
    event.error_name = errorMetadata.errorName;
  }
  if (errorMetadata.errorCode !== undefined) {
    event.error_code = errorMetadata.errorCode;
  }

  return event;
}

export function reportPublicLiveDiagnostic(
  sink: PublicLiveDiagnosticSink,
  stage: PublicLiveDiagnosticStage,
  facts: PublicLiveDiagnosticFacts = {},
): void {
  sink(createPublicLiveDiagnosticEvent(stage, facts));
}

function copyBoolean(
  event: PublicLiveDiagnosticEvent,
  key: keyof PublicLiveDiagnosticEvent,
  value: boolean | undefined,
): void {
  if (typeof value === "boolean") {
    Object.assign(event, { [key]: value });
  }
}

function sanitizedErrorMetadata(error: unknown): {
  errorName?: string;
  errorCode?: string | number;
} {
  if ((typeof error !== "object" && typeof error !== "function") || !error) {
    return {};
  }

  let errorName: string | undefined;
  try {
    const constructor = Object.getPrototypeOf(error)?.constructor;
    if (typeof constructor === "function") {
      errorName = boundedDiagnosticToken(constructor.name);
    }
  } catch {
    // Proxies and exotic runtime errors may reject introspection.
  }

  let errorCode: string | number | undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    if (descriptor && "value" in descriptor) {
      if (typeof descriptor.value === "string") {
        errorCode = boundedDiagnosticToken(descriptor.value);
      } else if (
        typeof descriptor.value === "number"
        && Number.isSafeInteger(descriptor.value)
      ) {
        errorCode = descriptor.value;
      }
    }
  } catch {
    // Error-code introspection is optional and must fail closed.
  }

  return { errorName, errorCode };
}

function boundedDiagnosticToken(value: string): string | undefined {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(value)
    ? value
    : undefined;
}
