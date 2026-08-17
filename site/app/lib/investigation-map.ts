import type { DiscoveryLane, DiscoveryProfile } from "./source-profile";
import { boundedReviewerText } from "./reviewer-text";
import {
  groupReviewTimestampItems,
  type ReviewTimestampGroupPrecision,
  type TemporalPrecision,
} from "./temporal";
import {
  TIME_AXIS_LABELS,
  discoveryLaneLabel,
  recordBoundaryLabel,
  relationDisplayLabel,
  sourceContentLabel,
  sourceRoleLabel,
  type TimeAxis,
} from "./experience";
import type {
  BoundedSupportReference,
  RelationType,
  SiteReadyCasePacket,
} from "./lineage/contracts";
import {
  relationEndpointOrderingBasis,
  type RelationEndpointOrderingBasis,
} from "./lineage/engine";

export const COVERAGE_LENSES = [
  "all",
  "baseline",
  "coverage_expansion",
  "official_established",
  "local_firsthand",
  "challenges_corrections",
  "open_questions",
] as const;

export type CoverageLens = (typeof COVERAGE_LENSES)[number];

export const COVERAGE_LENS_LABELS: Record<CoverageLens, string> = {
  all: "All",
  baseline: "Baseline sources",
  coverage_expansion: "Coverage expansion",
  official_established: "Official & established",
  local_firsthand: "Local & firsthand",
  challenges_corrections: "Challenges & corrections",
  open_questions: "Open questions",
};

export interface InvestigationTopicNode {
  kind: "topic";
  nodeId: string;
  title: string;
  packetTitle: string;
  mode: SiteReadyCasePacket["mode"];
  status: SiteReadyCasePacket["status"];
}

export interface InvestigationSourceNode {
  kind: "source";
  nodeId: string;
  sourceId: string;
  snapshotId: string;
  title: string;
  publisher: string;
  domain: string;
  sourceRole: string;
  lane: DiscoveryLane;
  laneLabel: string;
  discoveryPass: "baseline" | "coverage_expansion";
  selectedTimeAxis: TimeAxis;
  selectedTimeAxisLabel: string;
  selectedTime: string | null;
  selectedTimePrecision: TemporalPrecision;
  timeGroupId: string | null;
  timeGroupPrecision: ReviewTimestampGroupPrecision | null;
  timeRegion: "dated" | "time_unavailable";
  column: number;
  preview: string;
  previewLabel: string;
  recordStatus: "candidate" | "canonical";
  recordBoundaryLabel: string;
  citationUrl: string | null;
  claimCount: number;
  findingCount: number;
  actionCount: number;
}

export interface ResolvedQuestionReference {
  relatedId: string;
  resolution: "source" | "claim" | "action" | "occurrence" | "unknown";
  targetNodeIds: string[];
}

export interface InvestigationQuestionNode {
  kind: "question";
  nodeId: string;
  questionId: string;
  question: string;
  recordStatus: "candidate" | "canonical";
  resolvedReferences: ResolvedQuestionReference[];
  targetNodeIds: string[];
}

export interface InvestigationRelationEdge {
  kind: "relation";
  edgeId: string;
  relationId: string;
  fromNodeId: string;
  toNodeId: string;
  leftOccurrenceId: string;
  rightOccurrenceId: string;
  leftSourceId: string;
  rightSourceId: string;
  relationType: RelationType;
  label: string;
  reviewStatus: "pending_review";
  reason: string;
  leftSupportReference: BoundedSupportReference;
  rightSupportReference: BoundedSupportReference;
  lineageRowId: string | null;
  pairKey: string;
  parallelIndex: number;
  parallelCount: number;
  endpointOrdering: RelationEndpointOrderingBasis;
}

export interface InvestigationQuestionEdge {
  kind: "question_gap";
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  relatedId: string | null;
  label: "Related evidence gap";
  resolution: ResolvedQuestionReference["resolution"] | "no_reference";
}

export interface InvestigationTimeGroup {
  groupId: string;
  calendarDate: string;
  precision: ReviewTimestampGroupPrecision;
  sourceNodeIds: string[];
  startColumn: number;
  endColumn: number;
}

export interface InvestigationMap {
  contractVersion: "investigation_map.v1";
  packetRunId: string;
  selectedTimeAxis: TimeAxis;
  selectedTimeAxisLabel: string;
  timeSelectionRule: string;
  topic: InvestigationTopicNode;
  sources: InvestigationSourceNode[];
  timeGroups: InvestigationTimeGroup[];
  questions: InvestigationQuestionNode[];
  relationEdges: InvestigationRelationEdge[];
  questionEdges: InvestigationQuestionEdge[];
  laneOrder: DiscoveryLane[];
  columnCount: number;
}

