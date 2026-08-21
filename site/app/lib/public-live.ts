import type { AnalysisErrorPacket } from "./analysis/contracts";
import type { AnalysisFailureCode } from "./analysis/errors";
import { PUBLIC_MAX_SOURCE_LIMIT } from "./analysis/contracts";
import type { SiteReadyCasePacket } from "./lineage/contracts";
import type { DiscoveryProfile } from "./source-profile";

export const PUBLIC_LIVE_COOLDOWN_MS = 30_000;

export interface ProviderCallPlanningBound {
  sourceLimit: 3 | 5;
  discoveryProfile: DiscoveryProfile;
  discoveryRequests: 1 | 2;
  extractionRequests: 3 | 5;
  approximateTotalRequests: 4 | 5 | 6 | 7;
  reservedWorkUnits: 6 | 8 | 9 | 11;
}

export const PROVIDER_CALL_PLANNING_BOUNDS: readonly ProviderCallPlanningBound[] = [
  {
    sourceLimit: 3,
    discoveryProfile: "standard",
    discoveryRequests: 1,
    extractionRequests: 3,
    approximateTotalRequests: 4,
    reservedWorkUnits: 6,
  },
  {
    sourceLimit: 3,
    discoveryProfile: "coverage_expansion",
    discoveryRequests: 2,
    extractionRequests: 3,
    approximateTotalRequests: 5,
    reservedWorkUnits: 9,
  },
  {
    sourceLimit: 5,
    discoveryProfile: "standard",
    discoveryRequests: 1,
    extractionRequests: 5,
    approximateTotalRequests: 6,
    reservedWorkUnits: 8,
  },
  {
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion",
    discoveryRequests: 2,
    extractionRequests: 5,
    approximateTotalRequests: 7,
    reservedWorkUnits: 11,
  },
] as const;

export function publicRerunSourceLimit(requestedSourceLimit: number): number {
  return Math.min(requestedSourceLimit, PUBLIC_MAX_SOURCE_LIMIT);
}

export interface PublicLiveRunGuardState {
  inFlight: boolean;
  activeRequestId: number | null;
  cooldownUntilMs: number;
  cooldownRemainingSeconds: number;
}

export class PublicLiveRunGuard {
  private readonly now: () => number;
  private readonly cooldownMs: number;
  private nextRequestId = 1;
  private activeRequestId: number | null = null;
  private acceptedResponseId: number | null = null;
  private cooldownUntilMs = 0;

  constructor(options: { now?: () => number; cooldownMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.cooldownMs = options.cooldownMs ?? PUBLIC_LIVE_COOLDOWN_MS;
  }

  begin(): number | null {
    if (this.activeRequestId !== null || this.cooldownRemainingSeconds() > 0) {
      return null;
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    this.activeRequestId = requestId;
    this.acceptedResponseId = requestId;
    return requestId;
  }

  acceptsResponse(requestId: number): boolean {
    return this.activeRequestId === requestId && this.acceptedResponseId === requestId;
  }

  invalidateResponse(): void {
    this.acceptedResponseId = null;
  }

  complete(
    requestId: number,
    _outcome: "success" | "failure",
    minimumCooldownSeconds = 0,
  ): boolean {
    void _outcome;
    if (this.activeRequestId !== requestId) return false;
    this.activeRequestId = null;
    this.acceptedResponseId = null;
    this.cooldownUntilMs = this.now() + Math.max(
      this.cooldownMs,
      Math.max(0, minimumCooldownSeconds) * 1_000,
    );
    return true;
  }

  cooldownRemainingSeconds(): number {
    return Math.max(0, Math.ceil((this.cooldownUntilMs - this.now()) / 1_000));
  }

  state(): PublicLiveRunGuardState {
    return {
      inFlight: this.activeRequestId !== null,
      activeRequestId: this.activeRequestId,
      cooldownUntilMs: this.cooldownUntilMs,
      cooldownRemainingSeconds: this.cooldownRemainingSeconds(),
    };
  }
}

const PUBLIC_FAILURE_CODES: readonly AnalysisFailureCode[] = [
  "missing_api_key",
  "invalid_api_key",
  "api_timeout",
  "workflow_deadline_exceeded",
  "rate_limited",
  "service_spend_limit_reached",
  "web_search_failed",
  "malformed_source_set",
  "empty_source_set",
  "structured_output_invalid",
  "provider_failure",
];

export function fallbackFailureCode(
  packet: SiteReadyCasePacket,
): AnalysisFailureCode | null {
  if (packet.mode !== "fallback") return null;
  const prefix = packet.warnings[0]?.split(":", 1)[0];
  return PUBLIC_FAILURE_CODES.find((code) => code === prefix) ?? null;
}

export function safePublicFailureMessage(packet: SiteReadyCasePacket): string {
  const code = fallbackFailureCode(packet);
  if (code === "rate_limited") {
    return "The live request was rate limited.";
  }
  if (code === "api_timeout") {
    return "The live provider request timed out.";
  }
  return "The live investigation is unavailable.";
}

export function safePublicRouteErrorMessage(
  code: string,
  message: string,
  retryAfterSeconds: number,
): string {
  if (code === "capacity_exhausted") {
    return retryAfterSeconds > 0
      ? `Operator-sponsored capacity is currently full. Try again in about ${retryAfterSeconds} seconds.`
      : "Operator-sponsored capacity is currently full. Try again later.";
  }
  if (code === "service_spend_limit_reached") {
    return "The live service budget boundary has been reached.";
  }
  if (code === "workflow_deadline_exceeded") {
    return "The bounded investigation deadline was reached before a complete result was available.";
  }
  return message;
}

export type PublicRunResponseDecision =
  | { kind: "replace"; packet: SiteReadyCasePacket }
  | { kind: "preserve"; message: string };

export function decidePublicRunResponse(
  payload: SiteReadyCasePacket | AnalysisErrorPacket,
  options: {
    responseOk: boolean;
    hadDisplayedInvestigation: boolean;
    retryAfterSeconds: number;
  },
): PublicRunResponseDecision {
  if (payload.status === "error") {
    return {
      kind: "preserve",
      message: safePublicRouteErrorMessage(
        payload.error.code,
        payload.error.message,
        options.retryAfterSeconds,
      ),
    };
  }
  if (!options.responseOk) {
    return {
      kind: "preserve",
      message: "The bounded investigation request did not complete.",
    };
  }
  if (payload.mode === "fallback" && options.hadDisplayedInvestigation) {
    return { kind: "preserve", message: safePublicFailureMessage(payload) };
  }
  return { kind: "replace", packet: payload };
}
