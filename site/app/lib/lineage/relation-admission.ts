import type {
  AnalysisCandidate,
  AnalysisSourceSummary,
} from "../analysis/contracts";
import type {
  ClaimOccurrence,
  EvidenceClaimLinkBasis,
  EvidenceClaimReviewLinkCandidate,
} from "./contracts";
import {
  compareCodePoint,
  directLexicalTokenSet,
  entityAnchorTokenSet,
  normalizeLineageText,
  stableTokenUnion,
  tokenOverlap,
  topicTokenSet,
  withoutTokens,
} from "./topic-tokens";

export const MAX_RELATION_ADMISSION_REVIEW_LINKS = 32;
export const MAX_RELATION_ADMISSION_LINKS_PER_EVIDENCE = 2;
export const MAX_RELATION_ADMISSION_NEIGHBORHOOD_TOKENS = 64;

const HIGH_CONTEXT_LINK_BASES = new Set([
  "same_actor_action_topic_overlap",
  "cross_source_strong_topic_overlap",
]);

export interface SourceComparisonHint {
  source_id: string;
  comparison_target_source_ids: string[];
}

export interface RelationAdmissionHint {
  left_occurrence_id: string;
  right_occurrence_id: string;
  clean_direct_lexical: boolean;
  clean_direct_shared_topic_tokens: string[];
  clean_direct_token_overlap: number;
  shared_evidence_bridge: boolean;
  shared_evidence_keys: string[];
  strict_evidence_neighborhood_bridge: boolean;
  evidence_neighborhood_bridge_tokens: string[];
  left_claim_into_right_neighborhood_tokens: string[];
  right_claim_into_left_neighborhood_tokens: string[];
  entity_anchor_tokens: string[];
}

export interface RelationAdmissionBuildInput {
  claimOccurrences: ClaimOccurrence[];
  evidenceCandidates: AnalysisCandidate[];
  reviewLinks: EvidenceClaimReviewLinkCandidate[];
  sources: AnalysisSourceSummary[];
  sourceComparisonHints?: SourceComparisonHint[];
}

interface ResolvedReviewLink {
  link: EvidenceClaimReviewLinkCandidate;
  evidence: AnalysisCandidate & { candidate_type: "finding" | "action" };
  occurrence: ClaimOccurrence;
  evidenceKey: string;
}

interface EvidenceNeighborhood {
  links: ResolvedReviewLink[];
  evidenceKeys: Set<string>;
  evidenceSourceIds: Set<string>;
  findingCount: number;
  actionCount: number;
  reviewLinkBases: Set<EvidenceClaimLinkBasis>;
  sameSourceEvidenceKeys: Set<string>;
  crossSourceEvidenceKeys: Set<string>;
  evidenceTimes: Set<string>;
  topicTokens: Set<string>;
}

