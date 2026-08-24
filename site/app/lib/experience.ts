import type {
  SiteDetailKind,
  SiteReadyCasePacket,
  SiteTimelineRow,
} from "./lineage/contracts";
import {
  DISCOVERY_LANES,
  type DiscoveryLane,
  type InformationProximity,
  type SourceContext,
} from "./source-profile";
import {
  groupReviewTimestampItems,
  type ReviewTimestampGroup,
  type TemporalPrecision,
} from "./temporal";

export const EXPERIENCE_VIEWS = [
  "map",
  "timeline",
  "sources",
  "method",
] as const;

export type ExperienceView = (typeof EXPERIENCE_VIEWS)[number];

export const TIME_AXES = [
  "event_time",
  "actor_assertion_time",
  "publication_time",
  "retrieval_time",
] as const;

export type TimeAxis = (typeof TIME_AXES)[number];

export interface SupportingDatedEvidenceRow {
  evidenceRowId: string;
  recordKind: "action" | "finding";
  recordId: string;
  text: string;
  actor: string | null;
  sourceId: string | null;
  sourceTitle: string | null;
  selectedTime: string | null;
  selectedTimePrecision: TemporalPrecision;
  selectedTimeLabel: string;
  status: "candidate" | "canonical";
  packetOrder: number;
}

export const VIEW_LABELS: Record<ExperienceView, string> = {
  map: "Map",
  timeline: "Timeline",
  sources: "Sources",
  method: "Method",
};

export const TIME_AXIS_LABELS: Record<TimeAxis, string> = {
  event_time: "Event time",
  actor_assertion_time: "Actor assertion time",
  publication_time: "Publication time",
  retrieval_time: "Sisyphus retrieval time",
};

const TIME_AXIS_SEMANTIC_NOTES: Record<TimeAxis, string> = {
  event_time:
    "Ordered by event time where explicitly available. Missing event times remain unavailable; no other date is substituted.",
  publication_time:
    "Ordered by publication time. Publication time is not necessarily when the described event occurred or when a claim was first made.",
  actor_assertion_time:
    "Ordered by actor assertion time. This is when the actor's statement is dated, not necessarily when the described event occurred.",
  retrieval_time:
    "Ordered by Sisyphus retrieval time. Retrieval time is when Sisyphus saw the source, not when the event occurred or the claim was made.",
};

const TECHNICAL_RECORD_ID =
  /\b(?:src|snapshot|candidate|run|case|occurrence|relation|lineage|question|action|finding)_[a-z0-9][a-z0-9_-]*\b[:;]?\s*/gi;
const KNOWN_TIME_CANDIDATE_DATE_VALIDATION =
  /^No exact YYYY-MM-DD(?: or timezone-qualified ISO date-time)? was explicit, so time_candidate is null\.?$/i;
const TECHNICAL_TIME_OR_DATE_LANGUAGE =
  /time_candidate|event_time|actor_assertion_time|asserted_at|publication_time|retrieval_time|yyyy-mm-dd|timezone-qualified|iso date[- ]?time/i;

export function timeAxisSemanticNote(axis: TimeAxis): string {
  return TIME_AXIS_SEMANTIC_NOTES[axis];
}

const DISCOVERY_LANE_LABELS: Record<DiscoveryLane, string> = {
  baseline_authority: "Official & established",
  primary_or_origin: "Original records",
  local_or_firsthand: "Local & firsthand",
  specialist_context: "Specialist context",
  challenge_or_correction: "Challenges & corrections",
};

export function discoveryLaneLabel(lane: DiscoveryLane): string {
  return DISCOVERY_LANE_LABELS[lane];
}

export function sourceContextLabel(context: SourceContext): string {
  return context.replaceAll("_", " ");
}

export function informationProximityLabel(proximity: InformationProximity): string {
  return proximity.replaceAll("_", " ");
}

export function sourceRoleLabel(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): string {
  const { source_context: context, discovery_lane: lane } = source.source_selection;
  const prepared = source.retrieval_mode === "deterministic_fixture";

  if (context === "official") {
    return lane === "challenge_or_correction" ? "Official update" : "Official notice";
  }
  if (context === "community_organization") return "Community report";
  if (context === "individual_account") return "Firsthand account";
  if (context === "local_editorial") return "Local report";
  if (context === "established_editorial") return "News report";
  if (context === "specialist_publication") {
    return prepared && source.source_selection.information_proximity === "analysis_or_commentary"
      ? "Opinion / interpretation"
      : "Specialist context";
  }
  if (context === "archive") return "Archive";
  return "Public source";
}

