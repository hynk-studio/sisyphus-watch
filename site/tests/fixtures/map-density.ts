import { buildPreparedSiteReadyCasePacket } from "../../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type ClaimOccurrence,
  type RelationCandidate,
  type SiteReadyCasePacket,
} from "../../app/lib/lineage/contracts";
import type { DiscoveryLane } from "../../app/lib/source-profile";

export type MapDensitySourceCount = 3 | 5 | 8;

const EXTRA_LANES: readonly DiscoveryLane[] = [
  "primary_or_origin",
  "local_or_firsthand",
  "specialist_context",
  "challenge_or_correction",
];

const EIGHT_SOURCE_RELATION_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [1, 7],
  [2, 3],
  [2, 4],
  [2, 5],
  [3, 4],
  [3, 4],
];

export function buildMapDensityFixture(
  sourceCount: MapDensitySourceCount,
): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const baseSources = packet.source_snapshot_summaries.slice(0, sourceCount);
  const cloneSource = packet.source_snapshot_summaries.at(-1);
  if (!cloneSource) throw new Error("prepared density source unavailable");

  while (baseSources.length < sourceCount) {
    const index = baseSources.length + 1;
    const sourceId = `src_internal_density_stress_${index}`;
    const snapshotId = `snapshot_internal_density_stress_${index}`;
    const lane = EXTRA_LANES[(index - 5) % EXTRA_LANES.length];
    baseSources.push({
      ...structuredClone(cloneSource),
      source_id: sourceId,
      snapshot_id: snapshotId,
      title: `Internal density stress source ${index}`,
      url: `https://density-${index}.example.org/public-record`,
      domain: `density-${index}.example.org`,
      publisher: `Density fixture publisher ${index}`,
      published_at: `2026-08-${String(index).padStart(2, "0")}T12:00:00Z`,
      published_at_precision: "instant",
      retrieved_at: `2026-08-${String(index).padStart(2, "0")}T13:00:00Z`,
      source_selection: {
        ...structuredClone(cloneSource.source_selection),
        discovery_lane: lane,
        why_included: "Internal test-only source used to stress bounded map density.",
      },
    });
    packet.focused_detail_lookup_keys.push({
      kind: "source",
      id: sourceId,
      key: `source:${sourceId}`,
    });
  }

  packet.source_snapshot_summaries = baseSources;
  packet.focused_detail_lookup_keys = packet.focused_detail_lookup_keys.filter(
    (item) => item.kind !== "source" || baseSources.some((source) => source.source_id === item.id),
  );
  packet.actual_source_count = sourceCount;
  packet.requested_source_limit = sourceCount;
  packet.run_id = `run_internal_density_fixture_${sourceCount}`;
  packet.title = `${sourceCount}-source internal map density fixture`;
  if (sourceCount === 5 || sourceCount === 8) {
    addRelationDensity(packet, sourceCount);
  }
  if (packet.coverage_summary.coverage_basis === "prepared_fixture") {
    packet.coverage_summary.fixture_source_count = sourceCount;
  }
  packet.limitations = [
    ...packet.limitations,
    sourceCount === 8
      ? "The eight-source density packet is test-only and is not a public selectable input."
      : "Deterministic mocked packet for public map-density regression testing.",
  ];
  return validateSiteReadyCasePacket(packet);
}

export function buildSameSourceRelationFixture(): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const left = packet.claim_occurrences[0];
  const right = structuredClone(packet.claim_occurrences[1]);
  right.occurrence_id = "occurrence_fixture_same_source_relation_right";
  right.claim_id = "claim_fixture_same_source_relation_right";
  right.source_id = left.source_id;
  right.snapshot_id = left.snapshot_id;
  right.support_reference.source_id = left.source_id;
  right.support_reference.snapshot_id = left.snapshot_id;
  right.support_reference.evidence_reference =
    `fixture://${packet.case_id}/${left.source_id}#same-source-second-occurrence`;
  packet.claim_occurrences.push(right);

  const relation = structuredClone(packet.relation_candidates[0]);
  relation.relation_id = "relation_candidate_fixture_same_source_review";
  relation.left_occurrence_id = left.occurrence_id;
  relation.right_occurrence_id = right.occurrence_id;
  relation.left_source_id = left.source_id;
  relation.right_source_id = right.source_id;
  relation.left_snapshot_id = left.snapshot_id;
  relation.right_snapshot_id = right.snapshot_id;
  relation.left_support_reference = structuredClone(left.support_reference);
  relation.right_support_reference = structuredClone(right.support_reference);
  relation.reason =
    "Two separate claim occurrences in one source remain inspectable without a spatial self-loop.";
  packet.relation_candidates.push(relation);

  const lineageRowId = "lineage_row_fixture_same_source_review";
  packet.claim_lineage_rows.push({
    lineage_row_id: lineageRowId,
    family_id: null,
    relation_id: relation.relation_id,
    from_occurrence_id: relation.left_occurrence_id,
    to_occurrence_id: relation.right_occurrence_id,
    relation_type: relation.relation_type,
    summary: relation.reason,
    status: "candidate",
    review_status: "pending_review",
  });
  packet.focused_detail_lookup_keys.push(
    {
      kind: "claim_occurrence",
      id: right.occurrence_id,
      key: `claim_occurrence:${right.occurrence_id}`,
    },
    {
      kind: "relation",
      id: relation.relation_id,
      key: `relation:${relation.relation_id}`,
    },
    {
      kind: "lineage_row",
      id: lineageRowId,
      key: `lineage_row:${lineageRowId}`,
    },
  );
  packet.bounded_work_summary = {
    ...packet.bounded_work_summary,
    occurrence_count: packet.claim_occurrences.length,
    theoretical_pair_count:
      packet.claim_occurrences.length * (packet.claim_occurrences.length - 1) / 2,
    prefilter_candidate_count: packet.relation_candidates.length,
  };
  return validateSiteReadyCasePacket(packet);
}

