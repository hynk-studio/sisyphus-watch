export type RecordStatus = "candidate" | "canonical";

export type RetrievalMode = "deterministic_fixture";

export interface SourceSnapshot {
  snapshot_id: string;
  source_id: string;
  original_url: string | null;
  canonical_url: string | null;
  publisher: string;
  actor: string;
  title: string;
  published_at: string;
  event_time: string | null;
  event_time_candidates: string[];
  asserted_at: string | null;
  retrieved_at: string;
  content_sha256: string;
  retrieval_mode: RetrievalMode;
  source_text: string;
  evidence_excerpt: string;
  limitations: string[];
  source_hygiene_notes: string[];
  status: RecordStatus;
}

export type SourceSnapshotSummary = Omit<SourceSnapshot, "source_text">;

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
