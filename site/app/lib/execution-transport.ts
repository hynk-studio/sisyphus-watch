import { z } from "zod";

import type { AnalysisErrorPacket } from "./analysis/contracts";
import { buildLineageRequest } from "./investigation-map";
import {
  validateSiteReadyCasePacket,
  type SiteReadyCasePacket,
} from "./lineage/contracts";
import { relayLineageUrl, type RelayConnection } from "./relay";
import type { DiscoveryProfile } from "./source-profile";

export type ExecutionTransport =
  | { kind: "relay"; connection: RelayConnection }
  | { kind: "operator_sponsored" };

export interface ExecutionTransportResult {
  payload: SiteReadyCasePacket | AnalysisErrorPacket;
  responseOk: boolean;
  retryAfter: string | null;
}

export class ExecutionTransportError extends Error {
  constructor(
    readonly code:
      | "relay_request_failed"
      | "relay_response_invalid"
      | "relay_response_not_live"
      | "operator_response_invalid",
    message: string,
  ) {
    super(message);
    this.name = "ExecutionTransportError";
  }
}

const analysisErrorPacketSchema = z.object({
  mode: z.literal("unavailable"),
  status: z.literal("error"),
  error: z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(1_000),
  }).strict(),
  canonical_mutation: z.literal("none"),
}).strict();

export async function executeInvestigationTransport(
  transport: ExecutionTransport,
  input: {
    question: string;
    sourceLimit: number;
    discoveryProfile: DiscoveryProfile;
  },
  fetcher: typeof fetch = fetch,
): Promise<ExecutionTransportResult> {
  const requestBody = JSON.stringify(buildLineageRequest(input));
  const isRelay = transport.kind === "relay";
  const target = isRelay
    ? relayLineageUrl(transport.connection.relay_base_url)
    : "/api/lineage";

  let response: Response;
  try {
    response = await fetcher(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
      ...(isRelay
        ? { credentials: "omit" as const, redirect: "error" as const }
        : { redirect: "error" as const }),
    });
  } catch {
    throw new ExecutionTransportError(
      isRelay ? "relay_request_failed" : "operator_response_invalid",
      isRelay
        ? "Your relay could not complete the investigation."
        : "The sponsored investigation route is unavailable.",
    );
  }

  let inputPayload: unknown;
  try {
    inputPayload = await response.json();
  } catch {
    throw new ExecutionTransportError(
      isRelay ? "relay_response_invalid" : "operator_response_invalid",
      isRelay
        ? "Your relay returned an invalid investigation response."
        : "The sponsored investigation route returned an invalid response.",
    );
  }

  if (!response.ok) {
    if (!isRelay) {
      const errorPacket = analysisErrorPacketSchema.safeParse(inputPayload);
      if (errorPacket.success) {
        return {
          payload: errorPacket.data,
          responseOk: false,
          retryAfter: response.headers.get("Retry-After"),
        };
      }
    }
    throw new ExecutionTransportError(
      isRelay ? "relay_request_failed" : "operator_response_invalid",
      isRelay
        ? "Your relay did not complete the investigation."
        : "The sponsored investigation route did not complete.",
    );
  }

  let packet: SiteReadyCasePacket;
  try {
    packet = validateSiteReadyCasePacket(inputPayload);
  } catch {
    throw new ExecutionTransportError(
      isRelay ? "relay_response_invalid" : "operator_response_invalid",
      isRelay
        ? "Your relay returned an incompatible investigation packet."
        : "The sponsored investigation route returned an incompatible packet.",
    );
  }
  if (isRelay && (packet.mode !== "live" || packet.status !== "live")) {
    throw new ExecutionTransportError(
      "relay_response_not_live",
      "Your relay did not return a live investigation packet.",
    );
  }
  if (
    isRelay
    && packet.contract_version !== transport.connection.lineage_response_contract
  ) {
    throw new ExecutionTransportError(
      "relay_response_invalid",
      "Your relay returned a different investigation contract than it advertised.",
    );
  }

  return {
    payload: packet,
    responseOk: true,
    retryAfter: response.headers.get("Retry-After"),
  };
}
