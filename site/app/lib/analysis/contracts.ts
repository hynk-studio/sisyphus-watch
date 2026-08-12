import type { SearchProvenance, SnapshotStatus } from "../contracts";

export const DEFAULT_SOURCE_LIMIT = 5;
export const MAX_SOURCE_LIMIT = 8;
export const MIN_QUESTION_LENGTH = 12;
export const MAX_QUESTION_LENGTH = 500;
export const MAX_CANDIDATES_PER_SOURCE = 8;

export type AnalysisMode = "deterministic" | "live" | "fallback";
export type AnalysisStatus = "live" | "fallback";

export type CandidateType =
  | "finding"
  | "actor_claim"
  | "action"
  | "event_time_candidate"
  | "assertion_time_candidate"
  | "unresolved_question"
  | "source_hygiene";

export type CandidateConfidence = "high" | "medium" | "low" | "unknown";

export interface AnalysisCandidate {
  candidate_id: string;
  source_id: string;
  snapshot_id: string;
  candidate_type: CandidateType;
  text: string;
  evidence_reference: string;
  evidence_excerpt: string;
  time_candidate: string | null;
  confidence: CandidateConfidence;
  uncertainty: string;
  model: string;
  api_path: "responses.parse";
  generated_at: string;
  validation_status: "validated";
  mode: "live_api";
  status: "candidate";
}

export interface AnalysisSourceSummary {
  source_id: string;
  snapshot_id: string;
  title: string;
  url: string | null;
  domain: string;
  publisher: string;
  published_at: string | null;
  retrieved_at: string;
  snapshot_status: SnapshotStatus;
  retrieval_mode: "deterministic_fixture" | "openai_web_search";
  record_status: "candidate" | "canonical";
  evidence_excerpt: string;
  limitations: string[];
  api_provenance: SearchProvenance | null;
}

export type CandidateCounts = Record<CandidateType, number>;

export interface AnalysisRunPacket {
  run_id: string;
  case_id: string;
  mode: AnalysisMode;
  status: AnalysisStatus;
  normalized_question: string;
  requested_source_limit: number;
  actual_source_count: number;
  source_snapshot_summaries: AnalysisSourceSummary[];
  candidate_counts: CandidateCounts;
  candidate_ids: string[];
  candidates: AnalysisCandidate[];
  warnings: string[];
  limitations: string[];
  canonical_mutation: "none";
  focused_detail_lookup_keys: string[];
}

export interface AnalysisErrorPacket {
  mode: "fallback";
  status: "error";
  error: {
    code: string;
    message: string;
  };
  canonical_mutation: "none";
}

export type AnalysisRoutePayload = AnalysisRunPacket | AnalysisErrorPacket;

export const CANDIDATE_TYPES: CandidateType[] = [
  "finding",
  "actor_claim",
  "action",
  "event_time_candidate",
  "assertion_time_candidate",
  "unresolved_question",
  "source_hygiene",
];

export function emptyCandidateCounts(): CandidateCounts {
  return {
    finding: 0,
    actor_claim: 0,
    action: 0,
    event_time_candidate: 0,
    assertion_time_candidate: 0,
    unresolved_question: 0,
    source_hygiene: 0,
  };
}
