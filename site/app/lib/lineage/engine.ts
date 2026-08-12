import type {
  BoundedWorkSummary,
  ClaimFamilyCandidate,
  ClaimOccurrence,
  RelationCandidate,
  RelationType,
} from "./contracts";

export const MAX_RELATION_PAIR_WORKLOAD = 64;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was",
  "were", "will", "with",
]);

export interface FixtureRelationRule {
  left_claim_id: string;
  right_claim_id: string;
  relation_type: RelationType;
  confidence_score: number;
  reason: string;
  evidence_basis:
    | "deterministic_fixture"
    | "explicit_replacement_language"
    | "insufficient_evidence";
}

export interface RelationBuildResult {
  relations: RelationCandidate[];
  summary: BoundedWorkSummary;
  warnings: string[];
}

interface PairSignals {
  shared_actor: boolean;
  shared_topic_tokens: string[];
  token_overlap: number;
  nearby_dates: boolean;
  compatible_claim_types: boolean;
  explicit_fixture_rule: FixtureRelationRule | null;
  plausible: boolean;
  score: number;
}

interface RankedPair {
  left: ClaimOccurrence;
  right: ClaimOccurrence;
  signals: PairSignals;
}

export function normalizeClaimText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableLineageId(prefix: string, ...parts: string[]): string {
  const input = parts.join("|");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const value = input.charCodeAt(index);
    first = Math.imul(first ^ value, 0x01000193) >>> 0;
    second = Math.imul(second ^ (value + index), 0x85ebca6b) >>> 0;
  }
  return `${prefix}${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}

export function buildClaimFamilies(
  occurrences: ClaimOccurrence[],
  explicitGroups: Array<{
    family_id: string;
    claim_ids: string[];
    reason: string;
    signals: string[];
  }> = [],
): ClaimFamilyCandidate[] {
  const assigned = new Set<string>();
  const families: ClaimFamilyCandidate[] = [];

  for (const group of explicitGroups) {
    const members = occurrences.filter((item) => group.claim_ids.includes(item.claim_id));
    if (members.length === 0) continue;
    for (const member of members) assigned.add(member.occurrence_id);
    families.push({
      family_id: group.family_id,
      occurrence_ids: members.map((item) => item.occurrence_id).sort(),
      grouping_reason: group.reason,
      grouping_signals: group.signals,
      unresolved: members.length === 1,
      review_status: "pending_review",
      status: "candidate",
      origin: members.every((item) => item.origin === "deterministic_fixture")
        ? "deterministic_fixture"
        : "live_api",
    });
  }

  const remaining = occurrences.filter((item) => !assigned.has(item.occurrence_id));
  const groups: ClaimOccurrence[][] = [];
  for (const occurrence of remaining) {
    const group = groups.find((candidateGroup) => {
      const first = candidateGroup[0];
      if (!sameKnownActor(first.actor, occurrence.actor) || first.claim_kind !== occurrence.claim_kind) {
        return false;
      }
      const overlap = tokenOverlap(
        first.normalized_claim_representation,
        occurrence.normalized_claim_representation,
      );
      return overlap.score >= 0.5 && overlap.shared.length >= 2;
    });
    if (group) group.push(occurrence);
    else groups.push([occurrence]);
  }

  for (const group of groups) {
    if (group.length < 2) continue;
    const familyId = stableLineageId(
      "family_candidate_rule_",
      ...group.map((item) => item.occurrence_id).sort(),
    );
    for (const member of group) assigned.add(member.occurrence_id);
    families.push({
      family_id: familyId,
      occurrence_ids: group.map((item) => item.occurrence_id).sort(),
      grouping_reason:
        "Shared actor, compatible claim kind, and strong normalized token overlap make this a reviewable grouping candidate; they do not establish shared truth.",
      grouping_signals: ["shared_actor", "compatible_claim_type", "strong_token_overlap"],
      unresolved: false,
      review_status: "pending_review",
      status: "candidate",
      origin: group.every((item) => item.origin === "deterministic_fixture")
        ? "deterministic_fixture"
        : "live_api",
    });
  }

  for (const occurrence of remaining.filter((item) => !assigned.has(item.occurrence_id))) {
    families.push({
      family_id: stableLineageId("family_candidate_unresolved_", occurrence.occurrence_id),
      occurrence_ids: [occurrence.occurrence_id],
      grouping_reason:
        "No other occurrence met the conservative multi-signal grouping threshold.",
      grouping_signals: ["unresolved_grouping"],
      unresolved: true,
      review_status: "pending_review",
      status: "candidate",
      origin: occurrence.origin,
    });
  }

  return families.sort((left, right) => left.family_id.localeCompare(right.family_id));
}

export function applyFamilyReferences(
  occurrences: ClaimOccurrence[],
  families: ClaimFamilyCandidate[],
): ClaimOccurrence[] {
  const familyByOccurrence = new Map<string, string>();
  for (const family of families) {
    for (const occurrenceId of family.occurrence_ids) {
      familyByOccurrence.set(occurrenceId, family.family_id);
    }
  }
  return occurrences.map((occurrence) => ({
    ...occurrence,
    candidate_claim_family_id:
      familyByOccurrence.get(occurrence.occurrence_id) ?? null,
  }));
}

export function buildBoundedRelations(
  occurrences: ClaimOccurrence[],
  fixtureRules: FixtureRelationRule[] = [],
  maximumPairWorkload = MAX_RELATION_PAIR_WORKLOAD,
): RelationBuildResult {
  if (!Number.isInteger(maximumPairWorkload) || maximumPairWorkload < 1) {
    throw new Error("maximumPairWorkload must be a positive integer");
  }

  const rankedPairs: RankedPair[] = [];
  for (let leftIndex = 0; leftIndex < occurrences.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < occurrences.length; rightIndex += 1) {
      const left = occurrences[leftIndex];
      const right = occurrences[rightIndex];
      rankedPairs.push({
        left,
        right,
        signals: inspectPair(left, right, fixtureRules),
      });
    }
  }

  const theoreticalPairCount = rankedPairs.length;
  const plausiblePairs = rankedPairs
    .filter((pair) => pair.signals.plausible)
    .sort((left, right) =>
      right.signals.score - left.signals.score ||
      pairKey(left).localeCompare(pairKey(right)),
    );
  const selectedPairs = plausiblePairs.slice(0, maximumPairWorkload);
  const deferredPairCount = Math.max(0, plausiblePairs.length - selectedPairs.length);
  const relations = selectedPairs.map(classifyPair);
  const configuredBoundReached = deferredPairCount > 0;

  return {
    relations,
    summary: {
      occurrence_count: occurrences.length,
      theoretical_pair_count: theoreticalPairCount,
      configured_maximum_pair_count: maximumPairWorkload,
      prefilter_candidate_count: plausiblePairs.length,
      filtered_out_count: theoreticalPairCount - plausiblePairs.length,
      deferred_pair_count: deferredPairCount,
      model_classified_count: 0,
      unrelated_count: relations.filter((item) => item.relation_type === "unrelated").length,
      unresolved_or_insufficient_evidence_count: relations.filter(
        (item) => item.relation_type === "unresolved" || item.insufficient_evidence,
      ).length,
      configured_bound_reached: configuredBoundReached,
    },
    warnings: configuredBoundReached
      ? [
          `relation_pair_bound_reached:${plausiblePairs.length}->${maximumPairWorkload}; ${deferredPairCount} plausible pairs were deterministically deferred and completeness is not claimed.`,
        ]
      : [],
  };
}

function inspectPair(
  left: ClaimOccurrence,
  right: ClaimOccurrence,
  fixtureRules: FixtureRelationRule[],
): PairSignals {
  const overlap = tokenOverlap(
    left.normalized_claim_representation,
    right.normalized_claim_representation,
  );
  const explicitFixtureRule = fixtureRules.find(
    (rule) =>
      (rule.left_claim_id === left.claim_id && rule.right_claim_id === right.claim_id) ||
      (rule.left_claim_id === right.claim_id && rule.right_claim_id === left.claim_id),
  ) ?? null;
  const sharedActor = sameKnownActor(left.actor, right.actor);
  const nearbyDates = datesWithinDays(pairTime(left), pairTime(right), 45);
  const compatibleClaimTypes = left.claim_kind === right.claim_kind ||
    left.claim_kind === "prepared_actor_claim" ||
    right.claim_kind === "prepared_actor_claim";
  const multiSignalPlausible =
    overlap.shared.length >= 2 &&
    overlap.score >= 0.22 &&
    (sharedActor || nearbyDates) &&
    compatibleClaimTypes;
  const score =
    (explicitFixtureRule ? 10 : 0) +
    (sharedActor ? 1.5 : 0) +
    (nearbyDates ? 0.8 : 0) +
    (compatibleClaimTypes ? 0.5 : 0) +
    overlap.score * 2 +
    Math.min(overlap.shared.length, 5) * 0.1;

  return {
    shared_actor: sharedActor,
    shared_topic_tokens: overlap.shared,
    token_overlap: overlap.score,
    nearby_dates: nearbyDates,
    compatible_claim_types: compatibleClaimTypes,
    explicit_fixture_rule: explicitFixtureRule,
    plausible: Boolean(explicitFixtureRule) || multiSignalPlausible,
    score,
  };
}

function classifyPair(pair: RankedPair): RelationCandidate {
  const { left, right, signals } = pair;
  const rule = signals.explicit_fixture_rule;
  const ordered = orderByTime(left, right);
  let relationType: RelationType = "unresolved";
  let reason =
    "Deterministic signals make this pair reviewable, but they are insufficient to adjudicate truth or a stronger temporal relation.";
  let confidenceScore = Math.min(0.69, 0.25 + signals.token_overlap * 0.4);
  let insufficientEvidence = true;
  let generatedBy: RelationCandidate["generated_by"] = "deterministic_rule";

  if (rule) {
    relationType = enforceConservativeReplacementRule(rule, left, right);
    reason = rule.reason;
    confidenceScore = clampScore(rule.confidence_score);
    insufficientEvidence =
      rule.evidence_basis === "insufficient_evidence" || relationType === "unresolved";
    generatedBy = "deterministic_fixture";
  }

  return {
    relation_id: stableLineageId(
      "relation_candidate_",
      ordered[0].occurrence_id,
      ordered[1].occurrence_id,
      relationType,
    ),
    left_occurrence_id: ordered[0].occurrence_id,
    right_occurrence_id: ordered[1].occurrence_id,
    left_source_id: ordered[0].source_id,
    right_source_id: ordered[1].source_id,
    left_snapshot_id: ordered[0].snapshot_id,
    right_snapshot_id: ordered[1].snapshot_id,
    relation_type: relationType,
    left_support_reference: ordered[0].support_reference,
    right_support_reference: ordered[1].support_reference,
    left_support_kind: ordered[0].support_kind,
    right_support_kind: ordered[1].support_kind,
    confidence_score: confidenceScore,
    reason,
    review_status: "pending_review",
    status: "candidate",
    generated_by: generatedBy,
    insufficient_evidence: insufficientEvidence,
  };
}

function enforceConservativeReplacementRule(
  rule: FixtureRelationRule,
  left: ClaimOccurrence,
  right: ClaimOccurrence,
): RelationType {
  if (rule.relation_type !== "correction" && rule.relation_type !== "supersedes") {
    return rule.relation_type;
  }
  const linkedActor = sameKnownActor(left.actor, right.actor);
  const ordered = Boolean(pairTime(left) && pairTime(right) && pairTime(left) !== pairTime(right));
  const inspectableBasis =
    rule.evidence_basis === "explicit_replacement_language" ||
    rule.evidence_basis === "deterministic_fixture";
  return linkedActor && ordered && inspectableBasis ? rule.relation_type : "unresolved";
}

function tokenOverlap(left: string, right: string): { score: number; shared: string[] } {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).sort();
  const union = new Set([...leftTokens, ...rightTokens]);
  return { score: union.size === 0 ? 0 : shared.length / union.size, shared };
}

function sameKnownActor(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return normalizeClaimText(left) === normalizeClaimText(right);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeClaimText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function pairTime(occurrence: ClaimOccurrence): string | null {
  return occurrence.event_time_candidate ??
    occurrence.assertion_time_candidate ??
    occurrence.source_publication_time;
}

function datesWithinDays(left: string | null, right: string | null, days: number): boolean {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
  return Math.abs(leftTime - rightTime) <= days * 86_400_000;
}

function orderByTime(
  left: ClaimOccurrence,
  right: ClaimOccurrence,
): [ClaimOccurrence, ClaimOccurrence] {
  const leftTime = pairTime(left) ?? left.source_retrieval_time;
  const rightTime = pairTime(right) ?? right.source_retrieval_time;
  return leftTime < rightTime ||
    (leftTime === rightTime && left.occurrence_id < right.occurrence_id)
    ? [left, right]
    : [right, left];
}

function pairKey(pair: RankedPair): string {
  return [pair.left.occurrence_id, pair.right.occurrence_id].sort().join("|");
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
