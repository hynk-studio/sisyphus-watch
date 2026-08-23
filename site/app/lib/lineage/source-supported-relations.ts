import type { AnalysisRunPacket, AnalysisSourceSummary } from "../analysis/contracts";
import type {
  RelationCueDiagnostic,
  RelationCueDiagnosticRecord,
} from "../analysis/relation-cues";
import {
  compareReviewTimestamps,
  isExactTimestamp,
  type ReviewTimestampValue,
} from "../temporal";
import type {
  ClaimOccurrence,
  RelationCandidate,
  SiteReadyCasePacket,
} from "./contracts";
import { stableLineageId } from "./engine";
import {
  buildRelationTargetIndex,
  resolveRelationCueTarget,
} from "./relation-targets";
import {
  findCapturedTextAnchorOccurrences,
  MAX_CAPTURE_SUPPORT_EXCERPT_CHARS,
  requiredTargetAnchors,
  type AnchorOccurrence,
  type CaptureExecutionResult,
  type CapturePlan,
  type CapturedSourceDocument,
  type CapturedSourceSupport,
  type SupportAnchor,
} from "./source-capture";
import { compareCodePoint, normalizeLineageText } from "./topic-tokens";

export const MAX_SOURCE_SUPPORTED_RELATION_ASSESSMENTS_PER_WORKFLOW = 1;
export const MAX_CAPTURED_ASSERTION_CONTEXT_CHARS =
  MAX_CAPTURE_SUPPORT_EXCERPT_CHARS;

const ALLOWED_TARGET_KINDS = new Set<RelationCueDiagnostic["target_kind"]>([
  "notice_identifier",
  "guidance_identifier",
  "version_identifier",
  "dated_document_reference",
  "document_title",
]);
const ALLOWED_SCOPES = new Set<RelationCueDiagnostic["scope"]>([
  "whole_document",
  "whole_version",
]);
const ALLOWED_OPERATIVE_VERBS = new Set(["supersede", "supersedes"]);
const OWNER_TO_VERB_ALLOWED_TOKENS = new Set([
  "explicitly",
  "expressly",
  "hereby",
]);
const VERB_TO_TARGET_ALLOWED_TOKENS = new Set([
  "earlier",
  "former",
  "previous",
  "prior",
  "the",
]);
const ASSERTION_QUALIFIERS: SupportAnchor[] = [
  "not",
  "never",
  "may",
  "might",
  "could",
  "would",
  "should",
  "will",
  "if",
  "unless",
  "whether",
  "does not",
  "do not",
  "did not",
  "cannot",
  "can't",
  "doesn't",
  "don't",
  "didn't",
  "won't",
  "wouldn't",
  "shouldn't",
  "couldn't",
  "mightn't",
  "mustn't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "hasn't",
  "haven't",
  "hadn't",
  "fails to",
  "failed to",
  "no longer",
  "plans to",
  "plan to",
  "intends to",
  "intend to",
  "proposes to",
  "propose to",
  "expected to",
].map((value) => ({ value, boundary: value.includes(" ") ? "phrase" : "lexical" }));
const ASSERTION_HARD_BOUNDARIES = new Set(["\n", ".", "!", "?", ";"]);

export interface SourceSupportedRelationAssessment {
  assessment_id: string;
  relation_candidate_id: string;
  relation_type: "supersedes";
  from_occurrence_id: string;
  to_occurrence_id: string;
  from_source_id: string;
  to_source_id: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  cue_candidate_id: string;
  cue_source_id: string;
  cue_snapshot_id: string;
  owner_capture_id: string;
  target_capture_id: string;
  support_id: string;
  support_kind: "captured_live_source_text_span";
  proves: "captured_source_text_containment_only";
  captured_body_sha256: string;
  normalized_text_sha256: string;
  citation_url: string;
  assertion_context_start: number;
  assertion_context_end: number;
  owner_anchor: string;
  operative_verb: "supersede" | "supersedes";
  target_anchor: string;
  support_basis: "explicit_captured_supersedes_statement";
  target_resolution_basis: "unique_exact_deterministic_target_resolution";
  temporal_basis: "strict_later_source_publication_time";
  actor_basis: "exact_normalized_same_actor_match";
  assessment_status: "internal_source_supported_candidate";
  review_status: "pending_review";
  generated_by: "deterministic_rule";
  canonical_mutation: "none";
}

