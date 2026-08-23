import { z } from "zod";
import type {
  AnalysisMode,
  AnalysisSourceSummary,
  CandidateConfidence,
} from "../analysis/contracts";
import type { RecordStatus } from "../contracts";
import {
  isExactTimestamp,
  type TemporalPrecision,
} from "../temporal";
import {
  DISCOVERY_LANES,
  DISCOVERY_PROFILES,
  INFORMATION_PROXIMITIES,
  SOURCE_CONTEXTS,
  type CoverageSummary,
  type DiscoveryProfile,
} from "../source-profile";

export const RELATION_TYPES = [
  "same_event",
  "follow_up",
  "correction",
  "corroborates",
  "contradicts",
  "narrows",
  "supersedes",
  "unresolved",
  "unrelated",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];
export type LineageOrigin = "deterministic_fixture" | "live_api";
export type SupportKind =
  | "captured_fixture_source_evidence_excerpt"
  | "model_generated_web_search_summary_span";

export interface BoundedSupportReference {
  support_kind: SupportKind;
  source_id: string;
  snapshot_id: string;
  bounded_excerpt: string;
  evidence_reference: string;
  citation_url: string | null;
  proves: "captured_fixture_support" | "model_summary_containment_only";
}

export const EVIDENCE_CLAIM_LINK_BASES = [
  "same_source_topic_overlap",
  "coverage_comparison_topic_overlap",
  "same_actor_action_topic_overlap",
  "cross_source_strong_topic_overlap",
] as const;

export type EvidenceClaimLinkBasis = (typeof EVIDENCE_CLAIM_LINK_BASES)[number];

export interface EvidenceClaimReviewLinkCandidate {
  link_id: string;
  evidence_record_kind: "finding" | "action";
  evidence_record_id: string;
  evidence_source_id: string;
  claim_occurrence_id: string;
  claim_id: string;
  claim_source_id: string;
  link_semantics: "review_together_only";
  link_basis: EvidenceClaimLinkBasis;
  shared_topic_tokens: string[];
  reason: string;
  evidence_support_reference: BoundedSupportReference;
  claim_support_reference: BoundedSupportReference;
  review_status: "pending_review";
  status: "candidate";
  generated_by: "deterministic_rule";
  origin: "live_api";
}

export interface EvidenceClaimLinkWorkSummary {
  evidence_record_count: number;
  claim_occurrence_count: number;
  theoretical_pair_count: number;
  prefilter_candidate_count: number;
  selected_link_count: number;
  filtered_out_count: number;
  deferred_link_count: number;
  configured_maximum_link_count: number;
  configured_maximum_links_per_evidence_record: number;
  configured_bound_reached: boolean;
}

export function emptyEvidenceClaimLinkWorkSummary(): EvidenceClaimLinkWorkSummary {
  return {
    evidence_record_count: 0,
    claim_occurrence_count: 0,
    theoretical_pair_count: 0,
    prefilter_candidate_count: 0,
    selected_link_count: 0,
    filtered_out_count: 0,
    deferred_link_count: 0,
    configured_maximum_link_count: 32,
    configured_maximum_links_per_evidence_record: 2,
    configured_bound_reached: false,
  };
}

export interface ClaimOccurrence {
  occurrence_id: string;
  source_id: string;
  snapshot_id: string;
  source_record_status: RecordStatus;
  claim_id: string;
  claim_kind: "actor_claim" | "prepared_actor_claim";
  candidate_claim_family_id: string | null;
  actor: string | null;
  original_claim_text: string;
  normalized_claim_representation: string;
  support_kind: SupportKind;
  support_reference: BoundedSupportReference;
  assertion_time_candidate: string | null;
  assertion_time_candidate_precision: TemporalPrecision;
  event_time_candidate: string | null;
  event_time_candidate_precision: TemporalPrecision;
  source_publication_time: string | null;
  source_publication_time_precision: TemporalPrecision;
  source_retrieval_time: string;
  source_retrieval_time_precision: "instant";
  confidence: CandidateConfidence;
  uncertainty: string;
  validation_status: "validated";
  status: RecordStatus;
  origin: LineageOrigin;
}

export interface ClaimFamilyCandidate {
  family_id: string;
  occurrence_ids: string[];
  grouping_reason: string;
  grouping_signals: string[];
  unresolved: boolean;
  review_status: "pending_review";
  status: "candidate";
  origin: LineageOrigin;
}

export interface RelationCandidate {
  relation_id: string;
  left_occurrence_id: string;
  right_occurrence_id: string;
  left_source_id: string;
  right_source_id: string;
  left_snapshot_id: string;
  right_snapshot_id: string;
  relation_type: RelationType;
  left_support_reference: BoundedSupportReference;
  right_support_reference: BoundedSupportReference;
  left_support_kind: SupportKind;
  right_support_kind: SupportKind;
  confidence_score: number;
  reason: string;
  review_status: "pending_review";
  status: "candidate";
  generated_by:
    | "deterministic_rule"
    | "deterministic_fixture"
    | "model_assisted";
  insufficient_evidence: boolean;
}

