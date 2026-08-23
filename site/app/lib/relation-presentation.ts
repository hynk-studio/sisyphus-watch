import type {
  RelationCandidate,
  RelationType,
  SiteReadyCasePacket,
  SourceSupportedRelationSignal,
} from "./lineage/contracts";

export interface PublicRelationPresentation {
  candidateRelationType: RelationType;
  presentationRelationType: RelationType;
  sourceBacked: boolean;
  reviewLabel: "Needs review";
  fromOccurrenceId: string;
  toOccurrenceId: string;
  signal: SourceSupportedRelationSignal | null;
}

export function publicRelationPresentation(
  packet: SiteReadyCasePacket,
  relation: RelationCandidate,
): PublicRelationPresentation {
  const signal = packet.contract_version === "site_ready_case_packet.v2"
    ? packet.source_supported_relation_signals.find(
      (candidate) => candidate.relation_candidate_id === relation.relation_id,
    ) ?? null
    : null;
  if (!signal) {
    return {
      candidateRelationType: relation.relation_type,
      presentationRelationType: relation.relation_type,
      sourceBacked: false,
      reviewLabel: "Needs review",
      fromOccurrenceId: relation.left_occurrence_id,
      toOccurrenceId: relation.right_occurrence_id,
      signal: null,
    };
  }
  return {
    candidateRelationType: relation.relation_type,
    presentationRelationType: signal.supported_relation_type,
    sourceBacked: true,
    reviewLabel: "Needs review",
    fromOccurrenceId: signal.from_occurrence_id,
    toOccurrenceId: signal.to_occurrence_id,
    signal,
  };
}
