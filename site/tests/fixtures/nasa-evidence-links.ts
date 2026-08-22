import type {
  AnalysisCandidate,
  AnalysisRunPacket,
  AnalysisSourceSummary,
} from "../../app/lib/analysis/contracts";
import { emptyCandidateCounts } from "../../app/lib/analysis/contracts";
import { buildCoverageSummary } from "../../app/lib/source-profile";

const RETRIEVED_AT = "2026-08-22T00:36:25.166Z";

const sourceDefinitions = [
  {
    key: "february",
    title: "NASA Adds Mission to Artemis Lunar Program, Updates Architecture",
    url: "https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/",
    publishedAt: "2026-02-27T00:00:00.000Z",
  },
  {
    key: "may",
    title: "NASA Outlines Preliminary Artemis III Mission Plans",
    url: "https://www.nasa.gov/missions/artemis/artemis-3/nasa-outlines-preliminary-artemis-iii-mission-plans/",
    publishedAt: "2026-05-13T00:00:00.000Z",
  },
  {
    key: "june",
    title: "NASA Marches Toward Artemis III Mission in 2027, Names Crew Members",
    url: "https://www.nasa.gov/news-release/nasa-marches-toward-artemis-iii-mission-in-2027-names-crew-members/",
    publishedAt: "2026-06-09T00:00:00.000Z",
  },
] as const;

function source(
  definition: (typeof sourceDefinitions)[number],
): AnalysisSourceSummary {
  const sourceId = `src_nasa_${definition.key}`;
  return {
    source_id: sourceId,
    snapshot_id: `snapshot_nasa_${definition.key}_partial`,
    title: definition.title,
    url: definition.url,
    domain: "www.nasa.gov",
    publisher: "NASA",
    published_at: definition.publishedAt,
    published_at_precision: "day",
    retrieved_at: RETRIEVED_AT,
    snapshot_status: "partial",
    retrieval_mode: "openai_web_search",
    content_kind: "model_generated_web_search_summary",
    source_text_captured: false,
    content_sha256: null,
    candidate_summary_sha256: "a".repeat(64),
    record_status: "candidate",
    evidence_excerpt: null,
    web_search_grounded_candidate_summary:
      `Distilled model-generated summary for ${definition.title}.`,
    limitations: [
      "Distilled regression fixture: no captured page text or verbatim source excerpt.",
    ],
    api_provenance: null,
    source_selection: {
      discovery_pass: "baseline",
      discovery_lane: "baseline_authority",
      source_context: "official",
      information_proximity: "direct_document",
      why_included: "Official NASA update in the recovered bounded investigation.",
      classification_basis: "model_generated_web_search_classification",
      classification_status: "candidate_review_only",
      comparison_target_source_ids: [],
    },
  };
}

function candidate(
  index: number,
  sourceSummary: AnalysisSourceSummary,
  candidateType: "finding" | "actor_claim" | "action",
  text: string,
  actor: string | null = null,
): AnalysisCandidate {
  return {
    candidate_id: `candidate_nasa_${candidateType}_${String(index).padStart(2, "0")}`,
    source_id: sourceSummary.source_id,
    snapshot_id: sourceSummary.snapshot_id,
    candidate_type: candidateType,
    actor,
    text,
    evidence_reference: sourceSummary.url ?? "",
    support_kind: "model_generated_web_search_summary_span",
    supporting_summary_span: text,
    source_reference: {
      source_id: sourceSummary.source_id,
      snapshot_id: sourceSummary.snapshot_id,
      url: sourceSummary.url ?? "",
      title: sourceSummary.title,
      kind: "url_citation",
    },
    time_candidate: null,
    time_candidate_precision: null,
    confidence: "medium",
    uncertainty:
      "Distilled from an untrusted model-generated web-search summary; not captured source text.",
    model: "deterministic-regression-fixture",
    api_path: "responses.parse",
    generated_at: RETRIEVED_AT,
    validation_status: "validated",
    mode: "live_api",
    status: "candidate",
  };
}

export function nasaEvidenceLinkRun(): AnalysisRunPacket {
  const sources = sourceDefinitions.map(source);
  const [february, may, june] = sources;
  const candidates = [
    candidate(
      1,
      february,
      "finding",
      "Artemis III was moved from a planned lunar-landing role to a 2027 crewed low-Earth-orbit demonstration, and Artemis IV became the target for the first lunar landing in 2028.",
    ),
    candidate(
      2,
      may,
      "finding",
      "Artemis III was described as a crewed Earth-orbit test flight rather than a lunar landing.",
    ),
    candidate(
      3,
      may,
      "finding",
      "The mission was described as testing rendezvous and docking between Orion and commercial landers from Blue Origin and SpaceX.",
    ),
    candidate(
      4,
      may,
      "finding",
      "The stated purpose of the mission was to reduce risk before Artemis IV's planned lunar landing.",
    ),
    candidate(
      5,
      may,
      "finding",
      "The plans were characterized as preliminary, with the mission profile still being defined.",
    ),
    candidate(
      6,
      june,
      "finding",
      "The summary states that Artemis III is a crewed low-Earth-orbit test mission planned for 2027.",
    ),
    candidate(
      7,
      june,
      "finding",
      "The summary states that Artemis IV is the first planned crewed mission to the lunar South Pole in 2028.",
    ),
    candidate(
      8,
      june,
      "finding",
      "The summary states that NASA named the Artemis III crew.",
    ),
    candidate(
      9,
      june,
      "finding",
      "The summary states that orbiting rendezvous-and-docking tests with one or both commercial landing systems are intended to support Artemis IV, increase mission cadence, and improve production and supply-chain readiness.",
    ),
    candidate(
      10,
      february,
      "actor_claim",
      "NASA explained that the architecture change would standardize the SLS configuration, increase mission cadence, test commercial lander interfaces and other systems before attempting a landing, and support at least one surface landing annually thereafter.",
      "NASA",
    ),
    candidate(
      11,
      may,
      "actor_claim",
      "NASA provided a more specific explanation of Artemis III as a crewed Earth-orbit test flight rather than a lunar landing and described its testing objectives and risk-reduction purpose.",
      "NASA",
    ),
    candidate(
      12,
      february,
      "action",
      "NASA changed the public Artemis mission sequence in its February 27, 2026 architecture update.",
      "NASA",
    ),
  ];
  const candidateCounts = emptyCandidateCounts();
  for (const item of candidates) candidateCounts[item.candidate_type] += 1;
  return {
    run_id: "run_nasa_evidence_link_regression",
    case_id: "case_nasa_evidence_link_regression",
    mode: "live",
    status: "live",
    normalized_question:
      "How has NASA's public schedule and explanation for its current crewed mission plans changed across the latest official updates?",
    requested_source_limit: 3,
    actual_source_count: 3,
    discovery_profile: "standard",
    coverage_summary: buildCoverageSummary({
      discoveryProfile: "standard",
      requestedSourceLimit: 3,
      baselineRequested: 3,
      expansionRequested: 0,
      sources,
      duplicateURLCount: 0,
      expansionAttempted: false,
      expansionCompletedSuccessfully: false,
    }),
    source_snapshot_summaries: sources,
    candidate_counts: candidateCounts,
    candidate_ids: candidates.map((item) => item.candidate_id),
    candidates,
    warnings: [],
    limitations: ["Distilled NASA regression fixture only."],
    canonical_mutation: "none",
    focused_detail_lookup_keys: sources.map((item) => item.source_id),
  };
}
