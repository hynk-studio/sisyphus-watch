import type { AnalysisCandidate } from "../analysis/contracts";
import type {
  BoundedSupportReference,
  ClaimOccurrence,
  EvidenceClaimLinkBasis,
  EvidenceClaimLinkWorkSummary,
  EvidenceClaimReviewLinkCandidate,
} from "./contracts";
import {
  normalizeClaimText,
  stableLineageId,
  type SourceComparisonHint,
} from "./engine";

export const MAX_EVIDENCE_CLAIM_REVIEW_LINKS = 32;
export const MAX_REVIEW_LINKS_PER_EVIDENCE_RECORD = 2;

const MIN_CONTEXTUAL_SHARED_TOPIC_TOKENS = 2;
const MIN_CROSS_SOURCE_SHARED_TOPIC_TOKENS = 4;

const TOPIC_STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "before", "being",
  "between", "both", "but", "can", "did", "does", "each", "for", "from",
  "had", "has", "have", "into", "its", "may", "more", "not", "only",
  "other", "our", "public", "record", "said", "says", "source", "states",
  "summary", "than", "that", "the", "their", "them", "then", "there",
  "these", "they", "this", "through", "under", "was", "were", "will",
  "with", "would",
]);

const TOPIC_TOKEN_ALIASES: Record<string, string> = {
  changed: "change",
  changes: "change",
  changing: "change",
  explained: "explain",
  explaining: "explain",
  explanation: "explain",
  explanations: "explain",
  lander: "landing",
  landers: "landing",
  missions: "mission",
  moved: "move",
  moves: "move",
  moving: "move",
  planned: "plan",
  plans: "plan",
  planning: "plan",
  reduced: "reduce",
  reduces: "reduce",
  reducing: "reduce",
  reduction: "reduce",
  scheduled: "schedule",
  schedules: "schedule",
  scheduling: "schedule",
  tested: "test",
  testing: "test",
  tests: "test",
  updated: "update",
  updates: "update",
  updating: "update",
};

type EvidenceCandidate = AnalysisCandidate & {
  candidate_type: "finding" | "action";
};

interface RankedReviewLink {
  link: EvidenceClaimReviewLinkCandidate;
  rank: number;
  stable_key: string;
}

export interface EvidenceClaimLinkBuildResult {
  links: EvidenceClaimReviewLinkCandidate[];
  summary: EvidenceClaimLinkWorkSummary;
  warnings: string[];
}