export interface SiteTimelineRow {
  timeline_row_id: string;
  occurrence_ids: string[];
  summary: string;
  event_time: string | null;
  event_time_precision: TemporalPrecision;
  actor_assertion_time: string | null;
  actor_assertion_time_precision: TemporalPrecision;
  publication_time: string | null;
  publication_time_precision: TemporalPrecision;
  retrieval_time: string;
  retrieval_time_precision: "instant";
  display_time_axis:
    | "event_time"
    | "actor_assertion_time"
    | "publication_time"
    | "retrieval_time";
  display_time: string;
  display_time_precision: Exclude<TemporalPrecision, null>;
  time_inference: "none";
  status: RecordStatus;
}

export interface ClaimLineageRow {
  lineage_row_id: string;
  family_id: string | null;
  relation_id: string;
  from_occurrence_id: string;
  to_occurrence_id: string;
  relation_type: RelationType;
  summary: string;
  status: "candidate";
  review_status: "pending_review";
}

export interface PacketFinding {
  finding_id: string;
  text: string;
  source_ids: string[];
  confidence: string;
  status: RecordStatus;
  origin: LineageOrigin;
}

export interface PacketActorClaim {
  claim_id: string;
  actor: string | null;
  claim_text: string;
  source_ids: string[];
  assertion_time_candidate: string | null;
  assertion_time_candidate_precision: TemporalPrecision;
  confidence: string;
  uncertainty: string;
  status: RecordStatus;
  origin: LineageOrigin;
}

export interface PacketAction {
  action_id: string;
  actor: string | null;
  action_text: string;
  source_ids: string[];
  event_time_candidate: string | null;
  event_time_candidate_precision: TemporalPrecision;
  confidence: string;
  uncertainty: string;
  status: RecordStatus;
  origin: LineageOrigin;
}

export interface PacketTimeCandidate {
  candidate_id: string;
  candidate_type: "event_time_candidate" | "assertion_time_candidate";
  text: string;
  source_ids: string[];
  time_candidate: string | null;
  time_candidate_precision: TemporalPrecision;
  confidence: string;
  uncertainty: string;
  status: "candidate";
  origin: "live_api";
}

export interface PacketUnresolvedQuestion {
  question_id: string;
  question: string;
  related_ids: string[];
  status: "unresolved";
  record_status: RecordStatus;
  origin: LineageOrigin;
}

export interface BoundedWorkSummary {
  occurrence_count: number;
  theoretical_pair_count: number;
  configured_maximum_pair_count: number;
  prefilter_candidate_count: number;
  filtered_out_count: number;
  deferred_pair_count: number;
  model_classified_count: number;
  unrelated_count: number;
  unresolved_or_insufficient_evidence_count: number;
  configured_bound_reached: boolean;
}

export const DETAIL_KINDS = [
  "source",
  "finding",
  "action",
  "claim_occurrence",
  "claim_family",
  "relation",
  "timeline_row",
  "lineage_row",
  "unresolved_question",
] as const;

export type SiteDetailKind = (typeof DETAIL_KINDS)[number];

export interface FocusedDetailLookupKey {
  kind: SiteDetailKind;
  id: string;
  key: string;
}

export interface SourceSupportedRelationSignal {
  relation_candidate_id: string;
  supported_relation_type: "supersedes";
  from_occurrence_id: string;
  to_occurrence_id: string;
  support_status: "direct_source_support";
  review_status: "pending_review";
  statement_source_id: string;
  statement_snapshot_id: string;
  statement_excerpt: string;
  target_source_id: string;
  target_snapshot_id: string;
}

interface SiteReadyCasePacketFields {
  case_id: string;
  run_id: string;
  mode: AnalysisMode;
  status: "ready" | "live" | "fallback";
  title: string;
  normalized_public_interest_question: string;
  requested_source_limit: number;
  actual_source_count: number;
  discovery_profile: DiscoveryProfile | null;
  coverage_summary: CoverageSummary;
  source_snapshot_summaries: AnalysisSourceSummary[];
  source_bound_findings: PacketFinding[];
  actor_claims: PacketActorClaim[];
  actions: PacketAction[];
  time_candidates: PacketTimeCandidate[];
  claim_occurrences: ClaimOccurrence[];
  candidate_claim_families: ClaimFamilyCandidate[];
  relation_candidates: RelationCandidate[];
  evidence_claim_review_links: EvidenceClaimReviewLinkCandidate[];
  evidence_claim_link_work_summary: EvidenceClaimLinkWorkSummary;
  event_timeline_rows: SiteTimelineRow[];
  claim_lineage_rows: ClaimLineageRow[];
  current_source_bound_candidate_synthesis: string[];
  unresolved_questions: PacketUnresolvedQuestion[];
  warnings: string[];
  limitations: string[];
  candidate_canonical_boundary: {
    canonical_mutation: "none";
    deterministic_fixture_records_may_be_canonical: true;
    live_and_inferred_records: "candidate_review_only";
    browser_selection_can_mutate_canonical: false;
    confidence_can_promote_to_canonical: false;
  };
  bounded_work_summary: BoundedWorkSummary;
  focused_detail_lookup_keys: FocusedDetailLookupKey[];
}

