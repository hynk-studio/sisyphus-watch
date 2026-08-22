import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusedDetailPanel } from "../app/components/FocusedDetailPanel";
import { TimelineView } from "../app/components/InvestigationResultViews";
import type { AnalysisCandidate } from "../app/lib/analysis/contracts";
import {
  buildPreparedSiteReadyCasePacket,
  buildSiteReadyCasePacketFromAnalysis,
} from "../app/lib/lineage/builder";
import {
  siteReadyCasePacketSchema,
  validateSiteReadyCasePacket,
  type ClaimOccurrence,
} from "../app/lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../app/lib/lineage/details";
import {
  buildEvidenceClaimReviewLinks,
  MAX_EVIDENCE_CLAIM_REVIEW_LINKS,
  MAX_REVIEW_LINKS_PER_EVIDENCE_RECORD,
} from "../app/lib/lineage/evidence-links";
import { buildLocalWatchSnapshot } from "../app/lib/local-watch";
import {
  buildPublicEvidencePacket,
  PUBLIC_EVIDENCE_CONTRACT_VERSION,
} from "../app/lib/public-evidence";
import { nasaEvidenceLinkRun } from "./fixtures/nasa-evidence-links";

function nasaPacket() {
  return buildSiteReadyCasePacketFromAnalysis(nasaEvidenceLinkRun());
}

function candidateByType(type: "finding" | "action"): AnalysisCandidate {
  const candidate = nasaEvidenceLinkRun().candidates.find(
    (item) => item.candidate_type === type,
  );
  if (!candidate) throw new Error(`missing ${type} fixture candidate`);
  return structuredClone(candidate);
}

function withSource(
  candidate: AnalysisCandidate,
  sourceId: string,
  snapshotId: string,
): AnalysisCandidate {
  return {
    ...candidate,
    source_id: sourceId,
    snapshot_id: snapshotId,
    source_reference: {
      ...candidate.source_reference,
      source_id: sourceId,
      snapshot_id: snapshotId,
    },
  };
}

test("NASA regression preserves review-only links while shared evidence admits one unresolved claim pair", () => {
  const packet = nasaPacket();
  assert.equal(packet.source_bound_findings.length, 9);
  assert.equal(packet.actor_claims.length, 2);
  assert.equal(packet.actions.length, 1);
  assert.equal(packet.claim_occurrences.length, 2);
  assert.ok(packet.claim_occurrences.every((item) => item.claim_kind === "actor_claim"));
  assert.equal(packet.bounded_work_summary.theoretical_pair_count, 1);
  assert.equal(packet.bounded_work_summary.prefilter_candidate_count, 1);
  assert.equal(packet.relation_candidates.length, 1);
  assert.equal(packet.relation_candidates[0].relation_type, "unresolved");
  assert.equal(packet.relation_candidates[0].insufficient_evidence, true);
  assert.ok(packet.relation_candidates[0].confidence_score <= 0.35);
  assert.match(packet.relation_candidates[0].reason, /shared-evidence bridge/i);
  assert.equal(packet.evidence_claim_review_links.length, 8);
  assert.deepEqual(packet.evidence_claim_link_work_summary, {
    evidence_record_count: 10,
    claim_occurrence_count: 2,
    theoretical_pair_count: 20,
    prefilter_candidate_count: 8,
    selected_link_count: 8,
    filtered_out_count: 12,
    deferred_link_count: 0,
    configured_maximum_link_count: MAX_EVIDENCE_CLAIM_REVIEW_LINKS,
    configured_maximum_links_per_evidence_record:
      MAX_REVIEW_LINKS_PER_EVIDENCE_RECORD,
    configured_bound_reached: false,
  });
  assert.ok(packet.evidence_claim_review_links.some(
    (link) => link.evidence_record_kind === "action",
  ));
  assert.ok(packet.evidence_claim_review_links.some(
    (link) => link.evidence_source_id === "src_nasa_june",
  ));
  assert.ok(packet.evidence_claim_review_links.every((link) =>
    link.link_semantics === "review_together_only"
      && link.review_status === "pending_review"
      && link.status === "candidate"
      && link.generated_by === "deterministic_rule"
      && link.origin === "live_api"
      && link.evidence_support_reference.proves === "model_summary_containment_only"
      && link.claim_support_reference.proves === "model_summary_containment_only"
  ));
  assert.deepEqual(packet, nasaPacket());
});

