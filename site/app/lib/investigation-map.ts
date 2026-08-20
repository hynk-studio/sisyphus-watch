import type { DiscoveryLane, DiscoveryProfile } from "./source-profile";
import { DISCOVERY_LANES } from "./source-profile";
import { boundedReviewerText } from "./reviewer-text";
import {
  compareReviewTimestamps,
  groupReviewTimestampItems,
  normalizeTimestampWithPrecision,
  type ReviewTimestampGroupPrecision,
  type ReviewTimestampValue,
  type TemporalPrecision,
} from "./temporal";
import {
  TIME_AXIS_LABELS,
  discoveryLaneLabel,
  recordBoundaryLabel,
  sourceRoleLabel,
  type TimeAxis,
} from "./experience";
import type {
  BoundedSupportReference,
  ClaimOccurrence,
  PacketAction,
  RelationCandidate,
  RelationType,
  SiteReadyCasePacket,
} from "./lineage/contracts";

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

export type ClaimRowKind =
  | "candidate_thread"
  | "standalone_occurrence"
  | "ungrouped_occurrence";

export interface InvestigationClaimRow {
  rowId: string;
  rowOrdinal: number;
  rowKind: ClaimRowKind;
  label: string;
  accessibleName: string;
  traceLabel: string;
  familyId: string | null;
  displayThreadNumber: string | null;
  occurrenceNodeIds: string[];
}

export interface OccurrenceSourceAttachment {
  sourceId: string;
  snapshotId: string;
  title: string;
  publisher: string;
  domain: string;
  sourceRole: string;
  lane: DiscoveryLane | null;
  laneLabel: string;
  discoveryPass: "baseline" | "coverage_expansion" | null;
  provenanceAvailable: boolean;
  sourceBoundaryLabel: string;
  sourceRecordStatus: "candidate" | "canonical";
}

export interface InvestigationOccurrenceNode {
  kind: "claim_occurrence";
  nodeId: string;
  occurrenceId: string;
  claimId: string;
  familyId: string | null;
  rowId: string;
  rowOrdinal: number;
  rowKind: ClaimRowKind;
  actor: string | null;
  originalClaimText: string;
  recordStatus: "candidate" | "canonical";
  occurrenceBoundaryLabel: string;
  selectedTimeAxis: TimeAxis;
  selectedTimeAxisLabel: string;
  selectedTime: string | null;
  selectedTimePrecision: TemporalPrecision;
  timeRegion: "dated" | "unplaced";
  timeGroupId: string | null;
  timeGroupPrecision: ReviewTimestampGroupPrecision | null;
  column: number | null;
  source: OccurrenceSourceAttachment;
  supportKind: ClaimOccurrence["support_kind"];
  supportReference: BoundedSupportReference;
  uncertainty: string;
  confidence: ClaimOccurrence["confidence"];
  origin: ClaimOccurrence["origin"];
}

export interface InvestigationTimeGroup {
  groupId: string;
  calendarDate: string;
  precision: ReviewTimestampGroupPrecision;
  occurrenceNodeIds: string[];
  column: number;
}

export type NonClaimSourceSubtype =
  | "context_interpretation"
  | "action_bearing"
  | "finding_bearing"
  | "source_only"
  | "mixed_non_claim";

export const NON_CLAIM_SOURCE_SUBTYPE_LABELS: Record<
  NonClaimSourceSubtype,
  string
> = {
  context_interpretation: "Context / interpretation",
  action_bearing: "Action-bearing source",
  finding_bearing: "Finding-bearing evidence source",
  source_only: "Source-only record",
  mixed_non_claim: "Mixed non-claim source",
};

export interface InvestigationNonClaimSourceRecord {
  kind: "non_claim_source";
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
  subtype: NonClaimSourceSubtype;
  subtypeLabel: string;
  linkedActionIds: string[];
  linkedFindingIds: string[];
  selectedTimeAxis: TimeAxis;
  selectedTimeAxisLabel: string;
  selectedTime: string | null;
  selectedTimePrecision: TemporalPrecision;
  timeRegion: "dated" | "unplaced";
  timeGroupId: string | null;
  timeGroupPrecision: ReviewTimestampGroupPrecision | null;
  sourceBoundaryLabel: string;
  sourceRecordStatus: "candidate" | "canonical";
  relationEndpointEligible: false;
}

export interface InvestigationNonClaimTimeGroup {
  groupId: string;
  calendarDate: string;
  precision: ReviewTimestampGroupPrecision;
  sourceNodeIds: string[];
}

export type QuestionOriginType =
  | "occurrence"
  | "actor_claim"
  | "action"
  | "source"
  | "topic_unknown";

export interface QuestionOriginSourceIdentity {
  sourceId: string;
  title: string;
  publisher: string;
  sourceRole: string;
}

export interface InvestigationQuestionOrigin {
  originId: string;
  originType: QuestionOriginType;
  relatedId: string | null;
  label: string;
  conciseIdentity: string;
  occurrenceNodeIds: string[];
  nonClaimSourceNodeId: string | null;
  sourceIdentities: QuestionOriginSourceIdentity[];
  drawsOccurrenceTether: boolean;
}

export interface InvestigationQuestionNode {
  kind: "unresolved_question";
  nodeId: string;
  questionId: string;
  question: string;
  recordStatus: "candidate" | "canonical";
  boundaryLabel: string;
  origins: InvestigationQuestionOrigin[];
  occurrenceAnchorIds: string[];
}

export interface InvestigationQuestionTether {
  kind: "evidence_gap";
  tetherId: string;
  fromOccurrenceId: string;
  toQuestionId: string;
  originId: string;
  label: "Evidence gap";
  hasArrow: false;
}

export type RelationVisualFamily =
  | "transformative"
  | "responsive"
  | "tension"
  | "reinforcement_context"
  | "indeterminate"
  | "unrelated";

export interface InvestigationRelationEndpoint {
  occurrenceId: string;
  sourceId: string;
  actor: string;
  conciseClaim: string;
  sourceIdentity: string;
  selectedTime: string | null;
  selectedTimePrecision: TemporalPrecision;
  selectedTimeState: string;
  rowId: string | null;
}

export interface InvestigationRelationLedgerEntry {
  kind: "relation";
  relationId: string;
  relationNumber: number;
  publicNumber: string;
  leftOccurrenceId: string;
  rightOccurrenceId: string;
  fromNodeId: string;
  toNodeId: string;
  leftSourceId: string;
  rightSourceId: string;
  relationType: RelationType;
  shortLabel: string;
  visualFamily: RelationVisualFamily;
  lineStyle: "solid" | "dashed" | "double" | "dotted" | "dash_dot" | "none";
  reviewStatus: "pending_review";
  publicReviewLabel: "Needs review";
  integrityState: "valid" | "duplicate_relation_id";
  recordCount: number;
  candidateRecords: RelationCandidate[];
  reason: string;
  leftSupportReference: BoundedSupportReference;
  rightSupportReference: BoundedSupportReference;
  lineageRowId: string | null;
  pairKey: string;
  parallelIndex: number;
  parallelCount: number;
  leftEndpoint: InvestigationRelationEndpoint;
  rightEndpoint: InvestigationRelationEndpoint;
  sameRow: boolean;
  geometryEligible: boolean;
  directionAsserted: boolean;
  directionExplanation: string;
}

export type RelationPresentationMode = "matrix" | "relation_summary";

export interface RelationPresentationInput {
  availableWidth: number;
  drawableRelationCount: number;
  crossRowRelationCount: number;
  measuredCollisionCount: number;
  compactResponsiveMode: boolean;
  totalRelationCount?: number;
}

export interface RelationPresentationDecision {
  mode: RelationPresentationMode;
  simplified: boolean;
  reason:
    | "full_field_readable"
    | "compact_transformation"
    | "measured_collisions"
    | "available_width_pressure";
  retainedRelationCount: number;
  announcement: string | null;
}

