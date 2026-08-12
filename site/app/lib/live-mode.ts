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

export async function isLiveAnalysisEnabledOnServer(): Promise<boolean> {
  return isLiveAnalysisEnabled(
    await getServerEnvironmentValue(LIVE_MODE_ENVIRONMENT_FLAG),
  );
}

export function liveAnalysisDisabledResponse(): Response {
  return Response.json(
    {
      mode: "fallback",
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
