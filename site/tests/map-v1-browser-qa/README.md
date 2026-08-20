# Map Grammar v1 browser QA harness

This test-only Vite entry mounts the production `InvestigationMapView` and
`FocusedDetailPanel` with the prepared packet and
`buildMapDensityFixture(3 | 5 | 8)`. It does not add a production route, run the
Vinext/Worker stack, or call a provider/API.

From `site/`, start it with:

```sh
npx vite --config tests/map-v1-browser-qa/vite.config.ts
```

Then open:

```text
http://127.0.0.1:4179/tests/map-v1-browser-qa/index.html
```

Build it without writing generated output into the repository:

```sh
npx vite build --config tests/map-v1-browser-qa/vite.config.ts \
  --outDir /tmp/sisyphus-map-v1-browser-qa-build --emptyOutDir
```

Use the `QA packet` selector to switch between the prepared, 3-source,
5-source, and 8-source cases. Fixture switching remounts the Map so each packet
begins on its own occurrence-primary initial axis and derives its own stable row
ordinal. The production axis, coverage lens, focus, trace, adaptive relation
mode, responsive chapter transformation, and Inspector controls remain active.