export interface RelationRouteState {
  spatialRelationIds: string[];
  portRelationIds: string[];
  ledgerOnlyRelationIds: string[];
}

export interface CoverageRoleState {
  lane: DiscoveryLane;
  label: string;
  count: number;
  zero: boolean;
  missingTarget: boolean;
  missing: boolean;
}

export interface InvestigationCoverageState {
  totalSources: number;
  representedRoleCount: number;
  targetRoleCount: number;
  roles: CoverageRoleState[];
}

export interface InvestigationMapTopic {
  caseId: string;
  title: string;
  packetTitle: string;
  mode: SiteReadyCasePacket["mode"];
  status: SiteReadyCasePacket["status"];
}

export interface InvestigationMapBase {
  contractVersion: "investigation_map_base.v1";
  packetRunId: string;
  packet: SiteReadyCasePacket;
  initialTimeAxis: TimeAxis;
  topic: InvestigationMapTopic;
  rows: InvestigationClaimRow[];
  occurrenceRowById: ReadonlyMap<string, InvestigationClaimRow>;
  nonClaimSourceSnapshotIds: string[];
  coverage: InvestigationCoverageState;
  diagnostics: string[];
}

export interface InvestigationMap {
  contractVersion: "investigation_map.v2";
  packetRunId: string;
  initialTimeAxis: TimeAxis;
  selectedTimeAxis: TimeAxis;
  selectedTimeAxisLabel: string;
  timeSelectionRule: string;
  unplacedRegionLabel: string;
  topic: InvestigationMapTopic;
  rows: InvestigationClaimRow[];
  occurrences: InvestigationOccurrenceNode[];
  timeGroups: InvestigationTimeGroup[];
  unplacedOccurrenceIds: string[];
  nonClaimSources: InvestigationNonClaimSourceRecord[];
  nonClaimDatedGroups: InvestigationNonClaimTimeGroup[];
  nonClaimDatedSourceNodeIds: string[];
  nonClaimUnplacedSourceNodeIds: string[];
  questions: InvestigationQuestionNode[];
  questionTethers: InvestigationQuestionTether[];
  relationLedger: InvestigationRelationLedgerEntry[];
  relationPresentation: RelationPresentationDecision;
  relationRoutes: RelationRouteState;
  coverage: InvestigationCoverageState;
  columnCount: number;
  diagnostics: string[];
}

export interface QuestionInspectionOrigin extends InvestigationQuestionOrigin {
  topicRootOnly: boolean;
}

export interface MapHighlightState {
  nodeIds: string[];
  relationIds: string[];
  questionTetherIds: string[];
  traceKind:
    | ClaimRowKind
    | "question_context"
    | "non_claim_source"
    | "none";
  traceLabel: string;
}

export type InvestigationTimeAxisAction =
  | { type: "select_axis"; axis: TimeAxis }
  | { type: "display_packet"; packet: SiteReadyCasePacket };

interface BaseRowSeed {
  rowId: string;
  rowKind: ClaimRowKind;
  familyId: string | null;
  occurrenceNodeIds: string[];
  stableKey: string;
}

type ExplicitTimeValue = ReviewTimestampValue;

const DIRECTIONAL_RELATION_TYPES = new Set<RelationType>([
  "supersedes",
  "correction",
  "narrows",
  "follow_up",
]);

const RELATION_SHORT_LABELS: Record<RelationType, string> = {
  supersedes: "Replaces",
  correction: "Corrects",
  narrows: "Narrows",
  follow_up: "Responds",
  contradicts: "Challenges",
  corroborates: "Supports",
  same_event: "Same event",
  unresolved: "Unclear",
  unrelated: "No direct change",
};

const RELATION_VISUAL_FAMILIES: Record<RelationType, RelationVisualFamily> = {
  supersedes: "transformative",
  correction: "transformative",
  narrows: "transformative",
  follow_up: "responsive",
  contradicts: "tension",
  corroborates: "reinforcement_context",
  same_event: "reinforcement_context",
  unresolved: "indeterminate",
  unrelated: "unrelated",
};

const RELATION_LINE_STYLES: Record<RelationVisualFamily, InvestigationRelationLedgerEntry["lineStyle"]> = {
  transformative: "solid",
  responsive: "dashed",
  tension: "solid",
  reinforcement_context: "dotted",
  indeterminate: "dash_dot",
  unrelated: "none",
};

export function deriveInvestigationMapBase(
  packet: SiteReadyCasePacket,
): InvestigationMapBase {
  const initialTimeAxis = chooseInitialTimeAxis(packet);
  const diagnostics: string[] = [];
  const seeds = deriveRowSeeds(packet, diagnostics);
  const orderedSeeds = [...seeds].sort((left, right) =>
    compareRowSeeds(packet, initialTimeAxis, left, right)
  );
  let nextThreadNumber = 1;
  const rows = orderedSeeds.map((seed, index): InvestigationClaimRow => {
    const rowOrdinal = index + 1;
    const displayThreadNumber = seed.rowKind === "candidate_thread"
      ? `T${String(nextThreadNumber++).padStart(2, "0")}`
      : null;
    const label = rowLabel(seed.rowKind, seed.occurrenceNodeIds.length, displayThreadNumber);
    return {
      rowId: seed.rowId,
      rowOrdinal,
      rowKind: seed.rowKind,
      label,
      accessibleName: label,
      traceLabel: traceLabel(seed.rowKind),
      familyId: seed.familyId,
      displayThreadNumber,
      occurrenceNodeIds: [...seed.occurrenceNodeIds],
    };
  });
  const occurrenceRowById = new Map<string, InvestigationClaimRow>();
  for (const row of rows) {
    for (const occurrenceId of row.occurrenceNodeIds) {
      occurrenceRowById.set(occurrenceId, row);
    }
  }
  const occurrenceSourceSnapshots = new Set(
    packet.claim_occurrences.map((occurrence) =>
      sourceSnapshotKey(occurrence.source_id, occurrence.snapshot_id)
    ),
  );
  const nonClaimSourceSnapshotIds = packet.source_snapshot_summaries
    .filter((source) => !occurrenceSourceSnapshots.has(
      sourceSnapshotKey(source.source_id, source.snapshot_id),
    ))
    .map((source) => sourceSnapshotKey(source.source_id, source.snapshot_id))
    .sort();

  return {
    contractVersion: "investigation_map_base.v1",
    packetRunId: packet.run_id,
    packet,
    initialTimeAxis,
    topic: {
      caseId: packet.case_id,
      title: packet.normalized_public_interest_question,
      packetTitle: packet.title,
      mode: packet.mode,
      status: packet.status,
    },
    rows,
    occurrenceRowById,
    nonClaimSourceSnapshotIds,
    coverage: deriveCoverageState(packet),
    diagnostics,
  };
}

