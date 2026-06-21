# Sisyphus Watch

**Kaggle-facing title:** Sisyphus Watch: Version Control for Public Claims

Sisyphus Watch is an AI-agent demo that turns public news-like sources into versioned claim cards. It separates facts, actor claims, actions, interpretations, counter-branches, bias notes, version timelines, claim drift, claim graphs, and version diffs so people and AI agents can reason beyond the news cycle.

This first build is a Kaggle Code-native vertical slice for the Kaggle 5-Day AI Agents Intensive Vibe Coding Course with Google. It is not a production news platform.

## What It Is

Sisyphus Watch is claim-version-control for public reasoning. It takes messy public-interest source text and produces:

- source hygiene notes
- cold, source-bound facts
- actor claims separated from facts
- actions taken by actors
- evidence-linked interpretations
- counter-branches that keep alternatives visible
- bias, opinion, and metaphor notes
- version timelines that track public claims from initial statement to observation to correction or update
- claim drift records that show whether specific claims were weakened, strengthened, narrowed, corrected, or remain unresolved
- claim_graph relation maps that connect sources, facts, claims, actions, interpretations, counter-branches, timeline events, drift entries, version diffs, unresolved questions, and verdicts
- version diffs that show how judgment changes over time
- human-readable card rendering
- agent-readable JSON and JSONL records

## What It Is Not

Sisyphus Watch is not a generic news summarizer. It does not decide truth automatically, perform independent verification, crawl the live web, rank content, or infer strategic intent without evidence.

The default demo uses synthetic fixtures. They are realistic enough to show the workflow, but they are not real news and do not describe a real city or organization.

## Demo Scenarios

Two synthetic scenarios are included. `city_heatwave_cooling_centers` remains the default Kaggle demo.

**City Heatwave Cooling Centers** (`city_heatwave_cooling_centers`)

A fictional city announces that 50 cooling centers are open during a severe heatwave. A fictional community group later reports that several listed centers were closed, had limited hours, lacked clear signage, or were hard to access. The city then publishes updated guidance, clarifies hours, removes unavailable locations, and adds transport support for vulnerable residents.

**Public Transit Delay Communication** (`public_transit_delay_communication`)

A fictional transit agency says most service is running normally after a signal-system issue. Rider reports later show severe delays, unclear station notices, and lagging app updates. The agency publishes a correction, names affected lines, adds replacement bus support, and explains app data lag. This second scenario demonstrates that the same claim-version-control schema is reusable beyond the heatwave card.

The demo shows the claim-version-control flow:

```text
initial public claim
-> observed implementation gap
-> claim drift
-> claim graph relation map
-> counter-explanation
-> updated action
-> revised judgment
```

## Files

```text
README.md
notebooks/sisyphus_watch_kaggle_demo.ipynb
src/sisyphus_watch_demo.py
data/demo_sources.json
data/precomputed_records.json
schemas/sisyphus_schema.json
examples/sisyphus_watch_records.jsonl
examples/city_heatwave_demo.md
```

## Run Locally

From the project root:

```bash
python3 -m py_compile src/sisyphus_watch_demo.py
python3 - <<'PY'
import sys
sys.path.insert(0, "src")
from sisyphus_watch_demo import (
    find_project_root,
    get_news_cards,
    load_demo_sources,
    load_precomputed_records,
    run_negative_validation_self_test,
    run_quality_checks,
    build_agent_packet,
)
root = find_project_root()
sources = load_demo_sources()
records = load_precomputed_records()
cards = get_news_cards(records)
print(f"root={root}")
print(f"sources={len(sources)}")
for card in cards:
    checks = run_quality_checks(card)
    negative = run_negative_validation_self_test(card)
    packet = build_agent_packet(card)
    print(card["card_id"], checks, negative.keys(), packet["packet_version"])
    assert all(row["status"] == "PASS" for row in checks)
    assert packet["packet_version"] == "0.4"
PY
```

Then open:

```text
notebooks/sisyphus_watch_kaggle_demo.ipynb
```

The notebook defaults to demo mode and requires no API key.

## Use in Kaggle Code

1. Create a new Kaggle notebook.
2. Use one of the common upload patterns:
   - Copy the notebook into Kaggle and upload `data/`, `src/`, `schemas/`, and `examples/` as inputs.
   - Attach the full repository folder as a Kaggle dataset/input, for example under `/kaggle/input/<dataset-name>/`.
3. Open or copy `notebooks/sisyphus_watch_kaggle_demo.ipynb`.
4. Run all cells.

