# Map Grammar v1 browser QA harness

This test-only Vite entry mounts the production `InvestigationMapView` and
`FocusedDetailPanel` with the prepared packet and
`buildMapDensityFixture(3 | 5 | 8)`, plus one deterministic occurrence-Unplaced
packet. It does not add a production route, run the
Vinext/Worker stack, or call a provider/API.

From `site/`, start it with:

```sh
npx vite --config tests/map-v1-browser-qa/vite.config.ts
```

Then open:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html
```

For deterministic landing and result-navigation QA, open the same production
component harness with:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=experience
```

For the synthetic temporal-acceptance packet and the simulated live-loading
composer, use:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=temporal
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=live-relations
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=source-backed
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=source-rationale
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=loading
```

For the browser-local Saved Watch loop and the storage-unavailable state, use:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-storage-unavailable
```

For deterministic hierarchy and migration fixtures, use:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=no-watch
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-landing-legacy
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-landing-v2
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-prepared-unrelated
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-prepared-same
```

These surfaces seed only the owned Watch key before the production component
mounts. The legacy fixture records its initial bytes on the document element so
browser QA can prove hydration performs no write. On the prepared hierarchy
surfaces, activate the normal Prepared control to inspect unrelated- and
same-topic Watch behavior below the active workspace.

For deterministic production Since-last-check relation-evidence states, use:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-delta-unchanged
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-delta-clarified
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-delta-legacy
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-delta-not-reobserved
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-delta-unavailable
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=watch-delta-direction
```

These pages mount the production `InvestigationDeltaPanel` with local validated
snapshots and a fetch guard. They make no Relay, provider, hosted, or same-origin
API request.

For the relay-first execution boundary, use:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=public-default
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=relay
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=relay-failure
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=sponsored
```

These surfaces mount the production `CaseExplorer` and install a test-page-only
fetch mock before render. Relay capability and lineage requests are accepted
only at `https://relay.example/v1/capabilities` and
`https://relay.example/v1/lineage`; sponsored lineage is accepted only at the
same-origin `/api/lineage` path. The harness records capability, relay, and
operator call counts plus the last target, credentials mode, and redirect mode
on the document element as `data-qa-*` attributes. Any other fetch throws before
network traffic. No provider, hosted route, or D1 request is made.

The Watch surface uses the same browser-direct relay mock with a deterministic
packet A then packet B sequence selected from the validated owned Watch key, so
a real reload exercises Watch and relay-metadata restoration without adding
another browser-storage key. The restored relay endpoint makes zero automatic
requests and requires explicit Reconnect. The unavailable surface injects a storage
adapter whose read, write, and remove operations throw, while keeping the same
local packet-A response.

The temporal surface starts a local live-style zero-relation packet when the
prepared-example control is activated. The live-relations surface uses the same
production result shell with a deterministic nonzero-relation packet in live
presentation mode. The source-backed surface uses a deterministic Site packet v2
with one unresolved candidate relation and one directed source-supported
supersession signal. The loading surface passes `isLoading=true` directly to the
production composer. A test-page fetch guard records attempted calls and blocks
them before traffic; these surfaces do not submit `/api/lineage`.

The source-rationale surface renders a valid bounded reviewer rationale containing
ordinary-language uses of `accepted` and `canonical` so presentation preservation
can be checked without permitting those words in product-authored status labels.

That surface mounts the production `CaseExplorer` with local live capability
presentation enabled. It does not submit the composer, call `/api/lineage`, or
touch a provider or D1 unless a tester explicitly activates the primary live
submission control.

Build it without writing generated output into the repository:

```sh
npx vite build --config tests/map-v1-browser-qa/vite.config.ts \
  --outDir /tmp/sisyphus-map-v1-browser-qa-build --emptyOutDir
```

Use the `QA packet` selector to switch between the prepared, 3-source,
5-source, 8-source, and selected-axis Unplaced cases. Fixture switching remounts
the Map so each packet
begins on its own occurrence-primary initial axis and derives its own stable row
ordinal. The production axis, coverage lens, focus, trace, adaptive relation
mode, responsive chapter transformation, and Inspector controls remain active.

When either Map skip link receives focus, the harness records browser-derived
containment evidence on `.map-skip-links`:

- `data-qa-focused="true"`
- `data-qa-inside-viewport="true"`
- `data-qa-page-overflow="0"`

The harness emits a console error if a focused skip-link surface leaves the
viewport or creates page-level horizontal overflow.
