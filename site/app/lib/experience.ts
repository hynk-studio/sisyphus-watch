import type {
  SiteDetailKind,
  SiteReadyCasePacket,
  SiteTimelineRow,
} from "./lineage/contracts";

export const EXPERIENCE_VIEWS = [
  "overview",
  "timeline",
  "lineage",
  "sources",
  "unresolved",
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
  overview: "Overview",
  timeline: "Timeline",
  lineage: "Claim lineage",
  sources: "Sources",
  unresolved: "Unresolved",
};

export const TIME_AXIS_LABELS: Record<TimeAxis, string> = {
  event_time: "Event time",
  actor_assertion_time: "Actor assertion time",
  publication_time: "Publication time",
  retrieval_time: "Sisyphus retrieval time",
};

export function actorLabel(actor: string | null): string {
  return actor ?? "Unknown actor";
}

export function recordBoundaryLabel(status: "candidate" | "canonical"): string {
  return status === "canonical"
    ? "Accepted deterministic fixture record"
    : "Candidate · review only";
}

export function modeLabel(packet: SiteReadyCasePacket): string {
  if (packet.mode === "live") return "Live · review only";
  if (packet.mode === "fallback") return "Fallback · prepared case";
  return "Prepared case";
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
