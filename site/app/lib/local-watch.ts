import { z } from "zod";

import {
  MAX_QUESTION_LENGTH,
  MIN_QUESTION_LENGTH,
  type CandidateConfidence,
} from "./analysis/contracts";
import {
  validateSiteReadyCasePacket,
  type RelationType,
  type SiteReadyCasePacket,
} from "./lineage/contracts";
import { boundedReviewerText, normalizeReviewerWhitespace } from "./reviewer-text";
import {
  DISCOVERY_PROFILES,
  type DiscoveryProfile,
} from "./source-profile";
import { isExactTimestamp, type TemporalPrecision } from "./temporal";

export const LOCAL_WATCH_STORAGE_KEY = "sisyphus.local-watch.v1";
export const LOCAL_WATCH_LEGACY_CONTRACT_VERSION = "sisyphus_local_watch.v1";
export const LOCAL_WATCH_CONTRACT_VERSION = "sisyphus_local_watch.v2";
export const LOCAL_WATCH_MAX_BYTES = 128 * 1024;

const MAX_SNAPSHOT_SOURCES = 8;
const MAX_SNAPSHOT_CANDIDATES = 64;
const MAX_SNAPSHOT_RELATIONS = 64;
const MAX_SOURCE_URL_LENGTH = 2_048;
const MAX_IDENTITY_LENGTH = 4_096;

export interface LocalWatchTimestamp {
  value: string;
  precision: Exclude<TemporalPrecision, null>;
}

export interface LocalWatchSource {
  identity: string;
  title: string;
  url: string | null;
  domain: string;
  publisher: string;
  published_at: string | null;
  published_at_precision: TemporalPrecision;
}

export interface LocalWatchCandidate {
  identity: string;
  actor: string | null;
  text: string;
  normalized_claim_representation: string;
  supporting_source_identities: string[];
  confidences: CandidateConfidence[];
  assertion_times: LocalWatchTimestamp[];
  event_times: LocalWatchTimestamp[];
  publication_times: LocalWatchTimestamp[];
}

export interface LocalWatchRelation {
  identity: string;
  relation_type: RelationType;
  left_claim_identity: string;
  right_claim_identity: string;
}

export interface LocalWatchSourceBackedRelation {
  relation_identity: string;
  supported_relation_type: "supersedes";
  from_claim_identity: string;
  to_claim_identity: string;
}

export interface LocalWatchSnapshot {
  sources: LocalWatchSource[];
  candidates: LocalWatchCandidate[];
  relations: LocalWatchRelation[];
  relation_evidence_observation: "available" | "unavailable";
  source_backed_relations: LocalWatchSourceBackedRelation[];
}

export interface LocalWatch {
  contract_version: typeof LOCAL_WATCH_CONTRACT_VERSION;
  normalized_public_interest_question: string;
  saved_source_limit: 3 | 5;
  saved_discovery_profile: DiscoveryProfile;
  saved_at: string;
  last_checked_at: string;
  snapshot: LocalWatchSnapshot;
}

export interface LocalWatchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LocalWatchReadResult =
  | { status: "empty" }
  | { status: "valid"; watch: LocalWatch }
  | { status: "invalid"; reason: "malformed" | "unsupported" | "oversized" }
  | { status: "unavailable" };

export type LocalWatchMutationResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "oversized" | "unavailable" };

export class LocalWatchContractError extends Error {
  constructor(
    readonly reason: "invalid" | "oversized",
    message: string,
  ) {
    super(message);
    this.name = "LocalWatchContractError";
  }
}

const exactTimestampSchema = z.string().refine(isExactTimestamp, {
  message: "timestamp must be an exact day or zoned instant",
});

const localWatchTimestampSchema = z.object({
  value: exactTimestampSchema,
  precision: z.enum(["day", "instant"]),
}).strict();

