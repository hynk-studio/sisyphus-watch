# Sisyphus Watch ChatGPT Site foundation

This directory is the local ChatGPT Sites-compatible project for Sisyphus
Watch. It is intentionally separate from the repository's historical Python
and Kaggle surfaces: the hosted runtime must not depend on running the notebook
or an unsupported Python backend.

## Official basis and selected shape

Reviewed on 2026-08-17:

- [ChatGPT Sites developer guide](https://learn.chatgpt.com/docs/sites)
- [Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Web search tool guide](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)
- [OpenAI API error codes](https://developers.openai.com/api/docs/guides/error-codes)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare Worker limits](https://developers.cloudflare.com/workers/platform/limits/)
- the current bundled Sites `vinext-starter`, initialized by the OpenAI Sites
  workflow

The selected shape uses vinext's App Router compatibility layer, Vite, React,
and a Cloudflare Worker-compatible ESM entry point. It keeps the starter's
`sites()` Vite plugin and worker boundary. This supports server-rendered UI,
route handlers, and a Site-managed D1 binding. No authentication or visitor
identity store is added.

`.openai/hosting.json` came from the supported starter and now declares the
logical D1 binding `DB`; `r2` remains `null`. The linked project now targets the
owner-provided D1-capable replacement Site, and the file contains no secret. The
migration in `drizzle/` is packaged for a later owner-controlled Sites version.
This repository change does not create or modify a hosted database or production
binding.

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

`smoke:openai:live` is opt-in and potentially billable. Do not run it without
separate owner authorization.

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

## Bounded server-side OpenAI analysis

`POST /api/lineage` is the sole public billable boundary. The browser-facing
`POST /api/analysis` route is disabled and cannot invoke provider work. The
lineage route accepts only a normalized public-interest question, an optional source limit
(public default 3, public maximum 5), and an optional discovery profile. The
profile defaults to `standard`. Requests above 5 are rejected before adapter or
provider work. The analysis adapter retains a separate internal hard maximum of
8 for direct unit/stress use; 8 is not a public browser-route option. Only after
validation and admission does the route use `OPENAI_API_KEY` from the server
runtime. The client never imports the OpenAI adapter and receives no raw
provider response or unbounded source text.

The adapter uses the current OpenAI JavaScript SDK with:

- `responses.parse(...)` and `zodTextFormat(...)` for runtime schema-checked
  Structured Outputs;
- the built-in `{ type: "web_search" }` tool for bounded source discovery;
- `include: ["web_search_call.action.sources"]` plus URL-citation annotations
  for available search provenance;
- `store: false`, a 20-second per-request timeout, a 110-second whole-workflow
  deadline, and zero automatic retries;
- `max_tool_calls: 2` and `max_output_tokens: 6000` on discovery requests;
- `max_output_tokens: 4000` on source-local extraction requests; and
- a deterministic extraction pool with concurrency 2.

The installed `openai@7.4.0` request types were inspected before selecting
these parameters. `max_tool_calls` bounds total built-in tool calls within one
response, so two permits one bounded refinement while preventing open-ended
search use. These defaults have deterministic request-object coverage but still
require a later separately authorized provider-quality acceptance test.

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

Coverage summaries carry an explicit basis. `live_discovery` summaries contain
requested/returned baseline and expansion telemetry from an actual search run.
`prepared_fixture` summaries contain only curated fixture lane coverage; they
do not contain pass telemetry or claim that coverage expansion was attempted or
completed. When a live attempt falls back, the requested profile and failure
remain in run metadata and warnings while the visible lane counts are explicitly
identified as prepared fallback fixture coverage.

If only the expansion pass fails, a usable baseline remains a partial live
result with an explicit warning. A total live failure retains the prepared
fallback behavior and is never labeled successful live analysis.

### Provider-call planning bounds

The existing orchestration uses one discovery request for a standard review,
or at most two discovery requests for coverage expansion, followed by one
source-local extraction request per returned source. Absent partial failure,
the public planning shape is:

| Public source limit | Discovery profile | Discovery requests | Extraction requests | Approximate total | Reserved work units |
| --- | --- | ---: | ---: | ---: | ---: |
| 3 | Standard review | 1 | 3 | 4 | 6 |
| 3 | Expand source coverage | up to 2 | 3 | 5 | 9 |
| 5 | Standard review | 1 | 5 | 6 | 8 |
| 5 | Expand source coverage | up to 2 | 5 | 7 | 11 |

These are planning bounds for rate/cost preparation, not a promise that every
run completes every request. Work units conservatively reserve one unit per
provider request plus the two-call web-search ceiling for each discovery pass;
they are inspectable capacity units, not exact token or currency estimates.
There are no automatic provider retries, streaming responses, or background
jobs. Once less than two seconds remains in the 110-second workflow budget, no
new provider operation starts, and the shared abort signal is propagated to
in-flight SDK requests. The deadline covers the maximum public shape of two
sequential 20-second discovery requests plus three two-at-a-time extraction
waves (up to 60 seconds), with 10 seconds for bounded orchestration and packet
assembly. Cloudflare documents no hard HTTP Worker wall-time limit while the
client stays connected.

An exact hard-spend or workflow-deadline signal sets one shared terminal cause
for the extraction pool. No later source extraction starts, cleanly abortable
in-flight work receives the same signal, and a spend-triggered abort is not
reclassified as a deadline. There is still no retry orchestration.

### Atomic anonymous admission

Every public request is validated before runtime resolution, storage mutation,
or provider work. A valid request computes the deterministic work shape above
and attempts one aggregate reservation in D1. Admission is bounded to two
concurrent investigations, 60 work units per UTC hour, and 240 work units per
UTC day. Active leases expire after 150 seconds; stale active rows are marked
expired before a later reservation, and old completed rows are pruned after
their budget relevance ends.

The reservation is not a Worker-local counter and does not use a naive
read/check/write sequence. D1 executes stale reconciliation, retention, and the
conditional `INSERT ... SELECT ... WHERE` as one transactional `batch()`. The
conditional insert checks active, hourly, and daily capacity inside the write
transaction. Settlement updates only an `active` reservation, making duplicate
settlement a no-op; no decrementing counter can become negative. Consumed work
units remain conservatively charged within their windows on success, provider
failure, deadline, or unexpected failure.

The table stores only a random reservation ID, work units, UTC window keys,
status, and lease/settlement timestamps. It does not store the visitor question,
result packet, source content, discovered URLs, IP address, headers, user agent,
cookies, device fingerprint, or account identity. Aggregate admission limits
total capacity but cannot guarantee fairness between anonymous visitors and are
not claimed as strong identity-based abuse prevention.

Capacity denial returns a typed HTTP 429 with a deterministic `Retry-After`
derived from the limiting window or lease. It never substitutes the unrelated
prepared cooling-center packet: an existing packet remains intact, and the
prepared example stays a separate explicit action. An unavailable admission
backend returns a bounded 503 before provider work.

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
checked only for containment inside that model-generated summary; they are
not represented as source-page quotations or independently verified evidence.
Actor-claim and action candidates carry the actor identified by the bounded
record, or explicit `null` when the actor is unavailable or ambiguous. The
source publisher is never substituted as claimant or action actor. A separate
Unicode-aware lexical containment check requires a proposed actor to occur as
a complete token sequence, but it does not independently prove grammatical
performer or claimant role; those semantic-review fields remain model-produced.
Actor-claim and action text with a narrow, high-confidence unfinished tail
(currently a dangling terminal `and`/`or`, exposed terminal hyphen/slash, or
unclosed delimiter) is skipped rather than completed or repaired. The source
snapshot and model-generated candidate summary remain available, and the run
records only a bounded count-based limitation without copying the rejected text.
Every displayed live candidate includes a direct clickable URL citation or web-
search source reference mapped to its source and snapshot IDs. Cross-source
temporal reasoning is not performed by the analysis adapter itself.

Ordinary known live-provider failures may still return the deterministic
prepared case with explicit `fallback` status and no canonical mutation. A
workflow deadline instead returns a typed bounded timeout, and exact observable
project/organization spend-limit codes return a typed service-budget boundary;
neither is mislabeled as a successful live run. Set `RUN_OPENAI_LIVE_SMOKE=1` only when intentionally
authorizing the opt-in, potentially billable smoke; the default command prints
a skip result and makes no OpenAI request.

For local development, provide `OPENAI_API_KEY` through the server process
environment. Do not create or commit `.env` files. For a future hosted Site,
configure the secret in the ChatGPT Sites environment settings rather than in
browser-public variables or `.openai/hosting.json`.

## Site-ready temporal claim lineage

`POST /api/lineage` owns the shared public admission/execution boundary and
adapts deterministic fallback and live candidate runs into the same schema-checked
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
coverage gap around the baseline. A hint can admit an otherwise missed claim
pair only when the claims share at least one normalized non-stopword topic
token, and hint-only admissions are deterministically capped at two claim pairs
per hinted source pair before the existing 64-pair workload cap. Admitted pairs
remain `unresolved`, low-confidence, insufficient-evidence review candidates;
the hint does not imply corroboration, contradiction, correction, supersession,
truth, or falsity. Evidence-to-claim relations remain outside this bounded
lineage architecture.

All new claim families, relations, and lineage rows use non-canonical candidate
IDs and remain review-only. Confidence cannot promote them. Correction and
supersession require inspectable actor linkage, temporal ordering, and explicit
fixture replacement/correction support; otherwise the engine emits a weaker
or unresolved result. Event time, actor assertion time, publication time, and
Sisyphus retrieval time remain separate fields, and any selected display axis
is named explicitly. Normalized timestamps also carry explicit `day`, `instant`,
or `null` precision: an original `YYYY-MM-DD` renders as a date only, while a
timezone-bearing midnight remains an exact UTC instant. Precision is never
inferred from a normalized midnight clock value. A UTC date containing day and
instant precision becomes an explicit mixed-precision presentation group. Exact
instants retain their known clock order within that group; day-level records are
shown separately with no implied before/after position. Relation endpoints use
stable non-chronological record order for such pairs, and correction/supersession
rules cannot use the midnight surrogate as ordering evidence. Different dates
continue to order normally.

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

## Portable public evidence and agent contact

`SiteReadyCasePacket` remains the internal browser/Site read model. BFG8H adds a
separate allow-list-projected public contract:

```text
sisyphus_public_evidence_packet.v1
```

The public packet deliberately omits run IDs, search-call and raw API
provenance, hashes, bounded-work counters, focused-detail keys, admission and
reservation state, environment/credential state, provider request identifiers,
and authentication/session/user identity. It retains public source identity,
the captured-fixture versus model-generated-summary distinction, findings,
actor claims, actions, four separate time meanings, candidate relations and
review status, unresolved questions, limitations, and
`canonical_mutation: "none"`.

The selected prepared example is exportable only as
`synthetic_prepared_example`. Its sources use `url: null` and `domain: null`,
and any canonical record label is explicitly fixture-internal rather than
real-world truth verification. A failed live attempt is different: the public
representation is `sisyphus_public_no_result.v1`, contains no prepared fixture
evidence, forbids automatic retry, and warns that provider work may already
have occurred.

The result workspace exposes client-only **Copy shareable brief**, **Download
Markdown**, and **Download JSON** actions. All three start from the same public
serializer. They use only the already-displayed packet: no new investigation,
provider request, D1 write, server export persistence, automatic publication,
or focused-detail request occurs. Export filenames are fixed rather than
derived from untrusted question text. Markdown and shareable rendering escapes
untrusted control syntax, emits no raw HTML, and creates links only for
validated `http:` or `https:` URLs.

`GET /api/lineage` is a static, nonbillable capability document. It performs no
runtime read, D1 readiness check, admission reservation, provider call, or
persistence write. `/openapi.json` describes the real bounded POST request and
public response/error surface. To request the machine-readable public
representation from the existing POST, send:

```text
Accept: application/vnd.sisyphus.public-evidence.v1+json
```

The strict JSON body remains `question`, optional `sourceLimit` (1–5, default
3), and optional `discoveryProfile`; representation selection is not a body
field. The accepted investigation runs at most once, then the finished internal
packet is projected. The browser omits this vendor `Accept` value and continues
to receive the existing Site packet.

Retry semantics are intentionally conservative:

- 400: provider work has not begun; do not retry until the request changes.
- 429 `capacity_exhausted`: provider work has not begun for that denied
  request; honor `Retry-After` when present and retry only if still needed.
- 429 spend boundary: no automatic retry; `Retry-After` is not guaranteed.
- HTTP 200 no-result: provider work may already have occurred; no automatic
  retry.
- 500, 503, 504, or network interruption: delivery/provider-work state may be
  uncertain; do not retry blindly.

The surface does not claim idempotency, persistence, authentication, CORS
expansion, universal agent discovery, or safe blind retry.

Same-source relation candidates remain in the packet, accessible relation list,
and focused inspector. The current desktop/mobile spatial path omits only their
degenerate source-to-source self-loop geometry; cross-source relation rendering
and packet relation counts remain unchanged.

## Sites management boundary

Codex CLI and the IDE can edit and test this local project, but the official
guide states they do not provide a standalone Sites management view. The Sites
project, hosted versions, audience access, analytics, and production address
are managed from ChatGPT web or the desktop app. None of those hosted operations
is performed or represented in this implementation.

## Public experience and live-mode flag

The first-load experience uses the deterministic cooling-center case and the
schema-checked `site_ready_case_packet.v1` contract. Overview, Timeline, Claim
lineage, Sources, and Unresolved views consume that contract without rebuilding
relation, family, provenance, or canonical-state rules in React. Focused
prepared-case details use the stable `/api/lineage/:caseId` detail route.

Live analysis is closed by default. Set the non-secret server flag below only
when a reviewed environment should expose the bounded live route:

```text
SISYPHUS_LIVE_ENABLED=true
```

The rendered interface advertises self-service live work only when the flag is
true, the server API key is present, and the D1 admission table passes a safe
readiness query. Only that composite boolean reaches browser code. No secret
name/value, binding detail, counter, or spend information is serialized.
`OPENAI_API_KEY` remains a server-only secret and must be configured separately
in a later owner-controlled Sites environment step.

The public route retains the 12–500 normalized-question bound, 4 KB request-body
bound, public five-source maximum, internal eight-source hard maximum, 64-pair
relation-work maximum, bounded response structures, provider timeout, no
arbitrary URL input, no recursive crawling, and no visitor/result persistence.
The browser uses a synchronous one-in-flight request identity guard and a
30-second in-memory cooldown after success or failure. The cooldown prevents
accidental repeats in one page session; it is not strong abuse prevention and
uses no local storage, session storage, cookie, or R2 state. D1 holds only the
aggregate admission leases described above; it is not a visitor state store.

The installed SDK exposes structured provider error codes. Exact
`credit_balance_exhausted`, `organization_spend_limit_exceeded`,
`project_spend_limit_exceeded`, and `organization_usage_limit_exceeded` values
map to one bounded public service-budget error before the broader HTTP 429
rate-limit classification. Ambiguous quota failures remain generic rather than
inventing project/account detail. Source content cannot change the discovery profile, authorize tools,
request secrets, or mutate canonical state. Disabling live mode does not affect
the prepared case.