export function buildRelationAdmissionHints(
  input: RelationAdmissionBuildInput,
): RelationAdmissionHint[] {
  const sourceComparisonHints = input.sourceComparisonHints ?? [];
  const occurrenceById = new Map(
    input.claimOccurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
  );
  const sourceById = new Map(input.sources.map((source) => [source.source_id, source]));
  const evidenceByKey = new Map(
    input.evidenceCandidates
      .filter(isEvidenceCandidate)
      .map((evidence) => [typedEvidenceKey(evidence.candidate_type, evidence.candidate_id), evidence]),
  );
  let resolvedLinks = input.reviewLinks.length <= MAX_RELATION_ADMISSION_REVIEW_LINKS
    ? resolveValidReviewLinks(
        input.reviewLinks,
        occurrenceById,
        evidenceByKey,
        sourceById,
      )
    : [];
  if (!selectedLinkBoundsAreValid(resolvedLinks)) resolvedLinks = [];

  const neighborhoods = new Map<string, EvidenceNeighborhood>();
  for (const occurrence of input.claimOccurrences) {
    neighborhoods.set(occurrence.occurrence_id, {
      links: [],
      evidenceKeys: new Set(),
      evidenceSourceIds: new Set(),
      findingCount: 0,
      actionCount: 0,
      reviewLinkBases: new Set(),
      sameSourceEvidenceKeys: new Set(),
      crossSourceEvidenceKeys: new Set(),
      evidenceTimes: new Set(),
      topicTokens: new Set(),
    });
  }
  for (const resolved of resolvedLinks) {
    const neighborhood = neighborhoods.get(resolved.occurrence.occurrence_id);
    if (!neighborhood) continue;
    neighborhood.links.push(resolved);
    neighborhood.evidenceKeys.add(resolved.evidenceKey);
    neighborhood.evidenceSourceIds.add(resolved.evidence.source_id);
    neighborhood.findingCount += resolved.evidence.candidate_type === "finding" ? 1 : 0;
    neighborhood.actionCount += resolved.evidence.candidate_type === "action" ? 1 : 0;
    neighborhood.reviewLinkBases.add(resolved.link.link_basis);
    if (resolved.evidence.source_id === resolved.occurrence.source_id) {
      neighborhood.sameSourceEvidenceKeys.add(resolved.evidenceKey);
    } else {
      neighborhood.crossSourceEvidenceKeys.add(resolved.evidenceKey);
    }
    for (const time of evidenceTimes(resolved.evidence, sourceById)) {
      neighborhood.evidenceTimes.add(time);
    }
  }
  for (const neighborhood of neighborhoods.values()) {
    neighborhood.links.sort((left, right) =>
      compareCodePoint(resolvedLinkKey(left), resolvedLinkKey(right))
    );
    neighborhood.topicTokens = stableTokenUnion(
      neighborhood.links.map((item) => topicTokenSet(item.evidence.text)),
      MAX_RELATION_ADMISSION_NEIGHBORHOOD_TOKENS,
    );
  }

  const hints: RelationAdmissionHint[] = [];
  for (let leftIndex = 0; leftIndex < input.claimOccurrences.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < input.claimOccurrences.length;
      rightIndex += 1
    ) {
      const left = input.claimOccurrences[leftIndex];
      const right = input.claimOccurrences[rightIndex];
      const leftNeighborhood = requiredNeighborhood(neighborhoods, left.occurrence_id);
      const rightNeighborhood = requiredNeighborhood(neighborhoods, right.occurrence_id);
      hints.push(buildPairHint({
        left,
        right,
        leftNeighborhood,
        rightNeighborhood,
        sourceById,
        sourceComparisonHints,
      }));
    }
  }
  return hints.sort((left, right) =>
    compareCodePoint(relationAdmissionHintKey(left), relationAdmissionHintKey(right))
  );
}

function buildPairHint(input: {
  left: ClaimOccurrence;
  right: ClaimOccurrence;
  leftNeighborhood: EvidenceNeighborhood;
  rightNeighborhood: EvidenceNeighborhood;
  sourceById: Map<string, AnalysisSourceSummary>;
  sourceComparisonHints: SourceComparisonHint[];
}): RelationAdmissionHint {
  const {
    left,
    right,
    leftNeighborhood,
    rightNeighborhood,
    sourceById,
    sourceComparisonHints,
  } = input;
  const directExcludedTokens = stableTokenUnion([
    actorTokens(left.actor),
    actorTokens(right.actor),
    publisherTokens(sourceById.get(left.source_id)),
    publisherTokens(sourceById.get(right.source_id)),
  ]);
  const cleanDirectOverlap = tokenOverlap(
    directLexicalTokenSet(left.original_claim_text, directExcludedTokens),
    directLexicalTokenSet(right.original_claim_text, directExcludedTokens),
  );
  const sharedActor = sameKnownActor(left.actor, right.actor);
  const nearbyDates = datesWithinDays(pairTime(left), pairTime(right), 45);
  const compatibleClaimTypes = compatibleActorClaimKinds(left, right);
  const cleanDirectLexical =
    cleanDirectOverlap.shared.length >= 2
    && cleanDirectOverlap.score >= 0.22
    && compatibleClaimTypes
    && (sharedActor || nearbyDates);

  const sharedEvidenceKeys = [...leftNeighborhood.evidenceKeys]
    .filter((key) => rightNeighborhood.evidenceKeys.has(key))
    .sort(compareCodePoint);
  const pairExcludedTokens = stableTokenUnion([
    directExcludedTokens,
    ...leftNeighborhood.links.map((item) => actorTokens(item.evidence.actor)),
    ...rightNeighborhood.links.map((item) => actorTokens(item.evidence.actor)),
    ...leftNeighborhood.links.map((item) =>
      publisherTokens(sourceById.get(item.evidence.source_id))
    ),
    ...rightNeighborhood.links.map((item) =>
      publisherTokens(sourceById.get(item.evidence.source_id))
    ),
  ]);
  const leftNeighborhoodTokens = withoutTokens(
    leftNeighborhood.topicTokens,
    pairExcludedTokens,
  );
  const rightNeighborhoodTokens = withoutTokens(
    rightNeighborhood.topicTokens,
    pairExcludedTokens,
  );
  const leftClaimTopics = withoutTokens(topicTokenSet(left.original_claim_text), pairExcludedTokens);
  const rightClaimTopics = withoutTokens(topicTokenSet(right.original_claim_text), pairExcludedTokens);
  const reviewOverlap = tokenOverlap(
    topicTokenSet(left.original_claim_text),
    topicTokenSet(right.original_claim_text),
  );
  const neighborhoodOverlap = tokenOverlap(leftNeighborhoodTokens, rightNeighborhoodTokens);
  const leftIntoRight = tokenOverlap(leftClaimTopics, rightNeighborhoodTokens).shared;
  const rightIntoLeft = tokenOverlap(rightClaimTopics, leftNeighborhoodTokens).shared;
  const entityAnchors = tokenOverlap(
    withoutTokens(entityAnchorTokenSet(left.original_claim_text), pairExcludedTokens),
    withoutTokens(entityAnchorTokenSet(right.original_claim_text), pairExcludedTokens),
  ).shared.filter((token) => neighborhoodOverlap.shared.includes(token));
  const coverageComparison = hasCoverageComparisonHint(
    left.source_id,
    right.source_id,
    sourceComparisonHints,
  );
  const strictEvidenceNeighborhoodBridge =
    compatibleClaimTypes
    && reviewOverlap.shared.length >= 2
    && neighborhoodOverlap.shared.length >= 3
    && leftIntoRight.length >= 2
    && rightIntoLeft.length >= 2
    && entityAnchors.length >= 1
    && hasHighContextLink(leftNeighborhood)
    && hasHighContextLink(rightNeighborhood)
    && hasCrossSourceEvidence(leftNeighborhood)
    && hasCrossSourceEvidence(rightNeighborhood)
    && (left.source_id === right.source_id || sharedActor || coverageComparison);

  return {
    left_occurrence_id: left.occurrence_id,
    right_occurrence_id: right.occurrence_id,
    clean_direct_lexical: cleanDirectLexical,
    clean_direct_shared_topic_tokens: cleanDirectOverlap.shared,
    clean_direct_token_overlap: cleanDirectOverlap.score,
    shared_evidence_bridge: sharedEvidenceKeys.length > 0,
    shared_evidence_keys: sharedEvidenceKeys,
    strict_evidence_neighborhood_bridge: strictEvidenceNeighborhoodBridge,
    evidence_neighborhood_bridge_tokens: neighborhoodOverlap.shared,
    left_claim_into_right_neighborhood_tokens: leftIntoRight,
    right_claim_into_left_neighborhood_tokens: rightIntoLeft,
    entity_anchor_tokens: entityAnchors,
  };
}