const localWatchSourceSchema = z.object({
  identity: z.string().min(1).max(MAX_IDENTITY_LENGTH),
  title: normalizedTextSchema(1, 240),
  url: z.string().min(1).max(MAX_SOURCE_URL_LENGTH).nullable(),
  domain: normalizedTextSchema(1, 240),
  publisher: normalizedTextSchema(1, 240),
  published_at: exactTimestampSchema.nullable(),
  published_at_precision: z.enum(["day", "instant"]).nullable(),
}).strict().superRefine((source, context) => {
  if ((source.published_at === null) !== (source.published_at_precision === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["published_at_precision"],
      message: "publication precision must match publication time availability",
    });
  }
  if (source.url !== null && normalizeHttpUrl(source.url) !== source.url) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["url"],
      message: "source URL must be a normalized credential-free HTTP(S) URL",
    });
  }
  if (source.identity !== sourceIdentity(source)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identity"],
      message: "source identity does not match its validated source material",
    });
  }
});

const localWatchCandidateSchema = z.object({
  identity: z.string().min(1).max(MAX_IDENTITY_LENGTH),
  actor: normalizedTextSchema(1, 200).nullable(),
  text: normalizedTextSchema(1, 240),
  normalized_claim_representation: normalizedTextSchema(1, 1_200),
  supporting_source_identities: z.array(
    z.string().min(1).max(MAX_IDENTITY_LENGTH),
  ).min(1).max(MAX_SNAPSHOT_SOURCES),
  confidences: z.array(
    z.enum(["high", "medium", "low", "unknown"]),
  ).min(1).max(4),
  assertion_times: z.array(localWatchTimestampSchema).max(MAX_SNAPSHOT_SOURCES),
  event_times: z.array(localWatchTimestampSchema).max(MAX_SNAPSHOT_SOURCES),
  publication_times: z.array(localWatchTimestampSchema).max(MAX_SNAPSHOT_SOURCES),
}).strict().superRefine((candidate, context) => {
  if (
    candidate.identity
    !== claimCandidateIdentity(candidate.actor, candidate.normalized_claim_representation)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identity"],
      message: "claim identity does not match actor and normalized representation",
    });
  }
  requireSortedUnique(candidate.supporting_source_identities, context, [
    "supporting_source_identities",
  ]);
  requireSortedUnique(candidate.confidences, context, ["confidences"]);
  requireSortedUnique(candidate.assertion_times, context, ["assertion_times"], timestampKey);
  requireSortedUnique(candidate.event_times, context, ["event_times"], timestampKey);
  requireSortedUnique(candidate.publication_times, context, ["publication_times"], timestampKey);
});

const localWatchRelationSchema = z.object({
  identity: z.string().min(1).max(MAX_IDENTITY_LENGTH * 2),
  relation_type: z.enum([
    "same_event",
    "follow_up",
    "correction",
    "corroborates",
    "contradicts",
    "narrows",
    "supersedes",
    "unresolved",
    "unrelated",
  ]),
  left_claim_identity: z.string().min(1).max(MAX_IDENTITY_LENGTH),
  right_claim_identity: z.string().min(1).max(MAX_IDENTITY_LENGTH),
}).strict().superRefine((relation, context) => {
  const endpoints = normalizedRelationEndpoints(
    relation.relation_type,
    relation.left_claim_identity,
    relation.right_claim_identity,
  );
  if (
    endpoints.left !== relation.left_claim_identity
    || endpoints.right !== relation.right_claim_identity
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["left_claim_identity"],
      message: "symmetric relation endpoints must use deterministic ordering",
    });
  }
  if (
    relation.identity
    !== relationIdentity(
      relation.relation_type,
      relation.left_claim_identity,
      relation.right_claim_identity,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identity"],
      message: "relation identity does not match its type and endpoints",
    });
  }
});

const legacyLocalWatchSnapshotSchema = z.object({
  sources: z.array(localWatchSourceSchema).max(MAX_SNAPSHOT_SOURCES),
  candidates: z.array(localWatchCandidateSchema).max(MAX_SNAPSHOT_CANDIDATES),
  relations: z.array(localWatchRelationSchema).max(MAX_SNAPSHOT_RELATIONS),
}).strict().superRefine((snapshot, context) => {
  validateLocalWatchSnapshotReferences(snapshot, context);
});