export function actorLabel(actor: string | null): string {
  return actor ?? "Actor not separately identified";
}

export function publicMethodLimitations(packet: SiteReadyCasePacket): string[] {
  const publicBoundaries = [
    "Source coverage is bounded and nonexhaustive.",
    "Source inclusion is not endorsement or truth verification.",
    "Candidate relationships organize review; they do not establish truth or causation.",
    "Missing dates remain unavailable; Sisyphus does not substitute another date type.",
    "Browsing and focus controls do not change review records.",
  ];
  const packetSpecific = projectPublicLimitations(packet.limitations);

  return deduplicateLimitations([...publicBoundaries, ...packetSpecific]);
}

export function projectPublicLimitations(
  limitations: readonly string[],
): string[] {
  return deduplicateLimitations(
    limitations
      .map(humanizeMethodLimitation)
      .filter((limitation): limitation is string => Boolean(limitation)),
  );
}

function humanizeMethodLimitation(limitation: string): string | null {
  const normalized = limitation.trim();
  if (!normalized) return null;
  const withoutRecordIds = normalized.replace(TECHNICAL_RECORD_ID, "").trim();

  if (KNOWN_TIME_CANDIDATE_DATE_VALIDATION.test(withoutRecordIds)) {
    return "Some source summaries did not contain a precise date for one or more event or assertion fields, so those times remain unavailable.";
  }
  if (TECHNICAL_TIME_OR_DATE_LANGUAGE.test(withoutRecordIds)) {
    return null;
  }
  if (/clearly_incomplete_structured_candidates_skipped|incomplete structured candidate/i.test(normalized)) {
    return "Some incomplete extraction candidates were left out; the available source summary remains review material.";
  }
  if (/deterministic.*(?:assessment )?fixture/i.test(normalized)) {
    return "This is a prepared example, not a live investigation.";
  }
  if (/evidence-to-claim links?.*acceptance/i.test(normalized)) {
    return "Evidence-to-claim links only identify bounded records worth reviewing together; they do not imply support, contradiction, causality, truth, or a review outcome.";
  }
  if (/distilled from the accepted.*raw provider response/i.test(normalized)) {
    return "Based on a bounded earlier review record; the full original response is not included.";
  }
  if (/missing_coverage_lanes/i.test(normalized)) {
    return "Some intended source roles were not represented in the bounded discovery results.";
  }
  if (/^source inclusion is not endorsement\.?$/i.test(normalized)) {
    return "Source inclusion is not endorsement or truth verification.";
  }
  if (
    /source text was not captured|not captured source text|not captured page text|live source pages? (?:was|were) not captured|no page text (?:or|and) independent verification|model-generated (?:web-search(?:-grounded)? )?(?:candidate )?summar(?:y|ies).*(?:partial review|not independently verified|rather than captured page text)|bounded model-generated summary, not independently verified source text/i
      .test(normalized)
  ) {
    return "Live source pages were not captured; model-generated web-search summaries remain partial review material.";
  }
  if (
    /each extraction used exactly one source.*cross-source temporal relation analysis is not performed|no cross-source temporal relations? or truth judgments? were made|no cross-source temporal relationships? or factual truth determination was made/i
      .test(normalized)
  ) {
    return "Cross-source temporal relationships were not analyzed in this bounded run.";
  }
  if (/compact read model|focused detail returns/i.test(normalized)) {
    return "The default view omits full source text; source details remain bounded to the available record.";
  }
  if (/relation candidates? .*review|do not adjudicate truth|candidate\/review-only/i.test(normalized)) {
    return null;
  }
  if (/cannot mutate|canonical mutation|replace deterministic prepared-case state/i.test(normalized)) {
    return null;
  }
  if (/deterministic relation stage used no model-assisted classification/i.test(normalized)) {
    return null;
  }
  if (
    /schema|zod|structured[_ -]?output|hard[_ -]?pair|prefilter|model[_ -]?classified|theoretical[_ -]?pair|bounded[_ -]?work[_ -]?summary|work[_ -]?units?/i
      .test(normalized)
  ) {
    return null;
  }

  if (/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i.test(withoutRecordIds)) {
    return null;
  }
  return withoutRecordIds || null;
}

