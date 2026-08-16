import type {
  FocusKind,
  PreparedCaseDetail,
  PreparedCaseReadModel,
  SourceSnapshotSummary,
} from "./contracts";
import {
  actions,
  actorClaims,
  CASE_ID,
  claimLineage,
  findings,
  PREPARED_AT,
  sources,
  timeline,
  unresolvedQuestions,
} from "./prepared-case";

const sourceSummaries: SourceSnapshotSummary[] = sources.map(
  ({ source_text: sourceText, ...summary }) => {
    void sourceText;
    return summary;
  },
);

const preparedCase: PreparedCaseReadModel = {
  case_id: CASE_ID,
  title: "City Heatwave Cooling Centers: Public Claim vs Access Reality",
  problem_statement:
    "Public safety guidance can look complete while real-world access changes underneath it. Sisyphus Watch keeps claims, observations, corrections, and open questions visibly separate.",
  status: "canonical",
  prepared_at: PREPARED_AT,
  deterministic: true,
  requires_api_key: false,
  network_used: false,
  source_bound_summary: [
    "A fictional city announced 50 cooling centers during a severe heatwave.",
    "A community group later reported closures, limited hours, weak signage, and transport barriers in a sampled set of locations.",
    "The city updated the list and added transport support, suggesting partial remediation while resident-level impact remains unresolved.",
  ],
  sources: sourceSummaries,
  findings,
  actor_claims: actorClaims,
  actions,
  timeline,
  claim_lineage: claimLineage,
  unresolved_questions: unresolvedQuestions,
  limitations: [
    "This is a synthetic community-impact fixture, not real news.",
    "The prepared record does not start external discovery, call a provider API, or independently verify the fixture.",
    "Accepted within the prepared record does not mean final truth.",
    "The compact read model excludes full source text; focused detail returns one bounded fixture record.",
  ],
};

export function listPreparedCases(): PreparedCaseReadModel[] {
  return [preparedCase];
}

export function getPreparedCase(caseId: string): PreparedCaseReadModel {
  if (caseId !== CASE_ID) {
    throw new Error(`Unknown prepared case: ${caseId}`);
  }
  return preparedCase;
}

export function getPreparedCaseDetail(
  caseId: string,
  focusKind: FocusKind,
  focusId: string,
): PreparedCaseDetail | null {
  getPreparedCase(caseId);

  const detail = findFocusedDetail(focusKind, focusId);

  return detail
    ? { case_id: caseId, focus_kind: focusKind, focus_id: focusId, detail }
    : null;
}

function findFocusedDetail(focusKind: FocusKind, focusId: string): unknown {
  switch (focusKind) {
    case "source":
      return sources.find((entry) => entry.source_id === focusId);
    case "claim":
      return actorClaims.find((entry) => entry.claim_id === focusId);
    case "timeline":
      return timeline.find((entry) => entry.timeline_id === focusId);
    case "question":
      return unresolvedQuestions.find((entry) => entry.question_id === focusId);
  }
}