const localWatchSourceBackedRelationSchema = z.object({
  relation_identity: z.string().min(1).max(MAX_IDENTITY_LENGTH * 2),
  supported_relation_type: z.literal("supersedes"),
  from_claim_identity: z.string().min(1).max(MAX_IDENTITY_LENGTH),
  to_claim_identity: z.string().min(1).max(MAX_IDENTITY_LENGTH),
}).strict();

const localWatchSnapshotSchema = z.object({
  sources: z.array(localWatchSourceSchema).max(MAX_SNAPSHOT_SOURCES),
  candidates: z.array(localWatchCandidateSchema).max(MAX_SNAPSHOT_CANDIDATES),
  relations: z.array(localWatchRelationSchema).max(MAX_SNAPSHOT_RELATIONS),
  relation_evidence_observation: z.enum(["available", "unavailable"]),
  source_backed_relations: z.array(localWatchSourceBackedRelationSchema).max(1),
}).strict().superRefine((snapshot, context) => {
  validateLocalWatchSnapshotReferences(snapshot, context);
  requireSortedUnique(
    snapshot.source_backed_relations,
    context,
    ["source_backed_relations"],
    (item) => item.relation_identity,
  );
  if (
    snapshot.relation_evidence_observation === "unavailable"
    && snapshot.source_backed_relations.length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source_backed_relations"],
      message: "unavailable evidence observation cannot contain source-backed relations",
    });
  }
  const relationByIdentity = new Map(
    snapshot.relations.map((relation) => [relation.identity, relation]),
  );
  const candidateIdentities = new Set(
    snapshot.candidates.map((candidate) => candidate.identity),
  );
  snapshot.source_backed_relations.forEach((sourceBacked, index) => {
    const path = ["source_backed_relations", index];
    const relation = relationByIdentity.get(sourceBacked.relation_identity);
    if (!relation || relation.relation_type !== "unresolved") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "relation_identity"],
        message: "source-backed relation must resolve to one unresolved raw relation",
      });
      return;
    }
    if (!candidateIdentities.has(sourceBacked.from_claim_identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "from_claim_identity"],
        message: "source-backed from claim must resolve to a stored candidate",
      });
    }
    if (!candidateIdentities.has(sourceBacked.to_claim_identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "to_claim_identity"],
        message: "source-backed to claim must resolve to a stored candidate",
      });
    }
    if (sourceBacked.from_claim_identity === sourceBacked.to_claim_identity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "to_claim_identity"],
        message: "source-backed direction endpoints must differ",
      });
    }
    const evidenceEndpoints = [
      sourceBacked.from_claim_identity,
      sourceBacked.to_claim_identity,
    ].sort(compareCanonicalWatchStrings);
    const rawEndpoints = [
      relation.left_claim_identity,
      relation.right_claim_identity,
    ].sort(compareCanonicalWatchStrings);
    if (
      evidenceEndpoints[0] !== rawEndpoints[0]
      || evidenceEndpoints[1] !== rawEndpoints[1]
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: "source-backed endpoints must equal the raw relation endpoint pair",
      });
    }
  });
});

function validateLocalWatchSnapshotReferences(
  snapshot: {
    sources: LocalWatchSource[];
    candidates: LocalWatchCandidate[];
    relations: LocalWatchRelation[];
  },
  context: z.RefinementCtx,
): void {
  requireSortedUnique(snapshot.sources, context, ["sources"], (item) => item.identity);
  requireSortedUnique(snapshot.candidates, context, ["candidates"], (item) => item.identity);
  requireSortedUnique(snapshot.relations, context, ["relations"], (item) => item.identity);
  const sourceIdentities = new Set(snapshot.sources.map((source) => source.identity));
  const candidateIdentities = new Set(
    snapshot.candidates.map((candidate) => candidate.identity),
  );
  snapshot.candidates.forEach((candidate, candidateIndex) => {
    candidate.supporting_source_identities.forEach((identity, sourceIndex) => {
      if (sourceIdentities.has(identity)) return;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates", candidateIndex, "supporting_source_identities", sourceIndex],
        message: "candidate support must resolve to a stored source identity",
      });
    });
  });
  snapshot.relations.forEach((relation, relationIndex) => {
    if (!candidateIdentities.has(relation.left_claim_identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relations", relationIndex, "left_claim_identity"],
        message: "relation left endpoint must resolve to a stored claim identity",
      });
    }
    if (!candidateIdentities.has(relation.right_claim_identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relations", relationIndex, "right_claim_identity"],
        message: "relation right endpoint must resolve to a stored claim identity",
      });
    }
  });
}