export interface SourceSupportedRelationWorkSummary {
  considered_relation_count: number;
  eligible_supersession_cue_count: number;
  captured_support_candidate_count: number;
  accepted_assessment_count: number;
  rejected_existing_pair_count: number;
  rejected_ambiguous_capture_plan_count: number;
  rejected_cue_guard_count: number;
  rejected_target_resolution_count: number;
  rejected_capture_completeness_count: number;
  rejected_capture_support_count: number;
  rejected_assertion_context_count: number;
  rejected_qualifier_count: number;
  rejected_direction_count: number;
  rejected_owner_identity_count: number;
  rejected_actor_count: number;
  rejected_temporal_count: number;
  rejected_competing_semantics_count: number;
  configured_maximum_assessment_count: 1;
  configured_bound_reached: boolean;
  model_classifier_calls: 0;
  additional_network_requests: 0;
  canonical_mutations: 0;
}

export interface SourceSupportedRelationAssessmentResult {
  assessments: SourceSupportedRelationAssessment[];
  summary: SourceSupportedRelationWorkSummary;
}

export interface SourceSupportedRelationAssessmentInput {
  analysisRun: AnalysisRunPacket;
  lineagePacket: SiteReadyCasePacket;
  relationCueDiagnostics: RelationCueDiagnosticRecord[];
  capturePlan: CapturePlan;
  captureResult: CaptureExecutionResult;
}

interface AssertionContext {
  start: number;
  end: number;
  text: string;
}

interface DirectionMatch {
  ownerAnchor: string;
  operativeVerb: "supersede" | "supersedes";
  targetAnchor: string;
}

type RejectionCounter = Exclude<
  keyof SourceSupportedRelationWorkSummary,
  | "considered_relation_count"
  | "eligible_supersession_cue_count"
  | "captured_support_candidate_count"
  | "accepted_assessment_count"
  | "configured_maximum_assessment_count"
  | "configured_bound_reached"
  | "model_classifier_calls"
  | "additional_network_requests"
  | "canonical_mutations"
>;

