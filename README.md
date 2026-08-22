# Sisyphus Watch

**Version control for changing public information.**

**Live demo:** https://sisyphus-d1-capability-probe.hynk1240.chatgpt.site

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

## Built with Codex

Codex was used throughout development, not just for scaffolding.

It helped with:

- application and data-contract implementation
- OpenAI API integration
- the Relay execution boundary
- Saved Watch persistence and change comparison
- unit, boundary, and regression tests
- browser/computer-use QA across desktop and mobile
- debugging a real live-result edge case found during acceptance testing

The project was developed in small reviewed changes, with the hosted build tested separately before public release.

## Try it

Open the public demo:

**https://sisyphus-d1-capability-probe.hynk1240.chatgpt.site**

Choose **Explore the prepared investigation** to use the product without credentials or provider spend. Move between Map, Timeline, Sources, and Method to see the same case from different review angles.

**Connect your relay** is the optional live-execution path for users running a compatible backend.

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
