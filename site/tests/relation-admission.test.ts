import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusedDetailPanel } from "../app/components/FocusedDetailPanel";
import type {
  AnalysisCandidate,
  AnalysisSourceSummary,
} from "../app/lib/analysis/contracts";
import {
  buildPreparedSiteReadyCasePacket,
  buildSiteReadyCasePacketFromAnalysis,
} from "../app/lib/lineage/builder";
import type {
  ClaimOccurrence,
  EvidenceClaimLinkBasis,
  EvidenceClaimReviewLinkCandidate,
} from "../app/lib/lineage/contracts";
import {
  buildBoundedRelations,
  normalizeClaimText,
} from "../app/lib/lineage/engine";
import { buildEvidenceClaimReviewLinks } from "../app/lib/lineage/evidence-links";
import { getSiteReadyCaseDetail } from "../app/lib/lineage/details";
import {
  buildRelationAdmissionHints,
  type SourceComparisonHint,
} from "../app/lib/lineage/relation-admission";
import { version18RelationAdmissionRun } from "./fixtures/version18-relation-admission";

const GENERATED_AT = "2026-08-22T12:00:00.000Z";

function source(
  id: string,
  input: {
    publisher?: string;
    publishedAt?: string | null;
    comparisonTargetSourceIds?: string[];
  } = {},
): AnalysisSourceSummary {
  const publishedAt = input.publishedAt ?? null;
  return {
    source_id: id,
    snapshot_id: `snapshot_${id}`,
    title: `Source ${id}`,
    url: `https://example.test/${id}`,
    domain: "example.test",
    publisher: input.publisher ?? "Public Publisher",
    published_at: publishedAt,
    published_at_precision: publishedAt ? "day" : null,
    retrieved_at: GENERATED_AT,
    snapshot_status: "partial",
    retrieval_mode: "openai_web_search",
    content_kind: "model_generated_web_search_summary",
    source_text_captured: false,
    content_sha256: null,
    candidate_summary_sha256: "b".repeat(64),
    record_status: "candidate",
    evidence_excerpt: null,
    web_search_grounded_candidate_summary: `Summary for ${id}.`,
    limitations: ["Deterministic relation-admission fixture."],
    api_provenance: null,
    source_selection: {
      discovery_pass: "baseline",
      discovery_lane: "baseline_authority",
      source_context: "official",
      information_proximity: "direct_document",
      why_included: "Deterministic relation-admission fixture source.",
      classification_basis: "model_generated_web_search_classification",
      classification_status: "candidate_review_only",
      comparison_target_source_ids: input.comparisonTargetSourceIds ?? [],
    },
  };
}

function occurrence(
  id: string,
  text: string,
  sourceSummary: AnalysisSourceSummary,
  input: {
    actor?: string | null;
    assertionTime?: string | null;
  } = {},
): ClaimOccurrence {
  const assertionTime = input.assertionTime ?? null;
  return {
    occurrence_id: `occurrence_${id}`,
    source_id: sourceSummary.source_id,
    snapshot_id: sourceSummary.snapshot_id,
    source_record_status: "candidate",
    claim_id: `claim_${id}`,
    claim_kind: "actor_claim",
    candidate_claim_family_id: null,
    actor: input.actor ?? null,
    original_claim_text: text,
    normalized_claim_representation: normalizeClaimText(text),
    support_kind: "model_generated_web_search_summary_span",
    support_reference: {
      support_kind: "model_generated_web_search_summary_span",
      source_id: sourceSummary.source_id,
      snapshot_id: sourceSummary.snapshot_id,
      bounded_excerpt: text,
      evidence_reference: sourceSummary.url ?? "",
      citation_url: sourceSummary.url,
      proves: "model_summary_containment_only",
    },
    assertion_time_candidate: assertionTime,
    assertion_time_candidate_precision: assertionTime ? "day" : null,
    event_time_candidate: null,
    event_time_candidate_precision: null,
    source_publication_time: sourceSummary.published_at,
    source_publication_time_precision: sourceSummary.published_at_precision,
    source_retrieval_time: sourceSummary.retrieved_at,
    source_retrieval_time_precision: "instant",
    confidence: "medium",
    uncertainty: "Deterministic relation-admission fixture.",
    validation_status: "validated",
    status: "candidate",
    origin: "live_api",
  };
}

