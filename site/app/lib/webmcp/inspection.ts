import type { SiteReadyCasePacket } from "../lineage/contracts";
import {
  buildWebMcpRelationComparison,
  type WebMcpReviewKind,
} from "./co-review";

export interface WebMcpReviewInspection {
  surface_version: "sisyphus_webmcp_review_inspection.v1";
  scope: "prepared_demo";
  kind: WebMcpReviewKind;
  id: string;
  detail: Record<string, unknown>;
  returned_content_trust: "untrusted_evidence_data";
  canonical_mutation: "none";
}

export function buildWebMcpReviewInspection(
  packet: SiteReadyCasePacket,
  kind: WebMcpReviewKind,
  id: string,
): WebMcpReviewInspection | null {
  if (kind === "source") {
    const source = packet.source_snapshot_summaries.find(
      (candidate) => candidate.source_id === id,
    );
    if (!source) return null;
    return envelope(kind, id, {
      title: source.title,
      publisher: source.publisher,
      domain: source.domain,
      publication_time: source.published_at,
      publication_time_precision: source.published_at_precision,
      retrieval_time: source.retrieved_at,
      record_status: source.record_status,
      source_role: source.source_selection.discovery_lane,
      content_kind: source.content_kind,
      bounded_evidence:
        source.evidence_excerpt
        ?? source.web_search_grounded_candidate_summary
        ?? null,
      evidence_boundary: source.evidence_excerpt
        ? "prepared_or_captured_excerpt"
        : source.web_search_grounded_candidate_summary
          ? "model_generated_search_summary_not_captured_page_text"
          : "bounded_evidence_unavailable",
      limitations: source.limitations.slice(0, 8),
    });
  }

  if (kind === "claim_occurrence") {
    const occurrence = packet.claim_occurrences.find(
      (candidate) => candidate.occurrence_id === id,
    );
    if (!occurrence) return null;
    const source = packet.source_snapshot_summaries.find(
      (candidate) => candidate.source_id === occurrence.source_id,
    );
    return envelope(kind, id, {
      actor: occurrence.actor,
      claim_text: occurrence.original_claim_text,
      source_id: occurrence.source_id,
      source_title: source?.title ?? null,
      source_publisher: source?.publisher ?? null,
      confidence: occurrence.confidence,
      uncertainty: occurrence.uncertainty,
      event_time: occurrence.event_time_candidate,
      event_time_precision: occurrence.event_time_candidate_precision,
      assertion_time: occurrence.assertion_time_candidate,
      assertion_time_precision: occurrence.assertion_time_candidate_precision,
      publication_time: occurrence.source_publication_time,
      publication_time_precision: occurrence.source_publication_time_precision,
      bounded_support: occurrence.support_reference.bounded_excerpt,
      support_kind: occurrence.support_reference.support_kind,
      support_proves: occurrence.support_reference.proves,
      record_status: occurrence.status,
    });
  }

  if (kind === "relation") {
    const comparison = buildWebMcpRelationComparison(packet, id);
    if (!comparison) return null;
    return envelope(kind, id, {
      candidate_relation_type: comparison.candidate_relation_type,
      presentation_relation_type: comparison.presentation_relation_type,
      reason: comparison.reason,
      source_backed: comparison.source_backed,
      review_status: comparison.review_status,
      left: comparison.left,
      right: comparison.right,
      source_backed_statement: comparison.source_backed_statement,
    });
  }

  const question = packet.unresolved_questions.find(
    (candidate) => candidate.question_id === id,
  );
  if (!question) return null;
  return envelope(kind, id, {
    question: question.question,
    related_ids: question.related_ids.slice(0, 16),
    status: question.status,
    record_status: question.record_status,
    interpretation:
      "This is an unresolved evidence gap. Related records do not answer the question by themselves.",
  });
}

function envelope(
  kind: WebMcpReviewKind,
  id: string,
  detail: Record<string, unknown>,
): WebMcpReviewInspection {
  return {
    surface_version: "sisyphus_webmcp_review_inspection.v1",
    scope: "prepared_demo",
    kind,
    id,
    detail,
    returned_content_trust: "untrusted_evidence_data",
    canonical_mutation: "none",
  };
}
