import type {
  AnalysisCandidate,
  AnalysisRunPacket,
  AnalysisSourceSummary,
} from "../../app/lib/analysis/contracts";
import { emptyCandidateCounts } from "../../app/lib/analysis/contracts";
import { buildCoverageSummary } from "../../app/lib/source-profile";

const RETRIEVED_AT = "2026-08-22T07:02:17.888Z";

const sourceDefinitions = [
  {
    sourceId: "src_candidate_live_07c5c132ee9d5d09",
    title: "NASA Adds Mission to Artemis Lunar Program, Updates Architecture",
    url: "https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/",
    publishedAt: "2026-02-27T00:00:00.000Z",
  },
  {
    sourceId: "src_candidate_live_039e99cec25f752d",
    title: "NASA Outlines Preliminary Artemis III Mission Plans",
    url: "https://www.nasa.gov/missions/artemis/artemis-3/nasa-outlines-preliminary-artemis-iii-mission-plans/",
    publishedAt: "2026-05-13T00:00:00.000Z",
  },
  {
    sourceId: "src_candidate_live_f2d22ecf469c559d",
    title: "NASA Joins Artemis III Orion Modules; Rocket Hardware Update",
    url: "https://www.nasa.gov/blogs/missions/2026/08/05/nasa-joins-artemis-iii-orion-modules-rocket-hardware-update/",
    publishedAt: "2026-08-05T00:00:00.000Z",
  },
] as const;

function source(
  definition: (typeof sourceDefinitions)[number],
): AnalysisSourceSummary {
  return {
    source_id: definition.sourceId,
    snapshot_id: `snapshot_${definition.sourceId.slice(4)}_partial`,
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
      `Distilled Version 18 regression record for ${definition.title}.`,
    limitations: [
      "Distilled from the accepted Version 18 response; no raw provider response is committed.",
    ],
    api_provenance: null,
    source_selection: {
      discovery_pass: "baseline",
      discovery_lane: "baseline_authority",
      source_context: "official",
      information_proximity: "direct_document",
      why_included: "Accepted official NASA source in the Version 18 investigation.",
      classification_basis: "model_generated_web_search_classification",
      classification_status: "candidate_review_only",
      comparison_target_source_ids: [],
    },
  };
}

function candidate(input: {
  id: string;
  source: AnalysisSourceSummary;
  type: "finding" | "actor_claim" | "action";
  text: string;
  actor: string | null;
  supportingSummarySpan: string;
  timeCandidate?: string | null;
}): AnalysisCandidate {
  const timeCandidate = input.timeCandidate ?? null;
  return {
    candidate_id: input.id,
    source_id: input.source.source_id,
    snapshot_id: input.source.snapshot_id,
    candidate_type: input.type,
    actor: input.actor,
    text: input.text,
    evidence_reference: input.source.url ?? "",
    support_kind: "model_generated_web_search_summary_span",
    supporting_summary_span: input.supportingSummarySpan,
    source_reference: {
      source_id: input.source.source_id,
      snapshot_id: input.source.snapshot_id,
      url: input.source.url ?? "",
      title: input.source.title,
      kind: "url_citation",
    },
    time_candidate: timeCandidate,
    time_candidate_precision: timeCandidate ? "day" : null,
    confidence: "medium",
    uncertainty:
      "Distilled model-generated web-search summary record; not captured source text.",
    model: "deterministic-version18-regression-fixture",
    api_path: "responses.parse",
    generated_at: RETRIEVED_AT,
    validation_status: "validated",
    mode: "live_api",
    status: "candidate",
  };
}

export function version18RelationAdmissionRun(): AnalysisRunPacket {
  const sources = sourceDefinitions.map(source);
  const [february, may, august] = sources;
  const candidates = [
    candidate({
      id: "candidate_live_actor_claim_b4d292c3e726bf",
      source: august,
      type: "actor_claim",
      actor: "NASA",
      text: "NASA presented Artemis III as a 2027 crewed demonstration mission in low Earth orbit.",
      supportingSummarySpan:
        "NASA’s August 5, 2026 hardware update continued to present Artemis III as a 2027 crewed demonstration mission in low Earth orbit",
      timeCandidate: "2026-08-05T00:00:00.000Z",
    }),
    candidate({
      id: "candidate_live_actor_claim_b06535015f3463",
      source: august,
      type: "actor_claim",
      actor: null,
      text: "NASA associated the lunar landing with Artemis IV in 2028.",
      supportingSummarySpan:
        "while the lunar landing remained associated with Artemis IV in 2028",
    }),
    candidate({
      id: "candidate_live_action_9f5a882d41e9c7",
      source: february,
      type: "action",
      actor: "NASA",
      text: "NASA added Artemis III as a 2027 mission.",
      supportingSummarySpan:
        "NASA’s February 27, 2026 architecture update added Artemis III as a 2027 mission",
    }),
    candidate({
      id: "candidate_live_action_a4c277af22d566",
      source: february,
      type: "action",
      actor: null,
      text: "NASA positioned Artemis IV as the first planned crewed lunar landing.",
      supportingSummarySpan:
        "The update positioned Artemis IV as the first planned crewed lunar landing in 2028.",
    }),
    candidate({
      id: "candidate_live_action_90131792e866d0",
      source: may,
      type: "action",
      actor: "NASA",
      text: "NASA evaluated life support, reentry, spacesuit interfaces, communications, and possible science activities to reduce risk before Artemis IV’s lunar mission.",
      supportingSummarySpan:
        "while NASA evaluated life support, reentry, spacesuit interfaces, communications, and possible science activities to reduce risk before Artemis IV’s lunar mission",
    }),
    candidate({
      id: "candidate_live_finding_f078a3e42ae78f",
      source: may,
      type: "finding",
      actor: null,
      text: "NASA’s preliminary plan defined Artemis III as a crewed Earth-orbit demonstration in 2027.",
      supportingSummarySpan:
        "NASA’s May 13, 2026 preliminary plan defined Artemis III as a crewed Earth-orbit demonstration in 2027.",
    }),
    candidate({
      id: "candidate_live_action_19f3791d992327",
      source: august,
      type: "action",
      actor: null,
      text: "NASA emphasized measurable schedule progress and hardware reuse intended to accelerate Artemis IV.",
      supportingSummarySpan:
        "The update emphasized measurable schedule progress and hardware reuse intended to accelerate Artemis IV",
    }),
  ];
  const candidateCounts = emptyCandidateCounts();
  for (const item of candidates) candidateCounts[item.candidate_type] += 1;
  return {
    run_id: "run_version18_relation_admission_regression",
    case_id: "case_version18_relation_admission_regression",
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
    limitations: ["Distilled Version 18 relation-admission regression fixture only."],
    canonical_mutation: "none",
    focused_detail_lookup_keys: sources.map((item) => item.source_id),
  };
}