test("same source, unrelated text, and a generic shared actor fail closed", () => {
  const packet = nasaPacket();
  const occurrence = packet.claim_occurrences[0];
  const finding = withSource(
    {
      ...candidateByType("finding"),
      text: "Orchids bloom indoors during winter.",
      supporting_summary_span: "Orchids bloom indoors during winter.",
    },
    occurrence.source_id,
    occurrence.snapshot_id,
  );
  const action = withSource(
    {
      ...candidateByType("action"),
      actor: "NASA",
      text: "NASA convened a personnel briefing.",
      supporting_summary_span: "NASA convened a personnel briefing.",
    },
    occurrence.source_id,
    occurrence.snapshot_id,
  );
  const result = buildEvidenceClaimReviewLinks([finding, action], [occurrence]);
  assert.equal(result.summary.theoretical_pair_count, 2);
  assert.equal(result.summary.prefilter_candidate_count, 0);
  assert.equal(result.summary.filtered_out_count, 2);
  assert.deepEqual(result.links, []);
});

test("a coverage comparison hint admits topic-linked review only, not a truth relation", () => {
  const packet = nasaPacket();
  const occurrence = packet.claim_occurrences[0];
  const finding = withSource(
    {
      ...candidateByType("finding"),
      candidate_id: "candidate_coverage_finding",
      text: "Commercial landing interfaces changed.",
      supporting_summary_span: "Commercial landing interfaces changed.",
    },
    "src_coverage_expansion",
    "snapshot_coverage_expansion",
  );
  const result = buildEvidenceClaimReviewLinks(
    [finding],
    [occurrence],
    [{
      source_id: finding.source_id,
      comparison_target_source_ids: [occurrence.source_id],
    }],
  );
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].link_basis, "coverage_comparison_topic_overlap");
  assert.equal(result.links[0].link_semantics, "review_together_only");
  assert.equal("relation_type" in result.links[0], false);
  assert.equal("confidence_score" in result.links[0], false);
});

test("missing or mismatched support references omit links rather than invent support", () => {
  const packet = nasaPacket();
  const occurrence = packet.claim_occurrences[0];
  const missingEvidenceSupport = withSource(
    {
      ...candidateByType("finding"),
      text: occurrence.original_claim_text,
      supporting_summary_span: "",
    },
    occurrence.source_id,
    occurrence.snapshot_id,
  );
  const mismatchedClaimSupport: ClaimOccurrence = {
    ...occurrence,
    support_reference: {
      ...occurrence.support_reference,
      source_id: "src_mismatch",
    },
  };
  assert.deepEqual(
    buildEvidenceClaimReviewLinks([missingEvidenceSupport], [occurrence]).links,
    [],
  );
  assert.deepEqual(
    buildEvidenceClaimReviewLinks([candidateByType("finding")], [mismatchedClaimSupport]).links,
    [],
  );
});

test("global and per-evidence bounds defer deterministically with no completeness claim", () => {
  const run = nasaEvidenceLinkRun();
  const packet = nasaPacket();
  const baseEvidence = run.candidates.find(
    (item) => item.candidate_id === "candidate_nasa_finding_02",
  );
  const baseOccurrence = packet.claim_occurrences.find(
    (item) => item.claim_id === "candidate_nasa_actor_claim_11",
  );
  if (!baseEvidence || !baseOccurrence) throw new Error("missing bounded-work fixture");
  const evidence = Array.from({ length: 3 }, (_, index) => ({
    ...structuredClone(baseEvidence),
    candidate_id: `candidate_bound_evidence_${index}`,
  }));
  const occurrences = Array.from({ length: 3 }, (_, index) => ({
    ...structuredClone(baseOccurrence),
    occurrence_id: `occurrence_live_bound_${index}`,
    claim_id: `claim_bound_${index}`,
  }));
  const first = buildEvidenceClaimReviewLinks(evidence, occurrences, [], 2, 1);
  const second = buildEvidenceClaimReviewLinks(evidence, occurrences, [], 2, 1);
  assert.deepEqual(first, second);
  assert.equal(first.summary.theoretical_pair_count, 9);
  assert.equal(first.summary.prefilter_candidate_count, 9);
  assert.equal(first.summary.selected_link_count, 2);
  assert.equal(first.summary.deferred_link_count, 7);
  assert.equal(first.summary.configured_bound_reached, true);
  assert.match(first.warnings[0], /completeness is not claimed/);
  assert.ok(new Set(first.links.map((link) => link.evidence_record_id)).size === 2);
});

