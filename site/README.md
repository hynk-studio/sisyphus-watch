# Sisyphus Watch ChatGPT Site foundation

This directory is the local ChatGPT Sites-compatible project for Sisyphus
Watch. It is intentionally separate from the repository's historical Python
and Kaggle surfaces: the hosted runtime must not depend on running the notebook
or an unsupported Python backend.

## Official basis and selected shape

Reviewed on 2026-08-12:

- [ChatGPT Sites developer guide](https://learn.chatgpt.com/docs/sites)
- the current bundled Sites `vinext-starter`, initialized by the OpenAI Sites
  workflow

The selected shape uses vinext's App Router compatibility layer, Vite, React,
and a Cloudflare Worker-compatible ESM entry point. It keeps the starter's
`sites()` Vite plugin and worker boundary. This supports server-rendered UI and
route handlers without adding storage or authentication.

`.openai/hosting.json` came from the supported starter and declares both `d1`
and `r2` as `null`. It contains no secret or invented `project_id`. A real
project linkage may update that file only through ChatGPT Sites.

## Commands

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run smoke:deterministic
npm run check:secrets
```

The default development URL is printed by vinext (normally
`http://localhost:3000`).

## Deterministic data boundary

`app/lib/prepared-case.ts` adapts the existing synthetic cooling-center case
into a frozen Site-runtime fixture. It requires no API key or network. The
serializable contracts preserve stable IDs, source hashes, candidate/canonical
status, and distinct publication, event/assertion, and retrieval times.

The compact case response at `GET /api/cases` and
`GET /api/cases/:caseId` omits full source text. Focused detail is available at:

```text
GET /api/cases/:caseId?focus=source|claim|timeline|question&id=:stableId
```

Only a single bounded fixture record is returned through that detail path.
Source text is rendered through React or serialized as JSON; it is never
executed as HTML or instructions.

## Sites management boundary

Codex CLI and the IDE can edit and test this local project, but the official
guide states they do not provide a standalone Sites management view. The Sites
project, hosted versions, audience access, analytics, and production address
are managed from ChatGPT web or the desktop app. None of those hosted operations
is performed or represented in this foundation.
