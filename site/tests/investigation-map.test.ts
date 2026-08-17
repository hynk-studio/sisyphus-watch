import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLineageRequest,
  deriveCoverageHighlight,
  deriveInvestigationMap,
  deriveQuestionInspectionOrigins,
  deriveThreadTrace,
  spatialRelationEdges,
} from "../app/lib/investigation-map";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import type {
  PacketUnresolvedQuestion,
  SiteReadyCasePacket,
} from "../app/lib/lineage/contracts";
import { validateSiteReadyCasePacket } from "../app/lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../app/lib/lineage/details";
import {
  buildMapDensityFixture,
  buildSameSourceRelationFixture,
} from "./fixtures/map-density";

test("map derivation is deterministic, presentation-only, and preserves source roles and provenance labels", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const first = deriveInvestigationMap(packet, "event_time");
  const second = deriveInvestigationMap(packet, "event_time");

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(packet), before);
  assert.equal(first.contractVersion, "investigation_map.v1");
  assert.equal(first.packetRunId, packet.run_id);
  assert.deepEqual(
    first.sources.map((source) => source.sourceId),
    [
      "src_city_heatwave_initial_announcement_2026_06_10",
      "src_community_cooling_center_access_report_2026_06_12",
      "src_city_heatwave_updated_guidance_2026_06_14",
      "src_editorial_heatwave_accountability_note_2026_06_15",
    ],
  );
  assert.deepEqual(first.sources.map((source) => source.sourceRole), [
    "Official notice",
    "Community report",
    "Official update",
    "Opinion / interpretation",
  ]);
  for (const source of first.sources) {
    const packetSource = packet.source_snapshot_summaries.find(
      (item) => item.source_id === source.sourceId,
    );
    assert.ok(packetSource);
    assert.equal(source.publisher, packetSource.publisher);
    assert.equal(source.domain, packetSource.domain);
    assert.equal(source.lane, packetSource.source_selection.discovery_lane);
    assert.equal(source.discoveryPass, packetSource.source_selection.discovery_pass);
    assert.equal(source.snapshotId, packetSource.snapshot_id);
  }
});

test("prepared, mocked standard live, expanded live, partial expansion, and fallback packets use one map contract", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const standard = asLivePacket(prepared, "standard");
  const expanded = asLivePacket(prepared, "coverage_expansion");
  const partialExpansion = structuredClone(expanded);
  partialExpansion.warnings = ["one expansion source failed bounded extraction"];
  assert.equal(partialExpansion.coverage_summary.coverage_basis, "live_discovery");
  if (partialExpansion.coverage_summary.coverage_basis !== "live_discovery") {
    throw new Error("expected mocked live coverage summary");
  }
  partialExpansion.coverage_summary = {
    ...partialExpansion.coverage_summary,
    expansion_completed_successfully: false,
    expansion_returned: 2,
  };
  const fallback = structuredClone(prepared);
  fallback.mode = "fallback";
  fallback.status = "fallback";
  fallback.discovery_profile = "coverage_expansion";

  const maps = [prepared, standard, expanded, partialExpansion, fallback].map((packet) =>
    deriveInvestigationMap(packet, "publication_time"),
  );
  for (const map of maps) {
    assert.equal(map.contractVersion, "investigation_map.v1");
    assert.deepEqual(
      map.sources.map((source) => source.sourceId),
      maps[0].sources.map((source) => source.sourceId),
    );
    assert.deepEqual(
      map.relationEdges.map((edge) => edge.relationId),
      maps[0].relationEdges.map((edge) => edge.relationId),
    );
    assert.deepEqual(
      map.questions.map((question) => question.questionId),
      maps[0].questions.map((question) => question.questionId),
    );
  }
});