function deduplicateLimitations(limitations: string[]): string[] {
  const seen = new Set<string>();
  return limitations.filter((limitation) => {
    const key = limitation.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function recordBoundaryLabel(status: "candidate" | "canonical"): string {
  return status === "canonical"
    ? "Prepared case record"
    : "Needs review";
}

export function modeLabel(packet: SiteReadyCasePacket): string {
  if (packet.mode === "live") return "Live · review only";
  if (packet.mode === "fallback") return "Fallback · prepared case";
  return "Prepared case";
}

export function sourceCoverageLabel(packet: SiteReadyCasePacket): string {
  if (packet.mode === "deterministic") return "Prepared example coverage";
  if (packet.mode === "fallback") return "Prepared fallback coverage";
  return packet.discovery_profile === "coverage_expansion"
    ? "Live coverage expansion"
    : "Standard live review";
}

export function sourceCoverageNote(packet: SiteReadyCasePacket): string {
  const missing = packet.coverage_summary.missing_target_lanes
    .map(discoveryLaneLabel)
    .join(", ");
  const absentRoleCount = DISCOVERY_LANES.filter(
    (lane) => packet.coverage_summary.lane_counts[lane] === 0,
  ).length;

  if (packet.coverage_summary.coverage_basis === "prepared_fixture") {
    const fixtureGap = missing
      ? `Prepared case target role not represented: ${missing}.`
      : "Every target role category is represented in this prepared case; exhaustive web coverage is not claimed.";
    return packet.mode === "fallback"
      ? `The live attempt failed. These counts describe the prepared fallback, not live discovery. ${fixtureGap}`
      : `These counts describe curated prepared-case coverage, not live discovery. ${fixtureGap}`;
  }

  if (packet.coverage_summary.discovery_profile === "standard") {
    return absentRoleCount > 0
      ? `Standard review does not target every role category; ${absentRoleCount} role ${absentRoleCount === 1 ? "category is" : "categories are"} not represented in this packet.`
      : "All five role categories happen to be represented; Standard review still does not target exhaustive role coverage.";
  }
  if (missing) return `Coverage-expansion target-role gap: ${missing}.`;
  return "Every target role category is represented in this bounded coverage-expansion packet; exhaustive web coverage is still not claimed.";
}

export function supportingDatedEvidenceRows(
  packet: SiteReadyCasePacket,
  axis: TimeAxis,
): SupportingDatedEvidenceRow[] {
  const sourceById = new Map(
    packet.source_snapshot_summaries.map((source) => [source.source_id, source]),
  );
  const rows: SupportingDatedEvidenceRow[] = [];
  let packetOrder = 0;

  const appendRows = (input: {
    recordKind: SupportingDatedEvidenceRow["recordKind"];
    recordId: string;
    text: string;
    actor: string | null;
    sourceIds: string[];
    eventTime: string | null;
    eventTimePrecision: TemporalPrecision;
    status: SupportingDatedEvidenceRow["status"];
  }) => {
    const linkedSources = input.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source): source is SiteReadyCasePacket["source_snapshot_summaries"][number] => Boolean(source));
    const sources = linkedSources.length ? linkedSources : [null];
    for (const [sourceIndex, source] of sources.entries()) {
      const selected = supportingEvidenceTimestamp(input, source, axis);
      rows.push({
        evidenceRowId: `${input.recordKind}:${input.recordId}:${source?.source_id ?? `unlinked-${sourceIndex}`}`,
        recordKind: input.recordKind,
        recordId: input.recordId,
        text: input.text,
        actor: input.actor,
        sourceId: source?.source_id ?? null,
        sourceTitle: source?.title ?? null,
        selectedTime: selected.value,
        selectedTimePrecision: selected.precision,
        selectedTimeLabel: selected.label,
        status: input.status,
        packetOrder: packetOrder++,
      });
    }
  };

  for (const action of packet.actions) {
    appendRows({
      recordKind: "action",
      recordId: action.action_id,
      text: action.action_text,
      actor: action.actor,
      sourceIds: action.source_ids,
      eventTime: action.event_time_candidate,
      eventTimePrecision: action.event_time_candidate_precision,
      status: action.status,
    });
  }
  for (const finding of packet.source_bound_findings) {
    appendRows({
      recordKind: "finding",
      recordId: finding.finding_id,
      text: finding.text,
      actor: null,
      sourceIds: finding.source_ids,
      eventTime: null,
      eventTimePrecision: null,
      status: finding.status,
    });
  }
  return rows;
}

export function groupSupportingDatedEvidenceRowsByPrecision(
  rows: SupportingDatedEvidenceRow[],
): ReviewTimestampGroup<SupportingDatedEvidenceRow>[] {
  return groupReviewTimestampItems(
    rows.filter((row) => row.selectedTime && row.selectedTimePrecision),
    (row) => ({
      value: row.selectedTime as string,
      precision: row.selectedTimePrecision as Exclude<TemporalPrecision, null>,
    }),
    (left, right) => left.packetOrder - right.packetOrder,
  );
}

function supportingEvidenceTimestamp(
  input: {
    eventTime: string | null;
    eventTimePrecision: TemporalPrecision;
  },
  source: SiteReadyCasePacket["source_snapshot_summaries"][number] | null,
  axis: TimeAxis,
): { value: string | null; precision: TemporalPrecision; label: string } {
  if (axis === "event_time") {
    return {
      value: input.eventTime,
      precision: input.eventTimePrecision,
      label: "Event time",
    };
  }
  if (axis === "publication_time") {
    return {
      value: source?.published_at ?? null,
      precision: source?.published_at_precision ?? null,
      label: "Linked source publication time",
    };
  }
  if (axis === "retrieval_time") {
    return {
      value: source?.retrieved_at ?? null,
      precision: source ? "instant" : null,
      label: "Linked source Sisyphus retrieval time",
    };
  }
  return {
    value: null,
    precision: null,
    label: "Actor assertion time",
  };
}

const RELATION_LABELS: Record<string, string> = {
  same_event: "Same event",
  correction: "Correction",
  contradicts: "Challenge",
  supersedes: "Supersession",
  follow_up: "Follow-up",
  corroborates: "Support",
  narrows: "Narrowing",
  unresolved: "Unclear connection",
  unrelated: "No direct change",
};

export function relationDisplayLabel(value: string): string {
  return RELATION_LABELS[value] ?? value.replaceAll("_", " ");
}

export function sourceContentLabel(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): string {
  return source.content_kind === "model_generated_web_search_summary"
    ? "Model-generated search summary · not captured page text"
    : "Captured source evidence";
}

export function sourceSnapshotLabel(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): string {
  if (source.snapshot_status === "full") return "Prepared source snapshot";
  if (source.snapshot_status === "partial") return "Partial provenance record";
  return "Snapshot failed";
}

export function timeValue(row: SiteTimelineRow, axis: TimeAxis): string | null {
  return row[axis];
}

export function timePrecision(
  row: SiteTimelineRow,
  axis: TimeAxis,
): TemporalPrecision {
  if (axis === "event_time") return row.event_time_precision;
  if (axis === "actor_assertion_time") {
    return row.actor_assertion_time_precision;
  }
  if (axis === "publication_time") return row.publication_time_precision;
  return row.retrieval_time_precision;
}

export function orderTimelineRows(
  rows: SiteTimelineRow[],
  axis: TimeAxis,
): SiteTimelineRow[] {
  const unavailable = rows
    .filter((row) => !timeValue(row, axis))
    .sort((left, right) =>
      left.timeline_row_id.localeCompare(right.timeline_row_id),
    );
  return [
    ...groupTimelineRowsByPrecision(rows, axis).flatMap((group) => group.items),
    ...unavailable,
  ];
}

export function groupTimelineRowsByPrecision(
  rows: SiteTimelineRow[],
  axis: TimeAxis,
): ReviewTimestampGroup<SiteTimelineRow>[] {
  const available = rows.filter(
    (row) => timeValue(row, axis) && timePrecision(row, axis),
  );
  return groupReviewTimestampItems(
    available,
    (row) => ({
      value: timeValue(row, axis) as string,
      precision: timePrecision(row, axis) as Exclude<TemporalPrecision, null>,
    }),
    (left, right) => left.timeline_row_id.localeCompare(right.timeline_row_id),
  );
}

export function relatedRecordLabel(
  packet: SiteReadyCasePacket,
  id: string,
): string {
  const claim = packet.actor_claims.find((item) => item.claim_id === id);
  if (claim) return `${actorLabel(claim.actor)}: ${claim.claim_text}`;
  const action = packet.actions.find((item) => item.action_id === id);
  if (action) return `${actorLabel(action.actor)}: ${action.action_text}`;
  const occurrence = packet.claim_occurrences.find((item) => item.occurrence_id === id);
  if (occurrence) return `${actorLabel(occurrence.actor)}: ${occurrence.original_claim_text}`;
  const source = packet.source_snapshot_summaries.find((item) => item.source_id === id);
  if (source) return source.title;
  return id;
}

export function hasFocusedDetailKey(
  packet: SiteReadyCasePacket,
  kind: SiteDetailKind,
  id: string,
): boolean {
  return packet.focused_detail_lookup_keys.some(
    (item) => item.kind === kind && item.id === id,
  );
}
