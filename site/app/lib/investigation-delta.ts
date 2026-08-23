import type {
  LocalWatchCandidate,
  LocalWatchRelation,
  LocalWatchSource,
  LocalWatchSourceBackedRelation,
} from "./local-watch";
import { validateLocalWatchSnapshot } from "./local-watch";

export const DELTA_SIGNAL_RELATION_TYPES = [
  "contradicts",
  "correction",
  "supersedes",
] as const;

export type DeltaSignalRelationType =
  (typeof DELTA_SIGNAL_RELATION_TYPES)[number];

export interface ChangedCandidateRecord {
  identity: string;
  previous: LocalWatchCandidate;
  current: LocalWatchCandidate;
  changed_dimensions: Array<
    | "supporting sources"
    | "confidence"
    | "assertion time"
    | "event time"
    | "publication time"
  >;
}

export interface InvestigationDelta {
  new_sources: LocalWatchSource[];
  sources_not_returned: LocalWatchSource[];
  new_candidates: LocalWatchCandidate[];
  candidates_not_returned: LocalWatchCandidate[];
  changed_candidates: ChangedCandidateRecord[];
  new_contradiction_signals: LocalWatchRelation[];
  new_correction_signals: LocalWatchRelation[];
  new_supersession_signals: LocalWatchRelation[];
  relation_evidence_comparison:
    | "comparable"
    | "previous_unavailable"
    | "current_unavailable"
    | "unavailable";
  clarified_source_backed_relations: LocalWatchSourceBackedRelation[];
  new_source_backed_relations: LocalWatchSourceBackedRelation[];
  source_backed_relations_without_comparable_baseline: LocalWatchSourceBackedRelation[];
  source_backed_relations_not_reobserved: LocalWatchSourceBackedRelation[];
  source_backed_direction_changes: Array<{
    relation_identity: string;
    previous: LocalWatchSourceBackedRelation;
    current: LocalWatchSourceBackedRelation;
  }>;
  has_deterministic_differences: boolean;
}

