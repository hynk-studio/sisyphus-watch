import type {
  SiteDetailKind,
  SiteReadyCasePacket,
  SiteTimelineRow,
} from "./lineage/contracts";
import type {
  DiscoveryLane,
  InformationProximity,
  SourceContext,
} from "./source-profile";
import type { TemporalPrecision } from "./temporal";

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
  return actor ?? "Unknown actor";
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
  if (packet.mode === "deterministic") return "Prepared fixture coverage";
  if (packet.mode === "fallback") return "Prepared fallback coverage";
  return packet.discovery_profile === "coverage_expansion"
    ? "Live coverage expansion"
    : "Standard live review";
}

export function sourceCoverageNote(packet: SiteReadyCasePacket): string {
  const missing = packet.coverage_summary.missing_target_lanes
    .map(discoveryLaneLabel)
    .join(", ");

  if (packet.coverage_summary.coverage_basis === "prepared_fixture") {
    const fixtureGap = missing
      ? `Prepared case source type not represented: ${missing}.`
      : "Every target source type is represented in this prepared case; exhaustive web coverage is not claimed.";
    return packet.mode === "fallback"
      ? `The live attempt failed. These counts describe the prepared fallback, not live discovery. ${fixtureGap}`
      : `These counts describe curated prepared-case coverage, not live discovery. ${fixtureGap}`;
  }

  if (missing) return `Live discovery source-type gap: ${missing}.`;
  return packet.coverage_summary.discovery_profile === "coverage_expansion"
    ? "Every target source type is represented in this bounded live packet; exhaustive web coverage is still not claimed."
    : "Standard live review does not claim to fill every source type or exhaustively cover the web.";
}

const RELATION_LABELS: Record<string, string> = {
  same_event: "Describes the same event",
  correction: "Corrects the earlier claim",
  contradicts: "Challenges the earlier claim",
  supersedes: "Replaces earlier guidance",
  follow_up: "Responds to the earlier report",
  corroborates: "Supports the earlier report",
  narrows: "Makes the earlier claim more specific",
  unresolved: "Connection remains unclear",
  unrelated: "No direct change identified",
};

export function relationDisplayLabel(value: string): string {
  return RELATION_LABELS[value] ?? value.replaceAll("_", " ");
}

export function sourceContentLabel(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): string {
  return source.content_kind === "model_generated_web_search_summary"
    ? "Model-generated web-search candidate summary · not captured page text"
    : "Captured deterministic fixture evidence";
}

export function sourceSnapshotLabel(
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): string {
  if (source.snapshot_status === "full") return "Full fixture snapshot";
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
  return [...rows].sort((left, right) => {
    const leftValue = timeValue(left, axis);
    const rightValue = timeValue(right, axis);
    if (!leftValue && !rightValue) return left.timeline_row_id.localeCompare(right.timeline_row_id);
    if (!leftValue) return 1;
    if (!rightValue) return -1;
    return leftValue.localeCompare(rightValue);
  });
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