export function assessSourceSupportedRelations(
  input: SourceSupportedRelationAssessmentInput,
): SourceSupportedRelationAssessmentResult {
  const admittedRelations = input.lineagePacket.relation_candidates.filter(
    isAdmittedUnresolvedPair,
  );
  const summary = emptySourceSupportedRelationWorkSummary();
  summary.considered_relation_count = admittedRelations.length;
  summary.eligible_supersession_cue_count =
    input.relationCueDiagnostics.filter((record) => cuePassesEligibility(record.diagnostic))
      .length;
  summary.configured_bound_reached = input.capturePlan.configured_bound_reached;

  if (
    input.capturePlan.configured_bound_reached
    || input.capturePlan.relation_relevant_cue_count > 1
  ) {
    return reject(summary, "rejected_ambiguous_capture_plan_count");
  }
  if (input.capturePlan.relation_relevant_cue_count !== 1) {
    return reject(summary, "rejected_cue_guard_count");
  }

  const ownerEntries = input.capturePlan.entries.filter(
    (entry) => entry.role === "cue_owner",
  );
  if (ownerEntries.length !== 1) {
    return reject(summary, "rejected_capture_completeness_count");
  }
  const ownerEntry = ownerEntries[0];
  const occurrenceById = new Map(
    input.lineagePacket.claim_occurrences.map((occurrence) => [
      occurrence.occurrence_id,
      occurrence,
    ]),
  );
  const owner = occurrenceById.get(ownerEntry.cue_owner_occurrence_id);
  const target = occurrenceById.get(ownerEntry.paired_occurrence_id);
  if (!owner || !target || owner.occurrence_id === target.occurrence_id) {
    return reject(summary, "rejected_existing_pair_count");
  }

  const pairRelations = admittedRelations.filter((relation) =>
    relationHasExactEndpoints(relation, owner.occurrence_id, target.occurrence_id)
  );
  if (
    pairRelations.length !== 1
    || !relationEndpointProvenanceMatches(pairRelations[0], owner, target)
    || ownerEntry.source.source_id !== owner.source_id
    || ownerEntry.source.snapshot_id !== owner.snapshot_id
    || ownerEntry.cue_owner_occurrence_id !== owner.occurrence_id
    || ownerEntry.paired_occurrence_id !== target.occurrence_id
  ) {
    return reject(summary, "rejected_existing_pair_count");
  }
  const relation = pairRelations[0];

  const selectedRecord = matchingDiagnosticRecord(
    input.relationCueDiagnostics,
    ownerEntry.cue_record,
  );
  if (
    !selectedRecord
    || selectedRecord.candidate_id !== owner.claim_id
    || selectedRecord.source_id !== owner.source_id
    || selectedRecord.snapshot_id !== owner.snapshot_id
    || owner.claim_kind !== "actor_claim"
    || !cuePassesEligibility(selectedRecord.diagnostic)
  ) {
    return reject(summary, "rejected_cue_guard_count");
  }
  const cue = selectedRecord.diagnostic;
  const operativeVerb = normalizeOperativeVerb(cue.operative_verb);
  if (!operativeVerb) {
    return reject(summary, "rejected_cue_guard_count");
  }

  const ownerRelations = admittedRelations.filter((candidate) =>
    candidate.left_occurrence_id === owner.occurrence_id
    || candidate.right_occurrence_id === owner.occurrence_id
  );
  const ownerRelationCues = input.relationCueDiagnostics.filter((record) =>
    record.candidate_id === owner.claim_id
    && record.source_id === owner.source_id
    && record.snapshot_id === owner.snapshot_id
    && (
      record.diagnostic.cue_kind === "supersession_candidate"
      || record.diagnostic.cue_kind === "correction_candidate"
    )
    && record.diagnostic.target_kind !== "none"
    && Boolean(record.diagnostic.target_identifier)
  );
  if (ownerRelations.length !== 1 || ownerRelationCues.length !== 1) {
    return reject(summary, "rejected_competing_semantics_count");
  }

  const targetResolution = resolveRelationCueTarget({
    cue,
    index: buildRelationTargetIndex({
      occurrences: input.lineagePacket.claim_occurrences,
      sources: input.analysisRun.source_snapshot_summaries,
    }),
    expectedOccurrenceId: target.occurrence_id,
  });
  if (
    targetResolution.status !== "unique"
    || targetResolution.target_occurrence_id !== target.occurrence_id
  ) {
    return reject(summary, "rejected_target_resolution_count");
  }

  const targetEntries = input.capturePlan.entries.filter(
    (entry) => entry.role === "resolved_target",
  );
  if (
    targetEntries.length !== 1
    || !capturePlanEntryMatches(targetEntries[0], owner, target, selectedRecord)
  ) {
    return reject(summary, "rejected_capture_completeness_count");
  }

  const ownerDocument = exactCompleteDocument(
    input.captureResult.documents,
    owner.source_id,
    owner.snapshot_id,
  );
  const targetDocument = exactCompleteDocument(
    input.captureResult.documents,
    target.source_id,
    target.snapshot_id,
  );
  if (!ownerDocument || !targetDocument) {
    return reject(summary, "rejected_capture_completeness_count");
  }

  const supportCandidates = input.captureResult.supports.filter((support) =>
    support.source_id === owner.source_id
    && support.parent_snapshot_id === owner.snapshot_id
    && support.capture_id === ownerDocument.capture_id
    && support.support_kind === "captured_live_source_text_span"
    && support.proves === "captured_source_text_containment_only"
  );
  summary.captured_support_candidate_count = supportCandidates.length;
  if (supportCandidates.length !== 1) {
    return reject(summary, "rejected_capture_support_count");
  }
  const support = supportCandidates[0];
  const targetAnchors = requiredTargetAnchors(cue);
  if (
    targetAnchors.length === 0
    || !supportMatchesCapturedDocument(
      support,
      ownerDocument,
      operativeVerb,
      targetAnchors,
    )
  ) {
    return reject(summary, "rejected_capture_support_count");
  }

  const assertionContext = deriveBoundedAssertionContext(
    ownerDocument.normalized_text,
    support.normalized_text_start,
    support.normalized_text_end,
  );
  if (!assertionContext) {
    return reject(summary, "rejected_assertion_context_count");
  }
  if (hasAssertionQualifier(assertionContext.text)) {
    return reject(summary, "rejected_qualifier_count");
  }

  const ownerSource = input.analysisRun.source_snapshot_summaries.find(
    (source) => source.source_id === owner.source_id,
  );
  if (!ownerSource || ownerSource.snapshot_id !== owner.snapshot_id) {
    return reject(summary, "rejected_owner_identity_count");
  }
  const ownerAnchors = buildOwnerAnchors(owner, ownerSource);
  const ownerAnchorPresent = ownerAnchors.some(
    (anchor) => captureAnchorOccurrences(assertionContext.text, anchor).length > 0,
  );
  if (!ownerAnchorPresent) {
    return reject(summary, "rejected_owner_identity_count");
  }
  const direction = activeDirectionMatch(
    assertionContext.text,
    ownerAnchors,
    operativeVerb,
    targetAnchors,
    cue,
    support.normalized_text_start - assertionContext.start,
    support.normalized_text_end - assertionContext.start,
  );
  if (!direction) {
    return reject(summary, "rejected_direction_count");
  }

  if (!actorsMatchExactly(owner, target, cue)) {
    return reject(summary, "rejected_actor_count");
  }
  if (!hasStrictPublicationOrdering(owner, target)) {
    return reject(summary, "rejected_temporal_count");
  }

  const assessment = buildAssessment({
    relation,
    owner,
    target,
    cueRecord: selectedRecord,
    ownerDocument,
    targetDocument,
    support,
    assertionContext,
    direction,
  });
  summary.accepted_assessment_count = 1;
  return { assessments: [assessment], summary };
}

