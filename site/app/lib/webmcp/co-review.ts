import type {
  SiteDetailKind,
  SiteReadyCasePacket,
} from "../lineage/contracts";

export const WEBMCP_REVIEW_KINDS = [
  "source",
  "claim_occurrence",
  "relation",
  "unresolved_question",
] as const satisfies readonly SiteDetailKind[];

export type WebMcpReviewKind = (typeof WEBMCP_REVIEW_KINDS)[number];

export interface WebMcpReviewItem {
  kind: WebMcpReviewKind;
  id: string;
  label: string;
  summary: string;
  review_status: "reviewable" | "pending_review" | "unresolved";
}

export interface WebMcpEvidenceWalkItem {
  kind: WebMcpReviewKind;
  id: string;
  rationale: string;
}

export interface WebMcpEvidenceWalk {
  items: WebMcpEvidenceWalkItem[];
  persistence: "session_ui_only";
  canonical_mutation: "none";
}

export interface WebMcpInvestigationOverview {
  surface_version: "sisyphus_webmcp_coreview.v1";
  scope: "prepared_demo";
  question: string;
  title: string;
  source_count: number;
  claim_occurrence_count: number;
  relation_candidate_count: number;
  unresolved_question_count: number;
  candidate_review_boundary: SiteReadyCasePacket["candidate_canonical_boundary"];
  canonical_mutation: "none";
}

const MAX_LABEL_LENGTH = 240;
const MAX_SUMMARY_LENGTH = 360;
const MAX_WALK_ITEMS = 5;
const MAX_RATIONALE_LENGTH = 240;

export function buildWebMcpInvestigationOverview(
  packet: SiteReadyCasePacket,
): WebMcpInvestigationOverview {
  return {
    surface_version: "sisyphus_webmcp_coreview.v1",
    scope: "prepared_demo",
    question: packet.normalized_public_interest_question,
    title: packet.title,
    source_count: packet.source_snapshot_summaries.length,
    claim_occurrence_count: packet.claim_occurrences.length,
    relation_candidate_count: packet.relation_candidates.length,
    unresolved_question_count: packet.unresolved_questions.length,
    candidate_review_boundary: packet.candidate_canonical_boundary,
    canonical_mutation: "none",
  };
}

export function buildWebMcpReviewItems(
  packet: SiteReadyCasePacket,
): WebMcpReviewItem[] {
  const lookup = new Set(
    packet.focused_detail_lookup_keys.map((item) => `${item.kind}:${item.id}`),
  );

  const items: WebMcpReviewItem[] = [];

  for (const source of packet.source_snapshot_summaries) {
    if (!lookup.has(`source:${source.source_id}`)) continue;
    items.push({
      kind: "source",
      id: source.source_id,
      label: compact(source.title, MAX_LABEL_LENGTH),
      summary: compact(
        `${source.publisher} · ${source.domain} · ${source.web_search_grounded_candidate_summary ?? "No bounded source summary available."}`,
        MAX_SUMMARY_LENGTH,
      ),
      review_status: "reviewable",
    });
  }

  for (const occurrence of packet.claim_occurrences) {
    if (!lookup.has(`claim_occurrence:${occurrence.occurrence_id}`)) continue;
    items.push({
      kind: "claim_occurrence",
      id: occurrence.occurrence_id,
      label: compact(
        `${occurrence.actor ?? "Unknown actor"}: ${occurrence.original_claim_text}`,
        MAX_LABEL_LENGTH,
      ),
      summary: compact(
        `Source ${occurrence.source_id}; confidence ${occurrence.confidence}; support ${occurrence.support_reference.proves}.`,
        MAX_SUMMARY_LENGTH,
      ),
      review_status: "reviewable",
    });
  }

  for (const relation of packet.relation_candidates) {
    if (!lookup.has(`relation:${relation.relation_id}`)) continue;
    items.push({
      kind: "relation",
      id: relation.relation_id,
      label: compact(
        `${relation.relation_type}: ${relation.left_occurrence_id} ↔ ${relation.right_occurrence_id}`,
        MAX_LABEL_LENGTH,
      ),
      summary: compact(relation.reason, MAX_SUMMARY_LENGTH),
      review_status: "pending_review",
    });
  }

  for (const question of packet.unresolved_questions) {
    if (!lookup.has(`unresolved_question:${question.question_id}`)) continue;
    items.push({
      kind: "unresolved_question",
      id: question.question_id,
      label: compact(question.question, MAX_LABEL_LENGTH),
      summary: compact(
        question.related_ids.length > 0
          ? `Related records: ${question.related_ids.join(", ")}.`
          : "No related record identifiers are available.",
        MAX_SUMMARY_LENGTH,
      ),
      review_status: "unresolved",
    });
  }

  return items;
}

export function validateWebMcpEvidenceWalk(
  input: unknown,
  availableItems: readonly WebMcpReviewItem[],
): WebMcpEvidenceWalk {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Evidence walk input must be an object.");
  }
  const rawItems = (input as { items?: unknown }).items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_WALK_ITEMS) {
    throw new Error(`Evidence walk must contain 1-${MAX_WALK_ITEMS} items.`);
  }

  const available = new Set(
    availableItems.map((item) => `${item.kind}:${item.id}`),
  );
  const seen = new Set<string>();
  const items: WebMcpEvidenceWalkItem[] = rawItems.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Evidence walk item ${index + 1} must be an object.`);
    }
    const candidate = raw as { kind?: unknown; id?: unknown; rationale?: unknown };
    if (!isWebMcpReviewKind(candidate.kind)) {
      throw new Error(`Evidence walk item ${index + 1} has an unsupported kind.`);
    }
    if (typeof candidate.id !== "string" || candidate.id.length < 1 || candidate.id.length > 4096) {
      throw new Error(`Evidence walk item ${index + 1} has an invalid id.`);
    }
    const key = `${candidate.kind}:${candidate.id}`;
    if (!available.has(key)) {
      throw new Error(`Evidence walk item ${index + 1} is not present in the bounded review surface.`);
    }
    if (seen.has(key)) {
      throw new Error(`Evidence walk item ${index + 1} duplicates an earlier item.`);
    }
    seen.add(key);
    if (
      typeof candidate.rationale !== "string"
      || candidate.rationale.trim().length < 1
      || candidate.rationale.trim().length > MAX_RATIONALE_LENGTH
    ) {
      throw new Error(
        `Evidence walk item ${index + 1} rationale must be 1-${MAX_RATIONALE_LENGTH} characters.`,
      );
    }
    return {
      kind: candidate.kind,
      id: candidate.id,
      rationale: candidate.rationale.trim(),
    };
  });

  return {
    items,
    persistence: "session_ui_only",
    canonical_mutation: "none",
  };
}

export function isWebMcpReviewKind(value: unknown): value is WebMcpReviewKind {
  return typeof value === "string"
    && (WEBMCP_REVIEW_KINDS as readonly string[]).includes(value);
}

function compact(value: string, maximum: number): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 3)).trimEnd()}...`;
}
