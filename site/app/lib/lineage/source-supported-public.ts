import type { InternalLineageRunEnvelope } from "./internal";
import {
  validateSiteReadyCasePacket,
  type ClaimOccurrence,
  type RelationCandidate,
  type SiteReadyCasePacket,
  type SiteReadyCasePacketV2,
  type SourceSupportedRelationSignal,
} from "./contracts";

export function projectSourceSupportedRelationSignals(
  internal: InternalLineageRunEnvelope,
): SourceSupportedRelationSignal[] {
  const packet = internal.site_ready_case_packet;
  if (
    packet.candidate_canonical_boundary.canonical_mutation !== "none"
    || internal.source_supported_relation_assessments.length !== 1
    || internal.source_supported_target_identity_proofs.length !== 1
  ) return [];

  const assessment = internal.source_supported_relation_assessments[0];
  if (
    assessment.relation_type !== "supersedes"
    || assessment.assessment_status !== "internal_source_supported_candidate"
    || assessment.review_status !== "pending_review"
    || assessment.generated_by !== "deterministic_rule"
    || assessment.canonical_mutation !== "none"
    || assessment.support_kind !== "captured_live_source_text_span"
    || assessment.proves !== "captured_source_text_containment_only"
  ) return [];

  const relations = packet.relation_candidates.filter(
    (relation) => relation.relation_id === assessment.relation_candidate_id,
  );
  const relation = relations[0];
  if (
    relations.length !== 1
    || !isUnchangedUnresolvedRelation(relation)
    || !relationEndpointProvenanceAligns(packet.claim_occurrences, relation)
  ) return [];

  const fromOccurrences = packet.claim_occurrences.filter(
    (occurrence) => occurrence.occurrence_id === assessment.from_occurrence_id,
  );
  const toOccurrences = packet.claim_occurrences.filter(
    (occurrence) => occurrence.occurrence_id === assessment.to_occurrence_id,
  );
  if (fromOccurrences.length !== 1 || toOccurrences.length !== 1) return [];
  const from = fromOccurrences[0];
  const to = toOccurrences[0];
  if (!assessmentEndpointsAlign(assessment, relation, from, to)) return [];

  const proof = internal.source_supported_target_identity_proofs[0];
  if (
    proof.proof_id !== assessment.target_identity_proof_id
    || proof.relation_candidate_id !== assessment.relation_candidate_id
    || proof.target_occurrence_id !== assessment.to_occurrence_id
    || proof.target_source_id !== assessment.to_source_id
    || proof.target_snapshot_id !== assessment.to_snapshot_id
    || proof.target_capture_id !== assessment.target_capture_id
    || proof.proof_status !== "internal_target_identity_supported"
    || proof.generated_by !== "deterministic_rule"
    || proof.canonical_mutation !== "none"
  ) return [];

  const ownerDocuments = internal.documents.filter(
    (document) => document.capture_id === assessment.owner_capture_id,
  );
  const targetDocuments = internal.documents.filter(
    (document) => document.capture_id === assessment.target_capture_id,
  );
  if (ownerDocuments.length !== 1 || targetDocuments.length !== 1) return [];
  const ownerDocument = ownerDocuments[0];
  const targetDocument = targetDocuments[0];
  if (
    ownerDocument.capture_completeness !== "complete"
    || targetDocument.capture_completeness !== "complete"
    || ownerDocument.source_id !== assessment.from_source_id
    || ownerDocument.parent_snapshot_id !== assessment.from_snapshot_id
    || ownerDocument.captured_body_sha256 !== assessment.captured_body_sha256
    || ownerDocument.normalized_text_sha256 !== assessment.normalized_text_sha256
    || ownerDocument.final_url !== assessment.citation_url
    || targetDocument.source_id !== assessment.to_source_id
    || targetDocument.parent_snapshot_id !== assessment.to_snapshot_id
    || targetDocument.capture_id !== proof.target_capture_id
    || targetDocument.captured_body_sha256 !== proof.captured_body_sha256
    || targetDocument.normalized_text_sha256 !== proof.normalized_text_sha256
    || targetDocument.final_url !== proof.citation_url
  ) return [];

  const ownerSupports = internal.supports.filter(
    (support) => support.support_id === assessment.support_id,
  );
  if (ownerSupports.length !== 1 || internal.supports.length !== 1) return [];
  const support = ownerSupports[0];
  if (
    support.source_id !== assessment.from_source_id
    || support.parent_snapshot_id !== assessment.from_snapshot_id
    || support.capture_id !== assessment.owner_capture_id
    || support.captured_body_sha256 !== assessment.captured_body_sha256
    || support.normalized_text_sha256 !== assessment.normalized_text_sha256
    || support.citation_url !== assessment.citation_url
    || support.support_kind !== "captured_live_source_text_span"
    || support.proves !== "captured_source_text_containment_only"
    || support.bounded_excerpt.trim().length === 0
    || support.bounded_excerpt.length > 560
    || !Number.isInteger(support.normalized_text_start)
    || !Number.isInteger(support.normalized_text_end)
    || support.normalized_text_start < 0
    || support.normalized_text_end <= support.normalized_text_start
    || support.normalized_text_end > ownerDocument.normalized_text.length
    || support.normalized_text_end - support.normalized_text_start
      !== support.bounded_excerpt.length
    || ownerDocument.normalized_text.slice(
      support.normalized_text_start,
      support.normalized_text_end,
    ) !== support.bounded_excerpt
    || !Number.isInteger(assessment.assertion_context_start)
    || !Number.isInteger(assessment.assertion_context_end)
    || assessment.assertion_context_start < 0
    || assessment.assertion_context_start > support.normalized_text_start
    || assessment.assertion_context_end < support.normalized_text_end
    || assessment.assertion_context_end > ownerDocument.normalized_text.length
  ) return [];

  return [{
    relation_candidate_id: assessment.relation_candidate_id,
    supported_relation_type: "supersedes",
    from_occurrence_id: assessment.from_occurrence_id,
    to_occurrence_id: assessment.to_occurrence_id,
    support_status: "direct_source_support",
    review_status: "pending_review",
    statement_source_id: assessment.from_source_id,
    statement_snapshot_id: assessment.from_snapshot_id,
    statement_excerpt: support.bounded_excerpt,
    target_source_id: assessment.to_source_id,
    target_snapshot_id: assessment.to_snapshot_id,
  }];
}

