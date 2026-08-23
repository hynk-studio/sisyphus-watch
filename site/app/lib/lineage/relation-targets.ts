import type { AnalysisSourceSummary } from "../analysis/contracts";
import type { RelationCueDiagnostic } from "../analysis/relation-cues";
import type { ClaimOccurrence } from "./contracts";
import { compareCodePoint, normalizeLineageText } from "./topic-tokens";

export const MAX_TARGET_KEYS_PER_OCCURRENCE = 8;

export interface RelationTargetIndexEntry {
  key: string;
  occurrence_ids: string[];
}

export interface RelationTargetIndex {
  entries: RelationTargetIndexEntry[];
  keys_by_occurrence: Array<{
    occurrence_id: string;
    keys: string[];
  }>;
}

export interface RelationTargetResolution {
  status: "unique" | "no_match" | "ambiguous" | "conflict";
  target_occurrence_id: string | null;
  matched_keys: string[];
  conflicting_keys: string[];
}

interface ExplicitTargetIdentifier {
  kind: "notice_identifier" | "guidance_identifier" | "version_identifier";
  identifier: string;
}

export function buildRelationTargetIndex(input: {
  occurrences: ClaimOccurrence[];
  sources: AnalysisSourceSummary[];
}): RelationTargetIndex {
  const sourceById = new Map(
    input.sources.map((source) => [source.source_id, source]),
  );
  const keysByOccurrence = input.occurrences
    .map((occurrence) => ({
      occurrence_id: occurrence.occurrence_id,
      keys: occurrenceTargetKeys(occurrence, sourceById.get(occurrence.source_id)),
    }))
    .sort((left, right) => compareCodePoint(left.occurrence_id, right.occurrence_id));
  const occurrenceIdsByKey = new Map<string, Set<string>>();
  for (const item of keysByOccurrence) {
    for (const key of item.keys) {
      const occurrenceIds = occurrenceIdsByKey.get(key) ?? new Set<string>();
      occurrenceIds.add(item.occurrence_id);
      occurrenceIdsByKey.set(key, occurrenceIds);
    }
  }
  return {
    entries: [...occurrenceIdsByKey]
      .map(([key, occurrenceIds]) => ({
        key,
        occurrence_ids: [...occurrenceIds].sort(compareCodePoint),
      }))
      .sort((left, right) => compareCodePoint(left.key, right.key)),
    keys_by_occurrence: keysByOccurrence,
  };
}

export function resolveRelationCueTarget(input: {
  cue: RelationCueDiagnostic;
  index: RelationTargetIndex;
  expectedOccurrenceId?: string;
}): RelationTargetResolution {
  const suppliedKeys = cueTargetKeys(input.cue);
  if (suppliedKeys.length === 0) return emptyResolution("no_match");

  const occurrenceIdsByKey = new Map(
    input.index.entries.map((entry) => [entry.key, entry.occurrence_ids]),
  );
  const matchedKeys: string[] = [];
  const missingKeys: string[] = [];
  const ambiguousKeys: string[] = [];
  const singletonTargets = new Set<string>();
  for (const key of suppliedKeys) {
    const occurrenceIds = occurrenceIdsByKey.get(key) ?? [];
    if (occurrenceIds.length === 0) {
      missingKeys.push(key);
      continue;
    }
    matchedKeys.push(key);
    if (occurrenceIds.length > 1) {
      ambiguousKeys.push(key);
      continue;
    }
    singletonTargets.add(occurrenceIds[0]);
  }

  if (matchedKeys.length === 0) {
    return {
      status: "no_match",
      target_occurrence_id: null,
      matched_keys: [],
      conflicting_keys: [],
    };
  }
  if (ambiguousKeys.length > 0) {
    return {
      status: "ambiguous",
      target_occurrence_id: null,
      matched_keys: matchedKeys,
      conflicting_keys: ambiguousKeys,
    };
  }
  if (missingKeys.length > 0 || singletonTargets.size !== 1) {
    return {
      status: "conflict",
      target_occurrence_id: null,
      matched_keys: matchedKeys,
      conflicting_keys: [...missingKeys, ...matchedKeys].sort(compareCodePoint),
    };
  }

  const [targetOccurrenceId] = singletonTargets;
  if (
    input.expectedOccurrenceId
    && targetOccurrenceId !== input.expectedOccurrenceId
  ) {
    return {
      status: "conflict",
      target_occurrence_id: null,
      matched_keys: matchedKeys,
      conflicting_keys: matchedKeys,
    };
  }
  return {
    status: "unique",
    target_occurrence_id: targetOccurrenceId,
    matched_keys: matchedKeys,
    conflicting_keys: [],
  };
}

