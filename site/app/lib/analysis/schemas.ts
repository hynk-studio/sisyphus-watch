import { z } from "zod";
import {
  MAX_CANDIDATES_PER_SOURCE,
  MAX_QUESTION_LENGTH,
  MAX_SOURCE_LIMIT,
  MIN_QUESTION_LENGTH,
  PUBLIC_DEFAULT_SOURCE_LIMIT,
  PUBLIC_MAX_SOURCE_LIMIT,
} from "./contracts";
import {
  DISCOVERY_LANES,
  DISCOVERY_PROFILES,
  INFORMATION_PROXIMITIES,
  SOURCE_CONTEXTS,
} from "../source-profile";

export const WEB_SEARCH_CANDIDATE_SUMMARY_MAX_LENGTH = 500;
export const SOURCE_SELECTION_RATIONALE_MAX_LENGTH = 240;

export const AnalysisRequestSchema = z
  .object({
    question: z.string(),
    sourceLimit: z.number().int().min(1).max(MAX_SOURCE_LIMIT).optional(),
    discoveryProfile: z.enum(DISCOVERY_PROFILES).optional(),
  })
  .strict();

export const PublicAnalysisRequestSchema = z
  .object({
    question: z.string(),
    sourceLimit: z.number().int().min(1).max(PUBLIC_MAX_SOURCE_LIMIT).optional(),
    discoveryProfile: z.enum(DISCOVERY_PROFILES).optional(),
  })
  .strict();

export const NormalizedAnalysisRequestSchema = z.object({
  question: z.string().min(MIN_QUESTION_LENGTH).max(MAX_QUESTION_LENGTH),
  sourceLimit: z.number().int().min(1).max(MAX_SOURCE_LIMIT),
  discoveryProfile: z.enum(DISCOVERY_PROFILES).default("standard"),
});

export const NormalizedPublicAnalysisRequestSchema = z.object({
  question: z.string().min(MIN_QUESTION_LENGTH).max(MAX_QUESTION_LENGTH),
  sourceLimit: z
    .number()
    .int()
    .min(1)
    .max(PUBLIC_MAX_SOURCE_LIMIT)
    .default(PUBLIC_DEFAULT_SOURCE_LIMIT),
  discoveryProfile: z.enum(DISCOVERY_PROFILES).default("standard"),
});

export const DiscoverySourceSchema = z
  .object({
    title: z.string().min(1).max(300),
    url: z.string().min(1).max(2048),
    publisher: z.string().max(160).nullable(),
    published_at: z.string().max(64).nullable(),
    web_search_grounded_candidate_summary: z
      .string()
      .min(1)
      .max(WEB_SEARCH_CANDIDATE_SUMMARY_MAX_LENGTH)
      .describe(
        "A concise source-specific reviewer summary written in complete sentences. Stop at a natural sentence boundary before the hard limit; never end with an unfinished clause or cut-off token.",
      ),
    discovery_lane: z.enum(DISCOVERY_LANES),
    source_context: z.enum(SOURCE_CONTEXTS),
    information_proximity: z.enum(INFORMATION_PROXIMITIES),
    why_included: z
      .string()
      .min(1)
      .max(SOURCE_SELECTION_RATIONALE_MAX_LENGTH)
      .describe(
        "A concise reviewer-facing rationale written as a complete natural phrase or sentence. Stop before the hard character bound at a natural boundary; never fill the field by cutting a clause or token.",
      ),
    comparison_target_source_ids: z.array(z.string().min(1).max(160)).max(8),
    limitations: z.array(z.string().min(1).max(240)).max(4),
  })
  .strict();

export const DiscoveryOutputSchema = z
  .object({
    sources: z.array(DiscoverySourceSchema).max(MAX_SOURCE_LIMIT),
  })
  .strict();

export const ACTOR_SEMANTIC_ROLES = [
  "performer_or_responsible_actor",
  "speaker_or_claimant",
  "recipient_target_or_beneficiary",
  "generic_or_ambiguous",
  "not_applicable",
] as const;

export const STATEMENT_SEMANTICS = [
  "concrete_performed_or_announced_action",
  "recommendation_or_instruction",
  "recipient_behavior",
  "claim_or_guidance",
  "ambiguous",
  "not_applicable",
] as const;

export const ACTOR_SPECIFICITIES = [
  "specifically_identifiable",
  "generic_or_ambiguous",
  "recipient_target_or_beneficiary",
  "not_applicable",
] as const;

export const CandidateSemanticReviewSchema = z
  .object({
    actor_role: z.enum(ACTOR_SEMANTIC_ROLES),
    statement_semantics: z.enum(STATEMENT_SEMANTICS),
    actor_specificity: z.enum(ACTOR_SPECIFICITIES),
  })
  .strict();

export const CandidateProposalSchema = z
  .object({
    candidate_type: z.enum([
      "finding",
      "actor_claim",
      "action",
      "event_time_candidate",
      "assertion_time_candidate",
      "unresolved_question",
      "source_hygiene",
    ]),
    actor: z.string().min(1).max(200).nullable(),
    text: z
      .string()
      .min(1)
      .max(320)
      .describe(
        "Complete reviewer-facing record text. Keep it concise and finish at a natural phrase or sentence boundary; never emit an unfinished clause, dangling connector, or cut-off token.",
      ),
    supporting_summary_span: z.string().min(1).max(360),
    time_candidate: z.string().max(64).nullable(),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
    uncertainty: z.string().max(240),
    semantic_review: CandidateSemanticReviewSchema,
  })
  .strict();

export const SourceExtractionOutputSchema = z
  .object({
    candidates: z.array(CandidateProposalSchema).max(MAX_CANDIDATES_PER_SOURCE),
    limitations: z.array(z.string().min(1).max(240)).max(4),
  })
  .strict();

export type DiscoveryOutput = z.infer<typeof DiscoveryOutputSchema>;
export type DiscoverySource = z.infer<typeof DiscoverySourceSchema>;
export type CandidateSemanticReview = z.infer<typeof CandidateSemanticReviewSchema>;
export type CandidateProposal = z.infer<typeof CandidateProposalSchema>;
export type SourceExtractionOutput = z.infer<typeof SourceExtractionOutputSchema>;
