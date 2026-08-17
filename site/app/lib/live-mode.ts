import {
  D1PublicAdmissionStore,
  PUBLIC_ADMISSION_BINDING,
  asD1Database,
  type PublicAdmissionStore,
} from "./public-admission";

export const LIVE_MODE_ENVIRONMENT_FLAG = "SISYPHUS_LIVE_ENABLED";
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
  try {
    const runtime = await import("cloudflare:workers");
    return (runtime.env as unknown as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
}

export async function isLiveAnalysisEnabledOnServer(): Promise<boolean> {
  return isLiveAnalysisEnabled(
    await getServerEnvironmentValue(LIVE_MODE_ENVIRONMENT_FLAG),
  );
}

export interface PublicLiveRuntime {
  liveEnabled: boolean;
  apiKey: string | undefined;
  admission: PublicAdmissionStore | null;
}

export async function getPublicLiveRuntime(): Promise<PublicLiveRuntime> {
  const liveEnabled = await isLiveAnalysisEnabledOnServer();
  if (!liveEnabled) {
    return { liveEnabled: false, apiKey: undefined, admission: null };
  }

  const apiKey = await getServerEnvironmentValue(OPENAI_KEY_ENVIRONMENT_NAME);
  const database = asD1Database(
    await getServerEnvironmentBinding(PUBLIC_ADMISSION_BINDING),
  );
  return {
    liveEnabled,
    apiKey,
    admission: database ? new D1PublicAdmissionStore(database) : null,
  };
}

export async function isPublicLiveReady(
  runtime: PublicLiveRuntime,
): Promise<boolean> {
  if (!runtime.liveEnabled || !runtime.apiKey?.trim() || !runtime.admission) {
    return false;
  }
  return runtime.admission.isReady();
}

export async function isPublicLiveReadyOnServer(): Promise<boolean> {
  return isPublicLiveReady(await getPublicLiveRuntime());
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