The notebook searches for the project root in the current working directory, parent folders, `/kaggle/working`, and `/kaggle/input/**/src/sisyphus_watch_demo.py`.

The first screen explains the problem, the workflow, and the default synthetic scenario. The notebook then renders the human card view, version timeline, claim drift, claim graph, branch view, JSON export, JSONL preview, agent packet preview, and PASS/FAIL evaluation table.

To switch scenarios in the notebook, change:

```python
SCENARIO_ID = "city_heatwave_cooling_centers"
```

to:

```python
SCENARIO_ID = "public_transit_delay_communication"
```

## Kaggle Visual Review Path

1. Attach the full repository folder as a Kaggle dataset/input, or use the notebook created from that dataset input.
2. Run all cells.
3. Confirm the top evaluation summary passes before reading the detailed table.
4. Review the human card first; JSON, JSONL, and agent packet details are available in collapsed sections below.

For a cleaner Kaggle dataset package, exclude `.git`, `__pycache__`, and notebook checkpoint folders.

## Demo Mode

Demo mode loads:

- `data/demo_sources.json`
- `data/precomputed_records.json`

It always works without secrets, network access, or optional model packages. This is the intended Kaggle evaluation path. The deterministic record set includes both demo cards while preserving the heatwave card as the default.

## Agent Packet v0.4

`build_agent_packet()` now emits `packet_version: "0.4"` with reusable context for downstream agents:

- claim graph summary, primary graph paths, node/edge counts, and graph reuse hints
- compact version timeline and claim drift summaries
- latest version label and current verdict ID
- changed, weakened, strengthened, and unresolved claim ID buckets
- stable fact, claim, and action IDs
- unresolved questions
- what to watch next
- verdict change conditions
- recommended next source types
- reuse guidance that warns agents not to treat the packet as final truth

## Optional Gemini Live Mode

The notebook includes a conservative optional live regeneration path in `maybe_run_live_extraction()`.

To try it:

1. Set `RUN_LIVE_MODE = True` in the notebook.
2. Provide `GOOGLE_API_KEY` through Kaggle secrets or the local environment.
3. Optionally set `SISYPHUS_GEMINI_MODEL`; otherwise it uses `gemini-2.5-flash`.

Live mode treats source text as untrusted data, asks for JSON only, and normalizes the response into the same schema. If the key is missing, the package is unavailable, parsing fails, validation fails, or the API call fails, the notebook falls back to deterministic demo records. It never prints or stores the API key.

## Claim Graph v0.4

Each deterministic card includes an in-card `claim_graph` relation map. The graph is built from existing card IDs and records source/fact/claim/action/interpretation/counter/timeline/drift/diff/verdict relationships as nodes and edges. It is plain JSON; no database, graph service, network library, or external API is used.

## Graph Query Helpers v0.5

The graph is queryable without external dependencies:

- `get_graph_neighbors()` returns incoming/outgoing graph context around a node or card ref ID.
- `get_paths_to_verdict()` returns deterministic directed paths from a source, claim, interpretation, or counter-branch to a verdict.
- `get_selected_claim_subgraph()` returns a compact claim-centered subgraph for downstream reuse.
- `export_agent_graph_packet()` emits `packet_version: "0.5"` graph packets for downstream AI agents.

Graph packets are plain JSON and are designed to reuse compact claim context. No graph database, external graph service, crawler, or web API is used.

## Schema

`schemas/sisyphus_schema.json` documents the record shapes for:

- `source_record`
- `record_set`
- `news_card`
- `fact`
- `actor_claim`
- `action`
- `interpretation`
- `counter_branch`
- `bias_note`
- `version_diff`
- `version_event`
- `claim_drift`
- `graph_node`
- `graph_edge`
- `claim_graph`
- `graph_packet`
- `editorial_verdict`
- `agent_packet`

The notebook uses dependency-free Python validation from `src/sisyphus_watch_demo.py` so it remains Kaggle-friendly.

## Limitations

- Not an automatic truth oracle.
- Does not perform independent verification.
- Depends on source quality and source coverage.
- Strategic intent remains uncertain unless directly evidenced.
- Bias is labeled for review, not magically removed.
- Generated image prompts are visual summaries, not evidence.
- Synthetic demo fixtures are used for safe, reproducible Kaggle evaluation.
- No live web ingestion, crawler, database, login, recommender, MCP server, or production news platform is implemented.

## Next Steps

- Add optional `jsonschema` validation when that dependency is available.
- Add a small Kaggle dataset package for the demo files.
- Add a lightweight export command for producing JSONL from new scenarios.
