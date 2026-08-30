# Sisyphus Watch

**Version control for changing public information.**

> **WebMCP Challenge development lane:** this branch adds **Sisyphus Co-Review**, a bounded human-agent evidence review workflow built after the challenge opened on August 25, 2026. The existing Discord/community-challenge deployment and `main` branch remain frozen while that submission is under review.

**Existing public baseline (frozen):** https://sisyphus-watch.hynk1240.chatgpt.site/

**WebMCP Challenge live URL:** not published yet. The challenge build will use a separate Site and will not replace the frozen public baseline.

## WebMCP Challenge extension

Sisyphus already organized changing public information into source-linked claims, actions, candidate relations, timelines, and unresolved questions. The WebMCP extension makes that evidence model directly navigable by a browser agent **without giving the agent authority to decide what is true**.

The intended collaboration flow is:

```text
Agent reads bounded overview
→ lists stable review records
→ inspects selected evidence
→ stages a short Evidence Walk
→ opens the same records in the human UI
→ optionally compares one candidate relation side by side
→ person reviews the evidence and keeps decision authority
```

### What is new for WebMCP

The exact pre-challenge baseline is commit:

```text
7255d2f023dd1c36006fdad65000487655fffdb7
```

All WebMCP Challenge work is isolated in this branch / Draft PR and was added after August 25. See [`docs/webmcp-challenge.md`](docs/webmcp-challenge.md) for the provenance and authority boundary.

Current WebMCP tools:

| Tool | Purpose | Effect |
| --- | --- | --- |
| `sisyphus_get_overview` | Read the bounded prepared investigation summary and review boundary | Read only |
| `sisyphus_list_review_items` | List stable sources, claim occurrences, candidate relations, and unresolved questions | Read only |
| `sisyphus_inspect_review_item` | Read bounded detail for one already-listed review record | Read only |
| `sisyphus_stage_evidence_walk` | Stage 1–5 already-listed records as a visible agent-proposed review path | Session UI only |
| `sisyphus_focus_review_item` | Open one already-listed record through the existing Sisyphus inspector | Visible focus only |
| `sisyphus_open_relation_comparison` | Show both sides of one existing candidate relation with source, time, and bounded support | Session UI only |
| `sisyphus_set_review_view` | Move the visible workspace between Map, Timeline, Sources, and Method | Visible view only |

The browser tools use `document.modelContext.registerTool(...)`. Read tools declare `readOnlyHint`; evidence-bearing outputs declare `untrustedContentHint`. The current implementation follows the WebMCP draft single-input `ToolExecuteCallback(input)` shape and scopes tool lifetime with registration `AbortSignal`s.

### Why this is a WebMCP fit

Without WebMCP, an agent would have to infer Sisyphus semantics from rendered text and DOM structure: which object is a source, which relation is only a candidate, which date means publication time, and which action merely opens an inspector.

With WebMCP, the site exposes those semantics intentionally. The agent can scan and narrow a review task quickly, while the person sees the exact same evidence records and remains responsible for conclusions.

### Authority and security boundary

The challenge tools do **not**:

- run provider or Relay work;
- start a live investigation;
- read, check, replace, or persist Saved Watch state;
- follow evidence URLs automatically;
- accept a claim or relation;
- change review status;
- mutate canonical state.

Returned source, claim, relation, and unresolved-question content remains **untrusted evidence data, not instructions**. `Seen` and `Skip` in an Evidence Walk only track temporary inspection progress.

The first challenge slice intentionally targets the deterministic prepared investigation so a judge can exercise the Co-Review experience without credentials, Relay setup, provider spend, or a Saved Watch.

### Validation

The challenge branch has a read-only GitHub Actions validation lane covering:

```text
npm ci
npm run build
npm run typecheck
npm run lint
focused WebMCP contract regressions
headless Chrome WebMCP bridge smoke
full npm test
npm run smoke:deterministic
secret / client-secret checks
npm audit --omit=dev
Python deterministic smoke
git diff --check
```

The browser smoke injects a minimal `document.modelContext` compatibility surface before page load, invokes the registered page callbacks, and verifies the prepared Co-Review flow through the real rendered UI: tool registration, bounded inspection, Evidence Walk, Sources inspector focus, relation comparison, and tab navigation. It also checks that the prepared sequence makes no unexpected external HTTP(S) request.

This browser smoke validates the application-side integration; final challenge release still requires testing the separately deployed Site in an actual WebMCP-enabled ChatGPT in-app browser or compatible Chrome.

