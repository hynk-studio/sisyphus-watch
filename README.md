# Sisyphus Watch

**Kaggle-facing title:** Sisyphus Watch: Version Control and Epistemic Separation for Public Claims

Sisyphus Watch is an AI-agent demo that turns public news-like sources into versioned claim cards. It separates source-bound findings, actor claims, interpretation branches, current source-bound judgment, actions, bias notes, version timelines, claim drift, claim graphs, and version diffs so people and AI agents can reason beyond the news cycle.

This first build is a Kaggle Code-native vertical slice for the Kaggle 5-Day AI Agents Intensive Vibe Coding Course with Google. It is not a production news platform.

## What It Is

Sisyphus Watch is claim-version-control and epistemic separation for public reasoning. It takes messy public-interest source text and produces:

- source hygiene notes
- cold, source-bound findings from the existing `facts` field
- actor claims separated from findings
- actions taken by actors
- evidence-linked interpretations
- counter-branches that keep alternatives visible
- bias, opinion, and metaphor notes
- version timelines that track public claims from initial statement to observation to correction or update
- claim drift records that show whether the status of specific claims was strengthened, weakened, narrowed, complicated, superseded, unsupported, corrected, or left unresolved
- claim_graph relation maps that connect sources, facts, claims, actions, interpretations, counter-branches, timeline events, drift entries, version diffs, unresolved questions, and verdicts
- version diffs that show how the current source-bound judgment changes over time
- human-readable card rendering
- agent-readable JSON and JSONL records

## What It Is Not

Sisyphus Watch is not a generic news summarizer. It does not decide truth automatically, perform independent verification, crawl the live web, rank content, or infer strategic intent without evidence.

The default demo uses synthetic fixtures. They are realistic enough to show the workflow, but they are not real news and do not describe a real city or organization.

## Two-Surface Architecture

Sisyphus Watch exposes a human review workflow for understanding claim change over time and an agent contact surface for reusing source-bound structured state. Both surfaces are views over the same canonical card, source records, claim graph, and packet builders. The Kaggle notebook explains this once at the top, then lets the functional demo flow unfold with minimal interruption.

```text
Core State
news_card / source_records / evidence_patch / claim_graph / packets
-> Human Review Workflow
-> Agent Contact Surface
```

**Human Review Workflow**

- Judge Quickstart
- Guided Flow
- Human Card
- Timeline / Drift / Graph
- Revision Comparison
- Submission Readiness

**Agent Contact Surface**

- JSON / JSONL exports
- agent_packet
- graph_packet
- reviewer_packet
- revision_packet
- revision_comparison
- surface_model
- MCP tools/resources
- stable IDs / schema

Boundary:

- Human UI is for explanation.
- JSON/JSONL/MCP are for agent reuse.
- Optional Google AI discovery candidates are review inputs, not canonical evidence.
- Evidence patches remain non-mutating until reviewed.

## Course Concepts Demonstrated

Sisyphus Watch explicitly demonstrates these Kaggle Agents capstone concepts:

- **Agent / Multi-agent system / ADK - Code:** `src/sisyphus_watch_adk_demo.py` models the workflow as DiscoveryAgent, EpistemicSeparationAgent, RevisionHandoffAgent, and SisyphusOrchestratorAgent. It detects Google ADK when available and otherwise runs the same deterministic fallback sequence.
- **MCP Server - Code:** `src/sisyphus_watch_mcp_server.py` exposes deterministic Sisyphus cards, agent packets, claim graphs, guided flows, and security notes as MCP-style tools/resources, with a fallback manifest when `mcp` is not installed.
- **Security features - Code / Notebook:** API-key resolution is explicit and optional, source text is treated as untrusted input, generated image prompts are not evidence, live paths validate/fallback, and optional Google AI discovery candidates cannot mutate the canonical card in the default path.
- **Deployability - README / Notebook / Video:** The notebook runs deterministically in Kaggle with attached `data/`, `src/`, `schemas/`, and `examples/` folders, exports artifacts to `/kaggle/working`, and can be shown from the public GitHub repo if no live endpoint is deployed.

## Agent / ADK-Style Architecture

`src/sisyphus_watch_adk_demo.py` demonstrates a small orchestrated agent system:

- **DiscoveryAgent:** loads deterministic fixture discovery, or can represent an optional Google AI discovery packet when that path is enabled elsewhere.
- **EpistemicSeparationAgent:** summarizes source-bound findings, actor claims, actions, interpretations, counter-branches, and current source-bound judgment.
- **RevisionHandoffAgent:** packages claim graph context, evidence patch context, and reviewer/agent handoff artifacts.
- **SisyphusOrchestratorAgent:** runs the sequence and returns a structured trace with steps, output counts, security notes, deployability notes, and reusable artifacts.

Google ADK is optional. If ADK is unavailable, the module still runs a deterministic fallback orchestrator with the same conceptual steps. The default execution requires no API key, no network, and no external service.

## MCP Server Demo

`src/sisyphus_watch_mcp_server.py` exposes deterministic artifacts for downstream AI agents. When the optional `mcp` package is installed, it registers a FastMCP server named **Sisyphus Watch** using local stdio transport by default. When `mcp` is unavailable, importing the module still works and direct execution prints a JSON capability manifest.

MCP-style tools:

- `list_sisyphus_scenarios()`
- `get_sisyphus_card()`
- `get_sisyphus_agent_packet()`
- `get_sisyphus_claim_graph()`
- `get_sisyphus_guided_flow()`
- `get_sisyphus_security_notes()`

MCP resources when FastMCP is available:

- `sisyphus://scenarios`
- `sisyphus://scenario/{scenario_id}/card`
- `sisyphus://scenario/{scenario_id}/agent-packet`
- `sisyphus://scenario/{scenario_id}/claim-graph`

Run the local MCP demo:

```bash
python3 src/sisyphus_watch_mcp_server.py
```

If FastMCP is installed, the command runs the server over stdio by default. If FastMCP is absent, it prints the manifest and exits successfully. It does not start network listeners or require API keys by default.

## Security Features

The demo keeps secrets and evidence boundaries explicit:

- `resolve_google_api_key()` checks an explicit `api_key` argument, then Kaggle Notebook Secrets with `UserSecretsClient().get_secret("GOOGLE_API_KEY")`, then `os.environ.get("GOOGLE_API_KEY")`.
- API keys are never printed, logged, exported, or stored.
- Source text is treated as untrusted input and never as instructions.
- Generated image prompts are visual summaries, not evidence.
- Google AI discovery candidates are review inputs, not canonical evidence.
- Default canonical card mutation is disabled; deterministic cards come from `data/precomputed_records.json`.
- Optional live paths fall back safely on missing key, missing SDK, API failure, parse failure, validation failure, or schema failure.

## Deployability and Reproducibility

Default Kaggle execution remains deterministic, no-key, and no-network. Attach these folders as Kaggle dataset/input folders:

- `data/`
- `src/`
- `schemas/`
- `examples/`

Optional Google AI discovery can use `GOOGLE_API_KEY` from Kaggle Notebook Secrets, but `RUN_GOOGLE_DISCOVERY = False` and `RUN_LIVE_MODE = False` remain the default reviewer path.

Local smoke commands:

```bash
python3 -m py_compile src/sisyphus_watch_demo.py src/sisyphus_watch_adk_demo.py src/sisyphus_watch_mcp_server.py
python3 scripts/smoke_course_concepts.py
```

On Kaggle, export artifacts are written to `/kaggle/working`. If no live endpoint is deployed, the public GitHub repository can serve as the project link and the notebook can serve as the runnable deployment artifact.

## Epistemic Layer Separation

Sisyphus Watch separates findings, claims, interpretation branches, and source-bound judgment. This prevents claims or interpretations from being silently promoted into facts.

`claim_drift` tracks the changing epistemic status of claims, not general facts and not the judgment itself. `source_bound_judgment` is the current Sisyphus synthesis based on included sources; it is revisable, not final truth.

## Demo Scenarios

Three synthetic scenarios are included. `city_heatwave_cooling_centers` remains the default Kaggle demo.

**City Heatwave Cooling Centers** (`city_heatwave_cooling_centers`)

A fictional city announces that 50 cooling centers are open during a severe heatwave. A fictional community group later reports that several listed centers were closed, had limited hours, lacked clear signage, or were hard to access. The city then publishes updated guidance, clarifies hours, removes unavailable locations, and adds transport support for vulnerable residents.

**Public Transit Delay Communication** (`public_transit_delay_communication`)

A fictional transit agency says most service is running normally after a signal-system issue. Rider reports later show severe delays, unclear station notices, and lagging app updates. The agency publishes a correction, names affected lines, adds replacement bus support, and explains app data lag. This second scenario demonstrates that the same claim-version-control schema is reusable beyond the heatwave card.

