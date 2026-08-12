import type {
  SiteDetailKind,
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "./contracts";

export function getSiteReadyCaseDetail(
  packet: SiteReadyCasePacket,
  focusKind: SiteDetailKind,
  focusId: string,
): SiteReadyCaseDetail | null {
  const detail = findDetail(packet, focusKind, focusId);
  return detail === undefined
    ? null
    : {
        case_id: packet.case_id,
        run_id: packet.run_id,
        focus_kind: focusKind,
        focus_id: focusId,
        detail,
      };
}

function findDetail(
  packet: SiteReadyCasePacket,
  focusKind: SiteDetailKind,
  focusId: string,
): unknown {
  switch (focusKind) {
    case "source":
      return packet.source_snapshot_summaries.find((item) => item.source_id === focusId);
    case "claim_occurrence":
      return packet.claim_occurrences.find((item) => item.occurrence_id === focusId);
    case "claim_family":
      return packet.candidate_claim_families.find((item) => item.family_id === focusId);
    case "relation":
      return packet.relation_candidates.find((item) => item.relation_id === focusId);
    case "timeline_row":
      return packet.event_timeline_rows.find((item) => item.timeline_row_id === focusId);
    case "lineage_row":
      return packet.claim_lineage_rows.find((item) => item.lineage_row_id === focusId);
    case "unresolved_question":
      return packet.unresolved_questions.find((item) => item.question_id === focusId);
  }
}
