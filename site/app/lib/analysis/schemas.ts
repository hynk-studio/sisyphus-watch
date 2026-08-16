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
    web_search_grounded_candidate_summary: z.string().min(1).max(500),
    discovery_lane: z.enum(DISCOVERY_LANES),
    source_context: z.enum(SOURCE_CONTEXTS),
    information_proximity: z.enum(INFORMATION_PROXIMITIES),
    why_included: z.string().min(1).max(240),
    comparison_target_source_ids: z.array(z.string().min(1).max(160)).max(8),
    limitations: z.array(z.string().min(1).max(240)).max(4),
  })
  .strict();

export const DiscoveryOutputSchema = z
  .object({
    sources: z.array(DiscoverySourceSchema).max(MAX_SOURCE_LIMIT),
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
    text: z.string().min(1).max(320),
    supporting_summary_span: z.string().min(1).max(360),
    time_candidate: z.string().max(64).nullable(),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
    uncertainty: z.string().max(240),
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
export type CandidateProposal = z.infer<typeof CandidateProposalSchema>;
export type SourceExtractionOutput = z.infer<typeof SourceExtractionOutputSchema>;