test("relation edges preserve every exact relation, occurrence, source, review, reason, and support reference", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "actor_assertion_time");
  assert.equal(map.relationEdges.length, packet.relation_candidates.length);

  for (const relation of packet.relation_candidates) {
    const edge = map.relationEdges.find((item) => item.relationId === relation.relation_id);
    assert.ok(edge);
    assert.equal(edge.leftOccurrenceId, relation.left_occurrence_id);
    assert.equal(edge.rightOccurrenceId, relation.right_occurrence_id);
    assert.equal(edge.leftSourceId, relation.left_source_id);
    assert.equal(edge.rightSourceId, relation.right_source_id);
    assert.equal(edge.relationType, relation.relation_type);
    assert.equal(edge.reviewStatus, relation.review_status);
    assert.equal(edge.reason, relation.reason);
    assert.deepEqual(edge.leftSupportReference, relation.left_support_reference);
    assert.deepEqual(edge.rightSupportReference, relation.right_support_reference);
    assert.ok(packet.claim_lineage_rows.some((row) => row.lineage_row_id === edge.lineageRowId));
  }
});

test("multiple claim relations between the same two sources remain separate and explicitly counted", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const original = packet.relation_candidates[0];
  const duplicate = structuredClone(original);
  duplicate.relation_id = "relation_candidate_fixture_parallel_relation_test";
  duplicate.relation_type = "corroborates";
  duplicate.reason = "A second bounded claim relation for the same source pair.";
  packet.relation_candidates.push(duplicate);
  packet.claim_lineage_rows.push({
    ...packet.claim_lineage_rows[0],
    lineage_row_id: "lineage_row_parallel_relation_test",
    relation_id: duplicate.relation_id,
    relation_type: duplicate.relation_type,
    summary: duplicate.reason,
  });

  const map = deriveInvestigationMap(packet, "event_time");
  const pairEdges = map.relationEdges.filter((edge) => edge.pairKey === map.relationEdges[0].pairKey);
  assert.equal(pairEdges.length, 2);
  assert.deepEqual(pairEdges.map((edge) => edge.parallelIndex), [0, 1]);
  assert.ok(pairEdges.every((edge) => edge.parallelCount === 2));
  assert.ok(pairEdges.some((edge) => edge.relationId === original.relation_id));
  assert.ok(pairEdges.some((edge) => edge.relationId === duplicate.relation_id));
});

test("same-source relations remain packet data while spatial rendering omits the self-loop", () => {
  const packet = buildSameSourceRelationFixture();
  const relation = packet.relation_candidates.find(
    (item) => item.relation_id === "relation_candidate_fixture_same_source_review",
  );
  assert.ok(relation);
  assert.equal(relation.left_source_id, relation.right_source_id);

  const before = JSON.stringify(packet);
  const map = deriveInvestigationMap(packet, "publication_time");
  assert.equal(map.relationEdges.length, packet.relation_candidates.length);
  assert.ok(map.relationEdges.some((edge) => edge.relationId === relation.relation_id));
  assert.ok(
    spatialRelationEdges(map).every(
      (edge) => edge.leftSourceId !== edge.rightSourceId,
    ),
  );
  assert.equal(
    spatialRelationEdges(map).some((edge) => edge.relationId === relation.relation_id),
    false,
  );
  assert.ok(spatialRelationEdges(map).some(
    (edge) => edge.leftSourceId !== edge.rightSourceId,
  ));
  assert.ok(getSiteReadyCaseDetail(packet, "relation", relation.relation_id));
  assert.ok(packet.focused_detail_lookup_keys.some(
    (key) => key.kind === "relation" && key.id === relation.relation_id,
  ));
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
  assert.equal(JSON.stringify(packet), before);
});

