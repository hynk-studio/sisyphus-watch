# Sisyphus Watch ChatGPT Site foundation

This directory is the local ChatGPT Sites-compatible project for Sisyphus
Watch. It is intentionally separate from the repository's historical Python
and Kaggle surfaces: the hosted runtime must not depend on running the notebook
or an unsupported Python backend.

## Official basis and selected shape

Reviewed on 2026-08-13:

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
npm run test:lineage
npm run test:experience
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

`POST /api/analysis` is the source-local browser-to-analysis boundary. The route
accepts only a normalized public-interest question, an optional source limit
(default 5, hard maximum 8), and an optional discovery profile. The profile
defaults to `standard`. The route then reads `OPENAI_API_KEY` only from the
server process. The client never imports the OpenAI adapter and receives no raw
provider response or unbounded source text.

The adapter uses the current OpenAI JavaScript SDK with:

- `responses.parse(...)` and `zodTextFormat(...)` for runtime-validated
  Structured Outputs;
- the built-in `{ type: "web_search" }` tool for bounded source discovery;
- `include: ["web_search_call.action.sources"]` plus URL-citation annotations
  for available search provenance;
- `store: false`, a 20-second request timeout, and zero automatic retries.

### Discovery profiles

`standard` preserves the original one-pass behavior: one compact web-search
pass prefers directly relevant conventional public sources such as official
records, primary public documents, direct actor statements, and established
reporting.

`coverage_expansion` complements that baseline with one additional bounded
pass. It asks for directly relevant source roles that conventional
authority-oriented search may under-surface: primary or origin records, local
or firsthand observations, community-organization records, specialist context,
early reports, and later challenge, narrowing, or correction signals. This is
not a reliability downgrade or a generic alternative-sources mode. Lower
authority does not mean false, higher authority does not mean true, and source
inclusion is neither endorsement nor truth adjudication.

The total hard maximum remains eight. Deterministic allocations are `1 + 2`
for a three-source request, `2 + 3` for five, and `3 + 5` for eight. If the
baseline returns fewer than its allocation, its unused capacity is offered to
the single expansion pass. Exact normalized URLs are deduplicated across
passes, while distinct documents on the same domain remain eligible. There are
no recursive retries to fill missing roles. Missing lanes are reported as
coverage gaps, and the packet never claims complete or exhaustive web coverage.

If only the expansion pass fails, a usable baseline remains a partial live
result with an explicit warning. A total live failure retains the prepared
fallback behavior and is never labeled successful live analysis.

Every source carries selection metadata for discovery pass/lane, source
context, information proximity, and a concise inclusion reason. Prepared
fixture metadata is curated; live/model-derived classification is always
`candidate_review_only`. These fields stay separate from epistemic status and
cannot raise or lower candidate confidence, relation confidence, truth
likelihood, or canonical state. No trust, reliability, authority, or truth
probability score is computed.

Discovered items are not canonical evidence. Each accepted HTTPS source is
passed through the source snapshot/provenance contract as a `partial` candidate
snapshot. Its `source_text` and `evidence_excerpt` are explicitly `null`; the
separate `web_search_grounded_candidate_summary` field contains a bounded,
model-generated search-grounded summary. The API source list and URL-citation
annotations establish URL/citation provenance, not a verbatim excerpt from the
page. `content_sha256` therefore remains `null`, while a separate candidate-
summary hash records only that weaker model-generated artifact.

This implementation does not fetch pages, follow redirects, crawl links, or
accept user-supplied fetch URLs. Each partial record is extracted independently
with no tools before any candidate is serialized. Candidate support spans are
validated only for containment inside that model-generated summary; they are
not represented as source-page quotations or independently verified evidence.
Actor-claim and action candidates carry the actor identified by the bounded
record, or explicit `null` when the actor is unavailable or ambiguous. The
source publisher is never substituted as claimant or action actor.
Every displayed live candidate includes a direct clickable URL citation or web-
search source reference mapped to its source and snapshot IDs. Cross-source
temporal reasoning is not performed by the analysis adapter itself.

