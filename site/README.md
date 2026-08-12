# Sisyphus Watch ChatGPT Site foundation

This directory is the local ChatGPT Sites-compatible project for Sisyphus
Watch. It is intentionally separate from the repository's historical Python
and Kaggle surfaces: the hosted runtime must not depend on running the notebook
or an unsupported Python backend.

## Official basis and selected shape

Reviewed on 2026-08-12:

- [ChatGPT Sites developer guide](https://learn.chatgpt.com/docs/sites)
- [Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Web search tool guide](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)
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
npm run test:adapter
npm run smoke:deterministic
npm run check:secrets
npm run check:client-secrets
npm run smoke:openai:live
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

## Optional server-side OpenAI analysis

`POST /api/analysis` is the only browser-to-analysis boundary. The route
accepts a normalized public-interest question and a source limit (default 5,
hard maximum 8), then reads `OPENAI_API_KEY` only from the server process. The
client never imports the OpenAI adapter and receives no raw provider response
or unbounded source text.

The adapter uses the current OpenAI JavaScript SDK with:

- `responses.parse(...)` and `zodTextFormat(...)` for runtime-validated
  Structured Outputs;
- the built-in `{ type: "web_search" }` tool for bounded source discovery;
- `include: ["web_search_call.action.sources"]` plus URL-citation annotations
  for available search provenance;
- `store: false`, a 20-second request timeout, and zero automatic retries.

Discovered items are not canonical evidence. Each accepted HTTPS source is
passed through the source snapshot/provenance contract as a `partial` candidate
snapshot containing only a bounded search-provided excerpt. This implementation
does not fetch pages, follow redirects, crawl links, or accept user-supplied
fetch URLs. Each partial snapshot is extracted independently with no tools
before any candidate is serialized. Cross-source temporal reasoning remains out
of scope.

If the key is missing or a known live-provider failure occurs, the route returns
the deterministic prepared case with explicit `fallback` status and no
canonical mutation. Set `RUN_OPENAI_LIVE_SMOKE=1` only when intentionally
authorizing the opt-in, potentially billable smoke; the default command prints
a skip result and makes no OpenAI request.

For local development, provide `OPENAI_API_KEY` through the server process
environment. Do not create or commit `.env` files. For a future hosted Site,
configure the secret in the ChatGPT Sites environment settings rather than in
browser-public variables or `.openai/hosting.json`.

## Sites management boundary

Codex CLI and the IDE can edit and test this local project, but the official
guide states they do not provide a standalone Sites management view. The Sites
project, hosted versions, audience access, analytics, and production address
are managed from ChatGPT web or the desktop app. None of those hosted operations
is performed or represented in this implementation.