function evidenceCandidate(
  id: string,
  kind: "finding" | "action",
  text: string,
  sourceSummary: AnalysisSourceSummary,
  actor: string | null = null,
): AnalysisCandidate {
  return {
    candidate_id: id,
    source_id: sourceSummary.source_id,
    snapshot_id: sourceSummary.snapshot_id,
    candidate_type: kind,
    actor,
    text,
    evidence_reference: sourceSummary.url ?? "",
    support_kind: "model_generated_web_search_summary_span",
    supporting_summary_span: text,
    source_reference: {
      source_id: sourceSummary.source_id,
      snapshot_id: sourceSummary.snapshot_id,
      url: sourceSummary.url ?? "",
      title: sourceSummary.title,
      kind: "url_citation",
    },
    time_candidate: null,
    time_candidate_precision: null,
    confidence: "medium",
    uncertainty: "Deterministic relation-admission fixture.",
    model: "deterministic-relation-admission-fixture",
    api_path: "responses.parse",
    generated_at: GENERATED_AT,
    validation_status: "validated",
    mode: "live_api",
    status: "candidate",
  };
}

function reviewLink(
  id: string,
  evidence: AnalysisCandidate,
  claim: ClaimOccurrence,
  basis: EvidenceClaimLinkBasis,
  sharedTopicTokens: string[] = ["fixture", "topic"],
): EvidenceClaimReviewLinkCandidate {
  if (evidence.candidate_type !== "finding" && evidence.candidate_type !== "action") {
    throw new Error("review-link evidence must be typed finding/action");
  }
  return {
    link_id: `evidence_claim_review_link_${id}`,
    evidence_record_kind: evidence.candidate_type,
    evidence_record_id: evidence.candidate_id,
    evidence_source_id: evidence.source_id,
    claim_occurrence_id: claim.occurrence_id,
    claim_id: claim.claim_id,
    claim_source_id: claim.source_id,
    link_semantics: "review_together_only",
    link_basis: basis,
    shared_topic_tokens: sharedTopicTokens.sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
    reason: "Deterministic review-together-only fixture link.",
    evidence_support_reference: {
      support_kind: "model_generated_web_search_summary_span",
      source_id: evidence.source_id,
      snapshot_id: evidence.snapshot_id,
      bounded_excerpt: evidence.supporting_summary_span,
      evidence_reference: evidence.evidence_reference,
      citation_url: evidence.source_reference.url,
      proves: "model_summary_containment_only",
    },
    claim_support_reference: { ...claim.support_reference },
    review_status: "pending_review",
    status: "candidate",
    generated_by: "deterministic_rule",
    origin: "live_api",
  };
}

function finalDecision(input: {
  left: ClaimOccurrence;
  right: ClaimOccurrence;
  sources: AnalysisSourceSummary[];
  evidence?: AnalysisCandidate[];
  links?: EvidenceClaimReviewLinkCandidate[];
  sourceComparisonHints?: SourceComparisonHint[];
}) {
  const occurrences = [input.left, input.right];
  const hints = buildRelationAdmissionHints({
    claimOccurrences: occurrences,
    evidenceCandidates: input.evidence ?? [],
    reviewLinks: input.links ?? [],
    sources: input.sources,
    sourceComparisonHints: input.sourceComparisonHints ?? [],
  });
  return {
    hints,
    result: buildBoundedRelations(
      occurrences,
      [],
      64,
      input.sourceComparisonHints ?? [],
      hints,
    ),
  };
}