test("older packets receive safe empty defaults without a protocol version bump", () => {
  const packet = nasaPacket();
  const older = structuredClone(packet) as unknown as Record<string, unknown>;
  delete older.evidence_claim_review_links;
  delete older.evidence_claim_link_work_summary;
  const validated = validateSiteReadyCasePacket(older);
  assert.equal(validated.contract_version, "site_ready_case_packet.v1");
  assert.deepEqual(validated.evidence_claim_review_links, []);
  assert.equal(validated.evidence_claim_link_work_summary.selected_link_count, 0);
  assert.equal(validated.evidence_claim_link_work_summary.configured_maximum_link_count, 32);
});

test("schema rejects stronger semantics, broken endpoint support, and canonical promotion", () => {
  const packet = nasaPacket();
  const stronger = structuredClone(packet) as unknown as Record<string, unknown>;
  const strongerLinks = stronger.evidence_claim_review_links as Array<Record<string, unknown>>;
  strongerLinks[0].link_semantics = "supports";
  assert.equal(siteReadyCasePacketSchema.safeParse(stronger).success, false);

  const relationLabel = structuredClone(packet) as unknown as Record<string, unknown>;
  const relationLabelLinks = relationLabel.evidence_claim_review_links as Array<Record<string, unknown>>;
  relationLabelLinks[0].relation_type = "corroborates";
  assert.equal(siteReadyCasePacketSchema.safeParse(relationLabel).success, false);

  const brokenSupport = structuredClone(packet);
  brokenSupport.evidence_claim_review_links[0].claim_support_reference.source_id = "src_missing";
  assert.equal(siteReadyCasePacketSchema.safeParse(brokenSupport).success, false);

  const promoted = structuredClone(packet) as unknown as Record<string, unknown>;
  const promotedLinks = promoted.evidence_claim_review_links as Array<Record<string, unknown>>;
  promotedLinks[0].status = "canonical";
  assert.equal(siteReadyCasePacketSchema.safeParse(promoted).success, false);

  const widenedBound = structuredClone(packet);
  widenedBound.evidence_claim_link_work_summary.configured_maximum_link_count = 33;
  assert.equal(siteReadyCasePacketSchema.safeParse(widenedBound).success, false);
});

test("prepared, Saved Watch, and public evidence v1 boundaries remain unchanged", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  assert.deepEqual(prepared.evidence_claim_review_links, []);
  assert.equal(prepared.evidence_claim_link_work_summary.selected_link_count, 0);

  const packet = nasaPacket();
  const watchSnapshot = buildLocalWatchSnapshot(packet);
  assert.equal("evidence_claim_review_links" in watchSnapshot, false);
  assert.doesNotMatch(JSON.stringify(watchSnapshot), /review_together_only/);

  const publicPacket = buildPublicEvidencePacket(packet);
  assert.equal(publicPacket.contract_version, PUBLIC_EVIDENCE_CONTRACT_VERSION);
  assert.equal("evidence_claim_review_links" in publicPacket, false);
  assert.doesNotMatch(JSON.stringify(publicPacket), /review_together_only/);
});

test("focused finding, action, and claim inspectors disclose review-only semantics", () => {
  const packet = nasaPacket();
  const linkedFinding = packet.evidence_claim_review_links.find(
    (link) => link.evidence_record_kind === "finding",
  );
  const linkedAction = packet.evidence_claim_review_links.find(
    (link) => link.evidence_record_kind === "action",
  );
  if (!linkedFinding || !linkedAction) throw new Error("missing linked UI fixture records");

  for (const selection of [
    {
      kind: "finding" as const,
      id: linkedFinding.evidence_record_id,
      label: "Linked NASA finding",
    },
    {
      kind: "action" as const,
      id: linkedAction.evidence_record_id,
      label: "Linked NASA action",
    },
    {
      kind: "claim_occurrence" as const,
      id: linkedFinding.claim_occurrence_id,
      label: "Linked NASA claim occurrence",
    },
  ]) {
    const payload = getSiteReadyCaseDetail(packet, selection.kind, selection.id);
    assert.ok(payload);
    const html = renderToStaticMarkup(createElement(FocusedDetailPanel, {
      packet,
      selection,
      payload,
      state: "idle",
      onClose: () => undefined,
      modelOverride: "nonmodal",
    }));
    assert.match(html, /Review together/);
    assert.match(html, /do not imply support, contradiction, correction, causality, truth, or acceptance/);
    assert.match(html, /review together only/);
    assert.doesNotMatch(html, /Truth confidence|confidence score/i);
  }

  const timelineHtml = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "publication_time",
    onTimeAxisChange: () => undefined,
    onFocus: () => undefined,
  }));
  assert.match(timelineHtml, /supporting-evidence-record:finding:/);
  assert.match(timelineHtml, /supporting-evidence-record:action:/);
  assert.doesNotMatch(timelineHtml, /candidate relation/i);
});
