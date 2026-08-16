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
}

export const PROVIDER_CALL_PLANNING_BOUNDS: readonly ProviderCallPlanningBound[] = [
  {
    sourceLimit: 3,
    discoveryProfile: "standard",
    discoveryRequests: 1,
    extractionRequests: 3,
    approximateTotalRequests: 4,
  },
  {
    sourceLimit: 3,
    discoveryProfile: "coverage_expansion",
    discoveryRequests: 2,
    extractionRequests: 3,
    approximateTotalRequests: 5,
  },
  {
    sourceLimit: 5,
    discoveryProfile: "standard",
    discoveryRequests: 1,
    extractionRequests: 5,
    approximateTotalRequests: 6,
  },
  {
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion",
    discoveryRequests: 2,
    extractionRequests: 5,
    approximateTotalRequests: 7,
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

  complete(requestId: number, _outcome: "success" | "failure"): boolean {
    void _outcome;
    if (this.activeRequestId !== requestId) return false;
    this.activeRequestId = null;
    this.acceptedResponseId = null;
    this.cooldownUntilMs = this.now() + this.cooldownMs;
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
  "rate_limited",
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