test("Version 18 admits exactly one unresolved pair through the strict evidence neighborhood", () => {
  const run = version18RelationAdmissionRun();
  const packet = buildSiteReadyCasePacketFromAnalysis(run);
  const evidence = run.candidates.filter(
    (candidate) => candidate.candidate_type === "finding" || candidate.candidate_type === "action",
  );
  const hints = buildRelationAdmissionHints({
    claimOccurrences: packet.claim_occurrences,
    evidenceCandidates: evidence,
    reviewLinks: packet.evidence_claim_review_links,
    sources: run.source_snapshot_summaries,
  });

  assert.equal(packet.claim_occurrences.length, 2);
  assert.ok(packet.claim_occurrences.every((item) => item.claim_kind === "actor_claim"));
  assert.equal(packet.source_bound_findings.length, 1);
  assert.equal(packet.actions.length, 4);
  assert.equal(packet.evidence_claim_review_links.length, 5);
  assert.deepEqual(
    packet.evidence_claim_review_links.map((link) => link.link_id),
    [
      "evidence_claim_review_link_0e9514143f202ecc",
      "evidence_claim_review_link_08818bc3b1792bdd",
      "evidence_claim_review_link_3a0754c29a554077",
      "evidence_claim_review_link_f44643b6184f416e",
      "evidence_claim_review_link_aa8acfe693f4e9cb",
    ],
  );
  assert.equal(hints.length, 1);
  assert.equal(hints[0].clean_direct_lexical, false);
  assert.equal(hints[0].shared_evidence_bridge, false);
  assert.equal(hints[0].strict_evidence_neighborhood_bridge, true);
  assert.deepEqual(hints[0].evidence_neighborhood_bridge_tokens, [
    "artemis", "crewed", "lunar", "plan",
  ]);
  assert.deepEqual(hints[0].left_claim_into_right_neighborhood_tokens, [
    "artemis", "crewed",
  ]);
  assert.deepEqual(hints[0].right_claim_into_left_neighborhood_tokens, [
    "artemis", "lunar",
  ]);
  assert.deepEqual(hints[0].entity_anchor_tokens, ["artemis"]);
  assert.equal(packet.relation_candidates.length, 1);
  const relation = packet.relation_candidates[0];
  assert.equal(relation.relation_type, "unresolved");
  assert.equal(relation.insufficient_evidence, true);
  assert.equal(relation.generated_by, "deterministic_rule");
  assert.equal(relation.status, "candidate");
  assert.equal(relation.review_status, "pending_review");
  assert.ok(relation.confidence_score <= 0.35);
  assert.match(relation.reason, /strict bidirectional/i);
  assert.doesNotMatch(relation.reason, /establishes (?:follow-up|corroboration|truth)/i);
  assert.equal(packet.bounded_work_summary.model_classified_count, 0);

  const payload = getSiteReadyCaseDetail(packet, "relation", relation.relation_id);
  assert.ok(payload);
  const inspectorHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: {
      kind: "relation",
      id: relation.relation_id,
      label: "Version 18 unresolved relation",
    },
    payload,
    state: "idle",
    onClose: () => undefined,
    modelOverride: "nonmodal",
  }));
  assert.match(inspectorHtml, /<strong>Connection<\/strong><p>Unclear connection<\/p>/);
  assert.doesNotMatch(inspectorHtml, /Relation enum|<p>unresolved<\/p>/);
  assert.match(inspectorHtml, /strict bidirectional topic/);
  assert.match(inspectorHtml, /does not establish corroboration, contradiction, correction, supersession, follow-up, the same event, truth, or falsity/);
});

test("one typed evidence record linked to both claims admits only an unresolved A1 pair", () => {
  const evidenceSource = source("src_shared_evidence", { publisher: "Harbor Journal" });
  const leftSource = source("src_claim_left", { publisher: "Transit Office" });
  const rightSource = source("src_claim_right", { publisher: "Safety Office" });
  const left = occurrence(
    "a1_left",
    "Harbor Atlas elevator outages limited east terminal access for wheelchair users.",
    leftSource,
    { actor: "Transit Office" },
  );
  const right = occurrence(
    "a1_right",
    "Harbor Atlas bridge inspections restricted west terminal freight routes.",
    rightSource,
    { actor: "Safety Office" },
  );
  const evidence = evidenceCandidate(
    "finding_shared_bridge",
    "finding",
    "Harbor Atlas terminal review documented elevator outages and bridge inspections.",
    evidenceSource,
  );
  const builtLinks = buildEvidenceClaimReviewLinks([evidence], [left, right]);
  assert.equal(builtLinks.links.length, 2);
  const decision = finalDecision({
    left,
    right,
    sources: [evidenceSource, leftSource, rightSource],
    evidence: [evidence],
    links: builtLinks.links,
  });

  assert.equal(decision.hints[0].clean_direct_lexical, false);
  assert.equal(decision.hints[0].shared_evidence_bridge, true);
  assert.deepEqual(decision.hints[0].shared_evidence_keys, [
    "finding:finding_shared_bridge",
  ]);
  assert.equal(decision.result.relations.length, 1);
  assert.equal(decision.result.relations[0].relation_type, "unresolved");
  assert.equal(decision.result.relations[0].insufficient_evidence, true);
  assert.ok(decision.result.relations[0].confidence_score <= 0.35);
  assert.match(decision.result.relations[0].reason, /shared-evidence bridge/i);
});

