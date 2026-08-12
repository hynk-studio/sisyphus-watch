import { z } from "zod";
import {
  DEFAULT_SOURCE_LIMIT,
  MAX_CANDIDATES_PER_SOURCE,
  MAX_QUESTION_LENGTH,
  MAX_SOURCE_LIMIT,
  MIN_QUESTION_LENGTH,
} from "./contracts";

export const AnalysisRequestSchema = z
  .object({
    question: z.string(),
    sourceLimit: z.number().int().min(1).max(MAX_SOURCE_LIMIT).optional(),
  })
  .strict();

export const NormalizedAnalysisRequestSchema = z.object({
  question: z.string().min(MIN_QUESTION_LENGTH).max(MAX_QUESTION_LENGTH),
  sourceLimit: z.number().int().min(1).max(MAX_SOURCE_LIMIT).default(DEFAULT_SOURCE_LIMIT),
});

export const DiscoverySourceSchema = z
  .object({
    title: z.string().min(1).max(300),
    url: z.string().min(1).max(2048),
    publisher: z.string().max(160).nullable(),
    published_at: z.string().max(64).nullable(),
    evidence_excerpt: z.string().min(1).max(500),
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
    text: z.string().min(1).max(320),
    evidence_reference: z.string().min(1).max(2048),
    evidence_excerpt: z.string().min(1).max(360),
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
