# Evidence Update Demo

This example uses the synthetic heatwave patch:

`patch_city_heatwave_cooling_centers_2026_06_20_001`

## Patch Summary

A fictional follow-up access audit reports that most cooling center list corrections held after the city update, but shuttle availability remained inconsistent in two vulnerable neighborhoods.

## Affected Claim

`claim_city_all_centers_open_2026_06_10_001`

The original broad availability claim should be narrowed because corrected center listings did not guarantee reliable transport access.

## Proposed Verdict Effect

`narrow`

The revision proposal separates two outcomes: the city corrected many listing errors, but the remaining shuttle gap still affects real access.

## Current vs Proposed

| Item | Current | Proposed |
| --- | --- | --- |
| Affected claim | `claim_city_all_centers_open_2026_06_10_001` is already partially challenged by later observation. | Narrow the claim again because corrected listings still did not guarantee reliable shuttle access. |
| Proposed effect | Current card verdict remains a partially corrected implementation gap. | `narrow`, with reviewer attention on transport access rather than center-list accuracy. |
| Review priority | Existing uncertainty remains visible. | Medium: the patch changes access interpretation but does not prove every shuttle failure. |

The comparison object shows this side by side for humans and downstream agents. It does not mutate the canonical card, append the patch source to canonical `source_ids`, or promote suggested timeline/drift changes without review.

## Why This Shows Claim Version Control

The patch does not overwrite the canonical card. It creates a reviewable proposal with suggested claim status changes, a possible next timeline event, claim drift suggestions, graph context, reviewer questions, a v0.9 revision packet, and a v1.0 current-vs-proposed comparison.

## Limitations

- Synthetic demo fixture, not real evidence.
- No live ingestion, crawler, database, or model call.
- The canonical news card changes only if a reviewer chooses to promote the proposal.
