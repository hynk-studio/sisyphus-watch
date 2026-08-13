export const DISCOVERY_PROFILES = ["standard", "coverage_expansion"] as const;
export type DiscoveryProfile = (typeof DISCOVERY_PROFILES)[number];

export const DISCOVERY_LANES = [
  "baseline_authority",
  "primary_or_origin",
  "local_or_firsthand",
  "specialist_context",
  "challenge_or_correction",
] as const;
export type DiscoveryLane = (typeof DISCOVERY_LANES)[number];

export const SOURCE_CONTEXTS = [
  "official",
  "established_editorial",
  "local_editorial",
  "specialist_publication",
  "community_organization",
  "individual_account",
  "archive",
  "unknown",
] as const;
export type SourceContext = (typeof SOURCE_CONTEXTS)[number];

export const INFORMATION_PROXIMITIES = [
  "direct_document",
  "primary_actor_statement",
  "firsthand_observation",
  "secondary_reporting",
  "analysis_or_commentary",
  "unknown",
] as const;
export type InformationProximity = (typeof INFORMATION_PROXIMITIES)[number];

export type DiscoveryPass = "baseline" | "coverage_expansion";
export type ClassificationBasis =
  | "curated_fixture"
  | "model_generated_web_search_classification";
export type ClassificationStatus =
  | "curated_fixture_metadata"
  | "candidate_review_only";

export interface SourceSelectionMetadata {
  discovery_pass: DiscoveryPass;
  discovery_lane: DiscoveryLane;
  source_context: SourceContext;
  information_proximity: InformationProximity;
  why_included: string;
  classification_basis: ClassificationBasis;
  classification_status: ClassificationStatus;
  comparison_target_source_ids: string[];
}

export type DiscoveryLaneCounts = Record<DiscoveryLane, number>;

interface CoverageLaneSummary {
  lane_counts: DiscoveryLaneCounts;
  missing_target_lanes: DiscoveryLane[];
}

export interface LiveDiscoveryCoverageSummary extends CoverageLaneSummary {
  coverage_basis: "live_discovery";
  discovery_profile: DiscoveryProfile;
  baseline_requested: number;
  baseline_returned: number;
  expansion_requested: number;
  expansion_returned: number;
  unique_domain_count: number;
  duplicate_url_count: number;
  source_limit_reached: boolean;
  expansion_attempted: boolean;
  expansion_completed_successfully: boolean;
}

export interface PreparedFixtureCoverageSummary extends CoverageLaneSummary {
  coverage_basis: "prepared_fixture";
  fixture_source_count: number;
}

export type CoverageSummary =
  | LiveDiscoveryCoverageSummary
  | PreparedFixtureCoverageSummary;

export const COVERAGE_EXPANSION_TARGET_LANES: DiscoveryLane[] = [
  "baseline_authority",
  "primary_or_origin",
  "local_or_firsthand",
  "specialist_context",
  "challenge_or_correction",
];

export function allocateCoverageExpansionBudget(totalSourceLimit: number): {
  baseline: number;
  expansion: number;
} {
  if (!Number.isInteger(totalSourceLimit) || totalSourceLimit < 1 || totalSourceLimit > 8) {
    throw new Error("totalSourceLimit must be an integer between 1 and 8");
  }
  const baseline = Math.max(1, Math.floor(totalSourceLimit * 0.4));
  return { baseline, expansion: totalSourceLimit - baseline };
}

export function emptyDiscoveryLaneCounts(): DiscoveryLaneCounts {
  return {
    baseline_authority: 0,
    primary_or_origin: 0,
    local_or_firsthand: 0,
    specialist_context: 0,
    challenge_or_correction: 0,
  };
}

export function buildCoverageSummary(input: {
  discoveryProfile: DiscoveryProfile;
  requestedSourceLimit: number;
  baselineRequested: number;
  expansionRequested: number;
  sources: Array<{
    domain: string;
    source_selection: SourceSelectionMetadata;
  }>;
  duplicateURLCount: number;
  expansionAttempted: boolean;
  expansionCompletedSuccessfully: boolean;
  baselineReturned?: number;
  expansionReturned?: number;
}): LiveDiscoveryCoverageSummary {
  const laneCounts = emptyDiscoveryLaneCounts();
  let baselineReturned = 0;
  let expansionReturned = 0;
  for (const source of input.sources) {
    laneCounts[source.source_selection.discovery_lane] += 1;
    if (source.source_selection.discovery_pass === "baseline") baselineReturned += 1;
    else expansionReturned += 1;
  }

  return {
    coverage_basis: "live_discovery",
    discovery_profile: input.discoveryProfile,
    baseline_requested: input.baselineRequested,
    baseline_returned: input.baselineReturned ?? baselineReturned,
    expansion_requested: input.expansionRequested,
    expansion_returned: input.expansionReturned ?? expansionReturned,
    lane_counts: laneCounts,
    missing_target_lanes:
      input.discoveryProfile === "coverage_expansion"
        ? COVERAGE_EXPANSION_TARGET_LANES.filter((lane) => laneCounts[lane] === 0)
        : [],
    unique_domain_count: new Set(input.sources.map((source) => source.domain)).size,
    duplicate_url_count: input.duplicateURLCount,
    source_limit_reached: input.sources.length >= input.requestedSourceLimit,
    expansion_attempted: input.expansionAttempted,
    expansion_completed_successfully: input.expansionCompletedSuccessfully,
  };
}

export function buildPreparedFixtureCoverageSummary(input: {
  sources: Array<{
    source_selection: SourceSelectionMetadata;
  }>;
}): PreparedFixtureCoverageSummary {
  const laneCounts = emptyDiscoveryLaneCounts();
  for (const source of input.sources) {
    laneCounts[source.source_selection.discovery_lane] += 1;
  }

  return {
    coverage_basis: "prepared_fixture",
    fixture_source_count: input.sources.length,
    lane_counts: laneCounts,
    missing_target_lanes: COVERAGE_EXPANSION_TARGET_LANES.filter(
      (lane) => laneCounts[lane] === 0,
    ),
  };
}