export interface SiteReadyCasePacketV1 extends SiteReadyCasePacketFields {
  contract_version: "site_ready_case_packet.v1";
}

export interface SiteReadyCasePacketV2 extends SiteReadyCasePacketFields {
  contract_version: "site_ready_case_packet.v2";
  source_supported_relation_signals: SourceSupportedRelationSignal[];
}

export type SiteReadyCasePacket = SiteReadyCasePacketV1 | SiteReadyCasePacketV2;

export interface SiteReadyCaseDetail<T = unknown> {
  case_id: string;
  run_id: string;
  focus_kind: SiteDetailKind;
  focus_id: string;
  detail: T;
}

const recordStatusSchema = z.enum(["candidate", "canonical"]);
const candidateConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
const claimKindSchema = z.enum([
  "actor_claim",
  "prepared_actor_claim",
]);
const originSchema = z.enum(["deterministic_fixture", "live_api"]);
const supportKindSchema = z.enum([
  "captured_fixture_source_evidence_excerpt",
  "model_generated_web_search_summary_span",
]);
const nullableTimeSchema = z
  .string()
  .min(1)
  .refine(isExactTimestamp, "exact timestamps require YYYY-MM-DD or ISO date-time with zone")
  .nullable();
const temporalPrecisionSchema = z.enum(["day", "instant"]).nullable();
const searchProvenanceSchema = z.object({
  provider: z.literal("openai"),
  search_call_id: z.string().min(1),
  provider_source_included: z.boolean(),
  citation_title: z.string().nullable(),
  citation_start: z.number().int().min(0).nullable(),
  citation_end: z.number().int().min(0).nullable(),
});

const sourceSelectionSchema = z.object({
  discovery_pass: z.enum(["baseline", "coverage_expansion"]),
  discovery_lane: z.enum(DISCOVERY_LANES),
  source_context: z.enum(SOURCE_CONTEXTS),
  information_proximity: z.enum(INFORMATION_PROXIMITIES),
  why_included: z.string().min(1).max(240),
  classification_basis: z.enum([
    "curated_fixture",
    "model_generated_web_search_classification",
  ]),
  classification_status: z.enum([
    "curated_fixture_metadata",
    "candidate_review_only",
  ]),
  comparison_target_source_ids: z.array(z.string().min(1).max(160)).max(8),
}).strict();

const laneCountsSchema = z.object({
  baseline_authority: z.number().int().min(0).max(8),
  primary_or_origin: z.number().int().min(0).max(8),
  local_or_firsthand: z.number().int().min(0).max(8),
  specialist_context: z.number().int().min(0).max(8),
  challenge_or_correction: z.number().int().min(0).max(8),
}).strict();

const liveDiscoveryCoverageSummarySchema = z.object({
  coverage_basis: z.literal("live_discovery"),
  discovery_profile: z.enum(DISCOVERY_PROFILES),
  baseline_requested: z.number().int().min(0).max(8),
  baseline_returned: z.number().int().min(0).max(8),
  expansion_requested: z.number().int().min(0).max(8),
  expansion_returned: z.number().int().min(0).max(8),
  lane_counts: laneCountsSchema,
  missing_target_lanes: z.array(z.enum(DISCOVERY_LANES)).max(DISCOVERY_LANES.length),
  unique_domain_count: z.number().int().min(0).max(8),
  duplicate_url_count: z.number().int().min(0),
  source_limit_reached: z.boolean(),
  expansion_attempted: z.boolean(),
  expansion_completed_successfully: z.boolean(),
}).strict();

const preparedFixtureCoverageSummarySchema = z.object({
  coverage_basis: z.literal("prepared_fixture"),
  fixture_source_count: z.number().int().min(0).max(8),
  lane_counts: laneCountsSchema,
  missing_target_lanes: z.array(z.enum(DISCOVERY_LANES)).max(DISCOVERY_LANES.length),
}).strict();

const coverageSummarySchema = z.discriminatedUnion("coverage_basis", [
  liveDiscoveryCoverageSummarySchema,
  preparedFixtureCoverageSummarySchema,
]) satisfies z.ZodType<CoverageSummary>;

const boundedSupportSchema = z.object({
  support_kind: supportKindSchema,
  source_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  bounded_excerpt: z.string().min(1).max(560),
  evidence_reference: z.string().min(1),
  citation_url: z.string().url().nullable(),
  proves: z.enum(["captured_fixture_support", "model_summary_containment_only"]),
});