const legacyLocalWatchSchema = z.object({
  contract_version: z.literal(LOCAL_WATCH_LEGACY_CONTRACT_VERSION),
  normalized_public_interest_question: normalizedTextSchema(
    MIN_QUESTION_LENGTH,
    MAX_QUESTION_LENGTH,
  ),
  saved_source_limit: z.union([z.literal(3), z.literal(5)]),
  saved_discovery_profile: z.enum(DISCOVERY_PROFILES),
  saved_at: exactTimestampSchema,
  last_checked_at: exactTimestampSchema,
  snapshot: legacyLocalWatchSnapshotSchema,
}).strict().superRefine((watch, context) => {
  validateLocalWatchTimestamps(watch, context);
});

export const localWatchSchema = z.object({
  contract_version: z.literal(LOCAL_WATCH_CONTRACT_VERSION),
  normalized_public_interest_question: normalizedTextSchema(
    MIN_QUESTION_LENGTH,
    MAX_QUESTION_LENGTH,
  ),
  saved_source_limit: z.union([z.literal(3), z.literal(5)]),
  saved_discovery_profile: z.enum(DISCOVERY_PROFILES),
  saved_at: exactTimestampSchema,
  last_checked_at: exactTimestampSchema,
  snapshot: localWatchSnapshotSchema,
}).strict().superRefine((watch, context) => {
  validateLocalWatchTimestamps(watch, context);
}) satisfies z.ZodType<LocalWatch>;

function validateLocalWatchTimestamps(
  watch: { saved_at: string; last_checked_at: string },
  context: z.RefinementCtx,
): void {
  if (!isCanonicalInstant(watch.saved_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["saved_at"],
      message: "saved_at must be a canonical ISO instant",
    });
  }
  if (!isCanonicalInstant(watch.last_checked_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["last_checked_at"],
      message: "last_checked_at must be a canonical ISO instant",
    });
  }
  if (watch.last_checked_at < watch.saved_at) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["last_checked_at"],
      message: "last_checked_at cannot precede saved_at",
    });
  }
}

export function normalizeLocalWatchQuestion(value: string): string {
  return normalizeStoredText(value);
}

export function normalizeHttpUrl(value: string | null): string | null {
  if (!value || value.length > MAX_SOURCE_URL_LENGTH) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    return parsed.href;
  } catch {
    return null;
  }
}

export function sourceIdentity(source: {
  url: string | null;
  domain: string;
  publisher: string;
  title: string;
}): string {
  const url = normalizeHttpUrl(source.url);
  if (url) return `url:${url}`;
  return `fallback:${JSON.stringify([
    normalizeIdentityText(source.domain),
    normalizeIdentityText(source.publisher),
    normalizeIdentityText(source.title),
  ])}`;
}

export function claimCandidateIdentity(
  actor: string | null,
  normalizedClaimRepresentation: string,
): string {
  return `claim:${JSON.stringify([
    actor === null ? "unknown_actor" : "known_actor",
    actor === null ? null : normalizeIdentityText(actor),
    normalizeIdentityText(normalizedClaimRepresentation),
  ])}`;
}

export const SYMMETRIC_RELATION_TYPES = new Set<RelationType>([
  "same_event",
  "corroborates",
  "contradicts",
  "unresolved",
  "unrelated",
]);

