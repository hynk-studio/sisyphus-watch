import { z } from "zod";

import { DISCOVERY_PROFILES } from "./source-profile";

export const RELAY_STORAGE_KEY = "sisyphus.relay.v1";
export const RELAY_CONNECTION_CONTRACT_VERSION =
  "sisyphus_relay_connection.v1";
export const RELAY_PROTOCOL_VERSION = "sisyphus_relay.v1";
export const RELAY_CAPABILITIES_CONTRACT_VERSION =
  "sisyphus_relay_capabilities.v1";
export const RELAY_LINEAGE_RESPONSE_CONTRACTS = [
  "site_ready_case_packet.v1",
  "site_ready_case_packet.v2",
] as const;
export type RelayLineageResponseContract =
  (typeof RELAY_LINEAGE_RESPONSE_CONTRACTS)[number];
export const RELAY_LINEAGE_RESPONSE_CONTRACT = "site_ready_case_packet.v2";
export const RELAY_STORAGE_MAX_BYTES = 4 * 1024;
export const RELAY_CAPABILITY_TIMEOUT_MS = 10_000;

export interface RelayNegotiationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RelayStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RelayCapabilities {
  contract_version: typeof RELAY_CAPABILITIES_CONTRACT_VERSION;
  lineage_response_contract: RelayLineageResponseContract;
  supported_source_limits: [3, 5];
  supported_discovery_profiles: ["standard", "coverage_expansion"];
  relay_display_name?: string;
}

export interface RelayConnection {
  contract_version: typeof RELAY_CONNECTION_CONTRACT_VERSION;
  relay_protocol_version: typeof RELAY_PROTOCOL_VERSION;
  relay_base_url: string;
  capabilities_contract_version: typeof RELAY_CAPABILITIES_CONTRACT_VERSION;
  lineage_response_contract: RelayLineageResponseContract;
  relay_display_name?: string;
  saved_at: string;
}

export type RelayConnectionReadResult =
  | { status: "empty" }
  | { status: "valid"; connection: RelayConnection }
  | { status: "invalid"; reason: "malformed" | "unsupported" | "oversized" }
  | { status: "unavailable" };

export type RelayConnectionMutationResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "oversized" | "unavailable" };

export class RelayContractError extends Error {
  constructor(
    readonly code:
      | "invalid_relay_url"
      | "insecure_relay_url"
      | "relay_capabilities_unavailable"
      | "relay_capabilities_incompatible"
      | "relay_capabilities_timeout"
      | "relay_capabilities_cancelled",
    message: string,
  ) {
    super(message);
    this.name = "RelayContractError";
  }
}

const relayDisplayNameSchema = z.string().trim().min(1).max(80);

const relayCapabilitiesSchema = z.object({
  contract_version: z.literal(RELAY_CAPABILITIES_CONTRACT_VERSION),
  lineage_response_contract: z.enum(RELAY_LINEAGE_RESPONSE_CONTRACTS),
  supported_source_limits: z.array(z.union([z.literal(3), z.literal(5)]))
    .min(1)
    .max(2),
  supported_discovery_profiles: z.array(z.enum(DISCOVERY_PROFILES))
    .min(1)
    .max(2),
  relay_display_name: relayDisplayNameSchema.optional(),
}).strict().superRefine((capabilities, context) => {
  if (
    capabilities.supported_source_limits.length !== 2
    || capabilities.supported_source_limits[0] !== 3
    || capabilities.supported_source_limits[1] !== 5
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["supported_source_limits"],
      message: "Relay v1 must support the bounded 3 and 5 source limits.",
    });
  }
  if (
    capabilities.supported_discovery_profiles.length !== 2
    || capabilities.supported_discovery_profiles[0] !== "standard"
    || capabilities.supported_discovery_profiles[1] !== "coverage_expansion"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["supported_discovery_profiles"],
      message: "Relay v1 must support both bounded discovery profiles.",
    });
  }
});

const relayConnectionSchema = z.object({
  contract_version: z.literal(RELAY_CONNECTION_CONTRACT_VERSION),
  relay_protocol_version: z.literal(RELAY_PROTOCOL_VERSION),
  relay_base_url: z.string().min(1).max(2_048),
  capabilities_contract_version: z.literal(
    RELAY_CAPABILITIES_CONTRACT_VERSION,
  ),
  lineage_response_contract: z.enum(RELAY_LINEAGE_RESPONSE_CONTRACTS),
  relay_display_name: relayDisplayNameSchema.optional(),
  saved_at: z.string().datetime({ offset: true }),
}).strict().superRefine((connection, context) => {
  try {
    if (normalizeRelayBaseUrl(connection.relay_base_url) !== connection.relay_base_url) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relay_base_url"],
        message: "Stored relay URL must already be normalized.",
      });
    }
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relay_base_url"],
      message: "Stored relay URL is invalid.",
    });
  }
});

