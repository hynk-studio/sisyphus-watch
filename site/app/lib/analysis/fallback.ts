import { getPreparedCase } from "../read-model";
import {
  buildPreparedFixtureCoverageSummary,
  type DiscoveryProfile,
} from "../source-profile";
import type { AnalysisRunPacket, AnalysisSourceSummary } from "./contracts";
import { emptyCandidateCounts } from "./contracts";
import { shortStableHash } from "./ids";

const PREPARED_CASE_ID = "city_heatwave_cooling_centers";

export async function buildFallbackPacket(input: {
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
  generatedAt: string;
  reasonCode: string;
  reasonMessage: string;
}): Promise<AnalysisRunPacket> {
  const preparedCase = getPreparedCase(PREPARED_CASE_ID);
  const runHash = await shortStableHash(
    `${input.question}|${input.sourceLimit}|${input.discoveryProfile}|${input.generatedAt}`,
  );
  const sources: AnalysisSourceSummary[] = preparedCase.sources.map((source) => ({
    source_id: source.source_id,
    snapshot_id: source.snapshot_id,
    title: source.title,
    url: source.canonical_url ?? source.original_url,
    domain: source.canonical_url
      ? new URL(source.canonical_url).hostname
      : "deterministic.fixture",
    publisher: source.publisher,
    published_at: source.published_at,
    retrieved_at: source.retrieved_at,
    snapshot_status: source.snapshot_status,
    retrieval_mode: source.retrieval_mode,
    content_kind: source.content_kind,
    source_text_captured:
      source.content_kind === "captured_fixture_source_text",
    content_sha256: source.content_sha256,
    candidate_summary_sha256: source.candidate_summary_sha256,
    record_status: source.status,
    evidence_excerpt: source.evidence_excerpt,
    web_search_grounded_candidate_summary:
      source.web_search_grounded_candidate_summary,
    limitations: source.limitations,
    api_provenance: source.api_provenance,
    source_selection: source.source_selection,
  }));

  const coverageSummary = buildPreparedFixtureCoverageSummary({
    sources,
  });

  return {
    run_id: `run_fallback_${runHash}`,
    case_id: preparedCase.case_id,
    mode: "fallback",
    status: "fallback",
    normalized_question: input.question,
    requested_source_limit: input.sourceLimit,
    actual_source_count: sources.length,
    discovery_profile: input.discoveryProfile,
    coverage_summary: coverageSummary,
    source_snapshot_summaries: sources,
    candidate_counts: emptyCandidateCounts(),
    candidate_ids: [],
    candidates: [],
    warnings: [`${input.reasonCode}: ${input.reasonMessage}`],
    limitations: [
      ...preparedCase.limitations,
      "The live attempt did not change or replace the accepted prepared case.",
    ],
    canonical_mutation: "none",
    focused_detail_lookup_keys: sources.map((source) => source.source_id),
  };
}
