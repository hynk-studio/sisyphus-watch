import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchComposer } from "../app/components/SearchComposer";
import {
  ExecutionTransportError,
  executeInvestigationTransport,
} from "../app/lib/execution-transport";
import { compareInvestigationSnapshots } from "../app/lib/investigation-delta";
import {
  advanceLocalWatch,
  createLocalWatch,
} from "../app/lib/local-watch";
import {
  RELAY_STORAGE_KEY,
  RELAY_CAPABILITY_TIMEOUT_MS,
  RelayContractError,
  forgetRelayConnection,
  negotiateRelayConnection,
  normalizeRelayBaseUrl,
  readRelayConnection,
  validateRelayCapabilities,
  writeRelayConnection,
  type RelayConnection,
  type RelayStorage,
} from "../app/lib/relay";
import {
  buildSavedWatchFallbackPacket,
  buildSavedWatchPacketA,
  buildSavedWatchPacketB,
} from "./fixtures/saved-watch";
import { buildSourceSupportedSitePacketV2Fixture } from "./fixtures/source-supported-site-packet";

const CAPABILITIES = {
  contract_version: "sisyphus_relay_capabilities.v1",
  lineage_response_contract: "site_ready_case_packet.v1",
  supported_source_limits: [3, 5],
  supported_discovery_profiles: ["standard", "coverage_expansion"],
  relay_display_name: "Civic evidence relay",
} as const;

const REQUEST = {
  question: "How is public access changing for residents?",
  sourceLimit: 3,
  discoveryProfile: "standard" as const,
};

class MemoryStorage implements RelayStorage {
  readonly values = new Map<string, string>();
  getCount = 0;
  setCount = 0;
  removeCount = 0;

  getItem(key: string): string | null {
    this.getCount += 1;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCount += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removeCount += 1;
    this.values.delete(key);
  }
}

test("relay URL validation normalizes HTTPS and isolates loopback HTTP", () => {
  assert.equal(
    normalizeRelayBaseUrl(" HTTPS://Relay.Example:443/team "),
    "https://relay.example/team/",
  );
  assert.equal(
    normalizeRelayBaseUrl("http://127.0.0.1:8787/relay"),
    "http://127.0.0.1:8787/relay/",
  );
  assert.equal(
    normalizeRelayBaseUrl("http://[::1]:8787"),
    "http://[::1]:8787/",
  );

  for (const value of [
    "javascript:alert(1)",
    "data:text/plain,relay",
    "file:///tmp/relay",
    "ftp://relay.example",
    "http://relay.example",
    "https://user:password@relay.example",
    "https://relay.example/?token=secret",
    "https://relay.example/#credential",
    "not a url",
  ]) {
    assert.throws(() => normalizeRelayBaseUrl(value), RelayContractError);
  }
});

test("the public connection UI has one URL field and no provider-key input", () => {
  const noop = () => undefined;
  const html = renderToStaticMarkup(createElement(SearchComposer, {
    question: "",
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: false,
    relayFormOpen: true,
    isLoading: false,
    cooldownRemainingSeconds: 0,
    routeError: null,
    investigationStarted: false,
    onQuestionChange: noop,
    onSourceLimitChange: noop,
    onDiscoveryProfileChange: noop,
    onSubmit: noop,
    onPreparedExample: noop,
  }));
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  const urlInputs = inputs.filter((input) => /type="url"/.test(input));
  assert.equal(urlInputs.length, 1);
  assert.match(urlInputs[0], /name="relay-url"/);
  assert.doesNotMatch(urlInputs[0], /api.?key|provider.?key|authorization|bearer/i);
  assert.doesNotMatch(html, /sk-(?:proj-)?/i);
  assert.match(html, /What is a Relay\?/i);
  assert.match(html, /A Relay is a small backend you control/i);
  assert.match(html, /using your own OpenAI API key/i);
  assert.match(html, /Your API key stays on the Relay/i);
  assert.match(html, /this Site connects only to its URL/i);
  assert.match(html, /How to set up a Relay/i);

  const connectingHtml = renderToStaticMarkup(createElement(SearchComposer, {
    question: "",
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: false,
    relayFormOpen: true,
    relayConnecting: true,
    isLoading: false,
    cooldownRemainingSeconds: 0,
    routeError: null,
    investigationStarted: false,
    onQuestionChange: noop,
    onSourceLimitChange: noop,
    onDiscoveryProfileChange: noop,
    onSubmit: noop,
    onPreparedExample: noop,
  }));
  const buttons = connectingHtml.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const connectButton = buttons.find((button) => /Connecting…/.test(button)) ?? "";
  const cancelButton = buttons.find((button) => />Cancel<\/button>/.test(button)) ?? "";
  assert.match(connectButton, /disabled=""/);
  assert.doesNotMatch(cancelButton, /disabled=""/);
});