export function targetSourceTitleAlignsWithCue(
  sourceTitle: string,
  cue: RelationCueDiagnostic,
): boolean {
  if (!sourceTitle.trim() || !cue.target_identifier?.trim()) return false;
  if (
    cue.target_kind === "notice_identifier"
    || cue.target_kind === "guidance_identifier"
    || cue.target_kind === "version_identifier"
  ) {
    const expected = normalizeExactIdentifierForKind(
      cue.target_kind,
      cue.target_identifier,
    );
    const matches = explicitTargetIdentifiers(sourceTitle).filter(
      (identifier) => identifier.kind === cue.target_kind,
    );
    return Boolean(
      expected
      && matches.length === 1
      && matches[0].identifier === expected,
    );
  }
  if (cue.target_kind === "document_title") {
    const normalizedTitle = normalizeExactTargetIdentityText(sourceTitle);
    const explicitTitles = [cue.target_identifier, cue.target_reference_text]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeExactTargetIdentityText);
    return Boolean(
      normalizedTitle
      && explicitTitles.length > 0
      && explicitTitles.every((value) => value === normalizedTitle),
    );
  }
  if (cue.target_kind === "dated_document_reference") {
    return datedSourceTitleAlignsWithCue(sourceTitle, cue);
  }
  return false;
}

export function normalizeExactTargetIdentityText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function occurrenceTargetKeys(
  occurrence: ClaimOccurrence,
  source: AnalysisSourceSummary | undefined,
): string[] {
  const keys = new Set<string>();
  if (source?.title) {
    keys.add(`document_title:${normalizeTargetValue(source.title)}`);
  }
  keys.add(
    `quoted_proposition:${normalizeTargetValue(occurrence.original_claim_text)}`,
  );
  const searchableText = [
    source?.title ?? "",
    occurrence.original_claim_text,
    occurrence.support_reference.bounded_excerpt,
  ].join(" ");
  addExplicitIdentifierKeys(keys, searchableText);

  if (source?.published_at) {
    const documentKind = explicitDocumentKind(searchableText);
    if (documentKind) {
      keys.add(
        `dated_document_reference:${source.published_at.slice(0, 10)}:${documentKind}`,
      );
    }
  }
  return [...keys].sort(compareCodePoint).slice(0, MAX_TARGET_KEYS_PER_OCCURRENCE);
}

function cueTargetKeys(cue: RelationCueDiagnostic): string[] {
  if (cue.target_kind === "none" || !cue.target_identifier) return [];
  const keys = new Set<string>();
  const normalizedIdentifier = normalizeIdentifierForKind(
    cue.target_kind,
    cue.target_identifier,
  );
  if (normalizedIdentifier) {
    keys.add(`${cue.target_kind}:${normalizedIdentifier}`);
  }
  addExplicitIdentifierKeys(
    keys,
    `${cue.target_reference_text ?? ""} ${cue.target_identifier}`,
  );
  const datedKey = datedDocumentReferenceKey(
    `${cue.target_reference_text ?? ""} ${cue.target_identifier}`,
  );
  if (datedKey) keys.add(datedKey);
  return [...keys].sort(compareCodePoint).slice(0, MAX_TARGET_KEYS_PER_OCCURRENCE);
}

function addExplicitIdentifierKeys(keys: Set<string>, value: string): void {
  for (const identifier of explicitTargetIdentifiers(value)) {
    keys.add(`${identifier.kind}:${normalizeTargetValue(identifier.identifier)}`);
  }
}

