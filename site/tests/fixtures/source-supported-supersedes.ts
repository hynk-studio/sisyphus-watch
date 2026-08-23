import type {
  AnalysisCandidate,
  AnalysisRunPacket,
  AnalysisSourceSummary,
} from "../../app/lib/analysis/contracts";
import { emptyCandidateCounts } from "../../app/lib/analysis/contracts";
import { buildCoverageSummary } from "../../app/lib/source-profile";
import { version18RelationAdmissionRun } from "./version18-relation-admission";

const RETRIEVED_AT = "2026-08-23T00:00:00.000Z";

export interface SourceSupportedSupersedesFixtureOptions {
  ownerTitle?: string;
  targetTitle?: string;
  ownerPublishedAt?: string;
  targetPublishedAt?: string;
}

export function sourceSupportedSupersedesAnalysisRun(
  options: SourceSupportedSupersedesFixtureOptions = {},
): AnalysisRunPacket {
  const base = version18RelationAdmissionRun();
  const target = fixtureSource(
    base.source_snapshot_summaries[0],
    "source_target",
    options.targetTitle ?? "Guidance G-1",
    options.targetPublishedAt ?? "2025-01-01T00:00:00.000Z",
  );
  const owner = fixtureSource(
    base.source_snapshot_summaries[1],
    "source_owner",
    options.ownerTitle ?? "Guidance G-2",
    options.ownerPublishedAt ?? "2026-01-01T00:00:00.000Z",
  );
  const candidates = [
    fixtureCandidate(
      base.candidates.find((candidate) => candidate.candidate_type === "actor_claim")!,
      "candidate_target",
      target,
      `Agency ${target.title} governs the lunar safety program and mission schedule.`,
    ),
    fixtureCandidate(
      base.candidates.find((candidate) => candidate.candidate_type === "actor_claim")!,
      "candidate_owner",
      owner,
      `Agency ${owner.title} governs the lunar safety program and mission schedule.`,
    ),
  ];
  const candidateCounts = emptyCandidateCounts();
  candidateCounts.actor_claim = candidates.length;
  return {
    run_id: "run_source_supported_supersedes_fixture",
    case_id: "case_source_supported_supersedes_fixture",
    mode: "live",
    status: "live",
    normalized_question:
      "How did the agency's current guidance change the earlier guidance?",
    requested_source_limit: 3,
    actual_source_count: 2,
    discovery_profile: "standard",
    coverage_summary: buildCoverageSummary({
      discoveryProfile: "standard",
      requestedSourceLimit: 3,
      baselineRequested: 2,
      expansionRequested: 0,
      sources: [target, owner],
      duplicateURLCount: 0,
      expansionAttempted: false,
      expansionCompletedSuccessfully: false,
    }),
    source_snapshot_summaries: [target, owner],
    candidate_counts: candidateCounts,
    candidate_ids: candidates.map((candidate) => candidate.candidate_id),
    candidates,
    warnings: [],
    limitations: ["Deterministic BFG8Y1A internal assessment fixture only."],
    canonical_mutation: "none",
    focused_detail_lookup_keys: [],
  };
}

function fixtureSource(
  base: AnalysisSourceSummary,
  sourceId: string,
  title: string,
  publishedAt: string,
): AnalysisSourceSummary {
  return {
    ...structuredClone(base),
    source_id: sourceId,
    snapshot_id: `snapshot_${sourceId}`,
    title,
    url: `https://${sourceId.replaceAll("_", "-")}.example/document`,
    domain: `${sourceId.replaceAll("_", "-")}.example`,
    publisher: "Agency",
    published_at: publishedAt,
    published_at_precision: "day",
    retrieved_at: RETRIEVED_AT,
    source_text_captured: false,
    content_sha256: null,
    candidate_summary_sha256: "c".repeat(64),
    evidence_excerpt: null,
    web_search_grounded_candidate_summary:
      `Agency summary for ${title} and the lunar safety program.`,
    source_selection: {
      ...structuredClone(base.source_selection),
      comparison_target_source_ids: [],
    },
  };
}

function fixtureCandidate(
  base: AnalysisCandidate,
  candidateId: string,
  source: AnalysisSourceSummary,
  text: string,
): AnalysisCandidate {
  return {
    ...structuredClone(base),
    candidate_id: candidateId,
    source_id: source.source_id,
    snapshot_id: source.snapshot_id,
    candidate_type: "actor_claim",
    actor: "Agency",
    text,
    evidence_reference: source.url ?? "",
    supporting_summary_span: text,
    source_reference: {
      source_id: source.source_id,
      snapshot_id: source.snapshot_id,
      url: source.url ?? "",
      title: source.title,
      kind: "url_citation",
    },
    time_candidate: null,
    time_candidate_precision: null,
    generated_at: RETRIEVED_AT,
  };
}