const occurrenceSchema = z.object({
  occurrence_id: z.string().regex(/^occurrence_(fixture|live)_/),
  source_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  source_record_status: recordStatusSchema,
  claim_id: z.string().min(1),
  claim_kind: claimKindSchema,
  candidate_claim_family_id: z.string().nullable(),
  actor: z.string().min(1).max(200).nullable(),
  original_claim_text: z.string().min(1).max(1200),
  normalized_claim_representation: z.string().min(1).max(1200),
  support_kind: supportKindSchema,
  support_reference: boundedSupportSchema,
  assertion_time_candidate: nullableTimeSchema,
  assertion_time_candidate_precision: temporalPrecisionSchema,
  event_time_candidate: nullableTimeSchema,
  event_time_candidate_precision: temporalPrecisionSchema,
  source_publication_time: nullableTimeSchema,
  source_publication_time_precision: temporalPrecisionSchema,
  source_retrieval_time: z.string().min(1),
  source_retrieval_time_precision: z.literal("instant"),
  confidence: candidateConfidenceSchema,
  uncertainty: z.string().max(600),
  validation_status: z.literal("validated"),
  status: recordStatusSchema,
  origin: originSchema,
});

const familySchema = z.object({
  family_id: z.string().regex(/^family_candidate_/),
  occurrence_ids: z.array(z.string().min(1)).min(1),
  grouping_reason: z.string().min(1).max(600),
  grouping_signals: z.array(z.string().min(1)),
  unresolved: z.boolean(),
  review_status: z.literal("pending_review"),
  status: z.literal("candidate"),
  origin: originSchema,
});

const relationSchema = z.object({
  relation_id: z.string().regex(/^relation_candidate_/),
  left_occurrence_id: z.string().min(1),
  right_occurrence_id: z.string().min(1),
  left_source_id: z.string().min(1),
  right_source_id: z.string().min(1),
  left_snapshot_id: z.string().min(1),
  right_snapshot_id: z.string().min(1),
  relation_type: z.enum(RELATION_TYPES),
  left_support_reference: boundedSupportSchema,
  right_support_reference: boundedSupportSchema,
  left_support_kind: supportKindSchema,
  right_support_kind: supportKindSchema,
  confidence_score: z.number().min(0).max(1),
  reason: z.string().min(1).max(700),
  review_status: z.literal("pending_review"),
  status: z.literal("candidate"),
  generated_by: z.enum([
    "deterministic_rule",
    "deterministic_fixture",
    "model_assisted",
  ]),
  insufficient_evidence: z.boolean(),
});

const evidenceClaimReviewLinkSchema = z.object({
  link_id: z.string().regex(/^evidence_claim_review_link_/),
  evidence_record_kind: z.enum(["finding", "action"]),
  evidence_record_id: z.string().min(1),
  evidence_source_id: z.string().min(1),
  claim_occurrence_id: z.string().min(1),
  claim_id: z.string().min(1),
  claim_source_id: z.string().min(1),
  link_semantics: z.literal("review_together_only"),
  link_basis: z.enum(EVIDENCE_CLAIM_LINK_BASES),
  shared_topic_tokens: z.array(z.string().min(1)).min(2).max(40),
  reason: z.string().min(1).max(700),
  evidence_support_reference: boundedSupportSchema,
  claim_support_reference: boundedSupportSchema,
  review_status: z.literal("pending_review"),
  status: z.literal("candidate"),
  generated_by: z.literal("deterministic_rule"),
  origin: z.literal("live_api"),
}).strict();

const evidenceClaimLinkWorkSummarySchema = z.object({
  evidence_record_count: z.number().int().min(0),
  claim_occurrence_count: z.number().int().min(0),
  theoretical_pair_count: z.number().int().min(0),
  prefilter_candidate_count: z.number().int().min(0),
  selected_link_count: z.number().int().min(0),
  filtered_out_count: z.number().int().min(0),
  deferred_link_count: z.number().int().min(0),
  configured_maximum_link_count: z.number().int().min(1).max(32),
  configured_maximum_links_per_evidence_record: z.number().int().min(1).max(2),
  configured_bound_reached: z.boolean(),
}).strict();

const sourceSchema = z.object({
  source_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().nullable(),
  domain: z.string().min(1),
  publisher: z.string().min(1),
  published_at: nullableTimeSchema,
  published_at_precision: temporalPrecisionSchema,
  retrieved_at: z.string().min(1),
  snapshot_status: z.enum(["full", "partial", "failed"]),
  retrieval_mode: z.enum(["deterministic_fixture", "openai_web_search"]),
  content_kind: z.enum([
    "captured_fixture_source_text",
    "model_generated_web_search_summary",
  ]),
  source_text_captured: z.boolean(),
  content_sha256: z.string().nullable(),
  candidate_summary_sha256: z.string().nullable(),
  record_status: recordStatusSchema,
  evidence_excerpt: z.string().nullable(),
  web_search_grounded_candidate_summary: z.string().nullable(),
  limitations: z.array(z.string()),
  api_provenance: searchProvenanceSchema.nullable(),
  source_selection: sourceSelectionSchema,
});

