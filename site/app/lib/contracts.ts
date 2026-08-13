import type { SourceSelectionMetadata } from "./source-profile";

export type RecordStatus = "candidate" | "canonical";

export type RetrievalMode = "deterministic_fixture" | "openai_web_search";

export type SnapshotStatus = "full" | "partial" | "failed";

export type SnapshotContentKind =
  | "captured_fixture_source_text"
  | "model_generated_web_search_summary";

export interface SearchProvenance {
  provider: "openai";
  search_call_id: string;
  provider_source_included: boolean;
  citation_title: string | null;
  citation_start: number | null;
  citation_end: number | null;
}

interface SourceSnapshotBase {
  snapshot_id: string;
  source_id: string;
  original_url: string | null;
  canonical_url: string | null;
  publisher: string;
  actor: string;
  title: string;
  published_at: string | null;
  event_time: string | null;
  event_time_candidates: string[];
  asserted_at: string | null;
  retrieved_at: string;
  limitations: string[];
  source_hygiene_notes: string[];
  source_selection: SourceSelectionMetadata;
  status: RecordStatus;
}

export interface CapturedFixtureSourceSnapshot extends SourceSnapshotBase {
  original_url: null;
  canonical_url: null;
  retrieval_mode: "deterministic_fixture";
  snapshot_status: "full";
  content_kind: "captured_fixture_source_text";
  content_sha256: string;
  candidate_summary_sha256: null;
  source_text: string;
  evidence_excerpt: string;
  web_search_grounded_candidate_summary: null;
  api_provenance: null;
}

export interface WebSearchPartialSourceSnapshot extends SourceSnapshotBase {
  original_url: string;
  canonical_url: string;
  retrieval_mode: "openai_web_search";
  snapshot_status: "partial";
  content_kind: "model_generated_web_search_summary";
  content_sha256: null;
  candidate_summary_sha256: string;
  source_text: null;
  evidence_excerpt: null;
  web_search_grounded_candidate_summary: string;
  api_provenance: SearchProvenance;
  status: "candidate";
}

export type SourceSnapshot =
  | CapturedFixtureSourceSnapshot
  | WebSearchPartialSourceSnapshot;

type WithoutSourceText<T> = T extends unknown ? Omit<T, "source_text"> : never;

export type SourceSnapshotSummary = WithoutSourceText<SourceSnapshot>;

export interface SourceBoundFinding {
  finding_id: string;
  text: string;
  source_ids: string[];
  confidence: string;
}

export interface ActorClaim {
  claim_id: string;
  actor: string;
  claim_text: string;
  source_ids: string[];
  asserted_at: string;
  status: string;
  record_status: RecordStatus;
}

export interface PreparedAction {
  action_id: string;
  actor: string;
  action_text: string;
  occurred_at: string;
  source_ids: string[];
}

export interface TimelineRow {
  timeline_id: string;
  occurred_at: string;
  trigger: string;
  summary: string;
  evidence_ids: string[];
  judgment_at_time: string;
}

export interface ClaimLineagePlaceholder {
  lineage_id: string;
  claim_id: string;
  from_status: string;
  to_status: string;
  direction: string;
  driver_evidence_ids: string[];
  note: string;
}

export interface UnresolvedQuestion {
  question_id: string;
  question: string;
  status: "unresolved";
  related_ids: string[];
}

export interface PreparedCaseReadModel {
  case_id: string;
  title: string;
  problem_statement: string;
  status: RecordStatus;
  prepared_at: string;
  deterministic: true;
  requires_api_key: false;
  network_used: false;
  source_bound_summary: string[];
  sources: SourceSnapshotSummary[];
  findings: SourceBoundFinding[];
  actor_claims: ActorClaim[];
  actions: PreparedAction[];
  timeline: TimelineRow[];
  claim_lineage: ClaimLineagePlaceholder[];
  unresolved_questions: UnresolvedQuestion[];
  limitations: string[];
}

export type FocusKind = "source" | "claim" | "timeline" | "question";

export interface PreparedCaseDetail<T = unknown> {
  case_id: string;
  focus_kind: FocusKind;
  focus_id: string;
  detail: T;
}
