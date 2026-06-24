# Agent Workflow Trace Demo

Selected scenario: `city_heatwave_cooling_centers`

## Compact Run Summary

The deterministic agent reads four synthetic source fixtures, separates source-bound findings from actor claims and actions, builds epistemic layer, timeline/drift/graph structure, exports review packets, then simulates a non-mutating evidence update.

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
5. Epistemic layer separation: render findings, claims, interpretation branches, and current judgment as separate lanes.
6. Claim graph build: connect sources, facts, claims, actions, timeline events, drift, and verdicts.
7. Reviewer preset generation: create deterministic review queries.
8. Evidence patch intake: load a synthetic follow-up audit without mutating the canonical card.
9. Revision comparison generation: show current state vs proposed revision state.

## Reviewer Path

Start with the Submission Summary, Reviewer Dashboard, Agent Workflow Trace, and Epistemic Layer Separation, then inspect the Human Card, Version Timeline, Claim Drift, Claim Graph, Reviewer Presets, Evidence Update Simulation, Revision Comparison View, and Evaluation. The Kaggle mid-check checklist confirms the deterministic reviewer path and expected `/kaggle/working` artifacts.

## Exported Artifacts

- `sisyphus_news_card.json`
- `sisyphus_records.jsonl`
- `sisyphus_agent_packet.json`
- `sisyphus_epistemic_layers.json`
- `sisyphus_graph_packet.json`
- `sisyphus_reviewer_packet.json`
- `sisyphus_scenario_authoring_packet.json`
- `sisyphus_revision_packet.json`
- `sisyphus_revision_comparison.json`
- `sisyphus_agent_workflow_trace.json`
- `sisyphus_run_summary.json`

## Why This Is More Than a Generic Summarizer

This is more than a generic summarizer because the workflow preserves provenance, separates source-bound findings from claims, keeps interpretation branches distinct from current judgment, tracks claim status drift over versions, builds graph context, packages reviewer queries, and handles new evidence as a reviewable patch instead of rewriting the canonical card.

## Limitations

- Synthetic demo fixtures, not real-world evidence.
- No live ingestion, crawler, database, external API, or model call.
- Revision suggestions remain review proposals until a human promotes them.
