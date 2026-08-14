import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLineageRequest,
  deriveCoverageHighlight,
  deriveInvestigationMap,
  deriveThreadTrace,
} from "../app/lib/investigation-map";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import type {
  PacketUnresolvedQuestion,
  SiteReadyCasePacket,
} from "../app/lib/lineage/contracts";

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