test("the recovered older NASA pair remains R1 when no BFG8W links exist", () => {
  const february = source("src_candidate_live_07c5c132ee9d5d09", {
    publisher: "NASA",
    publishedAt: "2026-02-27T00:00:00.000Z",
  });
  const may = source("src_candidate_live_039e99cec25f752d", {
    publisher: "NASA",
    publishedAt: "2026-05-13T00:00:00.000Z",
  });
  const left = occurrence(
    "older_nasa_left",
    "NASA explained that the architecture change would standardize the SLS configuration, increase mission cadence, test commercial lander interfaces and other systems before attempting a landing, and support at least one surface landing annually thereafter.",
    february,
    { actor: "NASA" },
  );
  const right = occurrence(
    "older_nasa_right",
    "NASA provided a more specific explanation of Artemis III as a crewed Earth-orbit test flight rather than a lunar landing and described its testing objectives and risk-reduction purpose.",
    may,
    { actor: "NASA" },
  );
  const decision = finalDecision({ left, right, sources: [february, may] });
  assert.equal(decision.hints[0].clean_direct_lexical, false);
  assert.equal(decision.hints[0].shared_evidence_bridge, false);
  assert.equal(decision.hints[0].strict_evidence_neighborhood_bridge, false);
  assert.equal(decision.result.summary.theoretical_pair_count, 1);
  assert.equal(decision.result.summary.prefilter_candidate_count, 0);
  assert.equal(decision.result.relations.length, 0);
});

test("cleaned direct lexical admission preserves a meaningful live-style positive", () => {
  const leftSource = source("src_direct_left", { publisher: "Transit Authority" });
  const rightSource = source("src_direct_right", { publisher: "Transit Authority" });
  const left = occurrence(
    "direct_left",
    "Transit Authority confirmed Harbor Alpha elevator repairs restored terminal access.",
    leftSource,
    { actor: "Transit Authority" },
  );
  const right = occurrence(
    "direct_right",
    "Transit Authority said Harbor Alpha elevator repairs restored station access.",
    rightSource,
    { actor: "Transit Authority" },
  );
  const decision = finalDecision({ left, right, sources: [leftSource, rightSource] });
  assert.equal(decision.hints[0].clean_direct_lexical, true);
  assert.equal(decision.hints[0].shared_evidence_bridge, false);
  assert.equal(decision.hints[0].strict_evidence_neighborhood_bridge, false);
  assert.ok(decision.hints[0].clean_direct_token_overlap >= 0.22);
  assert.equal(decision.result.relations.length, 1);
  assert.equal(decision.result.relations[0].relation_type, "unresolved");
  assert.equal(decision.result.relations[0].insufficient_evidence, true);
});