test("capability negotiation is explicit, credentialless, and persists only afterward", async () => {
  const storage = new MemoryStorage();
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Response.json(CAPABILITIES);
  }) as typeof fetch;

  assert.deepEqual(readRelayConnection(storage), { status: "empty" });
  const connection = await negotiateRelayConnection(
    "https://relay.example/team",
    fetcher,
    new Date("2026-08-21T01:02:03.000Z"),
  );
  assert.equal(storage.setCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://relay.example/team/v1/capabilities");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[0].init?.credentials, "omit");
  assert.equal(calls[0].init?.redirect, "error");
  assert.deepEqual(calls[0].init?.headers, { accept: "application/json" });
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
  assert.equal(RELAY_CAPABILITY_TIMEOUT_MS, 10_000);

  assert.deepEqual(writeRelayConnection(storage, connection), { ok: true });
  assert.equal(storage.setCount, 1);
  assert.deepEqual(readRelayConnection(storage), {
    status: "valid",
    connection,
  });
  const serialized = storage.values.get(RELAY_STORAGE_KEY) ?? "";
  assert.doesNotMatch(
    serialized,
    /apiKey|openaiApiKey|providerKey|authorization|bearer|cookie|identity|result/i,
  );
});

test("Relay capability negotiation accepts and preserves either exact Site response contract", async () => {
  for (const lineageResponseContract of [
    "site_ready_case_packet.v1",
    "site_ready_case_packet.v2",
  ] as const) {
    const capabilities = {
      ...CAPABILITIES,
      lineage_response_contract: lineageResponseContract,
    };
    assert.equal(
      validateRelayCapabilities(capabilities).lineage_response_contract,
      lineageResponseContract,
    );
    const connection = await negotiateRelayConnection(
      "https://relay.example",
      (async () => Response.json(capabilities)) as typeof fetch,
      new Date("2026-08-21T01:02:03.000Z"),
    );
    assert.equal(connection.lineage_response_contract, lineageResponseContract);
  }
});

test("capability negotiation times out once, aborts the fetch, and cannot later succeed", async () => {
  let callCount = 0;
  let fetchSignal: AbortSignal = new AbortController().signal;
  let resolveFetch: ((response: Response) => void) | null = null;
  const fetcher = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    callCount += 1;
    if (init?.signal instanceof AbortSignal) fetchSignal = init.signal;
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  }) as typeof fetch;

  let succeeded = false;
  const negotiation = negotiateRelayConnection(
    "https://relay.example",
    fetcher,
    new Date("2026-08-21T01:02:03.000Z"),
    { timeoutMs: 5 },
  ).then((connection) => {
    succeeded = true;
    return connection;
  });

  await assert.rejects(
    negotiation,
    (error: unknown) => error instanceof RelayContractError
      && error.code === "relay_capabilities_timeout"
      && /timed out/i.test(error.message),
  );
  assert.equal(callCount, 1);
  assert.equal(fetchSignal.aborted, true);
  assert.equal(succeeded, false);

  const completeLateFetch = resolveFetch as ((response: Response) => void) | null;
  completeLateFetch?.(Response.json(CAPABILITIES));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(succeeded, false);
  assert.equal(callCount, 1);
});