export function buildUnplacedOccurrenceFixture(): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const occurrence = packet.claim_occurrences[0];
  if (!occurrence) throw new Error("prepared unplaced-occurrence fixture unavailable");
  occurrence.event_time_candidate = null;
  occurrence.event_time_candidate_precision = null;
  packet.run_id = "run_internal_unplaced_occurrence_fixture";
  packet.title = "Internal unplaced-occurrence Map fixture";
  packet.limitations = [
    ...packet.limitations,
    "Deterministic test-only packet for the selected-axis Unplaced presentation.",
  ];
  return validateSiteReadyCasePacket(packet);
}

function addRelationDensity(
  packet: SiteReadyCasePacket,
  sourceCount: 5 | 8,
): void {
  const occurrenceBySourceId = new Map(
    packet.claim_occurrences.map((occurrence) => [occurrence.source_id, occurrence]),
  );

  packet.source_snapshot_summaries.forEach((source, index) => {
    if (occurrenceBySourceId.has(source.source_id)) return;
    const occurrence = densityOccurrence(packet, index);
    packet.claim_occurrences.push(occurrence);
    occurrenceBySourceId.set(source.source_id, occurrence);
    packet.actor_claims.push({
      claim_id: occurrence.claim_id,
      actor: occurrence.actor,
      claim_text: occurrence.original_claim_text,
      source_ids: [source.source_id],
      assertion_time_candidate: occurrence.assertion_time_candidate,
      assertion_time_candidate_precision:
        occurrence.assertion_time_candidate_precision,
      confidence: occurrence.confidence,
      uncertainty: occurrence.uncertainty,
      status: "candidate",
      origin: "deterministic_fixture",
    });
    const displayTime = source.published_at ?? source.retrieved_at;
    const timelineRowId = `timeline_row_density_fixture_${sourceCount}_${index + 1}`;
    packet.event_timeline_rows.push({
      timeline_row_id: timelineRowId,
      occurrence_ids: [occurrence.occurrence_id],
      summary: occurrence.original_claim_text,
      event_time: null,
      event_time_precision: null,
      actor_assertion_time: occurrence.assertion_time_candidate,
      actor_assertion_time_precision:
        occurrence.assertion_time_candidate_precision,
      publication_time: occurrence.source_publication_time,
      publication_time_precision: occurrence.source_publication_time_precision,
      retrieval_time: occurrence.source_retrieval_time,
      retrieval_time_precision: occurrence.source_retrieval_time_precision,
      display_time_axis: source.published_at ? "publication_time" : "retrieval_time",
      display_time: displayTime,
      display_time_precision: source.published_at
        ? source.published_at_precision ?? "instant"
        : "instant",
      time_inference: "none",
      status: "candidate",
    });
    packet.focused_detail_lookup_keys.push(
      {
        kind: "claim_occurrence",
        id: occurrence.occurrence_id,
        key: `claim_occurrence:${occurrence.occurrence_id}`,
      },
      {
        kind: "timeline_row",
        id: timelineRowId,
        key: `timeline_row:${timelineRowId}`,
      },
    );
  });

  const occurrences = packet.source_snapshot_summaries.map((source) => {
    const occurrence = occurrenceBySourceId.get(source.source_id);
    if (!occurrence) throw new Error(`density occurrence unavailable for ${source.source_id}`);
    return occurrence;
  });
  const relationPairs = sourceCount === 5
    ? allMissingSourcePairs(packet, occurrences)
    : EIGHT_SOURCE_RELATION_PAIRS;

  relationPairs.forEach(([leftIndex, rightIndex], index) => {
    const relation = densityRelation(
      sourceCount,
      index,
      occurrences[leftIndex],
      occurrences[rightIndex],
    );
    const lineageRowId = `lineage_row_density_fixture_${sourceCount}_${index + 1}`;
    packet.relation_candidates.push(relation);
    packet.claim_lineage_rows.push({
      lineage_row_id: lineageRowId,
      family_id: null,
      relation_id: relation.relation_id,
      from_occurrence_id: relation.left_occurrence_id,
      to_occurrence_id: relation.right_occurrence_id,
      relation_type: relation.relation_type,
      summary: relation.reason,
      status: "candidate",
      review_status: "pending_review",
    });
    packet.focused_detail_lookup_keys.push(
      {
        kind: "relation",
        id: relation.relation_id,
        key: `relation:${relation.relation_id}`,
      },
      {
        kind: "lineage_row",
        id: lineageRowId,
        key: `lineage_row:${lineageRowId}`,
      },
    );
  });

  const theoreticalPairs = occurrences.length * (occurrences.length - 1) / 2;
  packet.bounded_work_summary = {
    ...packet.bounded_work_summary,
    occurrence_count: occurrences.length,
    theoretical_pair_count: theoreticalPairs,
    prefilter_candidate_count: packet.relation_candidates.length,
    filtered_out_count: Math.max(0, theoreticalPairs - packet.relation_candidates.length),
    deferred_pair_count: 0,
    model_classified_count: 0,
    unrelated_count: 0,
    unresolved_or_insufficient_evidence_count: packet.relation_candidates.filter(
      (relation) => relation.relation_type === "unresolved" || relation.insufficient_evidence,
    ).length,
    configured_bound_reached: false,
  };
}

