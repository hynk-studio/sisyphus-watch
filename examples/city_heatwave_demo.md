# City Heatwave Cooling Centers Demo

This example is synthetic. It is not real news and does not describe a real city or organization.

## Claim Card

**Card ID:** `news_city_heatwave_cooling_centers_2026_06_15_v01`

**Title:** City Heatwave Cooling Centers: Public Claim vs Access Reality

**Version:** `v01`

**Card type:** `public_claim_version_control_card`

## Three-Line Summary

1. The fictional city announced 50 cooling centers during a severe heatwave.
2. A community group later reported that several listed centers were closed, had limited hours, lacked signage, or were hard to reach.
3. The city updated the list, clarified hours, removed unavailable locations, and added transport support, shifting the judgment toward a partially corrected implementation gap.

## Fact Layer

- `fact_city_announces_50_cooling_centers_2026_06_10_001`: The fictional city announced that 50 cooling centers would be open during a severe heatwave.
- `fact_community_reports_access_problems_2026_06_12_001`: A fictional community volunteer group reported access problems at some listed cooling centers.
- `fact_city_updates_list_and_hours_2026_06_14_001`: The fictional city later updated the cooling center list and clarified opening hours.
- `fact_city_adds_transport_support_2026_06_14_001`: The fictional city added free shuttle support for older residents and medically vulnerable residents in hardest-hit neighborhoods.

## Actor Claim Layer

- `claim_city_all_centers_open_2026_06_10_001`: The city claimed residents could find safe, air-conditioned spaces across the city.
- `claim_city_list_will_update_2026_06_10_001`: The city claimed the list would be updated as conditions changed.
- `claim_community_access_gap_2026_06_12_001`: The community group claimed several listed centers were not practically accessible.
- `claim_city_update_corrected_errors_2026_06_14_001`: The city claimed the update corrected listing errors and improved access.

## Action Layer

- `action_city_updates_cooling_center_hours_2026_06_14_001`: Published an updated cooling center list and clarified opening hours.
- `action_city_removes_unavailable_locations_2026_06_14_001`: Removed unavailable locations and corrected addresses for several facilities.
- `action_city_adds_transport_support_2026_06_14_001`: Added free shuttle support for older and medically vulnerable residents.

## Interpretation Branch

`interp_emergency_service_implementation_gap_2026_06_15_001`

The case suggests an implementation gap between emergency-service public claims and real-world accessibility. The later update reduces concern about a simple bad-faith overclaim but increases the importance of versioned public communication during emergencies.

## Counter-Branch

`counter_fast_changing_conditions_2026_06_15_001`

The initial gap may reflect fast-changing emergency conditions, staffing constraints, and late facility confirmations rather than deliberate exaggeration. The update and transport support indicate partial correction.

## Bias / Opinion / Metaphor Layer

`bias_public_accountability_metaphor_2026_06_15_001`

"An emergency map that works only on paper is a cardboard umbrella in a heatwave."

This is labeled as metaphor and opinion, not evidence.

## Version Diff

**Previous judgment:** The announcement sounded adequate based on the city's initial statement, but real-world accessibility was unknown.

**Updated judgment:** Concern shifted from possible overclaim to partially corrected implementation gap after updated guidance and transport support.

**Confidence delta:**

- `implementation_gap_hypothesis`: low -> high
- `deliberate_overclaim_hypothesis`: low -> medium_low
- `remediation_hypothesis`: unknown -> medium_high

## Version Timeline

- `v00` on `2026-06-10`: The city announced 50 cooling centers were open; accessibility was still unknown.
- `v01` on `2026-06-12`: Community observations reported closed sites, limited hours, weak signage, and access barriers.
- `v02` on `2026-06-14`: The city corrected the list, clarified hours, removed unavailable sites, and added transport support.

## Claim Drift

- `claim_city_all_centers_open_2026_06_10_001`: weakened from an unverified initial claim to a partially challenged availability claim after community access observations.
- `claim_city_list_will_update_2026_06_10_001`: strengthened from an unverified process commitment to a supported update commitment after corrected hours and removed unavailable locations.

## Claim Graph

**Graph ID:** `graph_city_heatwave_cooling_centers_2026_06_15_v01`

**Primary path:** `src_community_cooling_center_access_report_2026_06_12` -> `claim_community_access_gap_2026_06_12_001` -> `diff_city_heatwave_v00_to_v01_2026_06_15` -> `verdict_city_heatwave_cooling_centers_2026_06_15_v01`

**Node/edge summary:** 29 nodes and 46 edges connect sources, facts, actor claims, actions, interpretations, counter-branches, timeline events, claim drift entries, version diff, unresolved questions, and verdict.

**Why this matters:** the card can be reused as a relation map instead of a set of independent lists, while still keeping every graph edge tied back to source-bound IDs.

## Graph Query Example

**Central claim:** `claim_city_all_centers_open_2026_06_10_001`

**Neighbor summary:** the claim connects to the initial city announcement source, the `v00` version event, and a claim drift entry that later weakens the broad availability claim.

**Path to verdict:** `Fictional City Emergency Management Office` -> `v00` -> `v01_after_community_report_and_city_update` -> `Public communication failure with partial remediation`

**Selected subgraph use:** a radius-2 subgraph around this claim includes the source, nearby claim drift, timeline, version diff, and related evidence nodes. This gives another AI agent compact claim context without handing over the entire card graph.

## Reviewer Query Example

**Preset:** `claim_status_review`

**Focus claim:** `claim_city_all_centers_open_2026_06_10_001`

**Answer summary:** the claim is currently handled as `partially_challenged_by_later_observation` and has weakened drift in the card history.

**Handoff use:** the reviewer packet keeps the claim record, drift entry, nearby graph context, evidence records, path to verdict, and radius-2 subgraph together so a downstream agent can inspect the claim without reloading the full card.

## Adding Another Scenario

Use `examples/scenario_authoring_template.json` as the starting point for another synthetic public-claim scenario. Run the authoring checklist, generate a draft skeleton, then fill evidence-bound facts, claims, actions, interpretations, counter-branches, timeline events, and drift entries before promoting anything into deterministic demo records.

See `examples/school_air_quality_demo.md` for the first promoted authoring-workflow dogfood scenario.

## Editorial Verdict

This case is best treated as a public-service communication and implementation-gap case. The city's initial claim was not fully reliable at street level, but the later correction weakens a simple bad-faith framing. Readers should inspect facts, counter-branches, and remaining uncertainties before accepting a stronger accusation.