export function normalizedRelationEndpoints(
  relationType: RelationType,
  leftClaimIdentity: string,
  rightClaimIdentity: string,
): { left: string; right: string } {
  if (
    SYMMETRIC_RELATION_TYPES.has(relationType)
    && compareCanonicalWatchStrings(rightClaimIdentity, leftClaimIdentity) < 0
  ) {
    return { left: rightClaimIdentity, right: leftClaimIdentity };
  }
  return { left: leftClaimIdentity, right: rightClaimIdentity };
}

export function relationIdentity(
  relationType: RelationType,
  leftClaimIdentity: string,
  rightClaimIdentity: string,
): string {
  const endpoints = normalizedRelationEndpoints(
    relationType,
    leftClaimIdentity,
    rightClaimIdentity,
  );
  return `relation:${JSON.stringify([
    relationType,
    endpoints.left,
    endpoints.right,
  ])}`;
}

export function buildLocalWatchSnapshot(input: unknown): LocalWatchSnapshot {
  const packet = validateSiteReadyCasePacket(input);
  if (packet.mode !== "live") {
    throw new LocalWatchContractError("invalid", "Only live packets can become a Watch");
  }

  const sourceIdentityByRunId = new Map<string, string>();
  const sourceByIdentity = new Map<string, LocalWatchSource>();
  for (const packetSource of packet.source_snapshot_summaries) {
    const url = normalizeHttpUrl(packetSource.url);
    const source: LocalWatchSource = {
      identity: sourceIdentity({ ...packetSource, url }),
      title: compactText(packetSource.title, 240),
      url,
      domain: compactText(packetSource.domain, 240),
      publisher: compactText(packetSource.publisher, 240),
      published_at: packetSource.published_at,
      published_at_precision: packetSource.published_at_precision,
    };
    sourceIdentityByRunId.set(packetSource.source_id, source.identity);
    const existing = sourceByIdentity.get(source.identity);
    if (
      !existing
      || compareCanonicalWatchStrings(stableJson(source), stableJson(existing)) < 0
    ) {
      sourceByIdentity.set(source.identity, source);
    }
  }

  interface CandidateAccumulator {
    identity: string;
    actorValues: Set<string>;
    actorWasNull: boolean;
    texts: Set<string>;
    normalizedValues: Set<string>;
    supportingSourceIdentities: Set<string>;
    confidences: Set<CandidateConfidence>;
    assertionTimes: Map<string, LocalWatchTimestamp>;
    eventTimes: Map<string, LocalWatchTimestamp>;
    publicationTimes: Map<string, LocalWatchTimestamp>;
  }

  const occurrenceIdentity = new Map<string, string>();
  const candidates = new Map<string, CandidateAccumulator>();
  for (const occurrence of packet.claim_occurrences) {
    const identity = claimCandidateIdentity(
      occurrence.actor,
      occurrence.normalized_claim_representation,
    );
    const source = sourceIdentityByRunId.get(occurrence.source_id);
    if (!source) {
      throw new LocalWatchContractError(
        "invalid",
        "A claim support source could not be resolved safely",
      );
    }
    occurrenceIdentity.set(occurrence.occurrence_id, identity);
    const accumulator = candidates.get(identity) ?? {
      identity,
      actorValues: new Set<string>(),
      actorWasNull: false,
      texts: new Set<string>(),
      normalizedValues: new Set<string>(),
      supportingSourceIdentities: new Set<string>(),
      confidences: new Set<CandidateConfidence>(),
      assertionTimes: new Map<string, LocalWatchTimestamp>(),
      eventTimes: new Map<string, LocalWatchTimestamp>(),
      publicationTimes: new Map<string, LocalWatchTimestamp>(),
    };
    if (occurrence.actor === null) accumulator.actorWasNull = true;
    else accumulator.actorValues.add(compactText(occurrence.actor, 200));
    accumulator.texts.add(compactText(occurrence.original_claim_text, 240));
    accumulator.normalizedValues.add(
      normalizeStoredText(occurrence.normalized_claim_representation),
    );
    accumulator.supportingSourceIdentities.add(source);
    accumulator.confidences.add(occurrence.confidence);
    addTimestamp(
      accumulator.assertionTimes,
      occurrence.assertion_time_candidate,
      occurrence.assertion_time_candidate_precision,
    );
    addTimestamp(
      accumulator.eventTimes,
      occurrence.event_time_candidate,
      occurrence.event_time_candidate_precision,
    );
    addTimestamp(
      accumulator.publicationTimes,
      occurrence.source_publication_time,
      occurrence.source_publication_time_precision,
    );
    candidates.set(identity, accumulator);
  }

  const compactCandidates: LocalWatchCandidate[] = [...candidates.values()]
    .map((candidate) => ({
      identity: candidate.identity,
      actor: candidate.actorWasNull
        ? null
        : [...candidate.actorValues].sort(compareCanonicalWatchStrings)[0] ?? null,
      text: [...candidate.texts].sort(compareCanonicalWatchStrings)[0],
      normalized_claim_representation:
        [...candidate.normalizedValues].sort(compareCanonicalWatchStrings)[0],
      supporting_source_identities:
        [...candidate.supportingSourceIdentities].sort(compareCanonicalWatchStrings),
      confidences: [...candidate.confidences].sort(compareCanonicalWatchStrings),
      assertion_times: [...candidate.assertionTimes.values()].sort(compareTimestamp),
      event_times: [...candidate.eventTimes.values()].sort(compareTimestamp),
      publication_times: [...candidate.publicationTimes.values()].sort(compareTimestamp),
    }))
    .sort((left, right) =>
      compareCanonicalWatchStrings(left.identity, right.identity)
    );

  const relationIdentityByRunId = new Map<string, string>();
  const relationByIdentity = new Map<string, LocalWatchRelation>();
  for (const packetRelation of packet.relation_candidates) {
    const leftIdentity = occurrenceIdentity.get(packetRelation.left_occurrence_id);
    const rightIdentity = occurrenceIdentity.get(packetRelation.right_occurrence_id);
    if (!leftIdentity || !rightIdentity) {
      throw new LocalWatchContractError(
        "invalid",
        "A relation endpoint could not be resolved safely",
      );
    }
    const endpoints = normalizedRelationEndpoints(
      packetRelation.relation_type,
      leftIdentity,
      rightIdentity,
    );
    const relation: LocalWatchRelation = {
      identity: relationIdentity(
        packetRelation.relation_type,
        endpoints.left,
        endpoints.right,
      ),
      relation_type: packetRelation.relation_type,
      left_claim_identity: endpoints.left,
      right_claim_identity: endpoints.right,
    };
    relationIdentityByRunId.set(packetRelation.relation_id, relation.identity);
    relationByIdentity.set(relation.identity, relation);
  }

  const sourceBackedRelations: LocalWatchSourceBackedRelation[] =
    packet.contract_version === "site_ready_case_packet.v2"
      ? packet.source_supported_relation_signals.map((signal) => {
          const rawRelationIdentity = relationIdentityByRunId.get(
            signal.relation_candidate_id,
          );
          const fromClaimIdentity = occurrenceIdentity.get(signal.from_occurrence_id);
          const toClaimIdentity = occurrenceIdentity.get(signal.to_occurrence_id);
          if (!rawRelationIdentity || !fromClaimIdentity || !toClaimIdentity) {
            throw new LocalWatchContractError(
              "invalid",
              "Source-backed relation evidence could not be resolved safely",
            );
          }
          return {
            relation_identity: rawRelationIdentity,
            supported_relation_type: signal.supported_relation_type,
            from_claim_identity: fromClaimIdentity,
            to_claim_identity: toClaimIdentity,
          };
        }).sort((left, right) =>
          compareCanonicalWatchStrings(left.relation_identity, right.relation_identity)
        )
      : [];

  return validateLocalWatchSnapshot({
    sources: [...sourceByIdentity.values()].sort((left, right) =>
      compareCanonicalWatchStrings(left.identity, right.identity)
    ),
    candidates: compactCandidates,
    relations: [...relationByIdentity.values()].sort((left, right) =>
      compareCanonicalWatchStrings(left.identity, right.identity)
    ),
    relation_evidence_observation:
      packet.contract_version === "site_ready_case_packet.v2"
        ? "available"
        : "unavailable",
    source_backed_relations: sourceBackedRelations,
  });
}

