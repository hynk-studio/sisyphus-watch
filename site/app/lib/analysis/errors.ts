export type AnalysisFailureCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "api_timeout"
  | "workflow_deadline_exceeded"
  | "rate_limited"
  | "service_spend_limit_reached"
  | "web_search_failed"
  | "malformed_source_set"
  | "empty_source_set"
  | "structured_output_invalid"
  | "provider_failure";

const SAFE_MESSAGES: Record<AnalysisFailureCode, string> = {
  missing_api_key: "Live analysis is unavailable because the server API key is not configured.",
  invalid_api_key: "Live analysis could not authenticate with the analysis provider.",
  api_timeout: "Live analysis timed out before a bounded result was available.",
  workflow_deadline_exceeded:
    "The bounded investigation deadline was reached before a complete result was available.",
  rate_limited: "Live analysis is temporarily rate limited.",
  service_spend_limit_reached:
    "The live service budget boundary has been reached.",
  web_search_failed: "Live source discovery did not complete successfully.",
  malformed_source_set: "Live discovery returned source records that did not pass validation.",
  empty_source_set: "Live discovery did not return a usable source set.",
  structured_output_invalid: "Live extraction did not return a valid bounded structure.",
  provider_failure: "Live analysis did not complete successfully.",
};

export class AnalysisFailure extends Error {
  readonly code: AnalysisFailureCode;
  readonly safeMessage: string;

  constructor(code: AnalysisFailureCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "AnalysisFailure";
    this.code = code;
    this.safeMessage = SAFE_MESSAGES[code];
  }
}

export function classifyProviderError(error: unknown): AnalysisFailure {
  if (error instanceof AnalysisFailure) return error;

  const candidate = asErrorRecord(error);
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const nested = asErrorRecord(candidate.error);
  const code = typeof candidate.code === "string"
    ? candidate.code
    : typeof nested.code === "string"
      ? nested.code
      : null;
  const name = typeof candidate.name === "string" ? candidate.name : null;

  if (status === 401 || code === "invalid_api_key") {
    return new AnalysisFailure("invalid_api_key");
  }
  if (
    code === "credit_balance_exhausted"
    || code === "organization_spend_limit_exceeded"
    || code === "project_spend_limit_exceeded"
    || code === "organization_usage_limit_exceeded"
  ) {
    return new AnalysisFailure("service_spend_limit_reached");
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return new AnalysisFailure("rate_limited");
  }
  if (
    name === "AbortError" ||
    name === "APIUserAbortError" ||
    name === "APIConnectionTimeoutError" ||
    code === "ETIMEDOUT"
  ) {
    return new AnalysisFailure("api_timeout");
  }
  if (code === "web_search_failed") {
    return new AnalysisFailure("web_search_failed");
  }

  return new AnalysisFailure("provider_failure");
}

function asErrorRecord(error: unknown): Record<string, unknown> {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : {};
}
