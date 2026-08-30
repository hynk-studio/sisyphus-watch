import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import {
  buildWebMcpInvestigationOverview,
  buildWebMcpRelationComparison,
  buildWebMcpReviewItems,
  validateWebMcpEvidenceWalk,
} from "../app/lib/webmcp/co-review";
import { buildWebMcpReviewInspection } from "../app/lib/webmcp/inspection";

test("WebMCP prepared overview preserves the review authority boundary", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const overview = buildWebMcpInvestigationOverview(packet);

  assert.equal(overview.surface_version, "sisyphus_webmcp_coreview.v1");
  assert.equal(overview.scope, "prepared_demo");
  assert.equal(overview.question, packet.normalized_public_interest_question);
  assert.equal(overview.source_count, packet.source_snapshot_summaries.length);
  assert.equal(overview.claim_occurrence_count, packet.claim_occurrences.length);
  assert.equal(overview.relation_candidate_count, packet.relation_candidates.length);
  assert.equal(overview.unresolved_question_count, packet.unresolved_questions.length);
  assert.equal(overview.canonical_mutation, "none");
  assert.equal(overview.candidate_review_boundary.canonical_mutation, "none");
  assert.equal(JSON.stringify(packet), before);
});

test("WebMCP review projection exposes only stable focused-detail records", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const items = buildWebMcpReviewItems(packet);
  const lookup = new Set(
    packet.focused_detail_lookup_keys.map((item) => `${item.kind}:${item.id}`),
  );

  assert.ok(items.length > 0);
  assert.ok(items.some((item) => item.kind === "source"));
  assert.ok(items.some((item) => item.kind === "claim_occurrence"));
  assert.ok(items.some((item) => item.kind === "relation"));
  assert.ok(items.some((item) => item.kind === "unresolved_question"));
  for (const item of items) {
    assert.ok(lookup.has(`${item.kind}:${item.id}`));
    assert.ok(item.label.length > 0 && item.label.length <= 240);
    assert.ok(item.summary.length > 0 && item.summary.length <= 360);
  }
});

test("Evidence walk validation is bounded, duplicate-free, and non-authoritative", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const available = buildWebMcpReviewItems(packet);
  const selected = available.slice(0, Math.min(3, available.length));
  assert.ok(selected.length > 0);

  const walk = validateWebMcpEvidenceWalk({
    items: selected.map((item, index) => ({
      kind: item.kind,
      id: item.id,
      rationale: `Review reason ${index + 1}`,
    })),
  }, available);

  assert.equal(walk.persistence, "session_ui_only");
  assert.equal(walk.canonical_mutation, "none");
  assert.equal(walk.items.length, selected.length);

  assert.throws(() => validateWebMcpEvidenceWalk({
    items: [{
      kind: "source",
      id: "not-a-real-source",
      rationale: "Should fail closed",
    }],
  }, available));

  assert.throws(() => validateWebMcpEvidenceWalk({
    items: [
      {
        kind: selected[0].kind,
        id: selected[0].id,
        rationale: "First",
      },
      {
        kind: selected[0].kind,
        id: selected[0].id,
        rationale: "Duplicate",
      },
    ],
  }, available));
});

test("Relation comparison is bounded to one existing candidate pair", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const relation = packet.relation_candidates[0];
  assert.ok(relation);

  const comparison = buildWebMcpRelationComparison(packet, relation.relation_id);
  assert.ok(comparison);
  assert.equal(comparison.relation_id, relation.relation_id);
  assert.equal(comparison.left.occurrence_id, relation.left_occurrence_id);
  assert.equal(comparison.right.occurrence_id, relation.right_occurrence_id);
  assert.equal(comparison.review_status, "pending_review");
  assert.equal(comparison.canonical_mutation, "none");
  assert.ok(comparison.left.claim_text.length > 0);
  assert.ok(comparison.right.claim_text.length > 0);
  assert.ok(comparison.left.support.bounded_excerpt.length > 0);
  assert.ok(comparison.right.support.bounded_excerpt.length > 0);
  assert.equal(buildWebMcpRelationComparison(packet, "relation_missing"), null);
  assert.equal(JSON.stringify(packet), before);
});

test("Read-only inspection returns bounded detail for every exposed review kind", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const items = buildWebMcpReviewItems(packet);

  for (const kind of [
    "source",
    "claim_occurrence",
    "relation",
    "unresolved_question",
  ] as const) {
    const item = items.find((candidate) => candidate.kind === kind);
    assert.ok(item, `expected one ${kind} review item`);
    const inspection = buildWebMcpReviewInspection(packet, kind, item.id);
    assert.ok(inspection);
    assert.equal(inspection.kind, kind);
    assert.equal(inspection.id, item.id);
    assert.equal(inspection.returned_content_trust, "untrusted_evidence_data");
    assert.equal(inspection.canonical_mutation, "none");
    assert.ok(Object.keys(inspection.detail).length > 0);
  }

  assert.equal(
    buildWebMcpReviewInspection(packet, "source", "source_missing"),
    null,
  );
  assert.equal(JSON.stringify(packet), before);
});

test("WebMCP bridges follow the current single-input execute callback contract", () => {
  const source = readFileSync(
    new URL("../app/components/WebMcpChallengeBridge.tsx", import.meta.url),
    "utf8",
  );
  const inspectionSource = readFileSync(
    new URL("../app/components/WebMcpInspectionBridge.tsx", import.meta.url),
    "utf8",
  );
  const wrapper = readFileSync(
    new URL("../app/components/CaseExplorer.tsx", import.meta.url),
    "utf8",
  );

  for (const tool of [
    "sisyphus_get_overview",
    "sisyphus_list_review_items",
    "sisyphus_stage_evidence_walk",
    "sisyphus_focus_review_item",
    "sisyphus_open_relation_comparison",
    "sisyphus_set_review_view",
  ]) {
    assert.match(source, new RegExp(`name: "${tool}"`));
  }
  assert.match(inspectionSource, /name: "sisyphus_inspect_review_item"/);

  assert.match(source, /execute: \(input: Record<string, unknown>\) => unknown \| Promise<unknown>/);
  assert.match(inspectionSource, /execute: \(input: Record<string, unknown>\) => unknown \| Promise<unknown>/);
  assert.doesNotMatch(source, /execute: async \(input,\s*\{/);
  assert.doesNotMatch(inspectionSource, /execute: async \(input,\s*\{/);
  assert.match(source, /context\.registerTool\(tool, \{ signal \}\)/);
  assert.match(inspectionSource, /context\.registerTool\(tool, \{ signal: registration\.signal \}\)/);
  assert.match(source, /untrustedContentHint: true/);
  assert.match(inspectionSource, /readOnlyHint: true/);
  assert.match(inspectionSource, /untrustedContentHint: true/);
  assert.match(source, /canonical_mutation: "none"/);
  assert.match(source, /session UI only|session_ui_only/);
  assert.doesNotMatch(
    `${source}\n${inspectionSource}`,
    /executeInvestigationTransport|runAnalysis\(|writeLocalWatch|advanceLocalWatch|negotiateRelayConnection|OPENAI_API_KEY/,
  );
  assert.match(wrapper, /<WebMcpChallengeBridge preparedCase=\{props\.preparedCase\} \/>/);
  assert.match(wrapper, /<WebMcpInspectionBridge preparedCase=\{props\.preparedCase\} \/>/);
});