function densityOccurrence(
  packet: SiteReadyCasePacket,
  sourceIndex: number,
): ClaimOccurrence {
  const source = packet.source_snapshot_summaries[sourceIndex];
  const ordinal = sourceIndex + 1;
  const claimId = `claim_density_fixture_${ordinal}`;
  const claimText =
    `Test-only source ${ordinal} contributes a bounded claim occurrence for relation-density review.`;
  return {
    occurrence_id: `occurrence_fixture_density_${ordinal}`,
    source_id: source.source_id,
    snapshot_id: source.snapshot_id,
    source_record_status: source.record_status,
    claim_id: claimId,
    claim_kind: "prepared_actor_claim",
    candidate_claim_family_id: null,
    actor: `Density fixture actor ${ordinal}`,
    original_claim_text: claimText,
    normalized_claim_representation: claimText.toLowerCase(),
    support_kind: "captured_fixture_source_evidence_excerpt",
    support_reference: {
      support_kind: "captured_fixture_source_evidence_excerpt",
      source_id: source.source_id,
      snapshot_id: source.snapshot_id,
      bounded_excerpt:
        `Test-only bounded evidence for relation-density source ${ordinal}; no production inference is represented.`,
      evidence_reference:
        `fixture://${packet.case_id}/${source.source_id}#relation-density-test-evidence`,
      citation_url: null,
      proves: "captured_fixture_support",
    },
    assertion_time_candidate: source.published_at,
    assertion_time_candidate_precision: source.published_at_precision,
    event_time_candidate: null,
    event_time_candidate_precision: null,
    source_publication_time: source.published_at,
    source_publication_time_precision: source.published_at_precision,
    source_retrieval_time: source.retrieved_at,
    source_retrieval_time_precision: "instant",
    confidence: "low",
    uncertainty: "Test-only review candidate; no truth or canonical status is asserted.",
    validation_status: "validated",
    status: "candidate",
    origin: "deterministic_fixture",
  };
}

function allMissingSourcePairs(
  packet: SiteReadyCasePacket,
  occurrences: ClaimOccurrence[],
): ReadonlyArray<readonly [number, number]> {
  const existingPairs = new Set(packet.relation_candidates.map((relation) =>
    [relation.left_source_id, relation.right_source_id].sort().join("|"),
  ));
  const pairs: Array<readonly [number, number]> = [];
  for (let left = 0; left < occurrences.length; left += 1) {
    for (let right = left + 1; right < occurrences.length; right += 1) {
      const pairKey = [occurrences[left].source_id, occurrences[right].source_id]
        .sort()
        .join("|");
      if (!existingPairs.has(pairKey)) pairs.push([left, right]);
    }
  }
  return pairs;
}

function densityRelation(
  sourceCount: 5 | 8,
  relationIndex: number,
  left: ClaimOccurrence,
  right: ClaimOccurrence,
): RelationCandidate {
  return {
    relation_id: `relation_candidate_density_fixture_${sourceCount}_${relationIndex + 1}`,
    left_occurrence_id: left.occurrence_id,
    right_occurrence_id: right.occurrence_id,
    left_source_id: left.source_id,
    right_source_id: right.source_id,
    left_snapshot_id: left.snapshot_id,
    right_snapshot_id: right.snapshot_id,
    relation_type: "unresolved",
    left_support_reference: structuredClone(left.support_reference),
    right_support_reference: structuredClone(right.support_reference),
    left_support_kind: left.support_kind,
    right_support_kind: right.support_kind,
    confidence_score: 0.2,
    reason:
      `Test-only relation-density candidate ${relationIndex + 1} of the ${sourceCount}-source fixture. ` +
      "It exercises review geometry only and does not assert endorsement, truth, correction, or canonical state.",
    review_status: "pending_review",
    status: "candidate",
    generated_by: "deterministic_fixture",
    insufficient_evidence: true,
  };
}