export interface QuestionInspectionOrigin {
  relatedId: string | null;
  resolution: ResolvedQuestionReference["resolution"];
  sourceNodes: Pick<
    InvestigationSourceNode,
    "sourceId" | "title" | "sourceRole"
  >[];
  topicRootOnly: boolean;
}

export interface MapHighlightState {
  nodeIds: string[];
  relationEdgeIds: string[];
  questionEdgeIds: string[];
}

interface ExplicitTimeValue {
  value: string;
  precision: Exclude<TemporalPrecision, null>;
}

const LANE_ORDER: DiscoveryLane[] = [
  "baseline_authority",
  "primary_or_origin",
  "local_or_firsthand",
  "specialist_context",
  "challenge_or_correction",
];

export function deriveInvestigationMap(
  packet: SiteReadyCasePacket,
  selectedTimeAxis: TimeAxis,
): InvestigationMap {
  const topicNodeId = `topic:${packet.case_id}`;
  const sourceTimes = new Map(
    packet.source_snapshot_summaries.map((source) => [
      source.source_id,
      explicitSourceTimes(packet, source.source_id),
    ]),
  );
  const selectedSourceTimes = new Map(
    [...sourceTimes].map(([sourceId, times]) => [
      sourceId,
      firstTime(times[selectedTimeAxis]),
    ]),
  );
  const datedSources = packet.source_snapshot_summaries.filter(
    (source) => (selectedSourceTimes.get(source.source_id) ?? null) !== null,
  );
  const selectedTimeGroups = groupReviewTimestampItems(
    datedSources,
    (source) => selectedSourceTimes.get(source.source_id) as ExplicitTimeValue,
    (left, right) => left.source_id.localeCompare(right.source_id),
  );
  const undatedSources = packet.source_snapshot_summaries
    .filter((source) => (selectedSourceTimes.get(source.source_id) ?? null) === null)
    .sort((left, right) => left.source_id.localeCompare(right.source_id));
  const sortedSources = [
    ...selectedTimeGroups.flatMap((group) => group.items),
    ...undatedSources,
  ];
  const groupBySourceId = new Map(
    selectedTimeGroups.flatMap((group) =>
      group.items.map((source) => [source.source_id, group] as const),
    ),
  );

  const sources: InvestigationSourceNode[] = sortedSources.map((source, index) => {
    const selectedTimeValue = firstTime(
      sourceTimes.get(source.source_id)?.[selectedTimeAxis] ?? [],
    );
    const selectedTime = selectedTimeValue?.value ?? null;
    const timeGroup = groupBySourceId.get(source.source_id) ?? null;
    const preview = sourcePreview(packet, source.source_id);
    return {
      kind: "source",
      nodeId: source.source_id,
      sourceId: source.source_id,
      snapshotId: source.snapshot_id,
      title: source.title,
      publisher: source.publisher,
      domain: source.domain,
      sourceRole: sourceRoleLabel(source),
      lane: source.source_selection.discovery_lane,
      laneLabel: discoveryLaneLabel(source.source_selection.discovery_lane),
      discoveryPass: source.source_selection.discovery_pass,
      selectedTimeAxis,
      selectedTimeAxisLabel: TIME_AXIS_LABELS[selectedTimeAxis],
      selectedTime,
      selectedTimePrecision: selectedTimeValue?.precision ?? null,
      timeGroupId: timeGroup
        ? `time_group:${selectedTimeAxis}:${timeGroup.calendarDate}`
        : null,
      timeGroupPrecision: timeGroup?.precision ?? null,
      timeRegion: selectedTime ? "dated" : "time_unavailable",
      column: index + 1,
      preview: preview.text,
      previewLabel: preview.label,
      recordStatus: source.record_status,
      recordBoundaryLabel: recordBoundaryLabel(source.record_status),
      citationUrl: source.url,
      claimCount: packet.claim_occurrences.filter(
        (occurrence) => occurrence.source_id === source.source_id,
      ).length,
      findingCount: packet.source_bound_findings.filter((finding) =>
        finding.source_ids.includes(source.source_id),
      ).length,
      actionCount: packet.actions.filter((action) =>
        action.source_ids.includes(source.source_id),
      ).length,
    };
  });

  let nextTimeGroupColumn = 1;
  const timeGroups: InvestigationTimeGroup[] = selectedTimeGroups.map((group) => {
    const startColumn = nextTimeGroupColumn;
    nextTimeGroupColumn += group.items.length;
    return {
      groupId: `time_group:${selectedTimeAxis}:${group.calendarDate}`,
      calendarDate: group.calendarDate,
      precision: group.precision,
      sourceNodeIds: group.items.map((source) => source.source_id),
      startColumn,
      endColumn: nextTimeGroupColumn - 1,
    };
  });

  const relationEdges = deriveRelationEdges(packet);
  const questions = packet.unresolved_questions
    .map((question) => {
      const resolvedReferences = question.related_ids.length
        ? question.related_ids.map((relatedId) =>
            resolveQuestionReference(packet, relatedId, topicNodeId),
          )
        : [{
            relatedId: "",
            resolution: "unknown" as const,
            targetNodeIds: [topicNodeId],
          }];
      return {
        kind: "question" as const,
        nodeId: question.question_id,
        questionId: question.question_id,
        question: question.question,
        recordStatus: question.record_status,
        resolvedReferences,
        targetNodeIds: unique(
          resolvedReferences.flatMap((reference) => reference.targetNodeIds),
        ),
      };
    })
    .sort((left, right) => left.questionId.localeCompare(right.questionId));
  const questionEdges = questions.flatMap((question) =>
    question.resolvedReferences.flatMap((reference, referenceIndex) =>
      reference.targetNodeIds.map((targetNodeId, targetIndex) => ({
        kind: "question_gap" as const,
        edgeId: `question_edge:${question.questionId}:${referenceIndex}:${targetIndex}`,
        fromNodeId: targetNodeId,
        toNodeId: question.nodeId,
        relatedId: reference.relatedId || null,
        label: "Related evidence gap" as const,
        resolution: reference.relatedId
          ? reference.resolution
          : "no_reference" as const,
      })),
    ),
  );

  return {
    contractVersion: "investigation_map.v1",
    packetRunId: packet.run_id,
    selectedTimeAxis,
    selectedTimeAxisLabel: TIME_AXIS_LABELS[selectedTimeAxis],
    timeSelectionRule:
      `Calendar dates are ordered by explicit ${TIME_AXIS_LABELS[selectedTimeAxis].toLowerCase()} values. Within a mixed-precision same-day group, exact instants retain clock order and day-level records have no implied within-day position. Missing values are not substituted.`,
    topic: {
      kind: "topic",
      nodeId: topicNodeId,
      title: packet.normalized_public_interest_question,
      packetTitle: packet.title,
      mode: packet.mode,
      status: packet.status,
    },
    sources,
    timeGroups,
    questions,
    relationEdges,
    questionEdges,
    laneOrder: [...LANE_ORDER],
    columnCount: Math.max(sources.length, 1),
  };
}

