# Sisyphus Watch

**Kaggle-facing title:** Sisyphus Watch: Version Control for Public Claims

Sisyphus Watch is an AI-agent demo that turns public news-like sources into versioned claim cards. It separates facts, actor claims, actions, interpretations, counter-branches, bias notes, and version diffs so people and AI agents can reason beyond the news cycle.

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
- version diffs that show how judgment changes over time
- human-readable card rendering
- agent-readable JSON and JSONL records

## What It Is Not

Sisyphus Watch is not a generic news summarizer. It does not decide truth automatically, perform independent verification, crawl the live web, rank content, or infer strategic intent without evidence.

The default demo uses synthetic fixtures. They are realistic enough to show the workflow, but they are not real news and do not describe a real city or organization.

## Demo Scenario

**City Heatwave Cooling Centers**

A fictional city announces that 50 cooling centers are open during a severe heatwave. A fictional community group later reports that several listed centers were closed, had limited hours, lacked clear signage, or were hard to access. The city then publishes updated guidance, clarifies hours, removes unavailable locations, and adds transport support for vulnerable residents.

The demo shows the claim-version-control flow:

```text
initial public claim
-> observed implementation gap
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
from sisyphus_watch_demo import load_demo_sources, load_precomputed_records, run_quality_checks
sources = load_demo_sources()
card = load_precomputed_records()["news_card"]
checks = run_quality_checks(card)
print(f"sources={len(sources)}")
print(checks)
assert all(row["status"] == "PASS" for row in checks)
PY
```

Then open:

```text
notebooks/sisyphus_watch_kaggle_demo.ipynb
```

The notebook defaults to demo mode and requires no API key.

## Use in Kaggle Code

1. Create a new Kaggle notebook.
2. Upload this repository folder, or upload the `data/`, `src/`, `schemas/`, `examples/`, and `notebooks/` files as notebook inputs.
3. Open or copy `notebooks/sisyphus_watch_kaggle_demo.ipynb`.
4. Run all cells.

The first screen explains the problem, the workflow, and the default synthetic scenario. The notebook then renders the human card view, branch view, JSON export, JSONL preview, agent packet preview, and PASS/FAIL evaluation table.

## Demo Mode

Demo mode loads:

- `data/demo_sources.json`
- `data/precomputed_records.json`

It always works without secrets, network access, or optional model packages. This is the intended Kaggle evaluation path.

## Optional Gemini Live Mode

The notebook includes a conservative optional live regeneration path in `maybe_run_live_extraction()`.

To try it:

1. Set `RUN_LIVE_MODE = True` in the notebook.
2. Provide `GOOGLE_API_KEY` through Kaggle secrets or the local environment.
3. Optionally set `SISYPHUS_GEMINI_MODEL`; otherwise it uses `gemini-2.5-flash`.

Live mode treats source text as untrusted data, asks for JSON only, and normalizes the response into the same schema. If the key is missing, the package is unavailable, parsing fails, validation fails, or the API call fails, the notebook falls back to deterministic demo records. It never prints or stores the API key.

## Schema

`schemas/sisyphus_schema.json` documents the record shapes for:

- `source_record`
- `news_card`
- `fact`
- `actor_claim`
- `action`
- `interpretation`
- `counter_branch`
- `bias_note`
- `version_diff`
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

- Add a second synthetic scenario to test portability.
- Add optional `jsonschema` validation when that dependency is available.
- Add a small Kaggle dataset package for the demo files.
- Add a lightweight export command for producing JSONL from new scenarios.