const siteReadyCasePacketBaseSchema = z.object({
  case_id: z.string().min(1),
  run_id: z.string().min(1),
  mode: z.enum(["deterministic", "live", "fallback"]),
  status: z.enum(["ready", "live", "fallback"]),
  title: z.string().min(1),
  normalized_public_interest_question: z.string().min(1).max(500),
  requested_source_limit: z.number().int().min(1).max(8),
  actual_source_count: z.number().int().min(0).max(8),
  discovery_profile: z.enum(DISCOVERY_PROFILES).nullable(),
  coverage_summary: coverageSummarySchema,
  source_snapshot_summaries: z.array(sourceSchema).max(8),
  source_bound_findings: z.array(z.object({
    finding_id: z.string().min(1), text: z.string().min(1), source_ids: z.array(z.string()),
    confidence: z.string(), status: recordStatusSchema, origin: originSchema,
  })),
  actor_claims: z.array(z.object({
    claim_id: z.string().min(1), actor: z.string().min(1).max(200).nullable(), claim_text: z.string().min(1),
    source_ids: z.array(z.string()), assertion_time_candidate: nullableTimeSchema,
    assertion_time_candidate_precision: temporalPrecisionSchema,
    confidence: z.string(), uncertainty: z.string(), status: recordStatusSchema, origin: originSchema,
  })),
  actions: z.array(z.object({
    action_id: z.string().min(1), actor: z.string().min(1).max(200).nullable(), action_text: z.string().min(1),
    source_ids: z.array(z.string()), event_time_candidate: nullableTimeSchema,
    event_time_candidate_precision: temporalPrecisionSchema,
    confidence: z.string(), uncertainty: z.string(), status: recordStatusSchema, origin: originSchema,
  })),
  time_candidates: z.array(z.object({
    candidate_id: z.string().min(1),
    candidate_type: z.enum(["event_time_candidate", "assertion_time_candidate"]),
    text: z.string().min(1),
    source_ids: z.array(z.string()),
    time_candidate: nullableTimeSchema,
    time_candidate_precision: temporalPrecisionSchema,
    confidence: z.string(),
    uncertainty: z.string(),
    status: z.literal("candidate"),
    origin: z.literal("live_api"),
  })),
  claim_occurrences: z.array(occurrenceSchema),
  candidate_claim_families: z.array(familySchema),
  relation_candidates: z.array(relationSchema).max(64),
  evidence_claim_review_links: z.array(evidenceClaimReviewLinkSchema).max(32).default([]),
  evidence_claim_link_work_summary: evidenceClaimLinkWorkSummarySchema
    .default(emptyEvidenceClaimLinkWorkSummary()),
  event_timeline_rows: z.array(z.object({
    timeline_row_id: z.string().min(1), occurrence_ids: z.array(z.string()), summary: z.string().min(1),
    event_time: nullableTimeSchema, event_time_precision: temporalPrecisionSchema,
    actor_assertion_time: nullableTimeSchema, actor_assertion_time_precision: temporalPrecisionSchema,
    publication_time: nullableTimeSchema, publication_time_precision: temporalPrecisionSchema,
    retrieval_time: z.string().min(1), retrieval_time_precision: z.literal("instant"),
    display_time_axis: z.enum(["event_time", "actor_assertion_time", "publication_time", "retrieval_time"]),
    display_time: z.string().min(1), display_time_precision: z.enum(["day", "instant"]),
    time_inference: z.literal("none"), status: recordStatusSchema,
  })),
  claim_lineage_rows: z.array(z.object({
    lineage_row_id: z.string().min(1), family_id: z.string().nullable(), relation_id: z.string().min(1),
    from_occurrence_id: z.string().min(1), to_occurrence_id: z.string().min(1),
    relation_type: z.enum(RELATION_TYPES), summary: z.string().min(1),
    status: z.literal("candidate"), review_status: z.literal("pending_review"),
  })),
  current_source_bound_candidate_synthesis: z.array(z.string().min(1)),
  unresolved_questions: z.array(z.object({
    question_id: z.string().min(1), question: z.string().min(1), related_ids: z.array(z.string()),
    status: z.literal("unresolved"), record_status: recordStatusSchema, origin: originSchema,
  })),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  candidate_canonical_boundary: z.object({
    canonical_mutation: z.literal("none"),
    deterministic_fixture_records_may_be_canonical: z.literal(true),
    live_and_inferred_records: z.literal("candidate_review_only"),
    browser_selection_can_mutate_canonical: z.literal(false),
    confidence_can_promote_to_canonical: z.literal(false),
  }),
  bounded_work_summary: z.object({
    occurrence_count: z.number().int().min(0), theoretical_pair_count: z.number().int().min(0),
    configured_maximum_pair_count: z.number().int().positive(), prefilter_candidate_count: z.number().int().min(0),
    filtered_out_count: z.number().int().min(0), deferred_pair_count: z.number().int().min(0),
    model_classified_count: z.literal(0), unrelated_count: z.number().int().min(0),
    unresolved_or_insufficient_evidence_count: z.number().int().min(0), configured_bound_reached: z.boolean(),
  }),
  focused_detail_lookup_keys: z.array(z.object({
    kind: z.enum(DETAIL_KINDS), id: z.string().min(1), key: z.string().min(1),
  })),
}).superRefine((packet, context) => {
  packet.source_snapshot_summaries.forEach((source, index) => {
    requireMatchingPrecision(
      source.published_at,
      source.published_at_precision,
      context,
      ["source_snapshot_summaries", index, "published_at_precision"],
    );
  });
  packet.actor_claims.forEach((claim, index) => {
    requireMatchingPrecision(
      claim.assertion_time_candidate,
      claim.assertion_time_candidate_precision,
      context,
      ["actor_claims", index, "assertion_time_candidate_precision"],
    );
  });
  packet.actions.forEach((action, index) => {
    requireMatchingPrecision(
      action.event_time_candidate,
      action.event_time_candidate_precision,
      context,
      ["actions", index, "event_time_candidate_precision"],
    );
  });
  packet.time_candidates.forEach((candidate, index) => {
    requireMatchingPrecision(
      candidate.time_candidate,
      candidate.time_candidate_precision,
      context,
      ["time_candidates", index, "time_candidate_precision"],
    );
  });
  packet.claim_occurrences.forEach((occurrence, index) => {
    requireMatchingPrecision(
      occurrence.assertion_time_candidate,
      occurrence.assertion_time_candidate_precision,
      context,
      ["claim_occurrences", index, "assertion_time_candidate_precision"],
    );
    requireMatchingPrecision(
      occurrence.event_time_candidate,
      occurrence.event_time_candidate_precision,
      context,
      ["claim_occurrences", index, "event_time_candidate_precision"],
    );
    requireMatchingPrecision(
      occurrence.source_publication_time,
      occurrence.source_publication_time_precision,
      context,
      ["claim_occurrences", index, "source_publication_time_precision"],
    );
  });
  packet.event_timeline_rows.forEach((row, index) => {
    requireMatchingPrecision(
      row.event_time,
      row.event_time_precision,
      context,
      ["event_timeline_rows", index, "event_time_precision"],
    );
    requireMatchingPrecision(
      row.actor_assertion_time,
      row.actor_assertion_time_precision,
      context,
      ["event_timeline_rows", index, "actor_assertion_time_precision"],
    );
    requireMatchingPrecision(
      row.publication_time,
      row.publication_time_precision,
      context,
      ["event_timeline_rows", index, "publication_time_precision"],
    );
    const selectedPrecision = row.display_time_axis === "event_time"
      ? row.event_time_precision
      : row.display_time_axis === "actor_assertion_time"
        ? row.actor_assertion_time_precision
        : row.display_time_axis === "publication_time"
          ? row.publication_time_precision
          : row.retrieval_time_precision;
    if (selectedPrecision !== row.display_time_precision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["event_timeline_rows", index, "display_time_precision"],
        message: "display precision must match the selected time axis",
      });
    }
  });

  const linkIds = new Set<string>();
  const linkCountsByEvidence = new Map<string, number>();
  packet.evidence_claim_review_links.forEach((link, index) => {
    if (linkIds.has(link.link_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence_claim_review_links", index, "link_id"],
        message: "review-link IDs must be unique",
      });
    }
    linkIds.add(link.link_id);
    const evidence = link.evidence_record_kind === "finding"
      ? packet.source_bound_findings.find((item) => item.finding_id === link.evidence_record_id)
      : packet.actions.find((item) => item.action_id === link.evidence_record_id);
    const evidenceSource = packet.source_snapshot_summaries.find(
      (item) => item.source_id === link.evidence_source_id,
    );
    if (!evidence || !evidence.source_ids.includes(link.evidence_source_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence_claim_review_links", index, "evidence_record_id"],
        message: "review-link evidence endpoint must resolve to its exact source-bound record",
      });
    }
    const occurrence = packet.claim_occurrences.find(
      (item) => item.occurrence_id === link.claim_occurrence_id,
    );
    if (
      !occurrence
      || occurrence.claim_id !== link.claim_id
      || occurrence.source_id !== link.claim_source_id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence_claim_review_links", index, "claim_occurrence_id"],
        message: "review-link claim endpoint must resolve to its exact actor-claim occurrence",
      });
    }
    if (
      link.evidence_support_reference.source_id !== link.evidence_source_id
      || link.evidence_support_reference.snapshot_id !== evidenceSource?.snapshot_id
      || link.claim_support_reference.source_id !== link.claim_source_id
      || link.claim_support_reference.snapshot_id !== occurrence?.snapshot_id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence_claim_review_links", index],
        message: "review-link support references must remain source-local to both endpoints",
      });
    }
    const evidenceKey = `${link.evidence_record_kind}:${link.evidence_record_id}`;
    linkCountsByEvidence.set(evidenceKey, (linkCountsByEvidence.get(evidenceKey) ?? 0) + 1);
    const sortedTopics = [...link.shared_topic_tokens].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    if (
      new Set(link.shared_topic_tokens).size !== link.shared_topic_tokens.length
      || sortedTopics.some((token, tokenIndex) => token !== link.shared_topic_tokens[tokenIndex])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence_claim_review_links", index, "shared_topic_tokens"],
        message: "review-link topic tokens must be unique and code-point ordered",
      });
    }
  });
  const linkSummary = packet.evidence_claim_link_work_summary;
  const compatibilityDefault = packet.evidence_claim_review_links.length === 0
    && linkSummary.evidence_record_count === 0
    && linkSummary.claim_occurrence_count === 0
    && linkSummary.theoretical_pair_count === 0
    && linkSummary.prefilter_candidate_count === 0;
  if (
    linkSummary.selected_link_count !== packet.evidence_claim_review_links.length
    || linkSummary.prefilter_candidate_count
      !== linkSummary.selected_link_count + linkSummary.deferred_link_count
    || linkSummary.theoretical_pair_count
      !== linkSummary.prefilter_candidate_count + linkSummary.filtered_out_count
    || linkSummary.configured_bound_reached !== (linkSummary.deferred_link_count > 0)
    || linkSummary.selected_link_count > linkSummary.configured_maximum_link_count
    || [...linkCountsByEvidence.values()].some(
      (count) => count > linkSummary.configured_maximum_links_per_evidence_record,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidence_claim_link_work_summary"],
      message: "review-link bounded-work accounting is inconsistent",
    });
  }

  if (
    !compatibilityDefault
    && (
      linkSummary.evidence_record_count
        !== packet.source_bound_findings.length + packet.actions.length
      || linkSummary.claim_occurrence_count !== packet.claim_occurrences.length
      || linkSummary.theoretical_pair_count
        !== linkSummary.evidence_record_count * linkSummary.claim_occurrence_count
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidence_claim_link_work_summary"],
      message: "review-link workload counts must match the typed packet lanes",
    });
  }

  if (packet.mode !== "live" && packet.evidence_claim_review_links.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidence_claim_review_links"],
      message: "only live packets may contain evidence-to-claim review links",
    });
  }

  if (packet.mode === "deterministic") {
    if (packet.discovery_profile !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discovery_profile"],
        message: "prepared deterministic packets do not represent a live discovery profile",
      });
    }
    if (packet.coverage_summary.coverage_basis !== "prepared_fixture") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverage_summary", "coverage_basis"],
        message: "prepared deterministic packets require prepared fixture coverage",
      });
    }
    return;
  }

  if (packet.discovery_profile === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discovery_profile"],
      message: "live attempts require the requested discovery profile",
    });
  }

  if (packet.mode === "live") {
    if (packet.coverage_summary.coverage_basis !== "live_discovery") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverage_summary", "coverage_basis"],
        message: "live packets require live discovery coverage telemetry",
      });
    } else if (packet.coverage_summary.discovery_profile !== packet.discovery_profile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverage_summary", "discovery_profile"],
        message: "live discovery coverage profile must match the requested profile",
      });
    }
    return;
  }

  if (packet.coverage_summary.coverage_basis !== "prepared_fixture") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage_summary", "coverage_basis"],
      message: "fallback packets require prepared fixture coverage",
    });
  }
});