export function deriveBoundedAssertionContext(
  normalizedText: string,
  supportStart: number,
  supportEnd: number,
): AssertionContext | null {
  if (
    !Number.isInteger(supportStart)
    || !Number.isInteger(supportEnd)
    || supportStart < 0
    || supportEnd <= supportStart
    || supportEnd > normalizedText.length
  ) return null;

  for (let index = supportStart; index < supportEnd; index += 1) {
    if (ASSERTION_HARD_BOUNDARIES.has(normalizedText[index])) return null;
  }

  let start = 0;
  for (let index = supportStart - 1; index >= 0; index -= 1) {
    if (ASSERTION_HARD_BOUNDARIES.has(normalizedText[index])) {
      start = index + 1;
      break;
    }
  }
  let end = normalizedText.length;
  for (let index = supportEnd; index < normalizedText.length; index += 1) {
    if (ASSERTION_HARD_BOUNDARIES.has(normalizedText[index])) {
      end = index + 1;
      break;
    }
  }

  while (start < supportStart && /\s/u.test(normalizedText[start])) start += 1;
  while (end > supportEnd && /\s/u.test(normalizedText[end - 1])) end -= 1;
  if (
    supportStart < start
    || supportEnd > end
    || end - start > MAX_CAPTURED_ASSERTION_CONTEXT_CHARS
  ) return null;
  const text = normalizedText.slice(start, end);
  return text ? { start, end, text } : null;
}