export function compareInvestigationSnapshots(
  previousInput: unknown,
  currentInput: unknown,
): InvestigationDelta {
  const previous = validateLocalWatchSnapshot(previousInput);
  const current = validateLocalWatchSnapshot(currentInput);

  const previousSources = keyed(previous.sources);
  const currentSources = keyed(current.sources);
  const previousCandidates = keyed(previous.candidates);
  const currentCandidates = keyed(current.candidates);
  const previousRelations = keyed(previous.relations);
  const previousSourceBacked = keyedBy(
    previous.source_backed_relations,
    (relation) => relation.relation_identity,
  );
  const currentSourceBacked = keyedBy(
    current.source_backed_relations,
    (relation) => relation.relation_identity,
  );

  const newSources = missingFrom(previousSources, current.sources);
  const sourcesNotReturned = missingFrom(currentSources, previous.sources);
  const newCandidates = missingFrom(previousCandidates, current.candidates);
  const candidatesNotReturned = missingFrom(currentCandidates, previous.candidates);
  const changedCandidates = current.candidates.flatMap((candidate) => {
    const prior = previousCandidates.get(candidate.identity);
    if (!prior) return [];
    const changedDimensions: ChangedCandidateRecord["changed_dimensions"] = [];
    if (!sameArray(prior.supporting_source_identities, candidate.supporting_source_identities)) {
      changedDimensions.push("supporting sources");
    }
    if (!sameArray(prior.confidences, candidate.confidences)) {
      changedDimensions.push("confidence");
    }
    if (!sameJson(prior.assertion_times, candidate.assertion_times)) {
      changedDimensions.push("assertion time");
    }
    if (!sameJson(prior.event_times, candidate.event_times)) {
      changedDimensions.push("event time");
    }
    if (!sameJson(prior.publication_times, candidate.publication_times)) {
      changedDimensions.push("publication time");
    }
    return changedDimensions.length > 0
      ? [{
          identity: candidate.identity,
          previous: prior,
          current: candidate,
          changed_dimensions: changedDimensions,
        }]
      : [];
  });

  const newRelations = current.relations.filter(
    (relation) => !previousRelations.has(relation.identity),
  );
  const newContradictionSignals = relationSignals(newRelations, "contradicts");
  const newCorrectionSignals = relationSignals(newRelations, "correction");
  const newSupersessionSignals = relationSignals(newRelations, "supersedes");
  const relationEvidenceComparison = evidenceComparison(previous, current);
  const evidenceIsComparable = relationEvidenceComparison === "comparable";
  const newSourceBackedRelations = current.relation_evidence_observation === "available"
    ? current.source_backed_relations.filter(
        (relation) => !previousRelations.has(relation.relation_identity),
      )
    : [];
  const clarifiedSourceBackedRelations = evidenceIsComparable
    ? current.source_backed_relations.filter(
        (relation) => previousRelations.has(relation.relation_identity)
          && !previousSourceBacked.has(relation.relation_identity),
      )
    : [];
  const sourceBackedRelationsWithoutComparableBaseline =
    relationEvidenceComparison === "previous_unavailable"
      ? current.source_backed_relations.filter(
          (relation) => previousRelations.has(relation.relation_identity),
        )
      : [];
  const sourceBackedRelationsNotReobserved = evidenceIsComparable
    ? previous.source_backed_relations.filter(
        (relation) => !currentSourceBacked.has(relation.relation_identity),
      )
    : [];
  const sourceBackedDirectionChanges = evidenceIsComparable
    ? current.source_backed_relations.flatMap((relation) => {
        const prior = previousSourceBacked.get(relation.relation_identity);
        if (
          !prior
          || (
            prior.from_claim_identity === relation.from_claim_identity
            && prior.to_claim_identity === relation.to_claim_identity
          )
        ) {
          return [];
        }
        return [{
          relation_identity: relation.relation_identity,
          previous: prior,
          current: relation,
        }];
      })
    : [];

  const categories = [
    newSources,
    sourcesNotReturned,
    newCandidates,
    candidatesNotReturned,
    changedCandidates,
    newContradictionSignals,
    newCorrectionSignals,
    newSupersessionSignals,
    clarifiedSourceBackedRelations,
    newSourceBackedRelations,
    sourceBackedRelationsNotReobserved,
    sourceBackedDirectionChanges,
  ];

  return {
    new_sources: newSources,
    sources_not_returned: sourcesNotReturned,
    new_candidates: newCandidates,
    candidates_not_returned: candidatesNotReturned,
    changed_candidates: changedCandidates,
    new_contradiction_signals: newContradictionSignals,
    new_correction_signals: newCorrectionSignals,
    new_supersession_signals: newSupersessionSignals,
    relation_evidence_comparison: relationEvidenceComparison,
    clarified_source_backed_relations: clarifiedSourceBackedRelations,
    new_source_backed_relations: newSourceBackedRelations,
    source_backed_relations_without_comparable_baseline:
      sourceBackedRelationsWithoutComparableBaseline,
    source_backed_relations_not_reobserved: sourceBackedRelationsNotReobserved,
    source_backed_direction_changes: sourceBackedDirectionChanges,
    has_deterministic_differences: categories.some((category) => category.length > 0),
  };
}

function evidenceComparison(
  previous: { relation_evidence_observation: "available" | "unavailable" },
  current: { relation_evidence_observation: "available" | "unavailable" },
): InvestigationDelta["relation_evidence_comparison"] {
  if (
    previous.relation_evidence_observation === "available"
    && current.relation_evidence_observation === "available"
  ) {
    return "comparable";
  }
  if (
    previous.relation_evidence_observation === "unavailable"
    && current.relation_evidence_observation === "available"
  ) {
    return "previous_unavailable";
  }
  if (
    previous.relation_evidence_observation === "available"
    && current.relation_evidence_observation === "unavailable"
  ) {
    return "current_unavailable";
  }
  return "unavailable";
}

function keyed<T extends { identity: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.identity, item]));
}

function keyedBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

function missingFrom<T extends { identity: string }>(
  previous: Map<string, T>,
  current: T[],
): T[] {
  return current.filter((item) => !previous.has(item.identity));
}

function relationSignals(
  relations: LocalWatchRelation[],
  relationType: DeltaSignalRelationType,
): LocalWatchRelation[] {
  return relations.filter((relation) => relation.relation_type === relationType);
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
