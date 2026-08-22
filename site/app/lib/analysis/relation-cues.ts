import type { AnalysisRunPacket } from "./contracts";
import type {
  CandidateProposal,
  RelationCueProposal,
} from "./schemas";
import {
  hasClearlyIncompleteTail,
  normalizeReviewerWhitespace,
} from "../reviewer-text";
import {
  normalizeTimestampWithPrecision,
  type TemporalPrecision,
} from "../temporal";

export const MAX_RELATION_CUES_PER_CANDIDATE = 2;

export interface RelationCueDiagnostic {
  provenance: "model_extracted_from_model_summary";
  cue_kind: RelationCueProposal["cue_kind"];
  operative_actor: string | null;
  operative_verb: string;
  target_reference_text: string | null;
  target_kind: RelationCueProposal["target_kind"];
  target_identifier: string | null;
  negated: boolean;
  modal_or_intent: boolean;
  question_or_uncertain: boolean;
  quoted_or_attributed: boolean;
  conditional_or_hypothetical: boolean;
  scope: RelationCueProposal["scope"];
  affected_field: string | null;
  prior_value: string | null;
  corrected_value: string | null;
  replacement_effect: RelationCueProposal["replacement_effect"];
  effective_time: string | null;
  effective_time_precision: TemporalPrecision;
  cue_supporting_summary_span: string;
}

export interface RelationCueDiagnosticRecord {
  candidate_id: string;
  source_id: string;
  snapshot_id: string;
  diagnostic: RelationCueDiagnostic;
}

export interface InternalAnalysisRunEnvelope {
  analysis_run: AnalysisRunPacket;
  relation_cue_diagnostics: RelationCueDiagnosticRecord[];
}

export function buildRelationCueDiagnosticRecords(input: {
  proposal: CandidateProposal;
  candidateId: string;
  sourceId: string;
  snapshotId: string;
  sourceSummary: string;
}): RelationCueDiagnosticRecord[] {
  if (input.proposal.candidate_type !== "actor_claim") return [];

  return input.proposal.relation_cues
    .map((cue) => sanitizeRelationCue(cue, input.sourceSummary))
    .filter((cue): cue is RelationCueDiagnostic => cue !== null)
    .sort((left, right) => compareCodePoint(cueSortKey(left), cueSortKey(right)))
    .slice(0, MAX_RELATION_CUES_PER_CANDIDATE)
    .map((diagnostic) => ({
      candidate_id: input.candidateId,
      source_id: input.sourceId,
      snapshot_id: input.snapshotId,
      diagnostic,
    }));
}

export function sortRelationCueDiagnosticRecords(
  records: RelationCueDiagnosticRecord[],
): RelationCueDiagnosticRecord[] {
  return [...records].sort((left, right) =>
    compareCodePoint(left.candidate_id, right.candidate_id)
    || compareCodePoint(cueSortKey(left.diagnostic), cueSortKey(right.diagnostic))
    || compareCodePoint(left.source_id, right.source_id)
    || compareCodePoint(left.snapshot_id, right.snapshot_id)
  );
}

function sanitizeRelationCue(
  cue: RelationCueProposal,
  sourceSummary: string,
): RelationCueDiagnostic | null {
  const supportingSpan = containedText(
    sourceSummary,
    cue.cue_supporting_summary_span,
  );
  if (!supportingSpan || !isSupportedOperativeCue(cue)) return null;

  const operativeActor = containedText(sourceSummary, cue.operative_actor);
  const operativeVerb = containedText(supportingSpan, cue.operative_verb)
    ?? containedText(sourceSummary, cue.operative_verb);
  if (!operativeVerb) return null;

  const targetReference = containedText(
    sourceSummary,
    cue.target_reference_text,
  );
  const targetIdentifier = containedText(
    targetReference ?? sourceSummary,
    cue.target_identifier,
  );
  const hasSpecificTarget = cue.target_kind !== "none"
    && targetReference !== null
    && targetIdentifier !== null;

  let affectedField = containedText(sourceSummary, cue.affected_field);
  let priorValue = containedText(sourceSummary, cue.prior_value);
  let correctedValue = containedText(sourceSummary, cue.corrected_value);
  let scope = cue.scope;
  let replacementEffect = cue.replacement_effect;

  if (cue.cue_kind === "correction_candidate") {
    replacementEffect = "none";
    if (
      scope === "field"
      && (!affectedField || !priorValue || !correctedValue)
    ) {
      scope = "partial_or_ambiguous";
    }
    if (
      scope !== "field"
      && scope !== "whole_proposition"
      && scope !== "partial_or_ambiguous"
      && scope !== "none"
    ) {
      scope = "partial_or_ambiguous";
    }
  } else {
    affectedField = null;
    priorValue = null;
    correctedValue = null;
    if (
      scope !== "whole_document"
      && scope !== "whole_version"
      && scope !== "withdrawal_or_rescission"
      && scope !== "partial_or_ambiguous"
      && scope !== "none"
    ) {
      scope = "partial_or_ambiguous";
    }
  }

  const effectiveTime = normalizeTimestampWithPrecision(cue.effective_time);
  return {
    provenance: "model_extracted_from_model_summary",
    cue_kind: cue.cue_kind,
    operative_actor: operativeActor,
    operative_verb: operativeVerb,
    target_reference_text: hasSpecificTarget ? targetReference : null,
    target_kind: hasSpecificTarget ? cue.target_kind : "none",
    target_identifier: hasSpecificTarget ? targetIdentifier : null,
    negated: cue.negated,
    modal_or_intent: cue.modal_or_intent,
    question_or_uncertain: cue.question_or_uncertain,
    quoted_or_attributed: cue.quoted_or_attributed,
    conditional_or_hypothetical: cue.conditional_or_hypothetical,
    scope,
    affected_field: affectedField,
    prior_value: priorValue,
    corrected_value: correctedValue,
    replacement_effect: replacementEffect,
    effective_time: effectiveTime.value,
    effective_time_precision: effectiveTime.precision,
    cue_supporting_summary_span: supportingSpan,
  };
}

function isSupportedOperativeCue(cue: RelationCueProposal): boolean {
  const verb = normalizeCueText(cue.operative_verb ?? "");
  if (!verb) return false;
  return cue.cue_kind === "correction_candidate"
    ? /\b(correct|corrects|corrected|correction|incorrect|incorrectly|error|wrong|mistaken)\b/u
      .test(verb)
    : /\b(supersede|supersedes|superseded|replace|replaces|replaced|rescind|rescinds|rescinded|withdraw|withdraws|withdrawn)\b/u
        .test(verb)
      || verb.includes("no longer in effect");
}

function containedText(
  containingText: string,
  candidate: string | null,
): string | null {
  if (!candidate) return null;
  const retained = normalizeReviewerWhitespace(candidate);
  if (
    !retained
    || retained.includes("\uFFFD")
    || hasClearlyIncompleteTail(retained)
  ) {
    return null;
  }
  return normalizeCueText(containingText).includes(normalizeCueText(retained))
    ? retained
    : null;
}

function normalizeCueText(value: string): string {
  return normalizeReviewerWhitespace(value.normalize("NFKC")).toLowerCase();
}

function cueSortKey(cue: RelationCueDiagnostic): string {
  return JSON.stringify([
    cue.cue_kind,
    cue.target_kind,
    cue.target_identifier,
    cue.operative_verb,
    cue.cue_supporting_summary_span,
  ]);
}

function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