function emptySourceSupportedRelationWorkSummary(): SourceSupportedRelationWorkSummary {
  return {
    considered_relation_count: 0,
    eligible_supersession_cue_count: 0,
    captured_support_candidate_count: 0,
    accepted_assessment_count: 0,
    rejected_existing_pair_count: 0,
    rejected_ambiguous_capture_plan_count: 0,
    rejected_cue_guard_count: 0,
    rejected_target_resolution_count: 0,
    rejected_capture_completeness_count: 0,
    rejected_capture_support_count: 0,
    rejected_assertion_context_count: 0,
    rejected_qualifier_count: 0,
    rejected_direction_count: 0,
    rejected_owner_identity_count: 0,
    rejected_actor_count: 0,
    rejected_temporal_count: 0,
    rejected_competing_semantics_count: 0,
    configured_maximum_assessment_count: 1,
    configured_bound_reached: false,
    model_classifier_calls: 0,
    additional_network_requests: 0,
    canonical_mutations: 0,
  };
}

function reject(
  summary: SourceSupportedRelationWorkSummary,
  counter: RejectionCounter,
): SourceSupportedRelationAssessmentResult {
  summary[counter] += 1;
  return { assessments: [], summary };
}

function isAdmittedUnresolvedPair(relation: RelationCandidate): boolean {
  return relation.generated_by === "deterministic_rule"
    && relation.relation_type === "unresolved"
    && relation.insufficient_evidence
    && relation.review_status === "pending_review"
    && relation.status === "candidate";
}

function relationHasExactEndpoints(
  relation: RelationCandidate,
  ownerOccurrenceId: string,
  targetOccurrenceId: string,
): boolean {
  return (
    relation.left_occurrence_id === ownerOccurrenceId
    && relation.right_occurrence_id === targetOccurrenceId
  ) || (
    relation.left_occurrence_id === targetOccurrenceId
    && relation.right_occurrence_id === ownerOccurrenceId
  );
}

function relationEndpointProvenanceMatches(
  relation: RelationCandidate,
  owner: ClaimOccurrence,
  target: ClaimOccurrence,
): boolean {
  const occurrenceById = new Map([
    [owner.occurrence_id, owner],
    [target.occurrence_id, target],
  ]);
  const left = occurrenceById.get(relation.left_occurrence_id);
  const right = occurrenceById.get(relation.right_occurrence_id);
  return Boolean(
    left
    && right
    && relation.left_source_id === left.source_id
    && relation.right_source_id === right.source_id
    && relation.left_snapshot_id === left.snapshot_id
    && relation.right_snapshot_id === right.snapshot_id,
  );
}

function matchingDiagnosticRecord(
  records: RelationCueDiagnosticRecord[],
  selected: RelationCueDiagnosticRecord,
): RelationCueDiagnosticRecord | null {
  const key = diagnosticRecordKey(selected);
  const matches = records.filter((record) => diagnosticRecordKey(record) === key);
  return matches.length === 1 ? matches[0] : null;
}

function diagnosticRecordKey(record: RelationCueDiagnosticRecord): string {
  return JSON.stringify([
    record.candidate_id,
    record.source_id,
    record.snapshot_id,
    record.diagnostic,
  ]);
}

function cuePassesEligibility(cue: RelationCueDiagnostic): boolean {
  return cue.cue_kind === "supersession_candidate"
    && cue.replacement_effect === "supersedes"
    && ALLOWED_SCOPES.has(cue.scope)
    && !cue.negated
    && !cue.modal_or_intent
    && !cue.question_or_uncertain
    && !cue.quoted_or_attributed
    && !cue.conditional_or_hypothetical
    && normalizeOperativeVerb(cue.operative_verb) !== null
    && ALLOWED_TARGET_KINDS.has(cue.target_kind)
    && Boolean(cue.target_identifier?.trim());
}

function normalizeOperativeVerb(
  value: string,
): "supersede" | "supersedes" | null {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  return ALLOWED_OPERATIVE_VERBS.has(normalized)
    ? normalized as "supersede" | "supersedes"
    : null;
}

function capturePlanEntryMatches(
  entry: CapturePlan["entries"][number],
  owner: ClaimOccurrence,
  target: ClaimOccurrence,
  cueRecord: RelationCueDiagnosticRecord,
): boolean {
  return entry.source.source_id === target.source_id
    && entry.source.snapshot_id === target.snapshot_id
    && entry.cue_owner_occurrence_id === owner.occurrence_id
    && entry.paired_occurrence_id === target.occurrence_id
    && diagnosticRecordKey(entry.cue_record) === diagnosticRecordKey(cueRecord);
}

