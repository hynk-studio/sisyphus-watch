# Agent Workflow Trace Demo

Selected scenario: `city_heatwave_cooling_centers`

## Compact Run Summary

The deterministic agent reads four synthetic source fixtures, separates facts from actor claims and actions, builds timeline/drift/graph structure, exports review packets, then simulates a non-mutating evidence update.

## Output Counts

- Sources: 4
- Facts: 4
- Actor claims: 4
- Actions: 3
- Timeline events: 3
- Claim drift entries: 2
- Claim graph: local nodes and edges generated from card IDs
- Evidence patches: 1

## Representative Steps

1. Source intake: read bounded synthetic source fixture references.
2. Source hygiene check: treat source text as untrusted input.
3. Fact extraction: keep facts source-bound.
4. Actor claim extraction: keep public claims separate from facts.
5. Claim graph build: connect sources, facts, claims, actions, timeline events, drift, and verdicts.
6. Reviewer preset generation: create deterministic review queries.
7. Evidence patch intake: load a synthetic follow-up audit without mutating the canonical card.
8. Revision comparison generation: show current state vs proposed revision state.

## Exported Artifacts

- `sisyphus_news_card.json`
- `sisyphus_agent_packet.json`
- `sisyphus_graph_packet.json`
- `sisyphus_reviewer_packet.json`
- `sisyphus_revision_packet.json`
- `sisyphus_revision_comparison.json`
- `sisyphus_agent_workflow_trace.json`
- `sisyphus_run_summary.json`

## Why This Is More Than a Generic Summarizer

This is more than a generic summarizer because the workflow preserves provenance, separates facts from claims and actions, tracks claim drift over versions, builds graph context, packages reviewer queries, and handles new evidence as a reviewable patch instead of rewriting the canonical card.

## Limitations

- Synthetic demo fixtures, not real-world evidence.
- No live ingestion, crawler, database, external API, or model call.
- Revision suggestions remain review proposals until a human promotes them.