test("external cancellation aborts exactly one capability request and rejects stale success", async () => {
  const controller = new AbortController();
  let callCount = 0;
  let fetchSignal: AbortSignal = new AbortController().signal;
  let resolveFetch: ((response: Response) => void) | null = null;
  const fetcher = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    callCount += 1;
    if (init?.signal instanceof AbortSignal) fetchSignal = init.signal;
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  }) as typeof fetch;

  let succeeded = false;
  const negotiation = negotiateRelayConnection(
    "https://relay.example",
    fetcher,
    new Date("2026-08-21T01:02:03.000Z"),
    { signal: controller.signal, timeoutMs: 1_000 },
  ).then((connection) => {
    succeeded = true;
    return connection;
  });
  await Promise.resolve();
  controller.abort();

  await assert.rejects(
    negotiation,
    (error: unknown) => error instanceof RelayContractError
      && error.code === "relay_capabilities_cancelled"
      && /No provider request was started/i.test(error.message),
  );
  assert.equal(callCount, 1);
  assert.equal(fetchSignal.aborted, true);
  assert.equal(succeeded, false);

  const completeLateFetch = resolveFetch as ((response: Response) => void) | null;
  completeLateFetch?.(Response.json(CAPABILITIES));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(succeeded, false);
  assert.equal(callCount, 1);
});

test("an already-aborted capability negotiation fails before network work", async () => {
  const controller = new AbortController();
  controller.abort();
  let callCount = 0;

  await assert.rejects(
    negotiateRelayConnection(
      "https://relay.example",
      (async () => {
        callCount += 1;
        return Response.json(CAPABILITIES);
      }) as typeof fetch,
      new Date("2026-08-21T01:02:03.000Z"),
      { signal: controller.signal, timeoutMs: 5 },
    ),
    (error: unknown) => error instanceof RelayContractError
      && error.code === "relay_capabilities_cancelled",
  );
  assert.equal(callCount, 0);
});