function exactCompleteDocument(
  documents: CapturedSourceDocument[],
  sourceId: string,
  snapshotId: string,
): CapturedSourceDocument | null {
  const matches = documents.filter((document) =>
    document.source_id === sourceId
    && document.parent_snapshot_id === snapshotId
  );
  return matches.length === 1
    && matches[0].status === "captured"
    && matches[0].capture_completeness === "complete"
    ? matches[0]
    : null;
}

function supportMatchesCapturedDocument(
  support: CapturedSourceSupport,
  document: CapturedSourceDocument,
  operativeVerb: "supersede" | "supersedes",
  targetAnchors: SupportAnchor[],
): boolean {
  if (
    support.captured_body_sha256 !== document.captured_body_sha256
    || support.normalized_text_sha256 !== document.normalized_text_sha256
    || support.citation_url !== document.final_url
    || !Number.isInteger(support.normalized_text_start)
    || !Number.isInteger(support.normalized_text_end)
    || support.normalized_text_start < 0
    || support.normalized_text_end <= support.normalized_text_start
    || support.normalized_text_end > document.normalized_text.length
    || support.bounded_excerpt !== document.normalized_text.slice(
      support.normalized_text_start,
      support.normalized_text_end,
    )
  ) return false;

  const expectedMatchBasis = [
    operativeVerb,
    ...targetAnchors.map((anchor) => anchor.value),
  ];
  if (JSON.stringify(support.match_basis) !== JSON.stringify(expectedMatchBasis)) {
    return false;
  }
  const excerpt = support.bounded_excerpt;
  return captureAnchorOccurrences(excerpt, {
    value: operativeVerb,
    boundary: "lexical",
  }).length > 0
    && targetAnchors.every(
      (anchor) => captureAnchorOccurrences(excerpt, anchor).length > 0,
    );
}

function hasAssertionQualifier(assertionContext: string): boolean {
  const qualifierText = assertionContext.normalize("NFKC").replaceAll("’", "'");
  return ASSERTION_QUALIFIERS.some(
    (anchor) => captureAnchorOccurrences(qualifierText, anchor).length > 0,
  );
}

function buildOwnerAnchors(
  owner: ClaimOccurrence,
  source: AnalysisSourceSummary,
): SupportAnchor[] {
  const anchors = new Map<string, SupportAnchor>();
  const add = (value: string, boundary: SupportAnchor["boundary"] = "phrase") => {
    const normalized = normalizeMatchText(value);
    if (!normalized) return;
    anchors.set(`${boundary}:${normalized}`, { value: normalized, boundary });
  };
  const normalizedTitle = normalizeMatchText(source.title);
  if (normalizedTitle.length >= 12) add(normalizedTitle);

  const documentKinds = new Set<string>();
  for (const match of source.title.matchAll(
    /\b(notice|guidance)\s+(?:no\.?\s*)?([\p{L}\p{N}][\p{L}\p{N}._/-]{0,39})\b/giu,
  )) {
    if (!/\d/u.test(match[2])) continue;
    documentKinds.add(match[1].toLowerCase());
    add(match[0]);
  }
  for (const match of source.title.matchAll(
    /\bversion\s+([\p{L}\p{N}][\p{L}\p{N}._/-]{0,39})\b/giu,
  )) {
    if (!/\d/u.test(match[1])) continue;
    documentKinds.add("version");
    add(match[0]);
  }
  for (const match of source.title.matchAll(
    /\b(policy|statement|document)\b/giu,
  )) documentKinds.add(match[1].toLowerCase());

  for (const kind of [...documentKinds].sort(compareCodePoint)) {
    add(`this ${kind}`);
  }
  if (source.title.trim() && owner.source_id === source.source_id) {
    add("this document");
  }
  return [...anchors.values()].sort((left, right) =>
    compareCodePoint(left.value, right.value)
    || compareCodePoint(left.boundary, right.boundary)
  );
}