test("unresolved questions resolve source, claim, action, and occurrence IDs conservatively while unknown IDs attach only to topic", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourceId = packet.source_snapshot_summaries[0].source_id;
  const claimId = packet.actor_claims[1].claim_id;
  const actionId = packet.actions[0].action_id;
  const occurrenceId = packet.claim_occurrences[2].occurrence_id;
  packet.unresolved_questions = [
    question("question_source_reference", sourceId),
    question("question_claim_reference", claimId),
    question("question_action_reference", actionId),
    question("question_occurrence_reference", occurrenceId),
    question("question_unknown_reference", "unknown_external_identifier"),
  ];
  const before = JSON.stringify(packet);
  const map = deriveInvestigationMap(packet, "event_time");

  assert.equal(
    map.questions.find((item) => item.questionId === "question_source_reference")
      ?.resolvedReferences[0].resolution,
    "source",
  );
  assert.equal(
    map.questions.find((item) => item.questionId === "question_claim_reference")
      ?.resolvedReferences[0].resolution,
    "claim",
  );
  assert.equal(
    map.questions.find((item) => item.questionId === "question_action_reference")
      ?.resolvedReferences[0].resolution,
    "action",
  );
  assert.equal(
    map.questions.find((item) => item.questionId === "question_occurrence_reference")
      ?.resolvedReferences[0].resolution,
    "occurrence",
  );
  const unknown = map.questions.find((item) => item.questionId === "question_unknown_reference");
  assert.deepEqual(unknown?.targetNodeIds, [map.topic.nodeId]);
  const unknownEdges = map.questionEdges.filter((edge) => edge.toNodeId === unknown?.nodeId);
  assert.equal(unknownEdges.length, 1);
  assert.equal(unknownEdges[0].fromNodeId, map.topic.nodeId);
  assert.equal(unknownEdges[0].resolution, "unknown");
  const sourceOrigins = deriveQuestionInspectionOrigins(map, "question_source_reference");
  assert.equal(sourceOrigins[0].resolution, "source");
  assert.equal(sourceOrigins[0].sourceNodes[0].title, packet.source_snapshot_summaries[0].title);
  assert.equal(sourceOrigins[0].sourceNodes[0].sourceRole, "Official notice");
  assert.equal(sourceOrigins[0].topicRootOnly, false);
  const unknownOrigins = deriveQuestionInspectionOrigins(map, "question_unknown_reference");
  assert.deepEqual(unknownOrigins, [{
    relatedId: "unknown_external_identifier",
    resolution: "unknown",
    sourceNodes: [],
    topicRootOnly: true,
  }]);
  assert.equal(JSON.stringify(packet), before);
});

test("findings/actions-only and disconnected sources stay visible without #43 edges", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.actor_claims = [];
  packet.claim_occurrences = [];
  packet.candidate_claim_families = [];
  packet.relation_candidates = [];
  packet.claim_lineage_rows = [];
  packet.event_timeline_rows = [];
  const before = JSON.stringify(packet);
  const map = deriveInvestigationMap(packet, "event_time");

  assert.equal(map.relationEdges.length, 0);
  assert.equal(map.sources.length, packet.source_snapshot_summaries.length);
  assert.ok(map.sources.some((source) => source.previewLabel === "Source-bound finding"));
  assert.ok(map.sources.some((source) => source.findingCount > 0));
  assert.ok(map.sources.some((source) => source.actionCount > 0));
  assert.equal(JSON.stringify(packet), before);

  const original = buildPreparedSiteReadyCasePacket();
  const originalMap = deriveInvestigationMap(original, "event_time");
  const disconnected = originalMap.sources.find((source) =>
    source.sourceId.includes("editorial_heatwave_accountability"),
  );
  assert.ok(disconnected);
  assert.equal(
    originalMap.relationEdges.some((edge) =>
      edge.fromNodeId === disconnected.nodeId || edge.toNodeId === disconnected.nodeId,
    ),
    false,
  );
});