export function createLocalWatch(
  input: unknown,
  savedAt: string | number | Date = new Date(),
): LocalWatch {
  const packet = validateSiteReadyCasePacket(input);
  if (packet.mode !== "live" || packet.discovery_profile === null) {
    throw new LocalWatchContractError("invalid", "Only a live investigation can be tracked");
  }
  if (packet.requested_source_limit !== 3 && packet.requested_source_limit !== 5) {
    throw new LocalWatchContractError("invalid", "The source limit is outside the public Watch bounds");
  }
  const timestamp = canonicalInstant(savedAt);
  const watch = validateLocalWatch({
    contract_version: LOCAL_WATCH_CONTRACT_VERSION,
    normalized_public_interest_question: normalizeLocalWatchQuestion(
      packet.normalized_public_interest_question,
    ),
    saved_source_limit: packet.requested_source_limit,
    saved_discovery_profile: packet.discovery_profile,
    saved_at: timestamp,
    last_checked_at: timestamp,
    snapshot: buildLocalWatchSnapshot(packet),
  });
  serializeLocalWatch(watch);
  return watch;
}

export function advanceLocalWatch(
  current: LocalWatch,
  input: unknown,
  checkedAt: string | number | Date = new Date(),
): LocalWatch {
  const validatedCurrent = validateLocalWatch(current);
  const packet = validateSiteReadyCasePacket(input);
  if (
    packet.mode !== "live"
    || packet.discovery_profile !== validatedCurrent.saved_discovery_profile
    || packet.requested_source_limit !== validatedCurrent.saved_source_limit
    || normalizeLocalWatchQuestion(packet.normalized_public_interest_question)
      !== validatedCurrent.normalized_public_interest_question
  ) {
    throw new LocalWatchContractError(
      "invalid",
      "The recheck response does not match the saved Watch configuration",
    );
  }
  const updated = validateLocalWatch({
    ...validatedCurrent,
    last_checked_at: canonicalInstant(checkedAt),
    snapshot: buildLocalWatchSnapshot(packet),
  });
  serializeLocalWatch(updated);
  return updated;
}

