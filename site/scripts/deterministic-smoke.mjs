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

const originalFetch = globalThis.fetch;
let outboundRequests = 0;
globalThis.fetch = async () => {
  outboundRequests += 1;
  throw new Error("Deterministic smoke blocked an outbound request");
};

try {
  const first = await readCases();
  const second = await readCases();
  assert.deepEqual(second, first);
  assert.equal(outboundRequests, 0);
  assert.equal(first.cases[0].requires_api_key, false);
  assert.equal(first.cases[0].network_used, false);
  assert.equal(JSON.stringify(first).includes("source_text"), false);
  console.log(
    `PASS deterministic case=${first.cases[0].case_id} sources=${first.cases[0].sources.length} outbound_requests=${outboundRequests}`,
  );
} finally {
  globalThis.fetch = originalFetch;
}