**School Air Quality Alert Communication** (`school_air_quality_alert_communication`)

A fictional school district says classroom air-quality readings are within safe limits after a ventilation/filter issue. Parent and teacher observations later report stale air, unclear notices, inconsistent dashboard readings, and relocation confusion. The district publishes a corrected dashboard, identifies rooms without current readings, deploys portable HEPA units, clarifies thresholds, and explains sensor calibration and data-sync delays. This third scenario dogfoods the scenario authoring workflow.

The demo shows the claim-version-control flow:

```text
initial public claim
-> source-bound findings
-> claim status drift
-> claim graph relation map
-> competing interpretation branches
-> updated action
-> current source-bound judgment
```

## Files

```text
README.md
notebooks/sisyphus_watch_kaggle_demo.ipynb
src/sisyphus_watch_demo.py
src/sisyphus_watch_adk_demo.py
src/sisyphus_watch_mcp_server.py
data/demo_sources.json
data/precomputed_records.json
data/evidence_patches.json
schemas/sisyphus_schema.json
examples/sisyphus_watch_records.jsonl
examples/city_heatwave_demo.md
examples/evidence_update_demo.md
examples/agent_workflow_trace_demo.md
examples/epistemic_layer_separation_demo.md
scripts/smoke_course_concepts.py
```

## Run Locally

From the project root:

