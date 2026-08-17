import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function request(path) {
  const worker = await loadWorker();
  return worker.fetch(
    new Request(`http://localhost${path}`),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders a truthful prepared-first shell when live discovery is disabled", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sisyphus Watch \| Build an investigation map<\/title>/i);
  assert.match(html, /Explore how public information changes/);
  assert.match(html, /Explore the prepared investigation/);
  assert.match(html, /Public live investigations are unavailable right now/);
  assert.match(html, /does not start external source discovery or an OpenAI provider request/i);
  assert.doesNotMatch(html, /<textarea/);
  assert.doesNotMatch(html, /Build investigation map/);
  assert.doesNotMatch(html, /id="investigation-workspace"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
  assert.doesNotMatch(html, /DEMO FIXTURE ONLY/);
});

test("keeps compact source summaries bounded", async () => {
  const response = await request("/api/cases");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cases.length, 1);

  const preparedCase = body.cases[0];
  assert.equal(preparedCase.deterministic, true);
  assert.equal(preparedCase.requires_api_key, false);
  assert.equal(preparedCase.network_used, false);
  assert.ok(preparedCase.sources.length >= 3);
  assert.ok(preparedCase.actor_claims.length >= 3);
  assert.ok(preparedCase.actions.length >= 2);
  assert.ok(preparedCase.timeline.length >= 3);
  assert.ok(preparedCase.claim_lineage.length >= 1);
  assert.ok(preparedCase.unresolved_questions.length >= 1);

  for (const source of preparedCase.sources) {
    assert.equal("source_text" in source, false);
    assert.match(source.source_id, /^src_[a-z0-9_]+$/);
    assert.match(source.snapshot_id, /^snapshot_[a-z0-9_]+$/);
    assert.match(source.content_sha256, /^[a-f0-9]{64}$/);
    assert.ok(source.evidence_excerpt.length <= 280);
    assert.ok(source.published_at);
    assert.ok("event_time" in source);
    assert.ok("asserted_at" in source);
    assert.ok(source.retrieved_at);
  }
});

test("returns one focused source detail by stable ID", async () => {
  const sourceId = "src_city_heatwave_initial_announcement_2026_06_10";
  const response = await request(
    `/api/cases/city_heatwave_cooling_centers?focus=source&id=${sourceId}`,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.focus_kind, "source");
  assert.equal(body.focus_id, sourceId);
  assert.match(body.detail.source_text, /^DEMO FIXTURE ONLY:/);
  assert.ok(body.detail.source_text.length < 1200);
});

test("rejects malformed or unknown focused-detail requests", async () => {
  const malformed = await request(
    "/api/cases/city_heatwave_cooling_centers?focus=source",
  );
  assert.equal(malformed.status, 400);

  const unknown = await request(
    "/api/cases/city_heatwave_cooling_centers?focus=claim&id=claim_missing",
  );
  assert.equal(unknown.status, 404);
});

test("serves the validated Site-ready lineage packet and focused details", async () => {
  const response = await request("/api/lineage/city_heatwave_cooling_centers");
  assert.equal(response.status, 200);
  const packet = await response.json();
  assert.equal(packet.contract_version, "site_ready_case_packet.v1");
  assert.equal(packet.mode, "deterministic");
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
  assert.equal(packet.bounded_work_summary.theoretical_pair_count, 3);
  assert.ok(packet.relation_candidates.length >= 3);
  assert.equal(JSON.stringify(packet).includes('"source_text":'), false);

  const relationId = packet.relation_candidates[0].relation_id;
  const detail = await request(
    `/api/lineage/city_heatwave_cooling_centers?focus=relation&id=${relationId}`,
  );
  assert.equal(detail.status, 200);
  const detailBody = await detail.json();
  assert.equal(detailBody.focus_kind, "relation");
  assert.equal(detailBody.focus_id, relationId);

  const sourceId = packet.source_snapshot_summaries[0].source_id;
  const sourceDetail = await request(
    `/api/lineage/city_heatwave_cooling_centers?focus=source&id=${sourceId}`,
  );
  assert.equal(sourceDetail.status, 200);
  const sourceDetailBody = await sourceDetail.json();
  assert.match(sourceDetailBody.detail.source_text, /^DEMO FIXTURE ONLY:/);
});