test("the final combined admission decision rejects all eight adversarial negatives", () => {
  const negativeCases: Array<{
    name: string;
    reason: string;
    build: () => Parameters<typeof finalDecision>[0];
  }> = [
    {
      name: "same actor unrelated topics",
      reason: "actor identity is removed from direct topical overlap",
      build: () => {
        const leftSource = source("src_negative_1_left", { publisher: "Agency Delta" });
        const rightSource = source("src_negative_1_right", { publisher: "Agency Delta" });
        return {
          left: occurrence("negative_1_left", "Agency Delta announced a coastal flood warning.", leftSource, { actor: "Agency Delta" }),
          right: occurrence("negative_1_right", "Agency Delta opened a scholarship application portal.", rightSource, { actor: "Agency Delta" }),
          sources: [leftSource, rightSource],
        };
      },
    },
    {
      name: "same entity unrelated policy",
      reason: "generic policy/program/revision words do not satisfy cleaned direct overlap",
      build: () => {
        const leftSource = source("src_negative_2_left", { publisher: "Artemis Office" });
        const rightSource = source("src_negative_2_right", { publisher: "Artemis Office" });
        return {
          left: occurrence("negative_2_left", "Artemis program revised lunar habitat safety policy.", leftSource, { actor: "Artemis Office" }),
          right: occurrence("negative_2_right", "Artemis program revised employee travel reimbursement policy.", rightSource, { actor: "Artemis Office" }),
          sources: [leftSource, rightSource],
        };
      },
    },
    {
      name: "many shared generic domain words",
      reason: "actor and reporting metadata leave fewer than two topical tokens",
      build: () => {
        const leftSource = source("src_negative_3_left", { publisher: "NASA" });
        const rightSource = source("src_negative_3_right", { publisher: "NASA" });
        return {
          left: occurrence("negative_3_left", "NASA mission program schedule update described crew training.", leftSource, { actor: "NASA" }),
          right: occurrence("negative_3_right", "NASA mission program schedule update described procurement policy.", rightSource, { actor: "NASA" }),
          sources: [leftSource, rightSource],
        };
      },
    },
    {
      name: "same source unrelated claims",
      reason: "same source is context only and no topical gate passes",
      build: () => {
        const sharedSource = source("src_negative_4_shared", { publisher: "NASA" });
        return {
          left: occurrence("negative_4_left", "NASA reported Europa radiation readings.", sharedSource, { actor: "NASA" }),
          right: occurrence("negative_4_right", "NASA published employee cafeteria menus.", sharedSource, { actor: "NASA" }),
          sources: [sharedSource],
        };
      },
    },
    {
      name: "nearby dates unrelated content",
      reason: "nearby dates are context only and claim topics do not overlap",
      build: () => {
        const leftSource = source("src_negative_5_left", { publisher: "Transit Authority", publishedAt: "2026-08-01T00:00:00.000Z" });
        const rightSource = source("src_negative_5_right", { publisher: "Health Ministry", publishedAt: "2026-08-02T00:00:00.000Z" });
        return {
          left: occurrence("negative_5_left", "Transit authority inspected rail bridge bearings.", leftSource, { actor: "Transit Authority" }),
          right: occurrence("negative_5_right", "Health ministry extended vaccine clinic hours.", rightSource, { actor: "Health Ministry" }),
          sources: [leftSource, rightSource],
        };
      },
    },
    {
      name: "coverage hint different subtopics",
      reason: "coverage metadata is not an independent admission route",
      build: () => {
        const leftSource = source("src_negative_6_baseline", { publisher: "Transit Office" });
        const rightSource = source("src_negative_6_expansion", { publisher: "School Office", comparisonTargetSourceIds: [leftSource.source_id] });
        return {
          left: occurrence("negative_6_left", "City transit program expanded weekend buses.", leftSource, { actor: "Transit Office" }),
          right: occurrence("negative_6_right", "School nutrition program changed lunch menus.", rightSource, { actor: "School Office" }),
          sources: [leftSource, rightSource],
          sourceComparisonHints: [{
            source_id: rightSource.source_id,
            comparison_target_source_ids: [leftSource.source_id],
          }],
        };
      },
    },
    {
      name: "different evidence neighborhoods generic overlap",
      reason: "generic evidence overlap has no non-publisher entity anchor",
      build: () => {
        const claimSource = source("src_negative_7_claim", { publisher: "Agency" });
        const evidenceSourceLeft = source("src_negative_7_evidence_left", { publisher: "Agency" });
        const evidenceSourceRight = source("src_negative_7_evidence_right", { publisher: "Agency" });
        const left = occurrence("negative_7_left", "Agency schedule report described coastal evacuation drills.", claimSource);
        const right = occurrence("negative_7_right", "Agency schedule report described tax filing changes.", claimSource);
        const leftEvidence = evidenceCandidate("finding_negative_7_left", "finding", "Agency public report update about emergency coastal drills.", evidenceSourceLeft);
        const rightEvidence = evidenceCandidate("finding_negative_7_right", "finding", "Agency public report update about tax filing changes.", evidenceSourceRight);
        return {
          left,
          right,
          sources: [claimSource, evidenceSourceLeft, evidenceSourceRight],
          evidence: [leftEvidence, rightEvidence],
          links: [
            reviewLink("negative_7_left", leftEvidence, left, "cross_source_strong_topic_overlap"),
            reviewLink("negative_7_right", rightEvidence, right, "cross_source_strong_topic_overlap"),
          ],
        };
      },
    },
    {
      name: "same actor action evidence unrelated to second claim",
      reason: "one claim neighborhood and same actor are insufficient",
      build: () => {
        const claimSourceLeft = source("src_negative_8_claim_left", { publisher: "NASA" });
        const claimSourceRight = source("src_negative_8_claim_right", { publisher: "NASA" });
        const actionSource = source("src_negative_8_action", { publisher: "NASA" });
        const left = occurrence("negative_8_left", "NASA described Artemis navigation calibration tests.", claimSourceLeft, { actor: "NASA" });
        const right = occurrence("negative_8_right", "NASA described employee health benefit enrollment.", claimSourceRight, { actor: "NASA" });
        const action = evidenceCandidate("action_negative_8", "action", "NASA calibrated Artemis navigation sensors.", actionSource, "NASA");
        const links = buildEvidenceClaimReviewLinks([action], [left, right]).links;
        assert.equal(links.length, 1);
        return {
          left,
          right,
          sources: [claimSourceLeft, claimSourceRight, actionSource],
          evidence: [action],
          links,
        };
      },
    },
  ];

  for (const negative of negativeCases) {
    const decision = finalDecision(negative.build());
    assert.equal(
      decision.result.relations.length,
      0,
      `${negative.name}: ${negative.reason}`,
    );
    assert.equal(decision.hints[0].clean_direct_lexical, false, negative.name);
    assert.equal(decision.hints[0].shared_evidence_bridge, false, negative.name);
    assert.equal(
      decision.hints[0].strict_evidence_neighborhood_bridge,
      false,
      negative.name,
    );
  }
});