function explicitTargetIdentifiers(value: string): ExplicitTargetIdentifier[] {
  const identifiers: ExplicitTargetIdentifier[] = [];
  for (const match of value.matchAll(
    /\b(notice|guidance)\s+(?:no\.?\s+)?([\p{L}\p{N}][\p{L}\p{N}._/-]{0,39})\b/giu,
  )) {
    const kind = match[1].toLowerCase() === "notice"
      ? "notice_identifier"
      : "guidance_identifier";
    if (/\d/u.test(match[2])) {
      identifiers.push({
        kind,
        identifier: normalizeExactTargetIdentityText(match[2]),
      });
    }
  }
  for (const match of value.matchAll(
    /\bversion\s+([\p{L}\p{N}][\p{L}\p{N}._/-]{0,39})\b/giu,
  )) {
    if (/\d/u.test(match[1])) {
      identifiers.push({
        kind: "version_identifier",
        identifier: normalizeExactTargetIdentityText(match[1]),
      });
    }
  }
  return identifiers;
}

function normalizeExactIdentifierForKind(
  kind: ExplicitTargetIdentifier["kind"],
  value: string,
): string {
  const normalized = normalizeExactTargetIdentityText(value);
  if (kind === "notice_identifier") {
    return normalized.replace(/^notice\s+(?:no\.?\s+)?/u, "");
  }
  if (kind === "guidance_identifier") {
    return normalized.replace(/^guidance\s+(?:no\.?\s+)?/u, "");
  }
  return normalized.replace(/^version\s+/u, "");
}

function datedSourceTitleAlignsWithCue(
  sourceTitle: string,
  cue: RelationCueDiagnostic,
): boolean {
  const cueText = `${cue.target_reference_text ?? ""} ${cue.target_identifier ?? ""}`;
  const requiredDates = new Set(
    [...cueText.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map((match) => match[0]),
  );
  const requiredKinds = new Set(
    [...cueText.matchAll(/\b(?:notice|guidance|schedule|policy|statement)\b/giu)]
      .map((match) => normalizeExactTargetIdentityText(match[0])),
  );
  if (requiredDates.size !== 1 || requiredKinds.size !== 1) return false;

  const titleDates = [...sourceTitle.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)]
    .map((match) => match[0]);
  const titleKinds = new Set(
    [...sourceTitle.matchAll(/\b(?:notice|guidance|schedule|policy|statement)\b/giu)]
      .map((match) => normalizeExactTargetIdentityText(match[0])),
  );
  const [requiredDate] = requiredDates;
  const [requiredKind] = requiredKinds;
  return titleDates.length > 0
    && titleDates.every((date) => date === requiredDate)
    && titleKinds.size === 1
    && titleKinds.has(requiredKind);
}

function normalizeIdentifierForKind(
  kind: RelationCueDiagnostic["target_kind"],
  value: string,
): string {
  const normalized = normalizeTargetValue(value);
  if (kind === "notice_identifier") {
    return normalized.replace(/^notice\s+(?:no\s+)?/u, "");
  }
  if (kind === "guidance_identifier") {
    return normalized.replace(/^guidance\s+(?:no\s+)?/u, "");
  }
  if (kind === "version_identifier") {
    return normalized.replace(/^version\s+/u, "");
  }
  if (kind === "dated_document_reference") {
    const key = datedDocumentReferenceKey(value);
    return key?.replace(/^dated_document_reference:/u, "") ?? normalized;
  }
  return normalized;
}

function datedDocumentReferenceKey(value: string): string | null {
  const date = /\b(\d{4}-\d{2}-\d{2})\b/u.exec(value)?.[1];
  const documentKind = explicitDocumentKind(value);
  return date && documentKind
    ? `dated_document_reference:${date}:${documentKind}`
    : null;
}

function explicitDocumentKind(value: string): string | null {
  const match = /\b(notice|guidance|schedule|policy|statement)\b/iu.exec(value);
  return match ? normalizeTargetValue(match[1]) : null;
}

function normalizeTargetValue(value: string): string {
  return normalizeLineageText(value);
}

function emptyResolution(
  status: "no_match",
): RelationTargetResolution {
  return {
    status,
    target_occurrence_id: null,
    matched_keys: [],
    conflicting_keys: [],
  };
}