const sourceSupportedRelationSignalSchema = z.object({
  relation_candidate_id: z.string().min(1),
  supported_relation_type: z.literal("supersedes"),
  from_occurrence_id: z.string().min(1),
  to_occurrence_id: z.string().min(1),
  support_status: z.literal("direct_source_support"),
  review_status: z.literal("pending_review"),
  statement_source_id: z.string().min(1),
  statement_snapshot_id: z.string().min(1),
  statement_excerpt: z.string().min(1).max(560).refine(
    (value) => value.trim().length > 0,
    "statement excerpt must contain non-whitespace text",
  ),
  target_source_id: z.string().min(1),
  target_snapshot_id: z.string().min(1),
}).strict();

export const siteReadyCasePacketV1Schema = z.intersection(
  z.object({
    contract_version: z.literal("site_ready_case_packet.v1"),
  }),
  siteReadyCasePacketBaseSchema,
) satisfies z.ZodType<SiteReadyCasePacketV1>;

export const siteReadyCasePacketV2Schema = z.intersection(
  z.object({
    contract_version: z.literal("site_ready_case_packet.v2"),
    source_supported_relation_signals: z.array(sourceSupportedRelationSignalSchema).max(1),
  }),
  siteReadyCasePacketBaseSchema,
).superRefine((packet, context) => {
  packet.source_supported_relation_signals.forEach((signal, signalIndex) => {
    const signalPath = ["source_supported_relation_signals", signalIndex];
    const relations = packet.relation_candidates.filter(
      (relation) => relation.relation_id === signal.relation_candidate_id,
    );
    const relation = relations[0];
    if (
      relations.length !== 1
      || relation.relation_type !== "unresolved"
      || relation.review_status !== "pending_review"
      || relation.status !== "candidate"
      || relation.insufficient_evidence !== true
      || relation.generated_by !== "deterministic_rule"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...signalPath, "relation_candidate_id"],
        message: "source-supported signal must resolve to one unchanged unresolved relation candidate",
      });
      return;
    }

    const fromOccurrences = packet.claim_occurrences.filter(
      (occurrence) => occurrence.occurrence_id === signal.from_occurrence_id,
    );
    const toOccurrences = packet.claim_occurrences.filter(
      (occurrence) => occurrence.occurrence_id === signal.to_occurrence_id,
    );
    const from = fromOccurrences[0];
    const to = toOccurrences[0];
    const relationEndpoints = new Set([
      relation.left_occurrence_id,
      relation.right_occurrence_id,
    ]);
    if (
      signal.from_occurrence_id === signal.to_occurrence_id
      || fromOccurrences.length !== 1
      || toOccurrences.length !== 1
      || relationEndpoints.size !== 2
      || !relationEndpoints.has(signal.from_occurrence_id)
      || !relationEndpoints.has(signal.to_occurrence_id)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: signalPath,
        message: "source-supported signal endpoints must resolve uniquely to the relation pair",
      });
      return;
    }

    if (
      from.source_id !== signal.statement_source_id
      || from.snapshot_id !== signal.statement_snapshot_id
      || to.source_id !== signal.target_source_id
      || to.snapshot_id !== signal.target_snapshot_id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: signalPath,
        message: "source-supported signal provenance must match its directed occurrence endpoints",
      });
    }

    const statementSources = packet.source_snapshot_summaries.filter(
      (source) => source.source_id === signal.statement_source_id,
    );
    const targetSources = packet.source_snapshot_summaries.filter(
      (source) => source.source_id === signal.target_source_id,
    );
    if (
      statementSources.length !== 1
      || statementSources[0].snapshot_id !== signal.statement_snapshot_id
      || targetSources.length !== 1
      || targetSources[0].snapshot_id !== signal.target_snapshot_id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: signalPath,
        message: "source-supported signal source summaries must resolve uniquely",
      });
    }
  });
}) satisfies z.ZodType<SiteReadyCasePacketV2>;