export function buildEvidenceClaimReviewLinks(
  evidenceCandidates: AnalysisCandidate[],
  claimOccurrences: ClaimOccurrence[],
  sourceComparisonHints: SourceComparisonHint[] = [],
  maximumLinkCount = MAX_EVIDENCE_CLAIM_REVIEW_LINKS,
  maximumLinksPerEvidenceRecord = MAX_REVIEW_LINKS_PER_EVIDENCE_RECORD,
): EvidenceClaimLinkBuildResult {
  if (!Number.isInteger(maximumLinkCount) || maximumLinkCount < 1) {
    throw new Error("maximumLinkCount must be a positive integer");
  }
  if (maximumLinkCount > MAX_EVIDENCE_CLAIM_REVIEW_LINKS) {
    throw new Error(
      `maximumLinkCount cannot exceed ${MAX_EVIDENCE_CLAIM_REVIEW_LINKS}`,
    );
  }
  if (!Number.isInteger(maximumLinksPerEvidenceRecord) || maximumLinksPerEvidenceRecord < 1) {
    throw new Error("maximumLinksPerEvidenceRecord must be a positive integer");
  }
  if (maximumLinksPerEvidenceRecord > MAX_REVIEW_LINKS_PER_EVIDENCE_RECORD) {
    throw new Error(
      `maximumLinksPerEvidenceRecord cannot exceed ${MAX_REVIEW_LINKS_PER_EVIDENCE_RECORD}`,
    );
  }

  const evidence = evidenceCandidates.filter(isEvidenceCandidate);
  const theoreticalPairCount = evidence.length * claimOccurrences.length;
  const ranked: RankedReviewLink[] = [];

  for (const evidenceCandidate of evidence) {
    const evidenceSupport = evidenceSupportReference(evidenceCandidate);
    if (!evidenceSupport) continue;
    for (const occurrence of claimOccurrences) {
      const claimSupport = claimSupportReference(occurrence);
      if (!claimSupport) continue;
      const sharedTopicTokens = sharedMeaningfulTopicTokens(
        evidenceCandidate.text,
        occurrence.original_claim_text,
        [evidenceCandidate.actor, occurrence.actor],
      );
      const sameSource = evidenceCandidate.source_id === occurrence.source_id;
      const coverageComparison = hasCoverageComparisonHint(
        evidenceCandidate.source_id,
        occurrence.source_id,
        sourceComparisonHints,
      );
      const sameActorAction = evidenceCandidate.candidate_type === "action"
        && sameKnownActor(evidenceCandidate.actor, occurrence.actor);
      const basis = selectLinkBasis({
        sameSource,
        coverageComparison,
        sameActorAction,
        sharedTopicTokenCount: sharedTopicTokens.length,
      });
      if (!basis) continue;

      const link: EvidenceClaimReviewLinkCandidate = {
        link_id: stableLineageId(
          "evidence_claim_review_link_",
          evidenceCandidate.candidate_type,
          evidenceCandidate.candidate_id,
          occurrence.occurrence_id,
          "review_together_only",
          basis,
        ),
        evidence_record_kind: evidenceCandidate.candidate_type,
        evidence_record_id: evidenceCandidate.candidate_id,
        evidence_source_id: evidenceCandidate.source_id,
        claim_occurrence_id: occurrence.occurrence_id,
        claim_id: occurrence.claim_id,
        claim_source_id: occurrence.source_id,
        link_semantics: "review_together_only",
        link_basis: basis,
        shared_topic_tokens: sharedTopicTokens,
        reason: linkReason(basis),
        evidence_support_reference: evidenceSupport,
        claim_support_reference: claimSupport,
        review_status: "pending_review",
        status: "candidate",
        generated_by: "deterministic_rule",
        origin: "live_api",
      };
      ranked.push({
        link,
        rank: basisRank(basis) * 100 + Math.min(sharedTopicTokens.length, 20),
        stable_key: `${evidenceCandidate.candidate_type}|${evidenceCandidate.candidate_id}|${occurrence.occurrence_id}|${basis}`,
      });
    }
  }

  ranked.sort((left, right) =>
    right.rank - left.rank || compareCodePoint(left.stable_key, right.stable_key)
  );
  const selected: EvidenceClaimReviewLinkCandidate[] = [];
  const selectedByEvidence = new Map<string, number>();
  for (const candidate of ranked) {
    if (selected.length >= maximumLinkCount) continue;
    const evidenceKey = `${candidate.link.evidence_record_kind}:${candidate.link.evidence_record_id}`;
    const currentCount = selectedByEvidence.get(evidenceKey) ?? 0;
    if (currentCount >= maximumLinksPerEvidenceRecord) continue;
    selected.push(candidate.link);
    selectedByEvidence.set(evidenceKey, currentCount + 1);
  }
  const deferredLinkCount = ranked.length - selected.length;
  const configuredBoundReached = deferredLinkCount > 0;

  return {
    links: selected,
    summary: {
      evidence_record_count: evidence.length,
      claim_occurrence_count: claimOccurrences.length,
      theoretical_pair_count: theoreticalPairCount,
      prefilter_candidate_count: ranked.length,
      selected_link_count: selected.length,
      filtered_out_count: theoreticalPairCount - ranked.length,
      deferred_link_count: deferredLinkCount,
      configured_maximum_link_count: maximumLinkCount,
      configured_maximum_links_per_evidence_record: maximumLinksPerEvidenceRecord,
      configured_bound_reached: configuredBoundReached,
    },
    warnings: configuredBoundReached
      ? [
          `evidence_claim_link_bound_reached:${ranked.length}->${selected.length}; ${deferredLinkCount} review-together candidates were deterministically deferred and completeness is not claimed.`,
        ]
      : [],
  };
}

function isEvidenceCandidate(candidate: AnalysisCandidate): candidate is EvidenceCandidate {
  return candidate.candidate_type === "finding" || candidate.candidate_type === "action";
}