test("focus tracing and coverage lenses are stable viewing operations that do not mutate map or packet", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const packetBefore = JSON.stringify(packet);
  const mapBefore = JSON.stringify(map);
  const selected = map.sources[1];

  const trace = deriveThreadTrace(map, selected.nodeId);
  assert.ok(trace.nodeIds.includes(selected.nodeId));
  assert.ok(trace.relationEdgeIds.length > 0);
  assert.ok(trace.nodeIds.some((id) => map.questions.some((questionNode) => questionNode.nodeId === id)));

  const baseline = deriveCoverageHighlight(map, "baseline");
  const expansion = deriveCoverageHighlight(map, "coverage_expansion");
  const questions = deriveCoverageHighlight(map, "open_questions");
  assert.ok(baseline.nodeIds.includes(map.topic.nodeId));
  assert.ok(baseline.nodeIds.includes(map.sources.find((source) => source.discoveryPass === "baseline")?.nodeId ?? ""));
  assert.ok(expansion.nodeIds.includes(map.sources.find((source) => source.discoveryPass === "coverage_expansion")?.nodeId ?? ""));
  assert.ok(map.questions.every((questionNode) => questions.nodeIds.includes(questionNode.nodeId)));
  assert.equal(JSON.stringify(packet), packetBefore);
  assert.equal(JSON.stringify(map), mapBefore);
});

test("coverage-expansion rerun preserves the existing request contract exactly", () => {
  const request = buildLineageRequest({
    question: "How is public access changing for residents?",
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion",
  });
  assert.deepEqual(request, {
    question: "How is public access changing for residents?",
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion",
  });
  assert.deepEqual(Object.keys(request), ["question", "sourceLimit", "discoveryProfile"]);
});

test("each selected time axis is explicit and missing values enter Time unavailable without fallback substitution", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const eventMap = deriveInvestigationMap(packet, "event_time");
  const editorial = eventMap.sources.find((source) =>
    source.sourceId.includes("editorial_heatwave_accountability"),
  );
  assert.equal(editorial?.selectedTime, null);
  assert.equal(editorial?.timeRegion, "time_unavailable");
  assert.equal(editorial?.selectedTimeAxisLabel, "Event time");
  assert.match(eventMap.timeSelectionRule, /Missing values are not substituted/);

  const retrievalMap = deriveInvestigationMap(packet, "retrieval_time");
  assert.ok(retrievalMap.sources.every((source) => source.selectedTime));
  assert.ok(retrievalMap.sources.every((source) => source.selectedTimeAxisLabel === "Sisyphus retrieval time"));
});

test("map groups mixed precision, preserves exact order, and marks relation endpoints non-chronological", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const [daySource, laterSource, earlierSource, nextDaySource] =
    packet.source_snapshot_summaries;
  daySource.published_at = "2025-07-15T00:00:00.000Z";
  daySource.published_at_precision = "day";
  laterSource.published_at = "2025-07-15T09:00:00.000Z";
  laterSource.published_at_precision = "instant";
  earlierSource.published_at = "2025-07-15T08:00:00.000Z";
  earlierSource.published_at_precision = "instant";
  nextDaySource.published_at = "2025-07-16T00:00:00.000Z";
  nextDaySource.published_at_precision = "instant";

  const relation = packet.relation_candidates[0];
  const leftOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relation.left_occurrence_id,
  );
  const rightOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relation.right_occurrence_id,
  );
  assert.ok(leftOccurrence);
  assert.ok(rightOccurrence);
  leftOccurrence.event_time_candidate = "2025-07-15T00:00:00.000Z";
  leftOccurrence.event_time_candidate_precision = "day";
  rightOccurrence.event_time_candidate = "2025-07-15T08:00:00.000Z";
  rightOccurrence.event_time_candidate_precision = "instant";

  const map = deriveInvestigationMap(packet, "publication_time");
  assert.deepEqual(
    map.sources.map((source) => source.sourceId),
    [
      earlierSource.source_id,
      laterSource.source_id,
      daySource.source_id,
      nextDaySource.source_id,
    ],
  );
  assert.deepEqual(map.timeGroups[0], {
    groupId: "time_group:publication_time:2025-07-15",
    calendarDate: "2025-07-15",
    precision: "mixed",
    sourceNodeIds: [
      earlierSource.source_id,
      laterSource.source_id,
      daySource.source_id,
    ],
    startColumn: 1,
    endColumn: 3,
  });
  assert.equal(map.sources.find((source) =>
    source.sourceId === daySource.source_id
  )?.timeGroupPrecision, "mixed");
  assert.match(map.timeSelectionRule, /day-level records have no implied within-day position/);
  assert.equal(
    map.relationEdges.find((edge) => edge.relationId === relation.relation_id)
      ?.endpointOrdering,
    "non_chronological_mixed_precision",
  );
});