function activeDirectionMatch(
  assertionContext: string,
  ownerAnchors: SupportAnchor[],
  operativeVerb: "supersede" | "supersedes",
  targetAnchors: SupportAnchor[],
  cue: RelationCueDiagnostic,
  supportStart: number,
  supportEnd: number,
): DirectionMatch | null {
  const ownerOccurrences = ownerAnchors.flatMap((anchor) =>
    captureAnchorOccurrences(assertionContext, anchor).map((occurrence) => ({
      ...occurrence,
      anchor,
    }))
  );
  const allowedVerbOccurrences = [...ALLOWED_OPERATIVE_VERBS].flatMap((value) =>
    captureAnchorOccurrences(assertionContext, {
      value,
      boundary: "lexical",
    })
  );
  if (allowedVerbOccurrences.length !== 1) return null;
  const verbOccurrences = captureAnchorOccurrences(assertionContext, {
    value: operativeVerb,
    boundary: "lexical",
  });
  if (verbOccurrences.length !== 1) return null;
  const targetExtents = orderedTargetExtents(assertionContext, targetAnchors);
  const matches: Array<{
    owner: AnchorOccurrence & { anchor: SupportAnchor };
    verb: AnchorOccurrence;
    target: AnchorOccurrence;
  }> = [];
  for (const verb of verbOccurrences) {
    if (verb.start < supportStart || verb.end > supportEnd) continue;
    for (const owner of ownerOccurrences) {
      if (owner.end > verb.start) continue;
      if (!gapContainsOnlyAllowedTokens(
        assertionContext,
        owner.end,
        verb.start,
        OWNER_TO_VERB_ALLOWED_TOKENS,
        2,
      )) continue;
      for (const target of targetExtents) {
        if (
          target.start < verb.end
          || target.start < supportStart
          || target.end > supportEnd
        ) continue;
        if (!gapContainsOnlyAllowedTokens(
          assertionContext,
          verb.end,
          target.start,
          VERB_TO_TARGET_ALLOWED_TOKENS,
          2,
        )) continue;
        matches.push({ owner, verb, target });
      }
    }
  }
  matches.sort((left, right) =>
    left.verb.start - right.verb.start
    || right.owner.end - left.owner.end
    || left.target.start - right.target.start
    || compareCodePoint(left.owner.anchor.value, right.owner.anchor.value)
  );
  const selected = matches[0];
  if (!selected) return null;
  return {
    ownerAnchor: selected.owner.anchor.value,
    operativeVerb,
    targetAnchor: normalizeMatchText(
      cue.target_reference_text ?? cue.target_identifier ?? "",
    ),
  };
}