test("uncased non-Latin generic overlap cannot become an entity anchor", () => {
  const claimSourceLeft = source("src_unicode_claim_left", { publisher: "서울 기관" });
  const claimSourceRight = source("src_unicode_claim_right", { publisher: "서울 기관" });
  const evidenceSourceLeft = source("src_unicode_evidence_left", { publisher: "지역 기록" });
  const evidenceSourceRight = source("src_unicode_evidence_right", { publisher: "지역 기록" });
  const left = occurrence("unicode_left", "서울 계획 보고 교통 개선", claimSourceLeft, { actor: "교통 기관" });
  const right = occurrence("unicode_right", "서울 계획 보고 교육 개선", claimSourceRight, { actor: "교육 기관" });
  const leftEvidence = evidenceCandidate("finding_unicode_left", "finding", "서울 계획 보고 지역 교통 개선", evidenceSourceLeft);
  const rightEvidence = evidenceCandidate("finding_unicode_right", "finding", "서울 계획 보고 지역 교육 개선", evidenceSourceRight);
  const comparisonHints = [{
    source_id: claimSourceLeft.source_id,
    comparison_target_source_ids: [claimSourceRight.source_id],
  }];
  const decision = finalDecision({
    left,
    right,
    sources: [claimSourceLeft, claimSourceRight, evidenceSourceLeft, evidenceSourceRight],
    evidence: [leftEvidence, rightEvidence],
    links: [
      reviewLink("unicode_left", leftEvidence, left, "cross_source_strong_topic_overlap"),
      reviewLink("unicode_right", rightEvidence, right, "cross_source_strong_topic_overlap"),
    ],
    sourceComparisonHints: comparisonHints,
  });
  assert.deepEqual(decision.hints[0].entity_anchor_tokens, []);
  assert.equal(decision.hints[0].strict_evidence_neighborhood_bridge, false);
  assert.equal(decision.result.relations.length, 0);
});