test("the vertical list model contains the visual map's material source, relation, and question information", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "publication_time");
  const material = {
    sources: map.sources.map((source) => ({
      role: source.sourceRole,
      title: source.title,
      publisher: source.publisher,
      domain: source.domain,
      axis: source.selectedTimeAxisLabel,
      time: source.selectedTime,
      preview: source.preview,
      state: source.recordBoundaryLabel,
      citation: source.citationUrl,
    })),
    relations: map.relationEdges.map((edge) => ({
      id: edge.relationId,
      from: edge.fromNodeId,
      to: edge.toNodeId,
      label: edge.label,
      review: edge.reviewStatus,
    })),
    questions: map.questions.map((questionNode) => ({
      id: questionNode.questionId,
      question: questionNode.question,
      targets: questionNode.targetNodeIds,
    })),
  };
  assert.equal(material.sources.length, packet.source_snapshot_summaries.length);
  assert.equal(material.relations.length, packet.relation_candidates.length);
  assert.equal(material.questions.length, packet.unresolved_questions.length);
  assert.ok(material.sources.every((source) => source.role && source.title && source.publisher && source.axis && source.preview));
  assert.ok(material.relations.every((edge) => edge.id && edge.from && edge.to && edge.label && edge.review));
  assert.ok(material.questions.every((questionNode) => questionNode.id && questionNode.question && questionNode.targets.length));
});

test("deterministic 3, 5, and internal 8-source fixtures preserve material map information without mutation", () => {
  const expectedRelationCounts = { 3: 3, 5: 10, 8: 18 } as const;
  for (const sourceCount of [3, 5, 8] as const) {
    const packet = buildMapDensityFixture(sourceCount);
    validateSiteReadyCasePacket(packet);
    const before = JSON.stringify(packet);
    const map = deriveInvestigationMap(packet, "event_time");
    assert.equal(map.sources.length, sourceCount);
    assert.equal(packet.relation_candidates.length, expectedRelationCounts[sourceCount]);
    assert.ok(map.sources.every((source) =>
      source.sourceId &&
      source.title &&
      source.publisher &&
      source.sourceRole &&
      source.preview &&
      source.recordBoundaryLabel
    ));
    assert.equal(map.relationEdges.length, packet.relation_candidates.length);
    assert.equal(map.questions.length, packet.unresolved_questions.length);
    assert.ok(map.questionEdges.length >= map.questions.length);

    const firstSource = map.sources[0];
    deriveThreadTrace(map, firstSource.nodeId);
    deriveCoverageHighlight(map, "all");
    deriveCoverageHighlight(map, "open_questions");
    assert.equal(JSON.stringify(packet), before);
  }

  const stress = buildMapDensityFixture(8);
  assert.match(stress.limitations.join(" "), /test-only/i);
  assert.match(stress.limitations.join(" "), /not a public selectable input/i);
});