export function watchRecheckInput(watch: LocalWatch): {
  question: string;
  sourceLimit: 3 | 5;
  discoveryProfile: DiscoveryProfile;
} {
  const valid = validateLocalWatch(watch);
  return {
    question: valid.normalized_public_interest_question,
    sourceLimit: valid.saved_source_limit,
    discoveryProfile: valid.saved_discovery_profile,
  };
}

export function isSameTrackedTopic(
  watch: LocalWatch,
  packet: SiteReadyCasePacket,
): boolean {
  return watch.normalized_public_interest_question
    === normalizeLocalWatchQuestion(packet.normalized_public_interest_question);
}

export function validateLocalWatch(input: unknown): LocalWatch {
  const result = localWatchSchema.safeParse(input);
  if (!result.success) {
    throw new LocalWatchContractError("invalid", "Browser-local Watch data is invalid");
  }
  return result.data;
}

export function validateLocalWatchSnapshot(input: unknown): LocalWatchSnapshot {
  const result = localWatchSnapshotSchema.safeParse(input);
  if (!result.success) {
    throw new LocalWatchContractError("invalid", "Compact investigation snapshot is invalid");
  }
  return result.data;
}

export function serializeLocalWatch(input: unknown): string {
  const serialized = JSON.stringify(validateLocalWatch(input));
  if (utf8ByteLength(serialized) > LOCAL_WATCH_MAX_BYTES) {
    throw new LocalWatchContractError(
      "oversized",
      "Compact investigation snapshot exceeds the browser-local Watch bound",
    );
  }
  return serialized;
}