export function projectSiteReadyCasePacketV2(
  internal: InternalLineageRunEnvelope,
): SiteReadyCasePacketV2 {
  const base = internal.site_ready_case_packet;
  const signals = projectSourceSupportedRelationSignals(internal);
  const candidate = {
    ...base,
    contract_version: "site_ready_case_packet.v2" as const,
    source_supported_relation_observation: "evaluated" as const,
    source_supported_relation_signals: signals,
  };
  try {
    return validateSiteReadyCasePacket(candidate) as SiteReadyCasePacketV2;
  } catch {
    return validateSiteReadyCasePacket({
      ...candidate,
      source_supported_relation_observation: "unavailable",
      source_supported_relation_signals: [],
    }) as SiteReadyCasePacketV2;
  }
}

export function projectSiteReadyCasePacketV2WithoutSignals(
  packet: SiteReadyCasePacket,
): SiteReadyCasePacketV2 {
  return validateSiteReadyCasePacket({
    ...packet,
    contract_version: "site_ready_case_packet.v2",
    source_supported_relation_observation: "unavailable",
    source_supported_relation_signals: [],
  }) as SiteReadyCasePacketV2;
}

function isUnchangedUnresolvedRelation(relation: RelationCandidate): boolean {
  return relation.relation_type === "unresolved"
    && relation.review_status === "pending_review"
    && relation.status === "candidate"
    && relation.insufficient_evidence === true
    && relation.generated_by === "deterministic_rule";
}

function relationEndpointProvenanceAligns(
  occurrences: ClaimOccurrence[],
  relation: RelationCandidate,
): boolean {
  const leftOccurrences = occurrences.filter(
    (occurrence) => occurrence.occurrence_id === relation.left_occurrence_id,
  );
  const rightOccurrences = occurrences.filter(
    (occurrence) => occurrence.occurrence_id === relation.right_occurrence_id,
  );
  if (leftOccurrences.length !== 1 || rightOccurrences.length !== 1) return false;
  const left = leftOccurrences[0];
  const right = rightOccurrences[0];
  return left.source_id === relation.left_source_id
    && left.snapshot_id === relation.left_snapshot_id
    && right.source_id === relation.right_source_id
    && right.snapshot_id === relation.right_snapshot_id;
}

function assessmentEndpointsAlign(
  assessment: InternalLineageRunEnvelope["source_supported_relation_assessments"][number],
  relation: RelationCandidate,
  from: ClaimOccurrence,
  to: ClaimOccurrence,
): boolean {
  const endpoints = new Set([
    relation.left_occurrence_id,
    relation.right_occurrence_id,
  ]);
  return from.occurrence_id !== to.occurrence_id
    && endpoints.size === 2
    && endpoints.has(from.occurrence_id)
    && endpoints.has(to.occurrence_id)
    && from.source_id === assessment.from_source_id
    && from.snapshot_id === assessment.from_snapshot_id
    && to.source_id === assessment.to_source_id
    && to.snapshot_id === assessment.to_snapshot_id;
}