function selectLinkBasis(input: {
  sameSource: boolean;
  coverageComparison: boolean;
  sameActorAction: boolean;
  sharedTopicTokenCount: number;
}): EvidenceClaimLinkBasis | null {
  if (
    input.sameActorAction
    && input.sharedTopicTokenCount >= MIN_CONTEXTUAL_SHARED_TOPIC_TOKENS
  ) {
    return "same_actor_action_topic_overlap";
  }
  if (
    input.sameSource
    && input.sharedTopicTokenCount >= MIN_CONTEXTUAL_SHARED_TOPIC_TOKENS
  ) {
    return "same_source_topic_overlap";
  }
  if (
    input.coverageComparison
    && input.sharedTopicTokenCount >= MIN_CONTEXTUAL_SHARED_TOPIC_TOKENS
  ) {
    return "coverage_comparison_topic_overlap";
  }
  if (
    !input.sameSource
    && input.sharedTopicTokenCount >= MIN_CROSS_SOURCE_SHARED_TOPIC_TOKENS
  ) {
    return "cross_source_strong_topic_overlap";
  }
  return null;
}

function sharedMeaningfulTopicTokens(
  evidenceText: string,
  claimText: string,
  actors: Array<string | null>,
): string[] {
  const evidenceTokens = topicTokens(evidenceText);
  const claimTokens = topicTokens(claimText);
  const actorTokens = new Set(actors.flatMap((actor) => actor ? [...topicTokens(actor)] : []));
  return [...evidenceTokens]
    .filter((token) => claimTokens.has(token) && !actorTokens.has(token))
    .sort(compareCodePoint);
}

function topicTokens(value: string): Set<string> {
  return new Set(
    normalizeClaimText(value)
      .split(" ")
      .map((token) => TOPIC_TOKEN_ALIASES[token] ?? token)
      .filter((token) => token.length >= 3 && !TOPIC_STOP_WORDS.has(token)),
  );
}

function sameKnownActor(left: string | null, right: string | null): boolean {
  return Boolean(left && right && normalizeClaimText(left) === normalizeClaimText(right));
}

function hasCoverageComparisonHint(
  evidenceSourceId: string,
  claimSourceId: string,
  hints: SourceComparisonHint[],
): boolean {
  return hints.some((hint) =>
    (hint.source_id === evidenceSourceId
      && hint.comparison_target_source_ids.includes(claimSourceId))
    || (hint.source_id === claimSourceId
      && hint.comparison_target_source_ids.includes(evidenceSourceId))
  );
}

function evidenceSupportReference(
  candidate: EvidenceCandidate,
): BoundedSupportReference | null {
  if (
    candidate.support_kind !== "model_generated_web_search_summary_span"
    || candidate.source_reference.source_id !== candidate.source_id
    || candidate.source_reference.snapshot_id !== candidate.snapshot_id
    || !candidate.supporting_summary_span.trim()
    || !candidate.evidence_reference.trim()
    || !isHttpUrl(candidate.source_reference.url)
  ) {
    return null;
  }
  return {
    support_kind: candidate.support_kind,
    source_id: candidate.source_id,
    snapshot_id: candidate.snapshot_id,
    bounded_excerpt: candidate.supporting_summary_span,
    evidence_reference: candidate.evidence_reference,
    citation_url: candidate.source_reference.url,
    proves: "model_summary_containment_only",
  };
}

function claimSupportReference(
  occurrence: ClaimOccurrence,
): BoundedSupportReference | null {
  const support = occurrence.support_reference;
  if (
    support.source_id !== occurrence.source_id
    || support.snapshot_id !== occurrence.snapshot_id
    || support.support_kind !== occurrence.support_kind
    || !support.bounded_excerpt.trim()
    || !support.evidence_reference.trim()
    || (support.citation_url !== null && !isHttpUrl(support.citation_url))
  ) {
    return null;
  }
  return { ...support };
}

function linkReason(basis: EvidenceClaimLinkBasis): string {
  if (basis === "same_actor_action_topic_overlap") {
    return "The source-bound action and actor claim name the same actor and share normalized topical tokens. This only identifies records worth reviewing together.";
  }
  if (basis === "same_source_topic_overlap") {
    return "The source-bound evidence and actor claim come from the same source and share normalized topical tokens. This only identifies records worth reviewing together.";
  }
  if (basis === "coverage_comparison_topic_overlap") {
    return "The evidence source was selected for bounded comparison with the claim source and the records share normalized topical tokens. This only identifies records worth reviewing together.";
  }
  return "The cross-source evidence and actor claim share several normalized topical tokens. This only identifies records worth reviewing together.";
}

function basisRank(basis: EvidenceClaimLinkBasis): number {
  if (basis === "same_actor_action_topic_overlap") return 4;
  if (basis === "same_source_topic_overlap") return 3;
  if (basis === "coverage_comparison_topic_overlap") return 2;
  return 1;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