export function deriveQuestionInspectionOrigins(
  map: InvestigationMap,
  questionId: string,
): QuestionInspectionOrigin[] {
  const question = map.questions.find((item) => item.questionId === questionId);
  if (!question) return [];

  return question.resolvedReferences.map((reference) => {
    const sourceNodes = reference.targetNodeIds
      .map((targetNodeId) => map.sources.find((source) => source.nodeId === targetNodeId))
      .filter((source): source is InvestigationSourceNode => Boolean(source))
      .map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        sourceRole: source.sourceRole,
      }));
    return {
      relatedId: reference.relatedId || null,
      resolution: reference.resolution,
      sourceNodes,
      topicRootOnly:
        reference.resolution === "unknown"
        && reference.targetNodeIds.length === 1
        && reference.targetNodeIds[0] === map.topic.nodeId,
    };
  });
}

export function deriveThreadTrace(
  map: InvestigationMap,
  selectedNodeId: string,
): MapHighlightState {
  const nodeIds = new Set([selectedNodeId]);
  const relationEdgeIds = new Set<string>();
  const questionEdgeIds = new Set<string>();
  const selectedQuestion = map.questions.find(
    (question) => question.nodeId === selectedNodeId,
  );

  if (selectedNodeId === map.topic.nodeId) {
    for (const edge of map.questionEdges) {
      if (edge.fromNodeId !== selectedNodeId) continue;
      questionEdgeIds.add(edge.edgeId);
      nodeIds.add(edge.toNodeId);
    }
  } else if (selectedQuestion) {
    for (const edge of map.questionEdges) {
      if (edge.toNodeId !== selectedNodeId) continue;
      questionEdgeIds.add(edge.edgeId);
      nodeIds.add(edge.fromNodeId);
    }
    for (const edge of map.relationEdges) {
      if (!nodeIds.has(edge.fromNodeId) && !nodeIds.has(edge.toNodeId)) continue;
      relationEdgeIds.add(edge.edgeId);
      nodeIds.add(edge.fromNodeId);
      nodeIds.add(edge.toNodeId);
    }
  } else {
    for (const edge of map.relationEdges) {
      if (edge.fromNodeId !== selectedNodeId && edge.toNodeId !== selectedNodeId) continue;
      relationEdgeIds.add(edge.edgeId);
      nodeIds.add(edge.fromNodeId);
      nodeIds.add(edge.toNodeId);
    }
    for (const edge of map.questionEdges) {
      if (!nodeIds.has(edge.fromNodeId)) continue;
      questionEdgeIds.add(edge.edgeId);
      nodeIds.add(edge.toNodeId);
    }
  }

  return orderedHighlightState(map, nodeIds, relationEdgeIds, questionEdgeIds);
}