test("the component cancellation path aborts and invalidates without mutating Relay ownership", () => {
  const source = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  const cancelStart = source.indexOf("function cancelRelayConnection()");
  const cancelEnd = source.indexOf("function disconnectRelay()", cancelStart);
  assert.ok(cancelStart > 0 && cancelEnd > cancelStart);
  const cancelSource = source.slice(cancelStart, cancelEnd);
  assert.match(cancelSource, /relayConnectionGeneration\.current \+= 1/);
  assert.match(cancelSource, /controller\.abort\(\)/);
  assert.match(cancelSource, /setRelayConnecting\(false\)/);
  assert.match(cancelSource, /setRelayFormOpen\(false\)/);
  assert.match(cancelSource, /No provider request was started/);
  assert.match(cancelSource, /"relay-connect-toggle"/);
  assert.match(cancelSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(cancelSource, /window\.scrollTo\(\{ top: scrollY, left: scrollX, behavior: "instant" \}\)/);
  assert.doesNotMatch(
    cancelSource,
    /setActiveRelay|setStoredRelay|setSelectedExecutionKind|writeRelayConnection|forgetRelayConnection/,
  );
  assert.doesNotMatch(
    cancelSource,
    /setQuestion|setSourceLimit|setDiscoveryProfile|executeInvestigationTransport|runAnalysis/,
  );

  const connectStart = source.indexOf("async function connectRelay()");
  const connectEnd = source.indexOf("function cancelRelayConnection()", connectStart);
  const connectSource = source.slice(connectStart, connectEnd);
  assert.match(connectSource, /\{ signal: controller\.signal \}/);
  assert.ok(
    connectSource.indexOf("generation !== relayConnectionGeneration.current")
      < connectSource.indexOf("writeRelayConnection"),
  );
  assert.match(connectSource, /setRelayError/);
  assert.match(connectSource, /setRelayConnecting\(false\)/);
  assert.match(connectSource, /"build-investigation-map"/);
  assert.match(connectSource, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(
    connectSource,
    /setQuestion|setSourceLimit|setDiscoveryProfile|executeInvestigationTransport|runAnalysis|\/v1\/lineage|\/api\/lineage/,
  );
  assert.match(
    source,
    /useEffect\(\(\) => \(\) => \{[\s\S]*?relayConnectionAbort\.current\?\.abort\(\)/,
  );
  assert.match(source, /onCancelRelay=\{cancelRelayConnection\}/);
});

test("invalid capabilities fail closed without a persistence opportunity", async () => {
  for (const capabilities of [
    { ...CAPABILITIES, contract_version: "unsupported.v2" },
    { ...CAPABILITIES, lineage_response_contract: "site_ready_case_packet.v3" },
    { ...CAPABILITIES, lineage_response_contract: "site_ready_case_packet" },
    { ...CAPABILITIES, lineage_response_contract: "arbitrary" },
    { ...CAPABILITIES, supported_source_limits: [3] },
    { ...CAPABILITIES, supported_discovery_profiles: ["standard"] },
    { ...CAPABILITIES, provider: "secret-provider-detail" },
  ]) {
    assert.throws(
      () => validateRelayCapabilities(capabilities),
      RelayContractError,
    );
    await assert.rejects(
      negotiateRelayConnection(
        "https://relay.example",
        (async () => Response.json(capabilities)) as typeof fetch,
      ),
      RelayContractError,
    );
  }
});

test("Relay lineage response must exactly match the negotiated v1 or v2 contract", async () => {
  const v1 = buildSavedWatchPacketA();
  const v2 = buildSourceSupportedSitePacketV2Fixture();
  const acceptedV1 = await executeInvestigationTransport(
    { kind: "relay", connection: relayConnection("site_ready_case_packet.v1") },
    REQUEST,
    (async () => Response.json(v1)) as typeof fetch,
  );
  assert.equal(
    "contract_version" in acceptedV1.payload
      ? acceptedV1.payload.contract_version
      : null,
    "site_ready_case_packet.v1",
  );
  assert.equal(
    "source_supported_relation_observation" in acceptedV1.payload,
    false,
  );

  const acceptedV2 = await executeInvestigationTransport(
    { kind: "relay", connection: relayConnection("site_ready_case_packet.v2") },
    REQUEST,
    (async () => Response.json(v2)) as typeof fetch,
  );
  assert.equal(
    "contract_version" in acceptedV2.payload
      ? acceptedV2.payload.contract_version
      : null,
    "site_ready_case_packet.v2",
  );
  if (
    !("contract_version" in acceptedV2.payload)
    || acceptedV2.payload.contract_version !== "site_ready_case_packet.v2"
  ) {
    assert.fail("expected validated Relay Site packet v2");
  }
  assert.equal(
    acceptedV2.payload.source_supported_relation_observation,
    "evaluated",
  );

  const missingObservation = structuredClone(v2) as Partial<typeof v2>;
  delete missingObservation.source_supported_relation_observation;
  await assert.rejects(
    executeInvestigationTransport(
      { kind: "relay", connection: relayConnection("site_ready_case_packet.v2") },
      REQUEST,
      (async () => Response.json(missingObservation)) as typeof fetch,
    ),
    (error: unknown) => error instanceof ExecutionTransportError
      && error.code === "relay_response_invalid",
  );

  for (const [connection, response] of [
    [relayConnection("site_ready_case_packet.v1"), v2],
    [relayConnection("site_ready_case_packet.v2"), v1],
  ] as const) {
    await assert.rejects(
      executeInvestigationTransport(
        { kind: "relay", connection },
        REQUEST,
        (async () => Response.json(response)) as typeof fetch,
      ),
      (error: unknown) => error instanceof ExecutionTransportError
        && error.code === "relay_response_invalid",
    );
  }
});

test("saved relay restoration is validation-only and Forget removes only the owned key", () => {
  const storage = new MemoryStorage();
  const connection = relayConnection();
  storage.values.set("sisyphus.local-watch.v1", "watch-baseline");
  writeRelayConnection(storage, connection);
  const writesBeforeRead = storage.setCount;
  assert.deepEqual(readRelayConnection(storage), {
    status: "valid",
    connection,
  });
  assert.equal(storage.setCount, writesBeforeRead);
  assert.deepEqual(forgetRelayConnection(storage), { ok: true });
  assert.equal(storage.values.has(RELAY_STORAGE_KEY), false);
  assert.equal(storage.values.get("sisyphus.local-watch.v1"), "watch-baseline");

  const componentSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  const restoreStart = componentSource.indexOf("const storage = relayStorage === undefined");
  const restoreEnd = componentSource.indexOf("useEffect(() => () =>", restoreStart);
  const restoreSource = componentSource.slice(restoreStart, restoreEnd);
  assert.match(restoreSource, /readRelayConnection\(storage\)/);
  assert.match(restoreSource, /reconnect to use\. No network request was made automatically/);
  assert.doesNotMatch(
    restoreSource,
    /fetch\(|negotiateRelayConnection|executeInvestigationTransport|runAnalysis/,
  );
});

test("relay lineage is browser-direct with a bounded credentialless body", async () => {
  const packet = buildSavedWatchPacketA();
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const result = await executeInvestigationTransport(
    { kind: "relay", connection: relayConnection() },
    REQUEST,
    (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return Response.json(packet);
    }) as typeof fetch,
  );

  assert.deepEqual(result.payload, packet);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://relay.example/team/v1/lineage");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.credentials, "omit");
  assert.equal(calls[0].init?.redirect, "error");
  assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), REQUEST);
  assert.doesNotMatch(
    JSON.stringify(calls[0].init),
    /apiKey|openaiApiKey|providerKey|authorization|bearer|cookie/i,
  );
  assert.notEqual(calls[0].input, "/api/lineage");
});

test("malformed and non-live relay packets fail without sponsored fallback", async () => {
  for (const payload of [
    { malformed: true },
    buildSavedWatchFallbackPacket(),
  ]) {
    const targets: string[] = [];
    await assert.rejects(
      executeInvestigationTransport(
        { kind: "relay", connection: relayConnection() },
        REQUEST,
        (async (input: URL | RequestInfo) => {
          targets.push(String(input));
          return Response.json(payload);
        }) as typeof fetch,
      ),
      ExecutionTransportError,
    );
    assert.deepEqual(targets, ["https://relay.example/team/v1/lineage"]);
    assert.equal(targets.includes("/api/lineage"), false);
  }
});

test("operator execution stays same-origin and never tries a relay automatically", async () => {
  const targets: string[] = [];
  await assert.rejects(
    executeInvestigationTransport(
      { kind: "operator_sponsored" },
      REQUEST,
      (async (input: URL | RequestInfo) => {
        targets.push(String(input));
        throw new Error("same-origin mock failure");
      }) as typeof fetch,
    ),
    ExecutionTransportError,
  );
  assert.deepEqual(targets, ["/api/lineage"]);
  assert.equal(targets.some((target) => target.includes("relay.example")), false);
});

test("successful relay Watch recheck advances the same baseline and deterministic delta", async () => {
  const packetA = buildSavedWatchPacketA();
  const packetB = buildSavedWatchPacketB();
  const baseline = createLocalWatch(
    packetA,
    new Date("2026-08-20T10:00:00.000Z"),
  );
  const result = await executeInvestigationTransport(
    { kind: "relay", connection: relayConnection() },
    {
      question: baseline.normalized_public_interest_question,
      sourceLimit: baseline.saved_source_limit,
      discoveryProfile: baseline.saved_discovery_profile,
    },
    (async () => Response.json(packetB)) as typeof fetch,
  );
  assert.equal(result.payload.status, "live");
  const advanced = advanceLocalWatch(
    baseline,
    result.payload,
    new Date("2026-08-21T10:00:00.000Z"),
  );
  const delta = compareInvestigationSnapshots(baseline.snapshot, advanced.snapshot);
  assert.notDeepEqual(advanced.snapshot, baseline.snapshot);
  assert.equal(delta.has_deterministic_differences, true);
  assert.equal(baseline.snapshot.relation_evidence_observation, "unavailable");
  assert.equal(advanced.snapshot.relation_evidence_observation, "unavailable");
  assert.equal(delta.relation_evidence_comparison, "unavailable");
  assert.deepEqual(delta.clarified_source_backed_relations, []);
  assert.deepEqual(delta.source_backed_relations_not_reobserved, []);
  assert.equal(advanced.saved_at, baseline.saved_at);
});

function relayConnection(
  lineageResponseContract: RelayConnection["lineage_response_contract"] =
    "site_ready_case_packet.v1",
): RelayConnection {
  return {
    contract_version: "sisyphus_relay_connection.v1",
    relay_protocol_version: "sisyphus_relay.v1",
    relay_base_url: "https://relay.example/team/",
    capabilities_contract_version: "sisyphus_relay_capabilities.v1",
    lineage_response_contract: lineageResponseContract,
    relay_display_name: "Civic evidence relay",
    saved_at: "2026-08-21T01:02:03.000Z",
  };
}