export function normalizeRelayBaseUrl(input: string): string {
  const candidate = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new RelayContractError(
      "invalid_relay_url",
      "Enter a complete HTTPS relay URL.",
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new RelayContractError(
      "invalid_relay_url",
      "Relay URLs cannot contain credentials, query parameters, or fragments.",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new RelayContractError(
      "invalid_relay_url",
      "Relay URLs must use HTTPS.",
    );
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    throw new RelayContractError(
      "insecure_relay_url",
      "Relay URLs must use HTTPS. HTTP is allowed only for loopback development.",
    );
  }

  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/`;
  return parsed.toString();
}

export function relayCapabilitiesUrl(relayBaseUrl: string): string {
  return new URL("v1/capabilities", normalizeRelayBaseUrl(relayBaseUrl)).toString();
}

export function relayLineageUrl(relayBaseUrl: string): string {
  return new URL("v1/lineage", normalizeRelayBaseUrl(relayBaseUrl)).toString();
}

export function validateRelayCapabilities(input: unknown): RelayCapabilities {
  const parsed = relayCapabilitiesSchema.safeParse(input);
  if (!parsed.success) {
    throw new RelayContractError(
      "relay_capabilities_incompatible",
      "The relay does not advertise the complete Sisyphus Relay v1 contract.",
    );
  }
  return parsed.data as RelayCapabilities;
}

export async function negotiateRelayConnection(
  relayUrlInput: string,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
  options: RelayNegotiationOptions = {},
): Promise<RelayConnection> {
  const relayBaseUrl = normalizeRelayBaseUrl(relayUrlInput);
  if (options.signal?.aborted) {
    throw relayNegotiationAbortError("cancelled");
  }

  const timeoutMs = options.timeoutMs ?? RELAY_CAPABILITY_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Relay capability timeout must be a positive finite number.");
  }

  const controller = new AbortController();
  let abortReason: "cancelled" | "timeout" | null = null;
  let rejectAbort: (error: RelayContractError) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abortNegotiation = (reason: "cancelled" | "timeout") => {
    if (abortReason !== null) return;
    abortReason = reason;
    controller.abort();
    rejectAbort(relayNegotiationAbortError(reason));
  };
  const onExternalAbort = () => abortNegotiation("cancelled");
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) onExternalAbort();
  const timeout = setTimeout(() => abortNegotiation("timeout"), timeoutMs);

  try {
    if (abortReason !== null) throw relayNegotiationAbortError(abortReason);

    let response: Response;
    try {
      response = await Promise.race([
        fetcher(relayCapabilitiesUrl(relayBaseUrl), {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        }),
        aborted,
      ]);
    } catch (error) {
      if (error instanceof RelayContractError) throw error;
      if (abortReason !== null) throw relayNegotiationAbortError(abortReason);
      throw new RelayContractError(
        "relay_capabilities_unavailable",
        "The relay capability check could not be completed.",
      );
    }
    if (abortReason !== null) throw relayNegotiationAbortError(abortReason);
    if (!response.ok) {
      throw new RelayContractError(
        "relay_capabilities_unavailable",
        "The relay capability check did not succeed.",
      );
    }

    let capabilitiesInput: unknown;
    try {
      capabilitiesInput = await Promise.race([response.json(), aborted]);
    } catch (error) {
      if (error instanceof RelayContractError) throw error;
      if (abortReason !== null) throw relayNegotiationAbortError(abortReason);
      throw new RelayContractError(
        "relay_capabilities_incompatible",
        "The relay returned an invalid capability document.",
      );
    }
    if (abortReason !== null) throw relayNegotiationAbortError(abortReason);
    const capabilities = validateRelayCapabilities(capabilitiesInput);
    return {
      contract_version: RELAY_CONNECTION_CONTRACT_VERSION,
      relay_protocol_version: RELAY_PROTOCOL_VERSION,
      relay_base_url: relayBaseUrl,
      capabilities_contract_version: capabilities.contract_version,
      lineage_response_contract: capabilities.lineage_response_contract,
      ...(capabilities.relay_display_name
        ? { relay_display_name: capabilities.relay_display_name }
        : {}),
      saved_at: now.toISOString(),
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

function relayNegotiationAbortError(
  reason: "cancelled" | "timeout",
): RelayContractError {
  return reason === "timeout"
    ? new RelayContractError(
      "relay_capabilities_timeout",
      "The relay capability check timed out. Check that the relay is reachable and try again.",
    )
    : new RelayContractError(
      "relay_capabilities_cancelled",
      "Relay connection cancelled. No provider request was started.",
    );
}

export function readRelayConnection(
  storage: RelayStorage,
): RelayConnectionReadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(RELAY_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (serialized === null) return { status: "empty" };
  if (byteLength(serialized) > RELAY_STORAGE_MAX_BYTES) {
    return { status: "invalid", reason: "oversized" };
  }
  let input: unknown;
  try {
    input = JSON.parse(serialized);
  } catch {
    return { status: "invalid", reason: "malformed" };
  }
  const parsed = relayConnectionSchema.safeParse(input);
  return parsed.success
    ? { status: "valid", connection: parsed.data as RelayConnection }
    : { status: "invalid", reason: "unsupported" };
}

export function writeRelayConnection(
  storage: RelayStorage,
  connection: RelayConnection,
): RelayConnectionMutationResult {
  const parsed = relayConnectionSchema.safeParse(connection);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const serialized = JSON.stringify(parsed.data);
  if (byteLength(serialized) > RELAY_STORAGE_MAX_BYTES) {
    return { ok: false, reason: "oversized" };
  }
  try {
    storage.setItem(RELAY_STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function forgetRelayConnection(
  storage: RelayStorage,
): RelayConnectionMutationResult {
  try {
    storage.removeItem(RELAY_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1";
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