export function deriveCoverageHighlight(
  map: InvestigationMap,
  lens: CoverageLens,
): MapHighlightState {
  if (lens === "all") {
    return {
      nodeIds: allNodeIds(map),
      relationEdgeIds: map.relationEdges.map((edge) => edge.edgeId),
      questionEdgeIds: map.questionEdges.map((edge) => edge.edgeId),
    };
  }

  const nodeIds = new Set<string>([map.topic.nodeId]);
  if (lens === "open_questions") {
    map.questions.forEach((question) => nodeIds.add(question.nodeId));
  } else {
    map.sources.forEach((source) => {
      if (sourceMatchesLens(source, lens)) nodeIds.add(source.nodeId);
    });
  }

  const relationEdgeIds = new Set(
    map.relationEdges
      .filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
      .map((edge) => edge.edgeId),
  );
  const questionEdgeIds = new Set(
    map.questionEdges
      .filter((edge) => nodeIds.has(edge.fromNodeId) || nodeIds.has(edge.toNodeId))
      .map((edge) => edge.edgeId),
  );
  for (const edge of map.questionEdges) {
    if (questionEdgeIds.has(edge.edgeId)) {
      nodeIds.add(edge.fromNodeId);
      nodeIds.add(edge.toNodeId);
    }
  }
  return orderedHighlightState(map, nodeIds, relationEdgeIds, questionEdgeIds);
}

export function buildLineageRequest(input: {
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
}): {
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
} {
  return {
    question: input.question,
    sourceLimit: input.sourceLimit,
    discoveryProfile: input.discoveryProfile,
  };
}

function explicitSourceTimes(
  packet: SiteReadyCasePacket,
  sourceId: string,
): Record<TimeAxis, ExplicitTimeValue[]> {
  const source = packet.source_snapshot_summaries.find(
    (item) => item.source_id === sourceId,
  );
  const occurrences = packet.claim_occurrences.filter(
    (occurrence) => occurrence.source_id === sourceId,
  );
  const actions = packet.actions.filter((action) => action.source_ids.includes(sourceId));
  const candidates = packet.time_candidates.filter((candidate) =>
    candidate.source_ids.includes(sourceId),
  );
  return {
    event_time: uniqueTimes([
      ...occurrences.map((occurrence) => explicitTime(
        occurrence.event_time_candidate,
        occurrence.event_time_candidate_precision,
      )),
      ...actions.map((action) => explicitTime(
        action.event_time_candidate,
        action.event_time_candidate_precision,
      )),
      ...candidates
        .filter((candidate) => candidate.candidate_type === "event_time_candidate")
        .map((candidate) => explicitTime(
          candidate.time_candidate,
          candidate.time_candidate_precision,
        )),
    ]),
    actor_assertion_time: uniqueTimes([
      ...occurrences.map((occurrence) => explicitTime(
        occurrence.assertion_time_candidate,
        occurrence.assertion_time_candidate_precision,
      )),
      ...packet.actor_claims
        .filter((claim) => claim.source_ids.includes(sourceId))
        .map((claim) => explicitTime(
          claim.assertion_time_candidate,
          claim.assertion_time_candidate_precision,
        )),
      ...candidates
        .filter((candidate) => candidate.candidate_type === "assertion_time_candidate")
        .map((candidate) => explicitTime(
          candidate.time_candidate,
          candidate.time_candidate_precision,
        )),
    ]),
    publication_time: source
      ? compactTime(source.published_at, source.published_at_precision)
      : [],
    retrieval_time: source?.retrieved_at
      ? [{ value: source.retrieved_at, precision: "instant" }]
      : [],
  };
}