export function projectInvestigationMap(
  base: InvestigationMapBase,
  selectedTimeAxis: TimeAxis,
  relationPresentationInput?: RelationPresentationInput,
): InvestigationMap {
  const { packet } = base;
  const sourceBySnapshot = uniqueIndex(
    packet.source_snapshot_summaries,
    (source) => sourceSnapshotKey(source.source_id, source.snapshot_id),
  );
  const occurrenceProjection = packet.claim_occurrences.map((occurrence) => {
    const row = base.occurrenceRowById.get(occurrence.occurrence_id);
    if (!row) return null;
    const selectedTime = occurrenceTime(occurrence, selectedTimeAxis);
    const source = sourceBySnapshot.get(
      sourceSnapshotKey(occurrence.source_id, occurrence.snapshot_id),
    );
    return {
      occurrence,
      row,
      selectedTime,
      source,
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const datedOccurrenceProjection = occurrenceProjection.filter(
    (item) => item.selectedTime !== null,
  );
  const groupedOccurrences = groupReviewTimestampItems(
    datedOccurrenceProjection,
    (item) => item.selectedTime as ExplicitTimeValue,
    (left, right) =>
      left.row.rowOrdinal - right.row.rowOrdinal
      || left.occurrence.occurrence_id.localeCompare(right.occurrence.occurrence_id),
  );
  const occurrenceGroupById = new Map<string, {
    groupId: string;
    precision: ReviewTimestampGroupPrecision;
    column: number;
  }>();
  const timeGroups: InvestigationTimeGroup[] = groupedOccurrences.map((group, index) => {
    const groupId = `time_group:${selectedTimeAxis}:${group.calendarDate}`;
    const column = index + 1;
    for (const item of group.items) {
      occurrenceGroupById.set(item.occurrence.occurrence_id, {
        groupId,
        precision: group.precision,
        column,
      });
    }
    return {
      groupId,
      calendarDate: group.calendarDate,
      precision: group.precision,
      occurrenceNodeIds: group.items.map((item) => item.occurrence.occurrence_id),
      column,
    };
  });
  const occurrences: InvestigationOccurrenceNode[] = occurrenceProjection
    .sort((left, right) =>
      left.row.rowOrdinal - right.row.rowOrdinal
      || compareNullableTimes(left.selectedTime, right.selectedTime)
      || left.occurrence.occurrence_id.localeCompare(right.occurrence.occurrence_id)
    )
    .map(({ occurrence, row, selectedTime, source }) => {
      const group = occurrenceGroupById.get(occurrence.occurrence_id) ?? null;
      return {
        kind: "claim_occurrence",
        nodeId: occurrence.occurrence_id,
        occurrenceId: occurrence.occurrence_id,
        claimId: occurrence.claim_id,
        familyId: occurrence.candidate_claim_family_id,
        rowId: row.rowId,
        rowOrdinal: row.rowOrdinal,
        rowKind: row.rowKind,
        actor: occurrence.actor,
        originalClaimText: occurrence.original_claim_text,
        recordStatus: occurrence.status,
        occurrenceBoundaryLabel: recordBoundaryLabel(occurrence.status),
        selectedTimeAxis,
        selectedTimeAxisLabel: TIME_AXIS_LABELS[selectedTimeAxis],
        selectedTime: selectedTime?.value ?? null,
        selectedTimePrecision: selectedTime?.precision ?? null,
        timeRegion: selectedTime ? "dated" : "unplaced",
        timeGroupId: group?.groupId ?? null,
        timeGroupPrecision: group?.precision ?? null,
        column: group?.column ?? null,
        source: occurrenceSourceAttachment(occurrence, source),
        supportKind: occurrence.support_kind,
        supportReference: { ...occurrence.support_reference },
        uncertainty: occurrence.uncertainty,
        confidence: occurrence.confidence,
        origin: occurrence.origin,
      };
    });
  const occurrenceById = new Map(
    occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence]),
  );
  const nonClaimProjection = deriveNonClaimSources(
    packet,
    base.nonClaimSourceSnapshotIds,
    selectedTimeAxis,
  );
  const questions = deriveQuestions(packet, occurrenceById, nonClaimProjection.records);
  const questionTethers = questions.flatMap((question) =>
    question.origins.flatMap((origin) =>
      origin.drawsOccurrenceTether
        ? origin.occurrenceNodeIds.map((occurrenceId, index) => ({
          kind: "evidence_gap" as const,
          tetherId: `question_tether:${question.questionId}:${origin.originId}:${index}`,
          fromOccurrenceId: occurrenceId,
          toQuestionId: question.questionId,
          originId: origin.originId,
          label: "Evidence gap" as const,
          hasArrow: false as const,
        }))
        : [],
    ),
  );
  const relationLedger = deriveRelationLedger(
    packet,
    occurrences,
    selectedTimeAxis,
  );
  const relationPresentation = deriveRelationPresentation(
    relationPresentationInput ? {
      ...relationPresentationInput,
      totalRelationCount: relationLedger.length,
    } : {
      availableWidth: Number.POSITIVE_INFINITY,
      drawableRelationCount: relationLedger.filter((entry) => entry.geometryEligible).length,
      crossRowRelationCount: relationLedger.filter(
        (entry) => entry.geometryEligible && !entry.sameRow,
      ).length,
      measuredCollisionCount: 0,
      compactResponsiveMode: false,
      totalRelationCount: relationLedger.length,
    },
  );
  const relationRoutes = deriveRelationRoutes(
    relationLedger,
    relationPresentation.mode,
    null,
  );

  return {
    contractVersion: "investigation_map.v2",
    packetRunId: packet.run_id,
    initialTimeAxis: base.initialTimeAxis,
    selectedTimeAxis,
    selectedTimeAxisLabel: TIME_AXIS_LABELS[selectedTimeAxis],
    timeSelectionRule:
      `Placed records use only explicit ${TIME_AXIS_LABELS[selectedTimeAxis].toLowerCase()} values. `
      + "Exact instants may retain clock order; day-level same-date records are unordered peers, including beside exact instants. Missing selected-axis values are not substituted.",
    unplacedRegionLabel: `Unplaced on ${TIME_AXIS_LABELS[selectedTimeAxis]}`,
    topic: base.topic,
    rows: base.rows,
    occurrences,
    timeGroups,
    unplacedOccurrenceIds: occurrences
      .filter((occurrence) => occurrence.timeRegion === "unplaced")
      .map((occurrence) => occurrence.occurrenceId),
    nonClaimSources: nonClaimProjection.records,
    nonClaimDatedGroups: nonClaimProjection.groups,
    nonClaimDatedSourceNodeIds: nonClaimProjection.records
      .filter((source) => source.timeRegion === "dated")
      .map((source) => source.nodeId),
    nonClaimUnplacedSourceNodeIds: nonClaimProjection.records
      .filter((source) => source.timeRegion === "unplaced")
      .map((source) => source.nodeId),
    questions,
    questionTethers,
    relationLedger,
    relationPresentation,
    relationRoutes,
    coverage: base.coverage,
    columnCount: Math.max(timeGroups.length, 1),
    diagnostics: [
      ...base.diagnostics,
      ...relationLedger
        .filter((entry) => entry.integrityState === "duplicate_relation_id")
        .map((entry) => `duplicate_relation_id:${entry.relationId}:${entry.recordCount}`),
    ],
  };
}

export function deriveInvestigationMap(
  packet: SiteReadyCasePacket,
  selectedTimeAxis: TimeAxis,
  relationPresentationInput?: RelationPresentationInput,
): InvestigationMap {
  return projectInvestigationMap(
    deriveInvestigationMapBase(packet),
    selectedTimeAxis,
    relationPresentationInput,
  );
}

export function chooseInitialTimeAxis(packet: SiteReadyCasePacket): TimeAxis {
  if (packet.claim_occurrences.length > 0) {
    if (packet.claim_occurrences.some((occurrence) =>
      occurrenceTime(occurrence, "event_time") !== null
    )) return "event_time";
    if (packet.claim_occurrences.some((occurrence) =>
      occurrenceTime(occurrence, "publication_time") !== null
    )) return "publication_time";
    if (packet.claim_occurrences.some((occurrence) =>
      occurrenceTime(occurrence, "actor_assertion_time") !== null
    )) return "actor_assertion_time";
    return "retrieval_time";
  }
  if (packet.source_snapshot_summaries.some((source) =>
    explicitTime(source.published_at, source.published_at_precision) !== null
  )) return "publication_time";
  return "retrieval_time";
}

export function investigationTimeAxisReducer(
  currentAxis: TimeAxis,
  action: InvestigationTimeAxisAction,
): TimeAxis {
  if (action.type === "select_axis") return action.axis;
  return chooseInitialTimeAxis(action.packet);
}

export function deriveRelationPresentation(
  input: RelationPresentationInput,
): RelationPresentationDecision {
  const retainedRelationCount = input.totalRelationCount
    ?? input.drawableRelationCount;
  const simplifiedResult = (
    reason: Exclude<RelationPresentationDecision["reason"], "full_field_readable">,
  ): RelationPresentationDecision => ({
    mode: "relation_summary",
    simplified: true,
    reason,
    retainedRelationCount,
    announcement:
      `Spatial overview simplified · all ${retainedRelationCount} candidate relations remain listed below`,
  });
  if (input.compactResponsiveMode && input.drawableRelationCount > 0) {
    return simplifiedResult("compact_transformation");
  }
  if (input.measuredCollisionCount > 0) {
    return simplifiedResult("measured_collisions");
  }
  const width = Math.max(input.availableWidth, 1);
  const pathPressure = input.drawableRelationCount * 118;
  const crossRowPressure = input.crossRowRelationCount * 164;
  if (pathPressure > width || crossRowPressure > width * 0.86) {
    return simplifiedResult("available_width_pressure");
  }
  return {
    mode: "matrix",
    simplified: false,
    reason: "full_field_readable",
    retainedRelationCount,
    announcement: null,
  };
}

export function deriveRelationRoutes(
  ledger: readonly InvestigationRelationLedgerEntry[],
  mode: RelationPresentationMode,
  selectedRelationId: string | null,
): RelationRouteState {
  const spatialRelationIds: string[] = [];
  const portRelationIds: string[] = [];
  const ledgerOnlyRelationIds: string[] = [];
  for (const entry of ledger) {
    if (!entry.geometryEligible) {
      ledgerOnlyRelationIds.push(entry.relationId);
      continue;
    }
    if (
      mode === "matrix"
      || entry.sameRow
      || entry.relationId === selectedRelationId
    ) {
      spatialRelationIds.push(entry.relationId);
    } else {
      portRelationIds.push(entry.relationId);
    }
  }
  return { spatialRelationIds, portRelationIds, ledgerOnlyRelationIds };
}

export function spatialRelationEdges(
  map: InvestigationMap,
  mode: RelationPresentationMode = map.relationPresentation.mode,
  selectedRelationId: string | null = null,
): InvestigationRelationLedgerEntry[] {
  const routes = deriveRelationRoutes(map.relationLedger, mode, selectedRelationId);
  const spatialIds = new Set(routes.spatialRelationIds);
  return map.relationLedger.filter((entry) => spatialIds.has(entry.relationId));
}

export function deriveQuestionInspectionOrigins(
  map: InvestigationMap,
  questionId: string,
): QuestionInspectionOrigin[] {
  const question = map.questions.find((item) => item.questionId === questionId);
  if (!question) return [];
  return question.origins.map((origin) => ({
    ...origin,
    sourceIdentities: origin.sourceIdentities.map((source) => ({ ...source })),
    occurrenceNodeIds: [...origin.occurrenceNodeIds],
    topicRootOnly: origin.originType === "topic_unknown",
  }));
}

export function deriveThreadTrace(
  map: InvestigationMap,
  selectedNodeId: string,
): MapHighlightState {
  const selectedOccurrence = map.occurrences.find(
    (occurrence) => occurrence.nodeId === selectedNodeId,
  );
  const selectedQuestion = map.questions.find(
    (question) => question.nodeId === selectedNodeId,
  );
  const selectedNonClaim = map.nonClaimSources.find(
    (source) => source.nodeId === selectedNodeId || source.sourceId === selectedNodeId,
  );
  const nodeIds = new Set<string>();
  const relationIds = new Set<string>();
  const questionTetherIds = new Set<string>();
  let traceKind: MapHighlightState["traceKind"] = "none";
  let label = "No trace is available for this selection.";

  if (selectedOccurrence) {
    const row = map.rows.find((item) => item.rowId === selectedOccurrence.rowId);
    traceKind = row?.rowKind ?? "ungrouped_occurrence";
    label = row?.traceLabel ?? "Trace this ungrouped claim occurrence";
    if (row?.rowKind === "candidate_thread") {
      row.occurrenceNodeIds.forEach((id) => nodeIds.add(id));
    } else {
      nodeIds.add(selectedOccurrence.nodeId);
    }
    const traceSeedIds = new Set(nodeIds);
    for (const relation of map.relationLedger) {
      if (!traceSeedIds.has(relation.leftOccurrenceId)
        && !traceSeedIds.has(relation.rightOccurrenceId)) continue;
      relationIds.add(relation.relationId);
      nodeIds.add(relation.leftOccurrenceId);
      nodeIds.add(relation.rightOccurrenceId);
    }
    for (const tether of map.questionTethers) {
      if (!nodeIds.has(tether.fromOccurrenceId)) continue;
      questionTetherIds.add(tether.tetherId);
      nodeIds.add(tether.toQuestionId);
    }
  } else if (selectedQuestion) {
    traceKind = "question_context";
    label = "Trace conservative evidence-question origins";
    nodeIds.add(selectedQuestion.nodeId);
    selectedQuestion.occurrenceAnchorIds.forEach((id) => nodeIds.add(id));
    for (const tether of map.questionTethers) {
      if (tether.toQuestionId === selectedQuestion.questionId) {
        questionTetherIds.add(tether.tetherId);
      }
    }
  } else if (selectedNonClaim) {
    traceKind = "non_claim_source";
    label = "Show this non-claim source record";
    nodeIds.add(selectedNonClaim.nodeId);
  }

  return orderedHighlightState(
    map,
    nodeIds,
    relationIds,
    questionTetherIds,
    traceKind,
    label,
  );
}

export function deriveCoverageHighlight(
  map: InvestigationMap,
  lens: CoverageLens,
): MapHighlightState {
  if (lens === "all") {
    return {
      nodeIds: allNodeIds(map),
      relationIds: map.relationLedger.map((entry) => entry.relationId),
      questionTetherIds: map.questionTethers.map((tether) => tether.tetherId),
      traceKind: "none",
      traceLabel: "All Map material",
    };
  }
  const nodeIds = new Set<string>();
  if (lens === "open_questions") {
    for (const question of map.questions) {
      nodeIds.add(question.nodeId);
      question.occurrenceAnchorIds.forEach((id) => nodeIds.add(id));
    }
  } else {
    for (const occurrence of map.occurrences) {
      if (sourceMatchesLens(occurrence.source, lens)) nodeIds.add(occurrence.nodeId);
    }
    for (const source of map.nonClaimSources) {
      if (sourceMatchesLens(source, lens)) nodeIds.add(source.nodeId);
    }
  }
  const relationIds = new Set(
    map.relationLedger
      .filter((entry) =>
        nodeIds.has(entry.leftOccurrenceId) && nodeIds.has(entry.rightOccurrenceId)
      )
      .map((entry) => entry.relationId),
  );
  const questionTetherIds = new Set(
    map.questionTethers
      .filter((tether) =>
        nodeIds.has(tether.fromOccurrenceId) || nodeIds.has(tether.toQuestionId)
      )
      .map((tether) => tether.tetherId),
  );
  for (const tether of map.questionTethers) {
    if (!questionTetherIds.has(tether.tetherId)) continue;
    nodeIds.add(tether.fromOccurrenceId);
    nodeIds.add(tether.toQuestionId);
  }
  return orderedHighlightState(
    map,
    nodeIds,
    relationIds,
    questionTetherIds,
    "none",
    COVERAGE_LENS_LABELS[lens],
  );
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

function deriveRowSeeds(
  packet: SiteReadyCasePacket,
  diagnostics: string[],
): BaseRowSeed[] {
  const occurrenceGroups = groupBy(
    packet.claim_occurrences,
    (occurrence) => occurrence.occurrence_id,
  );
  const familyGroups = groupBy(
    packet.candidate_claim_families,
    (family) => family.family_id,
  );
  const membershipCounts = new Map<string, number>();
  for (const family of packet.candidate_claim_families) {
    for (const occurrenceId of family.occurrence_ids) {
      membershipCounts.set(
        occurrenceId,
        (membershipCounts.get(occurrenceId) ?? 0) + 1,
      );
    }
  }
  const validOccurrenceIds = new Set<string>();
  const seeds: BaseRowSeed[] = [];
  for (const [familyId, families] of familyGroups) {
    if (families.length !== 1) {
      diagnostics.push(`family_membership_inconsistent:${familyId}`);
      continue;
    }
    const family = families[0];
    const uniqueIds = new Set(family.occurrence_ids);
    const occurrencesPointingToFamily = packet.claim_occurrences.filter(
      (occurrence) => occurrence.candidate_claim_family_id === familyId,
    );
    const referencesResolve = family.occurrence_ids.every(
      (id) => occurrenceGroups.get(id)?.length === 1,
    );
    const membersPointBack = family.occurrence_ids.every((id) =>
      occurrenceGroups.get(id)?.[0]?.candidate_claim_family_id === familyId
    );
    const inverseMembershipMatches = occurrencesPointingToFamily.length === uniqueIds.size
      && occurrencesPointingToFamily.every((occurrence) => uniqueIds.has(occurrence.occurrence_id));
    const exclusiveMembership = family.occurrence_ids.every(
      (id) => membershipCounts.get(id) === 1,
    );
    const singletonAllowed = family.occurrence_ids.length !== 1 || family.unresolved;
    const valid = family.occurrence_ids.length > 0
      && uniqueIds.size === family.occurrence_ids.length
      && referencesResolve
      && membersPointBack
      && inverseMembershipMatches
      && exclusiveMembership
      && singletonAllowed;
    if (!valid) {
      diagnostics.push(`family_membership_inconsistent:${familyId}`);
      continue;
    }
    const occurrenceNodeIds = [...family.occurrence_ids].sort();
    occurrenceNodeIds.forEach((id) => validOccurrenceIds.add(id));
    seeds.push({
      rowId: `family_row:${familyId}`,
      rowKind: occurrenceNodeIds.length > 1
        ? "candidate_thread"
        : "standalone_occurrence",
      familyId,
      occurrenceNodeIds,
      stableKey: `family:${familyId}`,
    });
  }
  for (const occurrence of packet.claim_occurrences) {
    if (validOccurrenceIds.has(occurrence.occurrence_id)) continue;
    seeds.push({
      rowId: `ungrouped_row:${occurrence.occurrence_id}`,
      rowKind: "ungrouped_occurrence",
      familyId: null,
      occurrenceNodeIds: [occurrence.occurrence_id],
      stableKey: `occurrence:${occurrence.occurrence_id}`,
    });
  }
  return seeds;
}

function compareRowSeeds(
  packet: SiteReadyCasePacket,
  initialAxis: TimeAxis,
  left: BaseRowSeed,
  right: BaseRowSeed,
): number {
  const occurrenceById = new Map(
    packet.claim_occurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
  );
  const leftTime = earliestRowTime(left, occurrenceById, initialAxis);
  const rightTime = earliestRowTime(right, occurrenceById, initialAxis);
  if (leftTime && !rightTime) return -1;
  if (!leftTime && rightTime) return 1;
  if (leftTime && rightTime) {
    const comparison = leftTime.value.slice(0, 10)
      .localeCompare(rightTime.value.slice(0, 10));
    if (comparison !== 0) return comparison;
  }
  return left.stableKey.localeCompare(right.stableKey);
}

function earliestRowTime(
  row: BaseRowSeed,
  occurrenceById: ReadonlyMap<string, ClaimOccurrence>,
  axis: TimeAxis,
): ExplicitTimeValue | null {
  const times = row.occurrenceNodeIds
    .map((id) => occurrenceById.get(id))
    .filter((occurrence): occurrence is ClaimOccurrence => Boolean(occurrence))
    .map((occurrence) => occurrenceTime(occurrence, axis))
    .filter((time): time is ExplicitTimeValue => Boolean(time));
  if (times.length === 0) return null;
  return [...times].sort((left, right) =>
    left.value.slice(0, 10).localeCompare(right.value.slice(0, 10))
    || `${left.value}:${left.precision}`.localeCompare(`${right.value}:${right.precision}`)
  )[0];
}

function rowLabel(
  kind: ClaimRowKind,
  count: number,
  threadNumber: string | null,
): string {
  if (kind === "candidate_thread") {
    return `${threadNumber ?? "Candidate"} · Candidate thread · ${count} occurrences · needs review`;
  }
  if (kind === "standalone_occurrence") {
    return "Standalone claim occurrence · grouping unresolved";
  }
  return "Ungrouped claim occurrence";
}

function traceLabel(kind: ClaimRowKind): string {
  if (kind === "candidate_thread") return "Candidate thread trace";
  if (kind === "standalone_occurrence") return "Standalone occurrence trace";
  return "Ungrouped occurrence trace";
}

function occurrenceTime(
  occurrence: ClaimOccurrence,
  axis: TimeAxis,
): ExplicitTimeValue | null {
  if (axis === "event_time") {
    return explicitTime(
      occurrence.event_time_candidate,
      occurrence.event_time_candidate_precision,
    );
  }
  if (axis === "publication_time") {
    return explicitTime(
      occurrence.source_publication_time,
      occurrence.source_publication_time_precision,
    );
  }
  if (axis === "actor_assertion_time") {
    return explicitTime(
      occurrence.assertion_time_candidate,
      occurrence.assertion_time_candidate_precision,
    );
  }
  return explicitTime(
    occurrence.source_retrieval_time,
    occurrence.source_retrieval_time_precision,
  );
}

function occurrenceSourceAttachment(
  occurrence: ClaimOccurrence,
  source: SiteReadyCasePacket["source_snapshot_summaries"][number] | undefined,
): OccurrenceSourceAttachment {
  if (!source) {
    return {
      sourceId: occurrence.source_id,
      snapshotId: occurrence.snapshot_id,
      title: "Source record unavailable",
      publisher: "Publisher unavailable",
      domain: "Domain unavailable",
      sourceRole: "Public source",
      lane: null,
      laneLabel: "Source role unavailable",
      discoveryPass: null,
      provenanceAvailable: false,
      sourceBoundaryLabel: sourceBoundaryLabel(occurrence.source_record_status),
      sourceRecordStatus: occurrence.source_record_status,
    };
  }
  return {
    sourceId: source.source_id,
    snapshotId: source.snapshot_id,
    title: source.title,
    publisher: source.publisher,
    domain: source.domain,
    sourceRole: sourceRoleLabel(source),
    lane: source.source_selection.discovery_lane,
    laneLabel: discoveryLaneLabel(source.source_selection.discovery_lane),
    discoveryPass: source.source_selection.discovery_pass,
    provenanceAvailable: true,
    sourceBoundaryLabel: sourceBoundaryLabel(source.record_status),
    sourceRecordStatus: source.record_status,
  };
}

function deriveNonClaimSources(
  packet: SiteReadyCasePacket,
  sourceSnapshotIds: readonly string[],
  selectedTimeAxis: TimeAxis,
): {
  records: InvestigationNonClaimSourceRecord[];
  groups: InvestigationNonClaimTimeGroup[];
} {
  const sourceSnapshotIdSet = new Set(sourceSnapshotIds);
  const baseRecords = packet.source_snapshot_summaries
    .filter((source) => sourceSnapshotIdSet.has(
      sourceSnapshotKey(source.source_id, source.snapshot_id),
    ))
    .map((source) => {
      const linkedActions = packet.actions.filter((action) =>
        action.source_ids.includes(source.source_id)
      );
      const linkedFindings = packet.source_bound_findings.filter((finding) =>
        finding.source_ids.includes(source.source_id)
      );
      const subtype = nonClaimSubtype(
        source.source_selection.information_proximity === "analysis_or_commentary",
        linkedActions.length > 0,
        linkedFindings.length > 0,
      );
      const selectedTime = nonClaimSourceTime(source, selectedTimeAxis);
      return {
        source,
        linkedActions,
        linkedFindings,
        subtype,
        selectedTime,
      };
    });
  const dated = baseRecords.filter((record) => record.selectedTime !== null);
  const grouped = groupReviewTimestampItems(
    dated,
    (record) => record.selectedTime as ExplicitTimeValue,
    (left, right) => left.source.source_id.localeCompare(right.source.source_id),
  );
  const groupBySourceId = new Map<string, {
    groupId: string;
    precision: ReviewTimestampGroupPrecision;
  }>();
  const groups: InvestigationNonClaimTimeGroup[] = grouped.map((group) => {
    const groupId = `non_claim_time_group:${selectedTimeAxis}:${group.calendarDate}`;
    group.items.forEach((record) => groupBySourceId.set(record.source.source_id, {
      groupId,
      precision: group.precision,
    }));
    return {
      groupId,
      calendarDate: group.calendarDate,
      precision: group.precision,
      sourceNodeIds: group.items.map((record) =>
        nonClaimNodeId(record.source.source_id, record.source.snapshot_id)
      ),
    };
  });
  const records: InvestigationNonClaimSourceRecord[] = baseRecords
    .sort((left, right) =>
      compareNullableTimes(left.selectedTime, right.selectedTime)
      || left.source.source_id.localeCompare(right.source.source_id)
    )
    .map(({ source, linkedActions, linkedFindings, subtype, selectedTime }) => {
      const group = groupBySourceId.get(source.source_id) ?? null;
      return {
        kind: "non_claim_source",
        nodeId: nonClaimNodeId(source.source_id, source.snapshot_id),
        sourceId: source.source_id,
        snapshotId: source.snapshot_id,
        title: source.title,
        publisher: source.publisher,
        domain: source.domain,
        sourceRole: sourceRoleLabel(source),
        lane: source.source_selection.discovery_lane,
        laneLabel: discoveryLaneLabel(source.source_selection.discovery_lane),
        discoveryPass: source.source_selection.discovery_pass,
        subtype,
        subtypeLabel: NON_CLAIM_SOURCE_SUBTYPE_LABELS[subtype],
        linkedActionIds: linkedActions.map((action) => action.action_id).sort(),
        linkedFindingIds: linkedFindings.map((finding) => finding.finding_id).sort(),
        selectedTimeAxis,
        selectedTimeAxisLabel: TIME_AXIS_LABELS[selectedTimeAxis],
        selectedTime: selectedTime?.value ?? null,
        selectedTimePrecision: selectedTime?.precision ?? null,
        timeRegion: selectedTime ? "dated" : "unplaced",
        timeGroupId: group?.groupId ?? null,
        timeGroupPrecision: group?.precision ?? null,
        sourceBoundaryLabel: sourceBoundaryLabel(source.record_status),
        sourceRecordStatus: source.record_status,
        relationEndpointEligible: false,
      };
    });
  return { records, groups };
}

function nonClaimSourceTime(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
  axis: TimeAxis,
): ExplicitTimeValue | null {
  if (axis === "publication_time") {
    return explicitTime(source.published_at, source.published_at_precision);
  }
  if (axis === "retrieval_time") {
    return explicitTime(source.retrieved_at, "instant");
  }
  return null;
}

function nonClaimSubtype(
  hasContext: boolean,
  hasAction: boolean,
  hasFinding: boolean,
): NonClaimSourceSubtype {
  const roleCount = Number(hasContext) + Number(hasAction) + Number(hasFinding);
  if (roleCount > 1) return "mixed_non_claim";
  if (hasContext) return "context_interpretation";
  if (hasAction) return "action_bearing";
  if (hasFinding) return "finding_bearing";
  return "source_only";
}

function deriveQuestions(
  packet: SiteReadyCasePacket,
  occurrenceById: ReadonlyMap<string, InvestigationOccurrenceNode>,
  nonClaimSources: readonly InvestigationNonClaimSourceRecord[],
): InvestigationQuestionNode[] {
  const actorClaimsById = groupBy(packet.actor_claims, (claim) => claim.claim_id);
  const actionsById = groupBy(packet.actions, (action) => action.action_id);
  const sourcesById = groupBy(
    packet.source_snapshot_summaries,
    (source) => source.source_id,
  );
  const occurrencesById = groupBy(
    packet.claim_occurrences,
    (occurrence) => occurrence.occurrence_id,
  );
  const nonClaimBySourceId = uniqueIndex(
    nonClaimSources,
    (source) => source.sourceId,
  );
  return packet.unresolved_questions.map((question) => {
    const relatedIds = unique(question.related_ids);
    const origins = (relatedIds.length ? relatedIds : [null]).map(
      (relatedId, index) => deriveQuestionOrigin({
        packet,
        relatedId,
        originIndex: index,
        actorClaimsById,
        actionsById,
        sourcesById,
        occurrencesById,
        occurrenceById,
        nonClaimBySourceId,
      }),
    );
    return {
      kind: "unresolved_question" as const,
      nodeId: question.question_id,
      questionId: question.question_id,
      question: question.question,
      recordStatus: question.record_status,
      boundaryLabel: question.record_status === "canonical"
        ? "Prepared case record"
        : "Needs review",
      origins,
      occurrenceAnchorIds: unique(origins.flatMap((origin) =>
        origin.drawsOccurrenceTether ? origin.occurrenceNodeIds : []
      )),
    };
  });
}

function deriveQuestionOrigin(input: {
  packet: SiteReadyCasePacket;
  relatedId: string | null;
  originIndex: number;
  actorClaimsById: ReadonlyMap<string, SiteReadyCasePacket["actor_claims"]>;
  actionsById: ReadonlyMap<string, SiteReadyCasePacket["actions"]>;
  sourcesById: ReadonlyMap<string, SiteReadyCasePacket["source_snapshot_summaries"]>;
  occurrencesById: ReadonlyMap<string, SiteReadyCasePacket["claim_occurrences"]>;
  occurrenceById: ReadonlyMap<string, InvestigationOccurrenceNode>;
  nonClaimBySourceId: ReadonlyMap<string, InvestigationNonClaimSourceRecord>;
}): InvestigationQuestionOrigin {
  const {
    packet,
    relatedId,
    originIndex,
    actorClaimsById,
    actionsById,
    sourcesById,
    occurrencesById,
    occurrenceById,
    nonClaimBySourceId,
  } = input;
  const originId = `question_origin:${originIndex}:${relatedId ?? "topic"}`;
  if (!relatedId) return topicUnknownOrigin(originId, null);
  const matchingKinds = [
    occurrencesById.get(relatedId)?.length ? "occurrence" : null,
    actorClaimsById.get(relatedId)?.length ? "actor_claim" : null,
    actionsById.get(relatedId)?.length ? "action" : null,
    sourcesById.get(relatedId)?.length ? "source" : null,
  ].filter((kind): kind is Exclude<QuestionOriginType, "topic_unknown"> => Boolean(kind));
  if (matchingKinds.length !== 1) return topicUnknownOrigin(originId, relatedId);
  const kind = matchingKinds[0];
  if (kind === "occurrence") {
    const occurrences = occurrencesById.get(relatedId) ?? [];
    if (occurrences.length !== 1 || !occurrenceById.has(relatedId)) {
      return topicUnknownOrigin(originId, relatedId);
    }
    const occurrence = occurrenceById.get(relatedId) as InvestigationOccurrenceNode;
    return {
      originId,
      originType: "occurrence",
      relatedId,
      label: "Via claim occurrence",
      conciseIdentity: `${occurrence.actor ?? "Actor not separately identified"}: ${boundedReviewerText(occurrence.originalClaimText, 120)}`,
      occurrenceNodeIds: [occurrence.occurrenceId],
      nonClaimSourceNodeId: null,
      sourceIdentities: [sourceIdentityFromAttachment(occurrence.source)],
      drawsOccurrenceTether: true,
    };
  }
  if (kind === "actor_claim") {
    const claims = actorClaimsById.get(relatedId) ?? [];
    if (claims.length !== 1) return topicUnknownOrigin(originId, relatedId);
    const claim = claims[0];
    const matchingOccurrences = packet.claim_occurrences
      .filter((occurrence) =>
        occurrence.claim_id === relatedId
        && claim.source_ids.includes(occurrence.source_id)
      )
      .map((occurrence) => occurrenceById.get(occurrence.occurrence_id))
      .filter((occurrence): occurrence is InvestigationOccurrenceNode => Boolean(occurrence));
    return {
      originId,
      originType: "actor_claim",
      relatedId,
      label: matchingOccurrences.length
        ? "Via matching claim occurrences"
        : "Via actor claim record",
      conciseIdentity: `${claim.actor ?? "Actor not separately identified"}: ${boundedReviewerText(claim.claim_text, 120)}`,
      occurrenceNodeIds: matchingOccurrences.map((occurrence) => occurrence.occurrenceId),
      nonClaimSourceNodeId: null,
      sourceIdentities: uniqueSourceIdentities(
        matchingOccurrences.map((occurrence) =>
          sourceIdentityFromAttachment(occurrence.source)
        ),
      ),
      drawsOccurrenceTether: matchingOccurrences.length > 0,
    };
  }
  if (kind === "action") {
    const actions = actionsById.get(relatedId) ?? [];
    if (actions.length !== 1) return topicUnknownOrigin(originId, relatedId);
    const action = actions[0];
    const sourceIdentities = action.source_ids.flatMap((sourceId) =>
      sourceIdentitiesForPacketSource(packet, sourceId)
    );
    return {
      originId,
      originType: "action",
      relatedId,
      label: "Via action record",
      conciseIdentity: actionIdentity(action, sourceIdentities),
      occurrenceNodeIds: [],
      nonClaimSourceNodeId: null,
      sourceIdentities: uniqueSourceIdentities(sourceIdentities),
      drawsOccurrenceTether: false,
    };
  }
  const sources = sourcesById.get(relatedId) ?? [];
  if (sources.length !== 1) return topicUnknownOrigin(originId, relatedId);
  const source = sources[0];
  return {
    originId,
    originType: "source",
    relatedId,
    label: "Via source record",
    conciseIdentity: `${source.title} · ${source.publisher}`,
    occurrenceNodeIds: [],
    nonClaimSourceNodeId: nonClaimBySourceId.get(source.source_id)?.nodeId ?? null,
    sourceIdentities: [packetSourceIdentity(source)],
    drawsOccurrenceTether: false,
  };
}

function topicUnknownOrigin(
  originId: string,
  relatedId: string | null,
): InvestigationQuestionOrigin {
  return {
    originId,
    originType: "topic_unknown",
    relatedId,
    label: "Topic-level evidence gap",
    conciseIdentity: relatedId
      ? "Related record type is unavailable or ambiguous in this packet"
      : "No specific related record is supplied",
    occurrenceNodeIds: [],
    nonClaimSourceNodeId: null,
    sourceIdentities: [],
    drawsOccurrenceTether: false,
  };
}

function deriveRelationLedger(
  packet: SiteReadyCasePacket,
  occurrences: readonly InvestigationOccurrenceNode[],
  selectedTimeAxis: TimeAxis,
): InvestigationRelationLedgerEntry[] {
  const occurrenceGroups = groupBy(occurrences, (occurrence) => occurrence.occurrenceId);
  const lineageByRelationId = new Map(
    packet.claim_lineage_rows.map((row) => [row.relation_id, row]),
  );
  const relationGroups = [...groupBy(
    packet.relation_candidates,
    (relation) => relation.relation_id,
  ).values()];
  const pairCounts = new Map<string, number>();
  for (const relations of relationGroups) {
    const relation = relations[0];
    const pairKey = stablePairKey(
      relation.left_occurrence_id,
      relation.right_occurrence_id,
    );
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
  }
  const pairIndexes = new Map<string, number>();
  return relationGroups.map((candidateRecords, index) => {
    const relation = candidateRecords[0];
    const left = occurrenceGroups.get(relation.left_occurrence_id)?.[0];
    const right = occurrenceGroups.get(relation.right_occurrence_id)?.[0];
    const endpointsUnique = occurrenceGroups.get(relation.left_occurrence_id)?.length === 1
      && occurrenceGroups.get(relation.right_occurrence_id)?.length === 1;
    const redundantReferencesMatch = Boolean(left && right)
      && left?.source.sourceId === relation.left_source_id
      && right?.source.sourceId === relation.right_source_id
      && left?.source.snapshotId === relation.left_snapshot_id
      && right?.source.snapshotId === relation.right_snapshot_id
      && relation.left_support_reference.source_id === relation.left_source_id
      && relation.right_support_reference.source_id === relation.right_source_id
      && relation.left_support_reference.snapshot_id === relation.left_snapshot_id
      && relation.right_support_reference.snapshot_id === relation.right_snapshot_id;
    const pairKey = stablePairKey(
      relation.left_occurrence_id,
      relation.right_occurrence_id,
    );
    const parallelIndex = pairIndexes.get(pairKey) ?? 0;
    pairIndexes.set(pairKey, parallelIndex + 1);
    const visualFamily = RELATION_VISUAL_FAMILIES[relation.relation_type];
    const integrityState = candidateRecords.length === 1
      ? "valid" as const
      : "duplicate_relation_id" as const;
    const geometryEligible = integrityState === "valid"
      && endpointsUnique
      && redundantReferencesMatch
      && relation.left_occurrence_id !== relation.right_occurrence_id
      && relation.relation_type !== "unrelated";
    const directionAsserted = geometryEligible
      && relationDirectionAsserted(relation, left, right);
    return {
      kind: "relation",
      relationId: relation.relation_id,
      relationNumber: index + 1,
      publicNumber: `R${index + 1}`,
      leftOccurrenceId: relation.left_occurrence_id,
      rightOccurrenceId: relation.right_occurrence_id,
      fromNodeId: relation.left_occurrence_id,
      toNodeId: relation.right_occurrence_id,
      leftSourceId: relation.left_source_id,
      rightSourceId: relation.right_source_id,
      relationType: relation.relation_type,
      shortLabel: RELATION_SHORT_LABELS[relation.relation_type],
      visualFamily,
      lineStyle: RELATION_LINE_STYLES[visualFamily],
      reviewStatus: relation.review_status,
      publicReviewLabel: "Needs review",
      integrityState,
      recordCount: candidateRecords.length,
      candidateRecords: candidateRecords.map(cloneRelationCandidate),
      reason: relation.reason,
      leftSupportReference: { ...relation.left_support_reference },
      rightSupportReference: { ...relation.right_support_reference },
      lineageRowId: integrityState === "valid"
        ? lineageByRelationId.get(relation.relation_id)?.lineage_row_id ?? null
        : null,
      pairKey,
      parallelIndex,
      parallelCount: pairCounts.get(pairKey) ?? 1,
      leftEndpoint: relationEndpoint(
        relation.left_occurrence_id,
        relation.left_source_id,
        left,
        selectedTimeAxis,
      ),
      rightEndpoint: relationEndpoint(
        relation.right_occurrence_id,
        relation.right_source_id,
        right,
        selectedTimeAxis,
      ),
      sameRow: Boolean(left && right && left.rowId === right.rowId),
      geometryEligible,
      directionAsserted,
      directionExplanation: directionAsserted
        ? `Direction asserted from earlier to later on ${TIME_AXIS_LABELS[selectedTimeAxis]} under the conservative composite rule.`
        : "Direction not asserted on the selected axis",
    };
  });
}

function relationDirectionAsserted(
  relation: RelationCandidate,
  left: InvestigationOccurrenceNode | undefined,
  right: InvestigationOccurrenceNode | undefined,
): boolean {
  if (!DIRECTIONAL_RELATION_TYPES.has(relation.relation_type)) return false;
  if (!left?.selectedTime || !left.selectedTimePrecision) return false;
  if (!right?.selectedTime || !right.selectedTimePrecision) return false;
  return compareReviewTimestamps(
    { value: left.selectedTime, precision: left.selectedTimePrecision },
    { value: right.selectedTime, precision: right.selectedTimePrecision },
  ) < 0;
}

function cloneRelationCandidate(
  relation: RelationCandidate,
): RelationCandidate {
  return {
    ...relation,
    left_support_reference: { ...relation.left_support_reference },
    right_support_reference: { ...relation.right_support_reference },
  };
}

function relationEndpoint(
  occurrenceId: string,
  sourceId: string,
  occurrence: InvestigationOccurrenceNode | undefined,
  selectedTimeAxis: TimeAxis,
): InvestigationRelationEndpoint {
  if (!occurrence) {
    return {
      occurrenceId,
      sourceId,
      actor: "Actor unavailable",
      conciseClaim: "Claim occurrence unavailable in this packet",
      sourceIdentity: "Source identity unavailable",
      selectedTime: null,
      selectedTimePrecision: null,
      selectedTimeState: `Unplaced on ${TIME_AXIS_LABELS[selectedTimeAxis]}`,
      rowId: null,
    };
  }
  return {
    occurrenceId,
    sourceId,
    actor: occurrence.actor ?? "Actor not separately identified",
    conciseClaim: boundedReviewerText(occurrence.originalClaimText, 150),
    sourceIdentity: `${occurrence.source.sourceRole} · ${occurrence.source.title} · ${occurrence.source.publisher}`,
    selectedTime: occurrence.selectedTime,
    selectedTimePrecision: occurrence.selectedTimePrecision,
    selectedTimeState: occurrence.selectedTime
      ? `${occurrence.selectedTime} · ${occurrence.selectedTimePrecision}`
      : `Unplaced on ${TIME_AXIS_LABELS[selectedTimeAxis]}`,
    rowId: occurrence.rowId,
  };
}

function deriveCoverageState(packet: SiteReadyCasePacket): InvestigationCoverageState {
  const roles = DISCOVERY_LANES.map((lane) => {
    const count = packet.coverage_summary.lane_counts[lane];
    return {
      lane,
      label: discoveryLaneLabel(lane),
      count,
      zero: count === 0,
      missingTarget: packet.coverage_summary.missing_target_lanes.includes(lane),
      missing: packet.coverage_summary.missing_target_lanes.includes(lane),
    };
  });
  return {
    totalSources: packet.source_snapshot_summaries.length,
    representedRoleCount: roles.filter((role) => role.count > 0).length,
    targetRoleCount: roles.length,
    roles,
  };
}

function sourceMatchesLens(
  source: {
    discoveryPass: "baseline" | "coverage_expansion" | null;
    lane: DiscoveryLane | null;
  },
  lens: Exclude<CoverageLens, "all" | "open_questions">,
): boolean {
  if (lens === "baseline") return source.discoveryPass === "baseline";
  if (lens === "coverage_expansion") {
    return source.discoveryPass === "coverage_expansion";
  }
  if (lens === "official_established") return source.lane === "baseline_authority";
  if (lens === "local_firsthand") return source.lane === "local_or_firsthand";
  return source.lane === "challenge_or_correction";
}

function orderedHighlightState(
  map: InvestigationMap,
  nodeIds: Set<string>,
  relationIds: Set<string>,
  questionTetherIds: Set<string>,
  traceKind: MapHighlightState["traceKind"],
  traceLabelValue: string,
): MapHighlightState {
  return {
    nodeIds: allNodeIds(map).filter((id) => nodeIds.has(id)),
    relationIds: map.relationLedger
      .map((entry) => entry.relationId)
      .filter((id) => relationIds.has(id)),
    questionTetherIds: map.questionTethers
      .map((tether) => tether.tetherId)
      .filter((id) => questionTetherIds.has(id)),
    traceKind,
    traceLabel: traceLabelValue,
  };
}

function allNodeIds(map: InvestigationMap): string[] {
  return [
    ...map.occurrences.map((occurrence) => occurrence.nodeId),
    ...map.nonClaimSources.map((source) => source.nodeId),
    ...map.questions.map((question) => question.nodeId),
  ];
}

function actionIdentity(
  action: PacketAction,
  sources: readonly QuestionOriginSourceIdentity[],
): string {
  const actor = action.actor ?? "Actor not separately identified";
  const sourceIdentity = sources.map((source) => source.title).join("; ")
    || "source identity unavailable";
  return `${actor}: ${boundedReviewerText(action.action_text, 120)} · ${sourceIdentity}`;
}

function sourceIdentitiesForPacketSource(
  packet: SiteReadyCasePacket,
  sourceId: string,
): QuestionOriginSourceIdentity[] {
  return packet.source_snapshot_summaries
    .filter((source) => source.source_id === sourceId)
    .map(packetSourceIdentity);
}

function packetSourceIdentity(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): QuestionOriginSourceIdentity {
  return {
    sourceId: source.source_id,
    title: source.title,
    publisher: source.publisher,
    sourceRole: sourceRoleLabel(source),
  };
}

function sourceIdentityFromAttachment(
  source: OccurrenceSourceAttachment,
): QuestionOriginSourceIdentity {
  return {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    sourceRole: source.sourceRole,
  };
}

function uniqueSourceIdentities(
  sources: readonly QuestionOriginSourceIdentity[],
): QuestionOriginSourceIdentity[] {
  const byId = new Map<string, QuestionOriginSourceIdentity>();
  sources.forEach((source) => byId.set(source.sourceId, source));
  return [...byId.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId)
  );
}

function sourceBoundaryLabel(status: "candidate" | "canonical"): string {
  return status === "canonical" ? "Prepared source record" : "Needs review";
}

function explicitTime(
  value: string | null,
  precision: TemporalPrecision,
): ExplicitTimeValue | null {
  if (!value || !precision) return null;
  if (precision === "day") {
    const calendarDate = value.trim().slice(0, 10);
    const normalizedDay = normalizeTimestampWithPrecision(calendarDate);
    return normalizedDay.value && normalizedDay.precision === "day"
      ? { value: normalizedDay.value, precision: "day" }
      : null;
  }
  const normalized = normalizeTimestampWithPrecision(value);
  if (!normalized.value || !normalized.precision) return null;
  if (normalized.precision !== "instant") return null;
  return { value: normalized.value, precision };
}

function compareNullableTimes(
  left: ExplicitTimeValue | null,
  right: ExplicitTimeValue | null,
): number {
  if (left && !right) return -1;
  if (!left && right) return 1;
  if (!left || !right) return 0;
  return compareReviewTimestamps(left, right);
}

function stablePairKey(leftOccurrenceId: string, rightOccurrenceId: string): string {
  return [leftOccurrenceId, rightOccurrenceId].sort().join("::");
}

function sourceSnapshotKey(sourceId: string, snapshotId: string): string {
  return `${sourceId}::${snapshotId}`;
}

function nonClaimNodeId(sourceId: string, snapshotId: string): string {
  return `non_claim_source:${sourceId}:${snapshotId}`;
}

function groupBy<Item>(
  items: readonly Item[],
  keyFor: (item: Item) => string,
): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function uniqueIndex<Item>(
  items: readonly Item[],
  keyFor: (item: Item) => string,
): Map<string, Item> {
  const groups = groupBy(items, keyFor);
  return new Map(
    [...groups]
      .filter(([, group]) => group.length === 1)
      .map(([key, group]) => [key, group[0]]),
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