function resolveValidReviewLinks(
  links: EvidenceClaimReviewLinkCandidate[],
  occurrenceById: Map<string, ClaimOccurrence>,
  evidenceByKey: Map<string, AnalysisCandidate & { candidate_type: "finding" | "action" }>,
  sourceById: Map<string, AnalysisSourceSummary>,
): ResolvedReviewLink[] {
  const linkIdCounts = new Map<string, number>();
  for (const link of links) {
    linkIdCounts.set(link.link_id, (linkIdCounts.get(link.link_id) ?? 0) + 1);
  }
  const resolved: ResolvedReviewLink[] = [];
  for (const link of links) {
    if ((linkIdCounts.get(link.link_id) ?? 0) !== 1) continue;
    const evidenceKey = typedEvidenceKey(link.evidence_record_kind, link.evidence_record_id);
    const evidence = evidenceByKey.get(evidenceKey);
    const occurrence = occurrenceById.get(link.claim_occurrence_id);
    const evidenceSource = sourceById.get(link.evidence_source_id);
    if (
      !evidence
      || !occurrence
      || !evidenceSource
      || link.link_semantics !== "review_together_only"
      || link.review_status !== "pending_review"
      || link.status !== "candidate"
      || link.generated_by !== "deterministic_rule"
      || link.origin !== "live_api"
      || !reviewTopicsAreValid(link.shared_topic_tokens)
      || link.evidence_source_id !== evidence.source_id
      || link.claim_id !== occurrence.claim_id
      || link.claim_source_id !== occurrence.source_id
      || evidence.source_reference.source_id !== evidence.source_id
      || evidence.source_reference.snapshot_id !== evidence.snapshot_id
      || evidenceSource.snapshot_id !== evidence.snapshot_id
      || !supportIsInspectable(link.evidence_support_reference)
      || !supportIsInspectable(link.claim_support_reference)
      || link.evidence_support_reference.source_id !== evidence.source_id
      || link.evidence_support_reference.snapshot_id !== evidence.snapshot_id
      || link.evidence_support_reference.support_kind !== evidence.support_kind
      || link.claim_support_reference.source_id !== occurrence.source_id
      || link.claim_support_reference.snapshot_id !== occurrence.snapshot_id
      || link.claim_support_reference.support_kind !== occurrence.support_kind
    ) {
      continue;
    }
    resolved.push({ link, evidence, occurrence, evidenceKey });
  }
  return resolved.sort((left, right) =>
    compareCodePoint(resolvedLinkKey(left), resolvedLinkKey(right))
  );
}