const siteReadyCasePacketUnionSchema = z.union([
  siteReadyCasePacketV1Schema,
  siteReadyCasePacketV2Schema,
]);

const SOURCE_SUPPORTED_SIGNAL_FIELDS = new Set([
  "relation_candidate_id",
  "supported_relation_type",
  "from_occurrence_id",
  "to_occurrence_id",
  "support_status",
  "review_status",
  "statement_source_id",
  "statement_snapshot_id",
  "statement_excerpt",
  "target_source_id",
  "target_snapshot_id",
]);

const EVIDENCE_CLAIM_REVIEW_LINK_FIELDS = new Set([
  "link_id",
  "evidence_record_kind",
  "evidence_record_id",
  "evidence_source_id",
  "claim_occurrence_id",
  "claim_id",
  "claim_source_id",
  "link_semantics",
  "link_basis",
  "shared_topic_tokens",
  "reason",
  "evidence_support_reference",
  "claim_support_reference",
  "review_status",
  "status",
  "generated_by",
  "origin",
]);

const INTERNAL_PUBLIC_PACKET_FIELDS = [
  "source_supported_target_identity_proofs",
  "source_supported_relation_assessments",
] as const;

export const siteReadyCasePacketSchema = z.unknown().superRefine((input, context) => {
  if (!isUnknownRecord(input)) return;
  const contractVersion = input.contract_version;
  if (
    contractVersion === "site_ready_case_packet.v1"
    && "source_supported_relation_signals" in input
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source_supported_relation_signals"],
      message: "Site packet v1 cannot contain the v2 source-supported overlay",
    });
  }
  for (const field of INTERNAL_PUBLIC_PACKET_FIELDS) {
    if (!(field in input)) continue;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: "internal source-supported sidecars cannot enter a public Site packet",
    });
  }
  requireExactObjectArrayFields(
    input.source_supported_relation_signals,
    SOURCE_SUPPORTED_SIGNAL_FIELDS,
    "source_supported_relation_signals",
    context,
  );
  requireExactObjectArrayFields(
    input.evidence_claim_review_links,
    EVIDENCE_CLAIM_REVIEW_LINK_FIELDS,
    "evidence_claim_review_links",
    context,
  );
}).pipe(siteReadyCasePacketUnionSchema) satisfies z.ZodType<SiteReadyCasePacket>;

function requireExactObjectArrayFields(
  input: unknown,
  allowedFields: ReadonlySet<string>,
  path: string,
  context: z.RefinementCtx,
): void {
  if (!Array.isArray(input)) return;
  input.forEach((item, index) => {
    if (!isUnknownRecord(item)) return;
    const unknownField = Object.keys(item).find((field) => !allowedFields.has(field));
    if (!unknownField) return;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path, index, unknownField],
      message: `${path} entries cannot contain additional fields`,
    });
  });
}

function isUnknownRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function requireMatchingPrecision(
  value: string | null,
  precision: TemporalPrecision,
  context: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if ((value === null) === (precision === null)) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: "timestamp precision must be null exactly when its value is null",
  });
}

export function validateSiteReadyCasePacket(input: unknown): SiteReadyCasePacket {
  return siteReadyCasePacketSchema.parse(input);
}