export function readLocalWatch(storage: LocalWatchStorage): LocalWatchReadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(LOCAL_WATCH_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (serialized === null) return { status: "empty" };
  if (utf8ByteLength(serialized) > LOCAL_WATCH_MAX_BYTES) {
    return { status: "invalid", reason: "oversized" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { status: "invalid", reason: "malformed" };
  }
  if (
    !parsed
    || typeof parsed !== "object"
    || !("contract_version" in parsed)
  ) {
    return { status: "invalid", reason: "unsupported" };
  }
  if (parsed.contract_version === LOCAL_WATCH_CONTRACT_VERSION) {
    const result = localWatchSchema.safeParse(parsed);
    return result.success
      ? { status: "valid", watch: result.data }
      : { status: "invalid", reason: "malformed" };
  }
  if (parsed.contract_version === LOCAL_WATCH_LEGACY_CONTRACT_VERSION) {
    const result = legacyLocalWatchSchema.safeParse(parsed);
    if (!result.success) return { status: "invalid", reason: "malformed" };
    return {
      status: "valid",
      watch: validateLocalWatch({
        ...result.data,
        contract_version: LOCAL_WATCH_CONTRACT_VERSION,
        snapshot: {
          ...result.data.snapshot,
          relation_evidence_observation: "unavailable",
          source_backed_relations: [],
        },
      }),
    };
  }
  return { status: "invalid", reason: "unsupported" };
}

export function writeLocalWatch(
  storage: LocalWatchStorage,
  input: unknown,
): LocalWatchMutationResult {
  let serialized: string;
  try {
    serialized = serializeLocalWatch(input);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof LocalWatchContractError && error.reason === "oversized"
        ? "oversized"
        : "invalid",
    };
  }
  try {
    storage.setItem(LOCAL_WATCH_STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function forgetLocalWatch(
  storage: LocalWatchStorage,
): LocalWatchMutationResult {
  try {
    storage.removeItem(LOCAL_WATCH_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function normalizedTextSchema(minimum: number, maximum: number) {
  return z.string().min(minimum).max(maximum).refine(
    (value) => normalizeStoredText(value) === value,
    "text must be Unicode-normalized with collapsed whitespace",
  );
}

function normalizeStoredText(value: string): string {
  return normalizeReviewerWhitespace(value.normalize("NFKC"));
}

function normalizeIdentityText(value: string): string {
  return normalizeStoredText(value).toLocaleLowerCase("und");
}

function compactText(value: string, maximum: number): string {
  const normalized = normalizeStoredText(value);
  if (Array.from(normalized).length <= maximum) return normalized;

  // boundedReviewerText uses U+2026, which NFKC expands to three periods.
  // Reserve that two-code-point growth before canonicalizing stored Watch text.
  return normalizeStoredText(boundedReviewerText(normalized, maximum - 2));
}

function canonicalInstant(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new LocalWatchContractError("invalid", "Watch timestamp is invalid");
  }
  return date.toISOString();
}

function isCanonicalInstant(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function addTimestamp(
  target: Map<string, LocalWatchTimestamp>,
  value: string | null,
  precision: TemporalPrecision,
): void {
  if (value === null || precision === null) return;
  const timestamp: LocalWatchTimestamp = { value, precision };
  target.set(timestampKey(timestamp), timestamp);
}

function timestampKey(timestamp: LocalWatchTimestamp): string {
  return `${timestamp.precision}:${timestamp.value}`;
}

function compareTimestamp(
  left: LocalWatchTimestamp,
  right: LocalWatchTimestamp,
): number {
  return compareCanonicalWatchStrings(timestampKey(left), timestampKey(right));
}

function compareCanonicalWatchStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function requireSortedUnique<T>(
  values: T[],
  context: z.RefinementCtx,
  path: Array<string | number>,
  key: (value: T) => string = (value) => String(value),
): void {
  const keys = values.map(key);
  const expected = [...new Set(keys)].sort(compareCanonicalWatchStrings);
  if (keys.length === expected.length && keys.every((value, index) => value === expected[index])) {
    return;
  }
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: "collection must be deduplicated and sorted deterministically",
  });
}
