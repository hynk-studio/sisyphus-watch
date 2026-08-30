# WebMCP Challenge lane

This document records the isolated WebMCP Challenge development lane for Sisyphus Watch.

## Frozen pre-challenge baseline

- Canonical `main` baseline: `7255d2f023dd1c36006fdad65000487655fffdb7`
- Baseline date: 2026-08-24
- Existing Discord/community-challenge public Site: `https://sisyphus-watch.hynk1240.chatgpt.site/`
- The existing public Site and `main` remain frozen while that submission is under review.

The WebMCP Challenge work starts after the August 25 challenge opening and is developed only on `codex/webmcp-challenge-co-review` until separately authorized for merge or deployment.

## Challenge product direction

The challenge upgrade is **Sisyphus Co-Review**: an agent can scan the bounded investigation, inspect individual evidence records, stage a short Evidence Walk, focus the same review records a person sees, and open a side-by-side relation comparison inside the Sisyphus interface.

The current challenge slice deliberately uses the deterministic prepared investigation so judges can exercise the WebMCP surface without a Relay, provider credential, billable request, or browser-local Watch setup.

Current tools:

- `sisyphus_get_overview`
- `sisyphus_list_review_items`
- `sisyphus_inspect_review_item`
- `sisyphus_stage_evidence_walk`
- `sisyphus_focus_review_item`
- `sisyphus_open_relation_comparison`
- `sisyphus_set_review_view`

The intended collaboration sequence is:

```text
Overview
→ list bounded review records
→ inspect selected evidence
→ stage a short Evidence Walk
→ focus the same records in the human UI
→ optionally compare one candidate relation side by side
```

`inspect_review_item` is read-only. It returns bounded source, claim, relation, or unresolved-question detail with explicit evidence/trust boundaries so the agent can choose a review path without scraping the DOM or inventing authority.

The relation comparison reuses the existing candidate relation, claim occurrence, source, time, bounded-support, and source-backed presentation semantics. It is a visual inspection aid only; it does not create a new relation or upgrade review status.

## WebMCP contract alignment

The imperative surface follows the current WebMCP draft shape at `https://webmachinelearning.github.io/webmcp/`:

- tools are registered through `document.modelContext.registerTool(...)`;
- `ToolExecuteCallback` receives the structured input object as its single callback argument;
- registration `AbortSignal`s scope tool lifetime; the UI bridge also reuses its registration signal to cancel pending frame work when unmounted;
- read tools declare `readOnlyHint`;
- evidence-bearing outputs declare `untrustedContentHint`.

The bridges feature-detect `document.modelContext`, so ordinary browsers without WebMCP retain the existing Sisyphus path.

## Authority boundary

The current WebMCP slice may:

- read a bounded overview of the prepared packet;
- list stable prepared review records;
- read bounded detail for one already-listed source, claim occurrence, relation, or unresolved question;
- stage at most five already-listed review items in temporary page state;
- switch Map / Timeline / Sources / Method;
- open an existing source, claim occurrence, relation, or unresolved-question inspector;
- open one existing relation as a temporary side-by-side comparison.

It must not:

- run provider or Relay work;
- start a new live investigation;
- check or persist a Saved Watch;
- follow evidence URLs automatically;
- accept claims or relations;
- change review status;
- mutate canonical state;
- deploy or publish the existing judged Site.

Returned source, claim, relation, and question content remains untrusted evidence data. Evidence Walk `Seen` / `Skip` values are session-only inspection progress, not evidence decisions.

## Current scope limitation

This implementation intentionally projects the prepared deterministic packet only. If a different live/fallback workspace is already open, mutating Co-Review tools fail closed rather than applying prepared IDs to that workspace. Read-only prepared projection tools remain explicitly labeled `scope: prepared_demo`.

A later challenge slice may generalize the adapter to the current live packet and expose the existing deterministic Watch delta as a read-only tool, but only after the prepared Co-Review path and browser-level WebMCP interoperability are independently validated.

## Validation boundary

The challenge branch carries an isolated GitHub Actions workflow for build, strict typecheck, lint, focused WebMCP regressions, the full test suite, deterministic smoke, secret/client-secret checks, production dependency audit, Python deterministic smoke, and diff hygiene. This workflow does not deploy or publish a Site and has read-only repository contents permission.

## Deployment boundary

No WebMCP Challenge build should replace the existing Discord/community-challenge public Site while that submission is being judged. A challenge build should use a separate ChatGPT Site / live URL.