function sourcePreview(
  packet: SiteReadyCasePacket,
  sourceId: string,
): { text: string; label: string } {
  const occurrence = [...packet.claim_occurrences]
    .filter((item) => item.source_id === sourceId)
    .sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id))[0];
  if (occurrence) {
    return { text: boundedPreview(occurrence.original_claim_text), label: "Actor claim found in source" };
  }
  const finding = packet.source_bound_findings.find((item) => item.source_ids.includes(sourceId));
  if (finding) return { text: boundedPreview(finding.text), label: "Source-bound finding" };
  const action = packet.actions.find((item) => item.source_ids.includes(sourceId));
  if (action) return { text: boundedPreview(action.action_text), label: "Action recorded in source" };
  const source = packet.source_snapshot_summaries.find((item) => item.source_id === sourceId);
  const summary = source?.web_search_grounded_candidate_summary ?? source?.evidence_excerpt;
  return {
    text: boundedPreview(summary ?? "No bounded claim or summary preview is available."),
    label: source ? sourceContentLabel(source) : "Source preview",
  };
}

function deriveRelationEdges(packet: SiteReadyCasePacket): InvestigationRelationEdge[] {
  const lineageByRelationId = new Map(
    packet.claim_lineage_rows.map((row) => [row.relation_id, row]),
  );
  const pairCounts = new Map<string, number>();
  for (const relation of packet.relation_candidates) {
    const pairKey = stablePairKey(relation.left_source_id, relation.right_source_id);
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
  }
  const pairIndexes = new Map<string, number>();
  const occurrenceById = new Map(
    packet.claim_occurrences.map((occurrence) => [
      occurrence.occurrence_id,
      occurrence,
    ]),
  );
  return [...packet.relation_candidates]
    .sort((left, right) =>
      left.left_source_id.localeCompare(right.left_source_id) ||
      left.right_source_id.localeCompare(right.right_source_id) ||
      left.relation_id.localeCompare(right.relation_id),
    )
    .map((relation) => {
      const pairKey = stablePairKey(relation.left_source_id, relation.right_source_id);
      const parallelIndex = pairIndexes.get(pairKey) ?? 0;
      pairIndexes.set(pairKey, parallelIndex + 1);
      const leftOccurrence = occurrenceById.get(relation.left_occurrence_id);
      const rightOccurrence = occurrenceById.get(relation.right_occurrence_id);
      return {
        kind: "relation" as const,
        edgeId: relation.relation_id,
        relationId: relation.relation_id,
        fromNodeId: relation.left_source_id,
        toNodeId: relation.right_source_id,
        leftOccurrenceId: relation.left_occurrence_id,
        rightOccurrenceId: relation.right_occurrence_id,
        leftSourceId: relation.left_source_id,
        rightSourceId: relation.right_source_id,
        relationType: relation.relation_type,
        label: relationDisplayLabel(relation.relation_type),
        reviewStatus: relation.review_status,
        reason: relation.reason,
        leftSupportReference: { ...relation.left_support_reference },
        rightSupportReference: { ...relation.right_support_reference },
        lineageRowId: lineageByRelationId.get(relation.relation_id)?.lineage_row_id ?? null,
        pairKey,
        parallelIndex,
        parallelCount: pairCounts.get(pairKey) ?? 1,
        endpointOrdering: leftOccurrence && rightOccurrence
          ? relationEndpointOrderingBasis(leftOccurrence, rightOccurrence)
          : "record_order",
      };
    });
}