function selectedLinkBoundsAreValid(links: ResolvedReviewLink[]): boolean {
  if (links.length > MAX_RELATION_ADMISSION_REVIEW_LINKS) return false;
  const counts = new Map<string, number>();
  for (const link of links) {
    const count = (counts.get(link.evidenceKey) ?? 0) + 1;
    if (count > MAX_RELATION_ADMISSION_LINKS_PER_EVIDENCE) return false;
    counts.set(link.evidenceKey, count);
  }
  return true;
}

function isEvidenceCandidate(
  candidate: AnalysisCandidate,
): candidate is AnalysisCandidate & { candidate_type: "finding" | "action" } {
  return candidate.candidate_type === "finding" || candidate.candidate_type === "action";
}

function supportIsInspectable(support: {
  bounded_excerpt: string;
  evidence_reference: string;
}): boolean {
  return Boolean(support.bounded_excerpt.trim() && support.evidence_reference.trim());
}

function reviewTopicsAreValid(tokens: string[]): boolean {
  if (tokens.length < 2 || new Set(tokens).size !== tokens.length) return false;
  const sorted = [...tokens].sort(compareCodePoint);
  return sorted.every((token, index) => token === tokens[index] && token.length > 0);
}

function typedEvidenceKey(kind: "finding" | "action", id: string): string {
  return `${kind}:${id}`;
}

function resolvedLinkKey(item: ResolvedReviewLink): string {
  return `${item.evidenceKey}|${item.occurrence.occurrence_id}|${item.link.link_id}`;
}

function requiredNeighborhood(
  neighborhoods: Map<string, EvidenceNeighborhood>,
  occurrenceId: string,
): EvidenceNeighborhood {
  const neighborhood = neighborhoods.get(occurrenceId);
  if (!neighborhood) throw new Error(`Missing admission neighborhood for ${occurrenceId}`);
  return neighborhood;
}

function relationAdmissionHintKey(hint: RelationAdmissionHint): string {
  return [hint.left_occurrence_id, hint.right_occurrence_id].sort(compareCodePoint).join("|");
}

function actorTokens(actor: string | null): Set<string> {
  return actor ? topicTokenSet(actor) : new Set<string>();
}

function publisherTokens(source: AnalysisSourceSummary | undefined): Set<string> {
  return source ? topicTokenSet(source.publisher) : new Set<string>();
}

function compatibleActorClaimKinds(left: ClaimOccurrence, right: ClaimOccurrence): boolean {
  return (
    left.claim_kind === "actor_claim" && right.claim_kind === "actor_claim"
  ) || (
    left.claim_kind === "prepared_actor_claim"
    && right.claim_kind === "prepared_actor_claim"
  );
}

function sameKnownActor(left: string | null, right: string | null): boolean {
  return Boolean(
    left
    && right
    && normalizeLineageText(left) === normalizeLineageText(right),
  );
}

function pairTime(occurrence: ClaimOccurrence): string | null {
  return occurrence.event_time_candidate
    ?? occurrence.assertion_time_candidate
    ?? occurrence.source_publication_time;
}

function datesWithinDays(left: string | null, right: string | null, days: number): boolean {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
  return Math.abs(leftTime - rightTime) <= days * 86_400_000;
}

function hasCoverageComparisonHint(
  leftSourceId: string,
  rightSourceId: string,
  hints: SourceComparisonHint[],
): boolean {
  return hints.some((hint) =>
    (hint.source_id === leftSourceId
      && hint.comparison_target_source_ids.includes(rightSourceId))
    || (hint.source_id === rightSourceId
      && hint.comparison_target_source_ids.includes(leftSourceId))
  );
}

function hasHighContextLink(neighborhood: EvidenceNeighborhood): boolean {
  return [...neighborhood.reviewLinkBases].some((basis) =>
    HIGH_CONTEXT_LINK_BASES.has(basis)
  );
}

function hasCrossSourceEvidence(neighborhood: EvidenceNeighborhood): boolean {
  return neighborhood.crossSourceEvidenceKeys.size > 0;
}

function evidenceTimes(
  evidence: AnalysisCandidate,
  sourceById: Map<string, AnalysisSourceSummary>,
): string[] {
  const times = [
    evidence.time_candidate,
    sourceById.get(evidence.source_id)?.published_at ?? null,
  ].filter((value): value is string => Boolean(value));
  return [...new Set(times)].sort(compareCodePoint);
}
