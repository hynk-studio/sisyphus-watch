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
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html?surface=loading
```

The temporal surface starts only the local synthetic packet when the prepared
example control is activated. The loading surface passes `isLoading=true`
directly to the production composer; neither surface submits `/api/lineage`.

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