function resolveQuestionReference(
  packet: SiteReadyCasePacket,
  relatedId: string,
  topicNodeId: string,
): ResolvedQuestionReference {
  const source = packet.source_snapshot_summaries.find((item) => item.source_id === relatedId);
  if (source) return { relatedId, resolution: "source", targetNodeIds: [source.source_id] };

  const occurrence = packet.claim_occurrences.find(
    (item) => item.occurrence_id === relatedId,
  );
  if (occurrence) {
    return { relatedId, resolution: "occurrence", targetNodeIds: [occurrence.source_id] };
  }

  const claim = packet.actor_claims.find((item) => item.claim_id === relatedId);
  if (claim) {
    const occurrenceSources = packet.claim_occurrences
      .filter((item) => item.claim_id === relatedId)
      .map((item) => item.source_id);
    const targetNodeIds = knownSourceIds(packet, [...claim.source_ids, ...occurrenceSources]);
    return targetNodeIds.length
      ? { relatedId, resolution: "claim", targetNodeIds }
      : { relatedId, resolution: "unknown", targetNodeIds: [topicNodeId] };
  }

  const action = packet.actions.find((item) => item.action_id === relatedId);
  if (action) {
    const targetNodeIds = knownSourceIds(packet, action.source_ids);
    return targetNodeIds.length
      ? { relatedId, resolution: "action", targetNodeIds }
      : { relatedId, resolution: "unknown", targetNodeIds: [topicNodeId] };
  }

  return { relatedId, resolution: "unknown", targetNodeIds: [topicNodeId] };
}

function sourceMatchesLens(
  source: InvestigationSourceNode,
  lens: Exclude<CoverageLens, "all" | "open_questions">,
): boolean {
  if (lens === "baseline") return source.discoveryPass === "baseline";
  if (lens === "coverage_expansion") return source.discoveryPass === "coverage_expansion";
  if (lens === "official_established") return source.lane === "baseline_authority";
  if (lens === "local_firsthand") return source.lane === "local_or_firsthand";
  return source.lane === "challenge_or_correction";
}

function orderedHighlightState(
  map: InvestigationMap,
  nodeIds: Set<string>,
  relationEdgeIds: Set<string>,
  questionEdgeIds: Set<string>,
): MapHighlightState {
  return {
    nodeIds: allNodeIds(map).filter((id) => nodeIds.has(id)),
    relationEdgeIds: map.relationEdges
      .map((edge) => edge.edgeId)
      .filter((id) => relationEdgeIds.has(id)),
    questionEdgeIds: map.questionEdges
      .map((edge) => edge.edgeId)
      .filter((id) => questionEdgeIds.has(id)),
  };
}

function allNodeIds(map: InvestigationMap): string[] {
  return [
    map.topic.nodeId,
    ...map.sources.map((source) => source.nodeId),
    ...map.questions.map((question) => question.nodeId),
  ];
}

function knownSourceIds(packet: SiteReadyCasePacket, sourceIds: string[]): string[] {
  const known = new Set(packet.source_snapshot_summaries.map((source) => source.source_id));
  return unique(sourceIds.filter((sourceId) => known.has(sourceId))).sort();
}

function stablePairKey(leftSourceId: string, rightSourceId: string): string {
  return [leftSourceId, rightSourceId].sort().join("::");
}

export function spatialRelationEdges(
  map: InvestigationMap,
): InvestigationRelationEdge[] {
  return map.relationEdges.filter(
    (edge) => edge.leftSourceId !== edge.rightSourceId,
  );
}

function firstTime(values: ExplicitTimeValue[]): ExplicitTimeValue | null {
  if (values.length === 0) return null;
  const earliestCalendarDate = values
    .map((value) => value.value.slice(0, 10))
    .sort()[0];
  const sameDateValues = values.filter(
    (value) => value.value.slice(0, 10) === earliestCalendarDate,
  );
  return sameDateValues.find((value) => value.precision === "day")
    ?? sameDateValues
      .filter((value) => value.precision === "instant")
      .sort((left, right) => left.value.localeCompare(right.value))[0]
    ?? null;
}

function boundedPreview(value: string): string {
  return boundedReviewerText(value, 220);
}

function explicitTime(
  value: string | null,
  precision: TemporalPrecision,
): ExplicitTimeValue | null {
  return value && precision ? { value, precision } : null;
}

function compactTime(
  value: string | null,
  precision: TemporalPrecision,
): ExplicitTimeValue[] {
  const time = explicitTime(value, precision);
  return time ? [time] : [];
}

function uniqueTimes(
  values: Array<ExplicitTimeValue | null>,
): ExplicitTimeValue[] {
  const byIdentity = new Map<string, ExplicitTimeValue>();
  for (const value of values) {
    if (!value) continue;
    byIdentity.set(`${value.value}:${value.precision}`, value);
  }
  const uniqueValues = [...byIdentity.values()];
  return groupReviewTimestampItems(
    uniqueValues,
    (value) => value,
    (left, right) => left.precision.localeCompare(right.precision),
  ).flatMap((group) => group.items);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
