import assert from "node:assert/strict";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("smoke", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function readCases() {
  const response = await worker.fetch(
    new Request("http://localhost/api/cases"),
    env,
    context,
  );
  assert.equal(response.status, 200);
  return response.json();
}

async function requestDisabledPublicAnalysis(runtimeEnv, expectedStatus) {
  const response = await worker.fetch(
    new Request("http://localhost/api/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "How is heatwave cooling-center access being communicated?",
      }),
    }),
    runtimeEnv,
    context,
  );
  assert.equal(response.status, expectedStatus);
  return response.json();
}

async function requestNoKeyLineage(runtimeEnv, expectedStatus) {
  const response = await worker.fetch(
    new Request("http://localhost/api/lineage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "How is heatwave cooling-center access being communicated?",
      }),
    }),
    runtimeEnv,
    context,
  );
  assert.equal(response.status, expectedStatus);
  return response.json();
}

const originalFetch = globalThis.fetch;
const originalLiveFlag = process.env.SISYPHUS_LIVE_ENABLED;
let outboundRequests = 0;
globalThis.fetch = async () => {
  outboundRequests += 1;
  throw new Error("Deterministic smoke blocked an outbound request");
};

try {
  process.env.SISYPHUS_LIVE_ENABLED = "false";
  const first = await readCases();
  const second = await readCases();
  assert.deepEqual(second, first);
  assert.equal(outboundRequests, 0);
  assert.equal(first.cases[0].requires_api_key, false);
  assert.equal(first.cases[0].network_used, false);
  assert.equal(JSON.stringify(first).includes('"source_text":'), false);

  const disabledAnalysis = await requestDisabledPublicAnalysis(env, 404);
  const disabledLineage = await requestNoKeyLineage(env, 503);
  assert.equal(disabledAnalysis.error.code, "public_analysis_route_disabled");
  assert.equal(disabledLineage.error.code, "live_analysis_disabled");
  assert.equal(disabledAnalysis.canonical_mutation, "none");
  assert.equal(disabledLineage.canonical_mutation, "none");
  assert.equal(outboundRequests, 0);

  process.env.SISYPHUS_LIVE_ENABLED = "true";
  const unavailableLineage = await requestNoKeyLineage(env, 503);
  assert.equal(unavailableLineage.status, "error");
  assert.equal(unavailableLineage.mode, "unavailable");
  assert.equal(
    unavailableLineage.error.code,
    "service_admission_unavailable",
  );
  assert.equal(unavailableLineage.canonical_mutation, "none");
  assert.equal(JSON.stringify(unavailableLineage).includes('"source_text":'), false);
  assert.equal(outboundRequests, 0);
  console.log(
    `PASS deterministic case=${first.cases[0].case_id} public_analysis_status=${disabledAnalysis.status} disabled_lineage_status=${disabledLineage.status} unavailable_lineage_status=${unavailableLineage.status} sources=${first.cases[0].sources.length} outbound_requests=${outboundRequests}`,
  );
} finally {
  if (originalLiveFlag === undefined) delete process.env.SISYPHUS_LIVE_ENABLED;
  else process.env.SISYPHUS_LIVE_ENABLED = originalLiveFlag;
  globalThis.fetch = originalFetch;
}