test("malformed review links are ignored rather than repaired for admission", () => {
  const evidenceSource = source("src_invalid_evidence", { publisher: "Harbor Journal" });
  const leftSource = source("src_invalid_left", { publisher: "Transit Office" });
  const rightSource = source("src_invalid_right", { publisher: "Safety Office" });
  const left = occurrence("invalid_left", "Harbor Atlas elevator outages limited east terminal access.", leftSource, { actor: "Transit Office" });
  const right = occurrence("invalid_right", "Harbor Atlas bridge inspections restricted west terminal routes.", rightSource, { actor: "Safety Office" });
  const evidence = evidenceCandidate("finding_invalid_bridge", "finding", "Harbor Atlas terminal review documented elevator outages and bridge inspections.", evidenceSource);
  const validLinks = buildEvidenceClaimReviewLinks([evidence], [left, right]).links;
  assert.equal(validLinks.length, 2);
  const malformed = structuredClone(validLinks);
  malformed[1].claim_support_reference.source_id = "src_mismatched";
  const decision = finalDecision({
    left,
    right,
    sources: [evidenceSource, leftSource, rightSource],
    evidence: [evidence],
    links: malformed,
  });
  assert.equal(decision.hints[0].shared_evidence_bridge, false);
  assert.equal(decision.hints[0].strict_evidence_neighborhood_bridge, false);
  assert.equal(decision.result.relations.length, 0);
});

test("identical Version 18 inputs produce stable hints, relations, work summaries, and link order", () => {
  const run = version18RelationAdmissionRun();
  const firstPacket = buildSiteReadyCasePacketFromAnalysis(structuredClone(run));
  const secondPacket = buildSiteReadyCasePacketFromAnalysis(structuredClone(run));
  assert.deepEqual(secondPacket.relation_candidates, firstPacket.relation_candidates);
  assert.deepEqual(secondPacket.bounded_work_summary, firstPacket.bounded_work_summary);
  assert.deepEqual(secondPacket.warnings, firstPacket.warnings);
  assert.deepEqual(
    secondPacket.evidence_claim_review_links,
    firstPacket.evidence_claim_review_links,
  );
  const evidence = run.candidates.filter(
    (candidate) => candidate.candidate_type === "finding" || candidate.candidate_type === "action",
  );
  const firstHints = buildRelationAdmissionHints({
    claimOccurrences: firstPacket.claim_occurrences,
    evidenceCandidates: evidence,
    reviewLinks: firstPacket.evidence_claim_review_links,
    sources: run.source_snapshot_summaries,
  });
  const secondHints = buildRelationAdmissionHints({
    claimOccurrences: secondPacket.claim_occurrences,
    evidenceCandidates: evidence,
    reviewLinks: secondPacket.evidence_claim_review_links,
    sources: run.source_snapshot_summaries,
  });
  assert.deepEqual(secondHints, firstHints);
});

test("prepared deterministic relations and BFG8W-empty boundary remain unchanged", () => {
  const first = buildPreparedSiteReadyCasePacket();
  const second = buildPreparedSiteReadyCasePacket();
  assert.deepEqual(second, first);
  assert.deepEqual(
    first.relation_candidates.map((relation) => ({
      id: relation.relation_id,
      type: relation.relation_type,
      reason: relation.reason,
    })),
    second.relation_candidates.map((relation) => ({
      id: relation.relation_id,
      type: relation.relation_type,
      reason: relation.reason,
    })),
  );
  assert.deepEqual(
    first.relation_candidates.map((relation) => relation.relation_type).sort(),
    ["contradicts", "follow_up", "supersedes"],
  );
  assert.deepEqual(first.evidence_claim_review_links, []);
  assert.equal(first.evidence_claim_link_work_summary.selected_link_count, 0);
});