```bash
python3 -m py_compile src/sisyphus_watch_demo.py
python3 - <<'PY'
import sys
sys.path.insert(0, "src")
from sisyphus_watch_demo import (
    build_epistemic_layers,
    validate_epistemic_layers,
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
    layers = build_epistemic_layers(card)
    negative = run_negative_validation_self_test(card)
    packet = build_agent_packet(card)
    print(card["card_id"], checks, negative.keys(), packet["packet_version"])
    assert all(row["status"] == "PASS" for row in checks)
    assert not validate_epistemic_layers(layers, card)
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

The notebook opens directly with the Sisyphus Watch product brief, review map, compact run status, and compact two-surface architecture readout. Version sync is checked in the setup cell before named helper imports. It then follows the human review workflow: User Problem, Discovery, Epistemic Separation, Human Card, Version Timeline, Claim Drift, Claim Graph, Evidence Patch, and Revision Comparison. Near exports, the **Agent Contact Surface** explains JSON/JSONL/MCP reuse before files are written to `/kaggle/working`. In the default Kaggle path, the canonical Sisyphus card still comes from deterministic records selected by `SCENARIO_ID`; optional Google AI discovery candidates do not become canonical evidence or mutate the card unless `RUN_LIVE_MODE` or a future reviewed source-to-card regeneration path is enabled.

To switch scenarios in the notebook, change:

```python
SCENARIO_ID = "city_heatwave_cooling_centers"
```

to:

```python
SCENARIO_ID = "public_transit_delay_communication"
```

or:

```python
SCENARIO_ID = "school_air_quality_alert_communication"
```

## Kaggle Review Path

The notebook is organized as a polished, notebook-safe feature showcase UI for Kaggle review. It is designed as a clean analytical briefing, not a fragile dashboard: raw JSON is collapsed in details blocks, candidate sources and long IDs are clipped or wrapped for readability, and the default reviewer path remains deterministic, no-key, and no-network.

1. Attach the full repository folder as a Kaggle dataset/input, or use the notebook created from that dataset input.
2. Read the opening Sisyphus Watch **Product Brief**.
3. Read **Review Map** and compact **Run Status**.
4. Follow the **Human Review Workflow** demo: problem, discovery, separation, human card, timeline, drift, graph, evidence patch, and revision comparison.
5. Inspect **Course Concepts Demonstrated** for the ADK-style agent system, MCP server, security, and deployability mapping.
6. Inspect **Agent Contact Surface** near exports.
7. Download or reuse JSON/JSONL/MCP artifacts.

The human workflow is for understanding. The agent contact surface is for reuse. Core state is shared across both surfaces.

Default Kaggle evaluation remains deterministic and does not require an API key or network access. It uses deterministic fixture discovery plus deterministic Sisyphus card processing.

If the setup cell fails, re-upload the matching Kaggle dataset version and restart the kernel before running the notebook again.

## Kaggle Dataset Version Sync

The Kaggle notebook and attached dataset must come from the same GitHub commit. After merging a PR that changes `src/`, `data/`, `schemas/`, `examples/`, or notebook imports, create a new Kaggle dataset version and reattach it to the notebook. Restart the Kaggle kernel before **Run all**.

If `ImportError` mentions a missing renderer or helper, the attached dataset is probably stale. The notebook includes a version/symbol guard that prints the resolved `sisyphus_watch_demo.py` path and fails clearly when required helpers are missing.

Checklist:

1. Merge latest PR.
2. Export/upload latest repository folder as a Kaggle dataset.
3. Confirm the dataset contains the latest `src/sisyphus_watch_demo.py`.
4. Attach the new dataset version to the notebook.
5. Restart the kernel.
6. Run the version/symbol guard cell.
7. Run all.

Optional Google AI discovery can be enabled in the notebook with:

```python
RUN_GOOGLE_DISCOVERY = True
```

This optional path is a candidate-source discovery panel for reviewer inspection. Unless `RUN_LIVE_MODE` or a future reviewed source-to-card regeneration path is enabled, Google AI discovery candidates are not canonical evidence and do not mutate the canonical Sisyphus card.

When enabled, `resolve_google_api_key()` supports the Kaggle Notebook Secrets pattern:

```python
from kaggle_secrets import UserSecretsClient
user_secrets = UserSecretsClient()
secret_value_0 = user_secrets.get_secret("GOOGLE_API_KEY")
```

If the secret is absent, the optional SDK is unavailable, the API call fails, parsing fails, or validation fails, the notebook safely falls back to deterministic fixture discovery. The API key is never printed, logged, exported, or stored.

For a cleaner Kaggle dataset package, exclude `.git`, `__pycache__`, and notebook checkpoint folders.

## Demo Mode

Demo mode loads:

- `data/demo_sources.json`
- `data/precomputed_records.json`
- `data/evidence_patches.json` for the optional evidence update simulation

It always works without secrets, network access, or optional model packages. This is the intended Kaggle evaluation path. The deterministic record set includes three demo cards while preserving the heatwave card as the default:

- `city_heatwave_cooling_centers`
- `public_transit_delay_communication`
- `school_air_quality_alert_communication`

## Epistemic Layer Readout v1.5

The v1.5 readout is derived from existing card fields and keeps card and packet versions unchanged:

- `build_epistemic_layers()` maps `facts` to `source_bound_findings`, `actor_claims` to `claim_history`, `interpretations` and `counter_branches` to `interpretation_branches`, and `editorial_verdict` / `version_diff` to `source_bound_judgment`.
- `render_epistemic_layers_html()` shows four reviewer lanes: Findings, Claims, Interpretation Branches, and Current Sisyphus Judgment.
- `summarize_epistemic_layers_for_agent()` produces a compact agent-readable warning and counts.
- `write_export_artifacts()` also writes `sisyphus_epistemic_layers.json`.

No live ingestion, crawler, database, external API, or model call is added.

## Agent Packet v0.4

`build_agent_packet()` now emits `packet_version: "0.4"` with reusable context for downstream agents:

- claim graph summary, primary graph paths, node/edge counts, and graph reuse hints
- compact version timeline and claim drift summaries
- latest version label and current verdict ID
- changed, weakened, strengthened, and unresolved claim ID buckets
- claim-status drift vocabulary that distinguishes strengthened, weakened, narrowed, complicated, superseded, unsupported, corrected, and unresolved handling
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
2. Provide `GOOGLE_API_KEY` through Kaggle Notebook Secrets or the local environment.
3. Optionally set `SISYPHUS_GEMINI_MODEL`; otherwise it uses `gemini-2.5-flash`.

Live mode treats source text as untrusted data, asks for JSON only, and normalizes the response into the same schema. If the key is missing, the package is unavailable, parsing fails, validation fails, or the API call fails, the notebook falls back to deterministic demo records. It never prints or stores the API key.

The same resolver is used by optional Google AI discovery and optional Gemini live extraction. It checks an explicit argument first, then Kaggle Notebook Secrets with `UserSecretsClient().get_secret("GOOGLE_API_KEY")`, then `os.environ.get("GOOGLE_API_KEY")`.

## Claim Graph v0.4

Each deterministic card includes an in-card `claim_graph` relation map. The graph is built from existing card IDs and records source/fact/claim/action/interpretation/counter/timeline/drift/diff/verdict relationships as nodes and edges. It is plain JSON; no database, graph service, network library, or external API is used.

## Graph Query Helpers v0.5

The graph is queryable without external dependencies:

- `get_graph_neighbors()` returns incoming/outgoing graph context around a node or card ref ID.
- `get_paths_to_verdict()` returns deterministic directed paths from a source, claim, interpretation, or counter-branch to a verdict.
- `get_selected_claim_subgraph()` returns a compact claim-centered subgraph for downstream reuse.
- `export_agent_graph_packet()` emits `packet_version: "0.5"` graph packets for downstream AI agents.

Graph packets are plain JSON and are designed to reuse compact claim context. No graph database, external graph service, crawler, or web API is used.

## Reviewer Query Presets v0.6

Reviewer presets package common graph questions into deterministic JSON packets for downstream AI agents:

- `claim_status_review` reviews one actor claim's status, drift, nearby evidence, and paths to verdict.
- `verdict_change_review` reviews the current verdict, version diff, unresolved questions, and next checks.
- `counter_branch_review` reviews counter-branch evidence and how it tempers a claim or interpretation.
- `next_agent_handoff` packages a compact claim-centered subgraph and graph packet for follow-up review.

`export_reviewer_packet()` emits `packet_version: "0.6"` reviewer packets. No LLM call, external graph service, or network access is required.

## Scenario Authoring Workflow v0.7

`examples/scenario_authoring_template.json` provides a lightweight draft for adding another synthetic public-claim scenario.

The authoring helpers are deterministic and dependency-free:

- `load_scenario_authoring_template()`
- `validate_scenario_authoring_template()`
- `build_scenario_authoring_checklist()`
- `build_news_card_skeleton_from_template()`
- `export_scenario_authoring_packet()`

The output is a draft authoring aid, not a verified news card. The School Air Quality Alert Communication scenario was added by dogfooding this workflow: the template validated, the checklist passed, the skeleton was generated, and the completed evidence-bound card now validates through graph, agent, reviewer, and export paths. No LLM call, live ingestion, graph database, external API, or network access is required.

## Evidence Intake and Revision Proposal v0.9

`data/evidence_patches.json` contains deterministic synthetic "new information arrived" patches, one per demo scenario. The helpers keep those patches separate from canonical cards:

- `load_evidence_patches()` loads the patch fixtures.
- `validate_evidence_patch()` checks patch shape and, when a card is provided, verifies affected claim and interpretation IDs.
- `build_revision_proposal()` creates a non-mutating `proposal_version: "0.9"` change plan.
- `export_revision_packet()` emits a downstream `packet_version: "0.9"` revision packet with graph and reviewer context.

Revision proposals summarize affected claims, suggested timeline and claim-drift updates, verdict impact, reviewer questions, and next checks. They do not mutate `data/precomputed_records.json`, append patch sources to canonical `source_ids`, or make live model calls. No live ingestion, crawler, database, external API, or network access is required.

## Revision Comparison View v1.0

Revision comparisons make evidence-update proposals easier to review by showing current card state next to proposed revision state:

- `build_revision_comparison()` creates a `comparison_version: "1.0"` readout from a canonical card and revision proposal.
- `validate_revision_comparison()` checks the comparison shape and affected claim references.
- `render_revision_comparison_html()` renders the current-vs-proposed view in the notebook.

Comparison objects summarize affected claims, proposed effects, verdict impact, timeline and drift suggestions, unchanged context, reviewer questions, and recommended next checks. They do not mutate canonical cards, add patch sources to `source_ids`, or change existing packet versions.

## Agent Workflow Trace v1.1

The notebook includes a deterministic Agent Workflow Trace near the top so reviewers can see what the agent did before reading detailed sections:

- `build_agent_workflow_trace()` records what the deterministic agent read, extracted, structured, reviewed, revised, and exported.
- `build_run_summary()` creates a compact reviewer-facing summary with key outputs, quality status, and next review actions.
- `render_agent_workflow_trace_html()` renders the trace, run summary, output counts, step table, and exported artifacts in the notebook.

The trace is a visibility layer over existing deterministic helpers. It does not require live ingestion, a database, an external API, or a model call.

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
- `source_bound_finding_summary`
- `claim_history_summary`
- `interpretation_branch_summary`
- `source_bound_judgment_summary`
- `epistemic_layers`
- `epistemic_layers_export`
- `graph_node`
- `graph_edge`
- `claim_graph`
- `graph_packet`
- `reviewer_packet`
- `scenario_authoring_template`
- `scenario_authoring_checklist`
- `scenario_authoring_packet`
- `evidence_patch`
- `revision_proposal`
- `revision_packet`
- `revision_comparison`
- `agent_workflow_trace`
- `run_summary`
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
