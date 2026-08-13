import { z } from "zod";
import type {
  AnalysisMode,
  AnalysisSourceSummary,
  CandidateConfidence,
} from "../analysis/contracts";
import type { RecordStatus } from "../contracts";
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
  event_time_candidate: string | null;
  source_publication_time: string | null;
  source_retrieval_time: string;
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
  actor_assertion_time: string | null;
  publication_time: string | null;
  retrieval_time: string;
  display_time_axis:
    | "event_time"
    | "actor_assertion_time"
    | "publication_time"
    | "retrieval_time";
  display_time: string;
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

export interface SiteReadyCasePacket {
  contract_version: "site_ready_case_packet.v1";
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
const nullableTimeSchema = z.string().min(1).nullable();
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
  event_time_candidate: nullableTimeSchema,
  source_publication_time: nullableTimeSchema,
  source_retrieval_time: z.string().min(1),
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

const sourceSchema = z.object({
  source_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().nullable(),
  domain: z.string().min(1),
  publisher: z.string().min(1),
  published_at: nullableTimeSchema,
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

export const siteReadyCasePacketSchema = z.object({
  contract_version: z.literal("site_ready_case_packet.v1"),
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
    confidence: z.string(), uncertainty: z.string(), status: recordStatusSchema, origin: originSchema,
  })),
  actions: z.array(z.object({
    action_id: z.string().min(1), actor: z.string().min(1).max(200).nullable(), action_text: z.string().min(1),
    source_ids: z.array(z.string()), event_time_candidate: nullableTimeSchema,
    confidence: z.string(), uncertainty: z.string(), status: recordStatusSchema, origin: originSchema,
  })),
  time_candidates: z.array(z.object({
    candidate_id: z.string().min(1),
    candidate_type: z.enum(["event_time_candidate", "assertion_time_candidate"]),
    text: z.string().min(1),
    source_ids: z.array(z.string()),
    time_candidate: nullableTimeSchema,
    confidence: z.string(),
    uncertainty: z.string(),
    status: z.literal("candidate"),
    origin: z.literal("live_api"),
  })),
  claim_occurrences: z.array(occurrenceSchema),
  candidate_claim_families: z.array(familySchema),
  relation_candidates: z.array(relationSchema).max(64),
  event_timeline_rows: z.array(z.object({
    timeline_row_id: z.string().min(1), occurrence_ids: z.array(z.string()), summary: z.string().min(1),
    event_time: nullableTimeSchema, actor_assertion_time: nullableTimeSchema,
    publication_time: nullableTimeSchema, retrieval_time: z.string().min(1),
    display_time_axis: z.enum(["event_time", "actor_assertion_time", "publication_time", "retrieval_time"]),
    display_time: z.string().min(1), time_inference: z.literal("none"), status: recordStatusSchema,
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
}) satisfies z.ZodType<SiteReadyCasePacket>;

export function validateSiteReadyCasePacket(input: unknown): SiteReadyCasePacket {
  return siteReadyCasePacketSchema.parse(input);
}
