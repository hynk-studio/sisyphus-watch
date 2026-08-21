import {
  validateSiteReadyCasePacket,
  type ClaimOccurrence,
  type RelationCandidate,
  type RelationType,
  type SiteReadyCasePacket,
} from "../../app/lib/lineage/contracts";
import { buildPreparedSiteReadyCasePacket } from "../../app/lib/lineage/builder";
import { buildTemporalAcceptanceFixture } from "./temporal-acceptance";

export function buildSavedWatchPacketA(): SiteReadyCasePacket {
  const packet = buildTemporalAcceptanceFixture();
  packet.run_id = "watch_fixture_run_a";
  return validateSiteReadyCasePacket(packet);
}

export function buildSavedWatchPacketB(): SiteReadyCasePacket {
  const packet = structuredClone(buildSavedWatchPacketA());
  const [, existingClaimSource, laterSource] = packet.source_snapshot_summaries;
  const existingOccurrence = packet.claim_occurrences[0];

  packet.run_id = "watch_fixture_run_b";
  packet.source_snapshot_summaries[0].url =
    "https://new-source.example.org/notices/maintenance-exercise-review";
  packet.source_snapshot_summaries[0].domain = "new-source.example.org";
  packet.source_snapshot_summaries[0].publisher = "Independent Public Review Desk";
  packet.source_snapshot_summaries[0].title =
    "Independent desk reviews maintenance exercise schedule";

  existingOccurrence.confidence = "high";
  const repeatedOccurrence: ClaimOccurrence = {
    ...structuredClone(existingOccurrence),
    occurrence_id: "occurrence_live_watch_existing_later_support",
    source_id: laterSource.source_id,
    snapshot_id: laterSource.snapshot_id,
    support_reference: supportReference(
      laterSource,
      existingOccurrence.original_claim_text,
    ),
    source_publication_time: laterSource.published_at,
    source_publication_time_precision: laterSource.published_at_precision,
  };

  const newClaimId = "candidate_live_claim_watch_revised_schedule";
  const newOccurrence: ClaimOccurrence = {
    ...structuredClone(existingOccurrence),
    occurrence_id: "occurrence_live_watch_revised_schedule",
    source_id: laterSource.source_id,
    snapshot_id: laterSource.snapshot_id,
    claim_id: newClaimId,
    actor: "Regional Operations Agency",
    original_claim_text:
      "The agency said maintenance exercise 97 remained scheduled for September 18.",
    normalized_claim_representation:
      "maintenance exercise 97 remained scheduled for september 18",
    support_reference: supportReference(
      laterSource,
      "The agency said maintenance exercise 97 remained scheduled for September 18.",
    ),
    assertion_time_candidate: "2030-09-18T00:00:00.000Z",
    assertion_time_candidate_precision: "day",
    event_time_candidate: null,
    event_time_candidate_precision: null,
    source_publication_time: laterSource.published_at,
    source_publication_time_precision: laterSource.published_at_precision,
    confidence: "medium",
  };

  packet.claim_occurrences.push(repeatedOccurrence, newOccurrence);
  packet.actor_claims.push({
    claim_id: newClaimId,
    actor: newOccurrence.actor,
    claim_text: newOccurrence.original_claim_text,
    source_ids: [laterSource.source_id],
    assertion_time_candidate: newOccurrence.assertion_time_candidate,
    assertion_time_candidate_precision: newOccurrence.assertion_time_candidate_precision,
    confidence: newOccurrence.confidence,
    uncertainty: "Candidate statement from a model-generated source summary.",
    status: "candidate",
    origin: "live_api",
  });

  packet.relation_candidates.push(
    relation("contradicts", existingOccurrence, newOccurrence, existingClaimSource, laterSource),
    relation("correction", existingOccurrence, newOccurrence, existingClaimSource, laterSource),
    relation("supersedes", existingOccurrence, newOccurrence, existingClaimSource, laterSource),
  );
  packet.bounded_work_summary = {
    ...packet.bounded_work_summary,
    occurrence_count: 3,
    theoretical_pair_count: 3,
    prefilter_candidate_count: 3,
  };
  packet.focused_detail_lookup_keys.push(
    {
      kind: "claim_occurrence",
      id: repeatedOccurrence.occurrence_id,
      key: `claim_occurrence:${repeatedOccurrence.occurrence_id}`,
    },
    {
      kind: "claim_occurrence",
      id: newOccurrence.occurrence_id,
      key: `claim_occurrence:${newOccurrence.occurrence_id}`,
    },
    ...packet.relation_candidates.map((item) => ({
      kind: "relation" as const,
      id: item.relation_id,
      key: `relation:${item.relation_id}`,
    })),
  );

  return validateSiteReadyCasePacket(packet);
}

export function buildSavedWatchFallbackPacket(): SiteReadyCasePacket {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.run_id = "watch_fixture_fallback_run";
  packet.mode = "fallback";
  packet.status = "fallback";
  packet.normalized_public_interest_question =
    buildSavedWatchPacketA().normalized_public_interest_question;
  packet.requested_source_limit = 3;
  packet.discovery_profile = "standard";
  packet.warnings = ["provider_failure: deterministic browser-QA fallback"];
  return validateSiteReadyCasePacket(packet);
}

function supportReference(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
  text: string,
): ClaimOccurrence["support_reference"] {
  return {
    support_kind: "model_generated_web_search_summary_span",
    source_id: source.source_id,
    snapshot_id: source.snapshot_id,
    bounded_excerpt: text,
    evidence_reference: "synthetic browser-QA candidate summary span",
    citation_url: source.url,
    proves: "model_summary_containment_only",
  };
}

function relation(
  type: Extract<RelationType, "contradicts" | "correction" | "supersedes">,
  left: ClaimOccurrence,
  right: ClaimOccurrence,
  leftSource: SiteReadyCasePacket["source_snapshot_summaries"][number],
  rightSource: SiteReadyCasePacket["source_snapshot_summaries"][number],
): RelationCandidate {
  return {
    relation_id: `relation_candidate_watch_${type}`,
    left_occurrence_id: left.occurrence_id,
    right_occurrence_id: right.occurrence_id,
    left_source_id: leftSource.source_id,
    right_source_id: rightSource.source_id,
    left_snapshot_id: leftSource.snapshot_id,
    right_snapshot_id: rightSource.snapshot_id,
    relation_type: type,
    left_support_reference: left.support_reference,
    right_support_reference: right.support_reference,
    left_support_kind: left.support_kind,
    right_support_kind: right.support_kind,
    confidence_score: 0.62,
    reason: `Synthetic browser-QA ${type} signal for deterministic comparison only.`,
    review_status: "pending_review",
    status: "candidate",
    generated_by: "model_assisted",
    insufficient_evidence: false,
  };
}