function gapContainsOnlyAllowedTokens(
  text: string,
  start: number,
  end: number,
  allowedTokens: Set<string>,
  maximumTokenCount: number,
): boolean {
  const gap = text.slice(start, end).normalize("NFKC").toLowerCase();
  const tokens = gap.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? [];
  const nonLexical = gap.replace(/[\p{L}\p{M}\p{N}_]+/gu, "");
  return /^[\s,.:;!?()[\]{}'"‘’“”–—-]*$/u.test(nonLexical)
    && tokens.length <= maximumTokenCount
    && new Set(tokens).size === tokens.length
    && tokens.every((token) => allowedTokens.has(token));
}

function orderedTargetExtents(
  text: string,
  anchors: SupportAnchor[],
): AnchorOccurrence[] {
  if (anchors.length === 0) return [];
  let extents = captureAnchorOccurrences(text, anchors[0]);
  for (let index = 1; index < anchors.length; index += 1) {
    const occurrences = captureAnchorOccurrences(text, anchors[index]);
    const next: AnchorOccurrence[] = [];
    for (const extent of extents) {
      for (const occurrence of occurrences) {
        if (occurrence.start >= extent.end) {
          next.push({ start: extent.start, end: occurrence.end });
        }
      }
    }
    extents = next;
  }
  return extents.sort((left, right) =>
    left.end - left.start - (right.end - right.start)
    || left.start - right.start
    || left.end - right.end
  );
}

function actorsMatchExactly(
  owner: ClaimOccurrence,
  target: ClaimOccurrence,
  cue: RelationCueDiagnostic,
): boolean {
  if (!owner.actor || !target.actor || !cue.operative_actor) return false;
  const normalizedOwner = normalizeLineageText(owner.actor);
  return Boolean(
    normalizedOwner
    && normalizedOwner === normalizeLineageText(target.actor)
    && normalizedOwner === normalizeLineageText(cue.operative_actor),
  );
}

function hasStrictPublicationOrdering(
  owner: ClaimOccurrence,
  target: ClaimOccurrence,
): boolean {
  const ownerTime = publicationTime(owner);
  const targetTime = publicationTime(target);
  return Boolean(
    ownerTime
    && targetTime
    && compareReviewTimestamps(ownerTime, targetTime) > 0,
  );
}

function publicationTime(
  occurrence: ClaimOccurrence,
): ReviewTimestampValue | null {
  const value = occurrence.source_publication_time;
  const precision = occurrence.source_publication_time_precision;
  return value
    && (precision === "day" || precision === "instant")
    && isExactTimestamp(value)
    ? { value, precision }
    : null;
}

function buildAssessment(input: {
  relation: RelationCandidate;
  owner: ClaimOccurrence;
  target: ClaimOccurrence;
  cueRecord: RelationCueDiagnosticRecord;
  ownerDocument: CapturedSourceDocument;
  targetDocument: CapturedSourceDocument;
  support: CapturedSourceSupport;
  assertionContext: AssertionContext;
  direction: DirectionMatch;
}): SourceSupportedRelationAssessment {
  const {
    relation,
    owner,
    target,
    cueRecord,
    ownerDocument,
    targetDocument,
    support,
    assertionContext,
    direction,
  } = input;
  return {
    assessment_id: stableLineageId(
      "source_supported_relation_assessment_",
      relation.relation_id,
      owner.occurrence_id,
      target.occurrence_id,
      cueRecord.candidate_id,
      cueRecord.source_id,
      cueRecord.snapshot_id,
      ownerDocument.capture_id,
      targetDocument.capture_id,
      support.support_id,
      support.captured_body_sha256,
      support.normalized_text_sha256,
      String(assertionContext.start),
      String(assertionContext.end),
      direction.ownerAnchor,
      direction.operativeVerb,
      direction.targetAnchor,
    ),
    relation_candidate_id: relation.relation_id,
    relation_type: "supersedes",
    from_occurrence_id: owner.occurrence_id,
    to_occurrence_id: target.occurrence_id,
    from_source_id: owner.source_id,
    to_source_id: target.source_id,
    from_snapshot_id: owner.snapshot_id,
    to_snapshot_id: target.snapshot_id,
    cue_candidate_id: cueRecord.candidate_id,
    cue_source_id: cueRecord.source_id,
    cue_snapshot_id: cueRecord.snapshot_id,
    owner_capture_id: ownerDocument.capture_id,
    target_capture_id: targetDocument.capture_id,
    support_id: support.support_id,
    support_kind: "captured_live_source_text_span",
    proves: "captured_source_text_containment_only",
    captured_body_sha256: support.captured_body_sha256,
    normalized_text_sha256: support.normalized_text_sha256,
    citation_url: support.citation_url,
    assertion_context_start: assertionContext.start,
    assertion_context_end: assertionContext.end,
    owner_anchor: direction.ownerAnchor,
    operative_verb: direction.operativeVerb,
    target_anchor: direction.targetAnchor,
    support_basis: "explicit_captured_supersedes_statement",
    target_resolution_basis: "unique_exact_deterministic_target_resolution",
    temporal_basis: "strict_later_source_publication_time",
    actor_basis: "exact_normalized_same_actor_match",
    assessment_status: "internal_source_supported_candidate",
    review_status: "pending_review",
    generated_by: "deterministic_rule",
    canonical_mutation: "none",
  };
}

function normalizeMatchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function captureAnchorOccurrences(
  text: string,
  anchor: SupportAnchor,
): AnchorOccurrence[] {
  return findCapturedTextAnchorOccurrences(text, anchor);
}
