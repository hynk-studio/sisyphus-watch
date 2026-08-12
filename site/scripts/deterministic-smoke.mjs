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

async function requestNoKeyAnalysis(runtimeEnv, expectedStatus) {
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

  const disabledAnalysis = await requestNoKeyAnalysis(env, 503);
  const disabledLineage = await requestNoKeyLineage(env, 503);
  assert.equal(disabledAnalysis.error.code, "live_analysis_disabled");
  assert.equal(disabledLineage.error.code, "live_analysis_disabled");
  assert.equal(disabledAnalysis.canonical_mutation, "none");
  assert.equal(disabledLineage.canonical_mutation, "none");
  assert.equal(outboundRequests, 0);

  process.env.SISYPHUS_LIVE_ENABLED = "true";
  const fallback = await requestNoKeyAnalysis(env, 200);
  assert.equal(fallback.mode, "fallback");
  assert.equal(fallback.status, "fallback");
  assert.equal(fallback.requested_source_limit, 5);
  assert.equal(fallback.canonical_mutation, "none");
  assert.deepEqual(fallback.candidate_ids, []);
  assert.match(fallback.warnings[0], /^missing_api_key:/);
  assert.equal(JSON.stringify(fallback).includes('"source_text":'), false);
  assert.equal(outboundRequests, 0);

  const lineage = await requestNoKeyLineage(env, 200);
  assert.equal(lineage.contract_version, "site_ready_case_packet.v1");
  assert.equal(lineage.mode, "fallback");
  assert.equal(lineage.status, "fallback");
  assert.ok(lineage.claim_occurrences.length >= 3);
  assert.ok(lineage.relation_candidates.length >= 3);
  assert.equal(lineage.bounded_work_summary.model_classified_count, 0);
  assert.equal(lineage.candidate_canonical_boundary.canonical_mutation, "none");
  assert.equal(JSON.stringify(lineage).includes('"source_text":'), false);
  assert.equal(outboundRequests, 0);
  console.log(
    `PASS deterministic case=${first.cases[0].case_id} disabled_status=${disabledAnalysis.status} analysis_status=${fallback.status} lineage_status=${lineage.status} relations=${lineage.relation_candidates.length} sources=${first.cases[0].sources.length} outbound_requests=${outboundRequests}`,
  );
} finally {
  if (originalLiveFlag === undefined) delete process.env.SISYPHUS_LIVE_ENABLED;
  else process.env.SISYPHUS_LIVE_ENABLED = originalLiveFlag;
  globalThis.fetch = originalFetch;
}