test("5/8-source density relations use only fixture-backed IDs and remain review-only", () => {
  const five = buildMapDensityFixture(5);
  const eight = buildMapDensityFixture(8);
  assert.equal(five.relation_candidates.length, 10);
  assert.equal(eight.relation_candidates.length, 18);
  assert.ok(eight.relation_candidates.length > five.relation_candidates.length);

  for (const packet of [five, eight]) {
    const sourceById = new Map(
      packet.source_snapshot_summaries.map((source) => [source.source_id, source]),
    );
    const occurrenceById = new Map(
      packet.claim_occurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
    );
    const relationDetailIds = new Set(
      packet.focused_detail_lookup_keys
        .filter((item) => item.kind === "relation")
        .map((item) => item.id),
    );
    const representedSources = new Set<string>();

    for (const relation of packet.relation_candidates) {
      const leftOccurrence = occurrenceById.get(relation.left_occurrence_id);
      const rightOccurrence = occurrenceById.get(relation.right_occurrence_id);
      assert.ok(leftOccurrence);
      assert.ok(rightOccurrence);
      assert.equal(leftOccurrence.source_id, relation.left_source_id);
      assert.equal(rightOccurrence.source_id, relation.right_source_id);
      assert.equal(leftOccurrence.snapshot_id, relation.left_snapshot_id);
      assert.equal(rightOccurrence.snapshot_id, relation.right_snapshot_id);
      assert.deepEqual(leftOccurrence.support_reference, relation.left_support_reference);
      assert.deepEqual(rightOccurrence.support_reference, relation.right_support_reference);
      assert.equal(relation.left_support_reference.source_id, relation.left_source_id);
      assert.equal(relation.right_support_reference.source_id, relation.right_source_id);
      assert.equal(relation.left_support_reference.snapshot_id, relation.left_snapshot_id);
      assert.equal(relation.right_support_reference.snapshot_id, relation.right_snapshot_id);
      assert.ok(sourceById.has(relation.left_source_id));
      assert.ok(sourceById.has(relation.right_source_id));
      assert.equal(relation.status, "candidate");
      assert.equal(relation.review_status, "pending_review");
      assert.ok(relationDetailIds.has(relation.relation_id));
      representedSources.add(relation.left_source_id);
      representedSources.add(relation.right_source_id);

      if (relation.relation_id.includes("density_fixture")) {
        assert.equal(relation.generated_by, "deterministic_fixture");
        assert.equal(relation.relation_type, "unresolved");
        assert.equal(relation.insufficient_evidence, true);
        assert.match(relation.reason, /test-only relation-density candidate/i);
        assert.match(relation.reason, /does not assert endorsement, truth, correction, or canonical state/i);
      }
    }
    assert.equal(representedSources.size, packet.actual_source_count);
  }

  const eightMap = deriveInvestigationMap(eight, "event_time");
  const parallel = eightMap.relationEdges.filter((edge) => edge.parallelCount === 2);
  assert.equal(parallel.length, 2);
  assert.deepEqual(parallel.map((edge) => edge.parallelIndex).sort(), [0, 1]);
});

function question(questionId: string, relatedId: string): PacketUnresolvedQuestion {
  return {
    question_id: questionId,
    question: `What remains unknown for ${relatedId}?`,
    related_ids: [relatedId],
    status: "unresolved",
    record_status: "candidate",
    origin: "live_api",
  };
}

function asLivePacket(
  input: SiteReadyCasePacket,
  discoveryProfile: "standard" | "coverage_expansion",
): SiteReadyCasePacket {
  const packet = structuredClone(input);
  packet.mode = "live";
  packet.status = "live";
  packet.discovery_profile = discoveryProfile;
  packet.source_snapshot_summaries = packet.source_snapshot_summaries.map((source, index) => ({
    ...source,
    record_status: "candidate" as const,
    source_selection: {
      ...source.source_selection,
      discovery_pass:
        discoveryProfile === "coverage_expansion" && index > 0
          ? "coverage_expansion" as const
          : "baseline" as const,
    },
  }));
  packet.coverage_summary = {
    coverage_basis: "live_discovery",
    discovery_profile: discoveryProfile,
    baseline_requested: discoveryProfile === "standard" ? 5 : 2,
    baseline_returned: discoveryProfile === "standard" ? 4 : 2,
    expansion_requested: discoveryProfile === "standard" ? 0 : 3,
    expansion_returned: discoveryProfile === "standard" ? 0 : 2,
    lane_counts: structuredClone(input.coverage_summary.lane_counts),
    missing_target_lanes: discoveryProfile === "standard" ? [] : ["primary_or_origin"],
    unique_domain_count: 4,
    duplicate_url_count: 0,
    source_limit_reached: false,
    expansion_attempted: discoveryProfile === "coverage_expansion",
    expansion_completed_successfully: true,
  };
  return packet;
}