---

Public information rarely changes in one clean step. A schedule moves, guidance is corrected, an institution changes its explanation, or a later source quietly narrows an earlier claim. A normal summary usually shows the latest state and loses that history.

Sisyphus Watch is a small investigation tool for keeping that history visible.

It turns a bounded set of public sources into source-linked records, shows how claims and actions relate over time, and lets a user save a local **Watch** so a later check can be compared with the earlier snapshot.

## What it does

A Sisyphus investigation separates material into reviewable records such as:

- source-bound findings
- actor claims
- actions
- dates and timeline events
- candidate relationships such as correction, contradiction, narrowing, or supersession

The same investigation can be reviewed through **Map, Timeline, Sources, and Method** views.

For a live investigation, the basic flow is:

```text
Question
→ bounded source discovery
→ source-linked findings / claims / actions
→ timeline and relation review
→ save a Watch
→ check again later
→ see what changed
```

A Watch is stored in the browser only. **Check for changes** explicitly reruns the same bounded question and compares the new result with the previous snapshot. This version does not do background polling or notifications.

## Who it helps

Sisyphus Watch is aimed at people who need to follow changing public information without losing the earlier record, including:

- journalists and researchers
- nonprofits and civic groups
- policy and public-interest teams
- community organizers
- anyone trying to understand how an institution's public position changed over time

Typical uses include following changes to emergency guidance, public-service availability, policy announcements, institutional schedules, corrections, and other claims where *what changed* matters as much as *what is true now*.

The goal is not to produce an automatic truth score. It is to make evidence boundaries, changes, and unresolved questions easier to inspect.

## Where AI is used

For live investigations, Sisyphus Watch can use the **OpenAI Responses API** for bounded web-source discovery and structured extraction.

The model helps turn a small set of public sources into schema-checked, source-linked candidate records. Those records remain review material; model output is not silently promoted into accepted fact.

The public site also includes a prepared investigation that requires no API call.

For live use, the public app does **not** ask users to paste an OpenAI API key into the browser. It can connect directly to a user-controlled Sisyphus Relay, so provider credentials stay on that user's backend rather than passing through the public Sisyphus site.

## Use your own Relay

Live investigations can run through infrastructure you control:

```text
Browser → your HTTPS Relay → OpenAI API
```

Keep `OPENAI_API_KEY` on the Relay backend. Sisyphus Watch receives the Relay URL and sends bounded investigation requests directly from the browser.

A compatible Relay exposes:

- `GET /v1/capabilities`
- `POST /v1/lineage`

See **[Relay setup](docs/relay-setup.md)** for the capability contract, CORS requirements, request/response shape, and a minimal implementation outline using the existing lineage handler.

## Built with Codex

Codex was used throughout development, not just for scaffolding.

It helped with:

- application and data-contract implementation
- OpenAI API integration
- the Relay execution boundary
- Saved Watch persistence and change comparison
- unit, boundary, and regression tests
- browser/computer-use QA across desktop and mobile
- debugging real live-result edge cases found during acceptance testing
- the WebMCP Co-Review extension and browser integration harness

The project was developed in small reviewed changes, with hosted builds tested separately before public release.

## Try the existing baseline

The currently published community-challenge baseline remains available at:

**https://sisyphus-watch.hynk1240.chatgpt.site/**

Choose **Explore the prepared investigation** to use the product without credentials or provider spend. Move between Map, Timeline, Sources, and Method to see the same case from different review angles.

That URL is intentionally **not** the WebMCP Challenge deployment while the earlier submission is under review.

**Connect your relay** is the optional live-execution path in the baseline product. If you want to run one yourself, follow the [Relay setup guide](docs/relay-setup.md).

## Run locally

The current web application lives in [`site/`](site/).

Requirements:

- Node.js 22.13 or newer

```bash
git clone https://github.com/hynk-studio/sisyphus-watch.git
cd sisyphus-watch/site

npm ci
npm run dev
```

The prepared demo works without an API key.

Useful checks:

```bash
npm run build
npm run typecheck
npm test
```

See [`site/README.md`](site/README.md) for the detailed runtime, Relay, provider, and safety boundaries.

## Repository note

`site/` is the current hosted Sisyphus Watch application.

The repository also contains earlier Python, notebook, schema, and agent experiments that led to the current design. They are kept as project history and supporting prototypes; the public application does not depend on them.