If the key is missing or a known live-provider failure occurs, the route returns
the deterministic prepared case with explicit `fallback` status and no
canonical mutation. Set `RUN_OPENAI_LIVE_SMOKE=1` only when intentionally
authorizing the opt-in, potentially billable smoke; the default command prints
a skip result and makes no OpenAI request.

For local development, provide `OPENAI_API_KEY` through the server process
environment. Do not create or commit `.env` files. For a future hosted Site,
configure the secret in the ChatGPT Sites environment settings rather than in
browser-public variables or `.openai/hosting.json`.

## Site-ready temporal claim lineage

`POST /api/lineage` reuses the existing server-only analysis boundary and
adapts deterministic fallback and live candidate runs into the same validated
`site_ready_case_packet.v1` contract. `GET /api/lineage/:caseId` serves the
deterministic prepared packet. Focused prepared-case detail is available at:

```text
GET /api/lineage/:caseId?focus=source|claim_occurrence|claim_family|relation|timeline_row|lineage_row|unresolved_question&id=:stableId
```

The lineage engine creates one occurrence per source-bound claim, evaluates
logical occurrence pairs with deterministic actor, topic-token, claim-type,
and date signals, and stops plausible-pair work at a hard maximum of 64. The
packet records theoretical, filtered, deferred, unrelated, unresolved, and
model-classified counts. If the cap is reached, it reports the exact deferral
and does not claim completeness.

An expansion source may carry a weak comparison target naming a selected
baseline source. That hint means only that the source was selected to inspect a
coverage gap around the baseline. It can admit an otherwise missed claim pair
to conservative review only as `unresolved`; it does not imply corroboration,
contradiction, correction, supersession, truth, or falsity. Evidence-to-claim
relations remain outside this bounded lineage architecture.

All new claim families, relations, and lineage rows use non-canonical candidate
IDs and remain review-only. Confidence cannot promote them. Correction and
supersession require inspectable actor linkage, temporal ordering, and explicit
fixture replacement/correction support; otherwise the engine emits a weaker
or unresolved result. Event time, actor assertion time, publication time, and
Sisyphus retrieval time remain separate fields, and any selected display axis
is named explicitly.

Only `actor_claim` records become live `ClaimOccurrence` records. Findings and
actions remain in their dedicated packet lanes, while standalone event/assertion
time candidates remain in `time_candidates`. A valid live run with no actual
claim record therefore has zero claim occurrences, families, relations,
timeline rows, and lineage rows rather than fabricated claim state.

Live partial records retain the weaker #32 provenance model: relation support
can point only to a bounded model-generated web-search summary span and its URL
or citation metadata. It is never relabeled captured page evidence. The #33
stage does not add another OpenAI client or make a relation-classification API
call; `model_classified_count` is deterministically zero. The initial packet
contains no full fixture source text or raw provider response.

## Sites management boundary

Codex CLI and the IDE can edit and test this local project, but the official
guide states they do not provide a standalone Sites management view. The Sites
project, hosted versions, audience access, analytics, and production address
are managed from ChatGPT web or the desktop app. None of those hosted operations
is performed or represented in this implementation.

## Public experience and live-mode flag

The first-load experience uses the deterministic cooling-center case and the
validated `site_ready_case_packet.v1` contract. Overview, Timeline, Claim
lineage, Sources, and Unresolved views consume that contract without rebuilding
relation, family, provenance, or canonical-state rules in React. Focused
prepared-case details use the stable `/api/lineage/:caseId` detail route.

Live analysis is closed by default. Set the non-secret server flag below only
when a reviewed environment should expose the existing bounded live route:

```text
SISYPHUS_LIVE_ENABLED=true
```

The flag is evaluated server-side and only the boolean enabled state reaches
the rendered interface. `OPENAI_API_KEY` remains a server-only secret and must
be configured separately in the server or future ChatGPT Sites environment
settings. A missing key or known provider failure returns an explicitly labeled
prepared fallback; it is never represented as a successful live run.

The public route retains the 500-character question maximum, eight-source hard
maximum, 64-pair relation-work maximum, bounded request/response sizes, provider
timeout, no arbitrary URL input, no recursive crawling, and no visitor/result
persistence. Source content cannot change the discovery profile, authorize
tools, request secrets, or mutate canonical state. Disabling live mode does not
affect the prepared case.
