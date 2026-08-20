import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaseExplorer,
  FirstPayoff,
  FocusedDetailPanel,
  InvestigationMapView,
  MethodView,
  SearchComposer,
  SourcesView,
  TimelineView,
  firstPayoffForPacket,
  getRunNotice,
} from "../app/components/CaseExplorer";
import {
  EXPERIENCE_VIEWS,
  VIEW_LABELS,
  actorLabel,
  publicMethodLimitations,
  recordBoundaryLabel,
  sourceContentLabel,
  timeAxisSemanticNote,
  type TimeAxis,
} from "../app/lib/experience";
import {
  FocusedDetailSupplementCache,
  focusedDetailKey,
  needsPreparedDetailSupplement,
} from "../app/lib/focused-detail";
import {
  deriveInvestigationMap,
  spatialRelationEdges,
} from "../app/lib/investigation-map";
import {
  isLiveAnalysisEnabled,
  liveAnalysisDisabledResponse,
} from "../app/lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import { getSiteReadyCaseDetail } from "../app/lib/lineage/details";
import { getPreparedCaseDetail } from "../app/lib/read-model";
import { POST as postLineage } from "../app/api/lineage/route";
import {
  INSPECTOR_ACCESSIBILITY_MODELS,
  INSPECTOR_CLOSE_KEY,
  MOBILE_INSPECTOR_MEDIA_QUERY,
  focusedRecordStatusLabel,
} from "../app/components/FocusedDetailPanel";
import { mapCanvasHasHorizontalOverflow } from "../app/components/InvestigationMapView";
import {
  focusTriggerId,
  type FocusSelection,
} from "../app/components/investigation-types";
import {
  PUBLIC_LIVE_COOLDOWN_MS,
  PublicLiveRunGuard,
  publicRerunSourceLimit,
} from "../app/lib/public-live";
import {
  buildMapDensityFixture,
  buildSameSourceRelationFixture,
  buildUnplacedOccurrenceFixture,
} from "./fixtures/map-density";

const noop = () => undefined;

test("Site metadata declares a repository-contained icon", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const icon = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
  assert.match(layout, /icons:\s*\{[\s\S]*?icon:\s*"\/icon\.svg"/);
  assert.match(icon, /^<svg[\s\S]*viewBox="0 0 32 32"/);
  assert.doesNotMatch(icon, /(?:href|src)=["']https?:\/\//);
});

test("live-disabled landing makes the prepared investigation the primary usable action without false editable affordances", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
    liveEnabled: false,
  }));

  assert.match(html, /Explore how public information changes/);
  assert.match(html, /class="prepared-primary-button"/);
  assert.match(html, /Explore the prepared investigation/);
  assert.match(html, /Public live investigations are unavailable right now/);
  assert.match(html, /available working path/);
  assert.match(html, /How live investigations work/);
  assert.doesNotMatch(html, /<textarea/);
  assert.doesNotMatch(html, /type="radio"/);
  assert.doesNotMatch(html, /<select/);
  assert.doesNotMatch(html, /Build investigation map/);
  assert.doesNotMatch(html, /id="investigation-workspace"/);
  assert.doesNotMatch(html, /Prepared demonstration/);
  assert.equal(JSON.stringify(packet), before);
});

test("the persistent top target and visible page heading follow the active surface", () => {
  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  const composerHtml = renderToStaticMarkup(createElement(SearchComposer, {
    question: "",
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: false,
    isLoading: false,
    cooldownRemainingSeconds: 0,
    routeError: null,
    investigationStarted: true,
    onQuestionChange: noop,
    onSourceLimitChange: noop,
    onDiscoveryProfileChange: noop,
    onSubmit: noop,
    onPreparedExample: noop,
  }));

  assert.match(explorerSource, /<main className="site-shell" id="top">/);
  assert.match(explorerSource, /<h1 id="case-title">/);
  assert.match(composerHtml, /<h2 id="composer-title">/);
  assert.doesNotMatch(composerHtml, /<h1/);
});

test("live composer exposes the existing bounded request controls without claiming success", () => {
  const html = renderToStaticMarkup(createElement(SearchComposer, {
    question: "How is public access changing?",
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: true,
    isLoading: false,
    cooldownRemainingSeconds: 0,
    routeError: null,
    investigationStarted: false,
    onQuestionChange: noop,
    onSourceLimitChange: noop,
    onDiscoveryProfileChange: noop,
    onSubmit: noop,
    onPreparedExample: noop,
  }));

  assert.match(html, /minLength="12"/);
  assert.match(html, /maxLength="500"/);
  assert.match(html, /value="3" selected=""/);
  assert.match(html, /3 sources/);
  assert.match(html, /5 sources · broader and slower/);
  assert.doesNotMatch(html, /8 sources/);
  assert.match(html, /Bounded live discovery is available/);
  assert.match(html, /live, partial, or a clearly labeled prepared fallback/);
  assert.doesNotMatch(html, /\bvalidated\b/i);
  assert.doesNotMatch(html, /disabled=""/);
  assert.ok(html.indexOf("Build investigation map") < html.indexOf("Try the cooling-center example"));
});

test("first payoff resolves one existing source-bound finding without fabricating fallback evidence", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const intendedSource = packet.source_snapshot_summaries[1];
  const otherSource = packet.source_snapshot_summaries[0];
  packet.source_bound_findings[0].text = "One existing source-bound finding.";
  packet.source_bound_findings[0].source_ids = [intendedSource.source_id];

  const payoff = firstPayoffForPacket(packet);
  assert.equal(payoff?.source.source_id, intendedSource.source_id);
  assert.equal(payoff?.finding.text, "One existing source-bound finding.");

  const html = renderToStaticMarkup(createElement(FirstPayoff, {
    packet,
    onFocus: noop,
  }));
  assert.match(html, /Start here/);
  assert.match(html, /Synthetic fixture · prepared example/);
  assert.match(html, /One existing source-bound finding/);
  assert.match(html, /<p class="first-payoff-finding">One existing source-bound finding\.<\/p>/);
  assert.doesNotMatch(html, /<blockquote/);
  assert.match(html, new RegExp(escapeRegex(intendedSource.title)));
  assert.doesNotMatch(html, new RegExp(escapeRegex(otherSource.title)));
  assert.match(html, /Source inclusion is not endorsement or truth verification/);
  assert.match(
    html,
    new RegExp(escapeRegex(focusTriggerId("first-payoff", {
      kind: "source",
      id: intendedSource.source_id,
    }))),
  );

  const live = structuredClone(packet);
  live.mode = "live";
  live.status = "live";
  live.source_snapshot_summaries[1].content_kind = "model_generated_web_search_summary";
  live.source_snapshot_summaries[1].source_text_captured = false;
  const liveHtml = renderToStaticMarkup(createElement(FirstPayoff, {
    packet: live,
    onFocus: noop,
  }));
  assert.match(liveHtml, /Candidate finding · review only/);
  assert.match(
    liveHtml,
    /Based on a model-generated web-search summary · not captured page text/,
  );
  assert.match(liveHtml, /<p class="first-payoff-finding">/);
  assert.doesNotMatch(liveHtml, /<blockquote/);
  assert.doesNotMatch(liveHtml, /Synthetic fixture/);

  const fallback = structuredClone(packet);
  fallback.mode = "fallback";
  fallback.status = "fallback";
  assert.equal(firstPayoffForPacket(fallback), null);
  assert.equal(renderToStaticMarkup(createElement(FirstPayoff, {
    packet: fallback,
    onFocus: noop,
  })), "");

  const unsupported = structuredClone(packet);
  unsupported.source_bound_findings[0].source_ids = ["src_missing"];
  unsupported.source_bound_findings = [unsupported.source_bound_findings[0]];
  assert.equal(firstPayoffForPacket(unsupported), null);

  const source = readFileSync(
    new URL("../app/components/FirstPayoff.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|\/api\//);
});

test("live composer presents concise privacy, review, persistence, and cost-density limits", () => {
  const html = renderToStaticMarkup(createElement(SearchComposer, {
    question: "How is public access changing?",
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: true,
    isLoading: false,
    cooldownRemainingSeconds: 0,
    routeError: null,
    investigationStarted: false,
    onQuestionChange: noop,
    onSourceLimitChange: noop,
    onDiscoveryProfileChange: noop,
    onSubmit: noop,
    onPreparedExample: noop,
  }));

  assert.match(html, /question is sent to OpenAI to discover and analyze public sources/i);
  assert.match(html, /personal, confidential, sensitive, or identifying information/i);
  assert.match(html, /does not persist visitor questions or results/i);
  assert.match(html, /Results may be incomplete or wrong/i);
  assert.match(html, /records and relations remain review candidates/i);
  assert.match(html, /Privacy &amp; limits/);
  assert.match(html, /Source inclusion is not endorsement or truth verification/i);
  assert.match(html, /20-second timeout applies to each provider request/i);
  assert.match(html, /not strong abuse prevention/i);
  assert.doesNotMatch(html, /anonymous|independently verified|fact.checked|no network activity/i);
  assert.doesNotMatch(html, /OPENAI_API_KEY|SISYPHUS_LIVE_ENABLED/);
});

test("synchronous run guard blocks rapid and overlapping actions and rejects stale responses", () => {
  let now = 1_000;
  const guard = new PublicLiveRunGuard({ now: () => now });
  let startedRequests = 0;
  const start = () => {
    const requestId = guard.begin();
    if (requestId !== null) startedRequests += 1;
    return requestId;
  };
  const buildRequest = start();
  assert.equal(buildRequest, 1);
  assert.equal(start(), null);
  assert.equal(startedRequests, 1);
  assert.equal(guard.state().inFlight, true);
  assert.equal(guard.acceptsResponse(buildRequest), true);

  guard.invalidateResponse();
  assert.equal(guard.acceptsResponse(buildRequest), false);
  assert.equal(guard.complete(buildRequest, "success"), true);
  assert.equal(guard.begin(), null);

  now += PUBLIC_LIVE_COOLDOWN_MS;
  const expandRequest = start();
  assert.equal(expandRequest, 2);
  assert.equal(guard.acceptsResponse(buildRequest), false);
  assert.equal(guard.acceptsResponse(expandRequest), true);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(explorerSource.indexOf("runGuard.current.begin()") < explorerSource.indexOf("fetch(\"/api/lineage\""));
  assert.match(explorerSource, /runGuard\.current\.acceptsResponse\(requestId\)/);
});

test("every public coverage rerun clamps the internal stress maximum to the public maximum", () => {
  assert.equal(publicRerunSourceLimit(3), 3);
  assert.equal(publicRerunSourceLimit(5), 5);
  assert.equal(publicRerunSourceLimit(8), 5);
});

test("memory-only cooldown starts after success and failure and expires on a fake clock", () => {
  let now = 10_000;
  const guard = new PublicLiveRunGuard({ now: () => now });

  const success = guard.begin();
  assert.ok(success);
  guard.complete(success, "success");
  assert.equal(guard.cooldownRemainingSeconds(), 30);
  now += 12_250;
  assert.equal(guard.cooldownRemainingSeconds(), 18);
  assert.equal(guard.begin(), null);
  now += 17_750;
  assert.equal(guard.cooldownRemainingSeconds(), 0);

  const failure = guard.begin();
  assert.ok(failure);
  guard.complete(failure, "failure");
  assert.equal(guard.cooldownRemainingSeconds(), 30);
  now += PUBLIC_LIVE_COOLDOWN_MS;
  assert.ok(guard.begin());

  const implementation = [
    readFileSync(new URL("../app/lib/public-live.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../app/components/InvestigationExplorer.tsx", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(implementation, /localStorage|sessionStorage|document\.cookie|indexedDB/);
});

test("composer disables live starts during cooldown while keeping the prepared example usable", () => {
  const html = renderToStaticMarkup(createElement(SearchComposer, {
    question: "How is public access changing?",
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: true,
    isLoading: false,
    cooldownRemainingSeconds: 12,
    routeError: null,
    investigationStarted: true,
    onQuestionChange: noop,
    onSourceLimitChange: noop,
    onDiscoveryProfileChange: noop,
    onSubmit: noop,
    onPreparedExample: noop,
  }));
  assert.match(html, /Try again in 12s/);
  assert.match(html, /Next live attempt available in 12s/);
  assert.match(html, /build-map-button" type="submit" disabled=""/);
  assert.doesNotMatch(html, /prepared-example-button" type="button" disabled/);
});

test("prepared focused detail is immediate and same-key source supplements are cached or failure-deduped", async () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const source = packet.source_snapshot_summaries[0];
  const local = getSiteReadyCaseDetail(packet, "source", source.source_id);
  assert.ok(local);
  const html = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "source", id: source.source_id, label: source.title },
    payload: local,
    state: "idle",
    onClose: noop,
  }));
  assert.match(html, /Captured evidence excerpt from the prepared record/);
  assert.doesNotMatch(html, /Loading bounded focused detail/);
  assert.equal(needsPreparedDetailSupplement(packet, "source"), true);
  assert.equal(needsPreparedDetailSupplement(packet, "relation"), false);

  const cache = new FocusedDetailSupplementCache();
  const key = focusedDetailKey(packet, "source", source.source_id);
  let requestCount = 0;
  const loader = async () => {
    requestCount += 1;
    return local;
  };
  await cache.load(key, loader);
  await cache.load(key, loader);
  await cache.load(key, loader);
  assert.equal(requestCount, 1);

  const failureCache = new FocusedDetailSupplementCache();
  let failedRequestCount = 0;
  const failedLoader = async () => {
    failedRequestCount += 1;
    throw new Error("supplement unavailable");
  };
  await assert.rejects(failureCache.load(key, failedLoader));
  await assert.rejects(failureCache.load(key, failedLoader));
  assert.equal(failedRequestCount, 1);
});

test("timeline, map, and detail expose mixed day/instant groups without losing exact order", () => {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const normalizedMidnight = "2025-07-15T00:00:00.000Z";
  packet.source_snapshot_summaries[0].published_at = normalizedMidnight;
  packet.source_snapshot_summaries[0].published_at_precision = "day";
  packet.source_snapshot_summaries[1].published_at = normalizedMidnight;
  packet.source_snapshot_summaries[1].published_at_precision = "instant";
  packet.source_snapshot_summaries[2].published_at = "2025-07-15T08:00:00.000Z";
  packet.source_snapshot_summaries[2].published_at_precision = "instant";
  packet.event_timeline_rows[0].publication_time = normalizedMidnight;
  packet.event_timeline_rows[0].publication_time_precision = "day";
  packet.event_timeline_rows[1].publication_time = normalizedMidnight;
  packet.event_timeline_rows[1].publication_time_precision = "instant";
  packet.event_timeline_rows[2].publication_time = "2025-07-15T08:00:00.000Z";
  packet.event_timeline_rows[2].publication_time_precision = "instant";
  packet.claim_occurrences[0].source_publication_time = normalizedMidnight;
  packet.claim_occurrences[0].source_publication_time_precision = "day";
  packet.claim_occurrences[1].source_publication_time = normalizedMidnight;
  packet.claim_occurrences[1].source_publication_time_precision = "instant";
  packet.claim_occurrences[2].source_publication_time = "2025-07-15T08:00:00.000Z";
  packet.claim_occurrences[2].source_publication_time_precision = "instant";

  const timeline = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "publication_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  assert.match(timeline, /Jul 15, 2025/);
  assert.match(timeline, /Jul 15, 2025[^<]*00:00 UTC/);
  assert.match(timeline, /Same-day mixed precision group/);
  assert.match(timeline, /Exact instants · clock order/);
  assert.match(timeline, /Day-level records · no within-day position/);
  assert.match(timeline, /<ul class="temporal-list temporal-peer-list">/);
  assert.doesNotMatch(timeline, /class="timeline-record-marker">\d/);
  assert.ok(timeline.indexOf("00:00 UTC") < timeline.indexOf("08:00 UTC"));

  const sources = renderToStaticMarkup(createElement(SourcesView, {
    packet,
    onFocus: noop,
  }));
  assert.match(sources, /Publication time<\/dt><dd>Jul 15, 2025<\/dd>/);
  assert.match(sources, /Publication time<\/dt><dd>Jul 15, 2025[^<]*00:00 UTC<\/dd>/);

  for (const [index, expected] of [[0, /Publication time<\/strong><p>Jul 15, 2025<\/p>/], [1, /Publication time<\/strong><p>Jul 15, 2025[^<]*00:00 UTC<\/p>/]] as const) {
    const source = packet.source_snapshot_summaries[index];
    const payload = getSiteReadyCaseDetail(packet, "source", source.source_id);
    assert.ok(payload);
    const detail = renderToStaticMarkup(createElement(FocusedDetailPanel, {
      packet,
      selection: { kind: "source", id: source.source_id, label: source.title },
      payload,
      state: "idle",
      onClose: noop,
    }));
    assert.match(detail, expected);
  }
  const relation = packet.relation_candidates[0];
  const leftOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relation.left_occurrence_id,
  );
  const rightOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relation.right_occurrence_id,
  );
  assert.ok(leftOccurrence);
  assert.ok(rightOccurrence);
  leftOccurrence.event_time_candidate = normalizedMidnight;
  leftOccurrence.event_time_candidate_precision = "day";
  rightOccurrence.event_time_candidate = "2025-07-15T08:00:00.000Z";
  rightOccurrence.event_time_candidate_precision = "instant";
  const map = deriveInvestigationMap(packet, "publication_time");
  const mapHtml = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "publication_time",
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
  assert.match(mapHtml, /Mixed precision · no artificial order/);
  assert.match(mapHtml, /Direction not established on Publication time/);
  assert.match(mapHtml, /data-direction-asserted="false"/);
  assert.doesNotMatch(`${timeline}${sources}${mapHtml}`, /Jul 14/);
});

test("timeline renders same-date day-precision records as unordered peers", () => {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const normalizedMidnight = "2025-07-15T00:00:00.000Z";
  packet.event_timeline_rows = packet.event_timeline_rows.slice(0, 2);
  for (const row of packet.event_timeline_rows) {
    row.publication_time = normalizedMidnight;
    row.publication_time_precision = "day";
  }

  const html = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "publication_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));

  assert.match(html, /<ul class="temporal-list temporal-peer-list">/);
  assert.doesNotMatch(html, /<ol class="temporal-list"/);
  assert.equal(
    html.match(
      /<time dateTime="2025-07-15T00:00:00.000Z">Jul 15, 2025<\/time>/g,
    )?.length,
    2,
  );
  assert.doesNotMatch(html, /Jul 15, 2025[^<]*UTC/);
  assert.doesNotMatch(html, /class="timeline-record-marker">\s*\d/);
});

test("inspector uses responsive desktop-nonmodal and mobile-modal semantics with Escape and stable trigger identity", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const relation = packet.relation_candidates[0];
  const payload = getSiteReadyCaseDetail(packet, "relation", relation.relation_id);
  assert.ok(payload);
  const html = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "relation", id: relation.relation_id, label: "Candidate relation" },
    payload,
    state: "idle",
    onClose: noop,
  }));
  assert.deepEqual(INSPECTOR_ACCESSIBILITY_MODELS, {
    desktop: "nonmodal",
    mobile: "modal",
  });
  assert.equal(MOBILE_INSPECTOR_MEDIA_QUERY, "(max-width: 720px)");
  assert.equal(INSPECTOR_CLOSE_KEY, "Escape");
  assert.match(html, /^<aside/);
  assert.match(html, /data-inspector-model="nonmodal"/);
  assert.doesNotMatch(html, /aria-modal/);
  assert.match(html, /aria-label="Close focused inspector"/);

  const mobileHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "relation", id: relation.relation_id, label: "Candidate relation" },
    payload,
    state: "idle",
    onClose: noop,
    modelOverride: INSPECTOR_ACCESSIBILITY_MODELS.mobile,
  }));
  assert.match(mobileHtml, /^<dialog/);
  assert.match(mobileHtml, /aria-modal="true"/);
  assert.match(mobileHtml, /data-inspector-model="modal"/);
  assert.match(mobileHtml, /aria-label="Close focused inspector"/);
  assert.equal(
    focusTriggerId("sources-card", { kind: "source", id: "stable-source" }),
    "sources-card:source:stable-source",
  );
  assert.equal(JSON.stringify(packet), before);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.detail-panel \{[\s\S]*?position: fixed/);
  assert.match(css, /\.detail-scroll \{[\s\S]*?overflow-y: auto/);
  assert.match(css, /dialog\.detail-panel::backdrop/);

  const panelSource = readFileSync(
    new URL("../app/components/FocusedDetailPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(panelSource, /dialog\.showModal\(\)/);
  assert.match(panelSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(panelSource, /onKeyDown=\{containMobileInspectorFocus\}/);
  assert.match(panelSource, /event\.shiftKey/);
  assert.match(panelSource, /last\.focus\(\{ preventScroll: true \}\)/);
  assert.match(panelSource, /first\.focus\(\{ preventScroll: true \}\)/);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(explorerSource, /const scrollY = window\.scrollY/);
  assert.match(explorerSource, /window\.scrollTo\(\{ top: scrollY, left: window\.scrollX, behavior: "instant" \}\)/);
});

test("desktop inspector offers typed, nonmutating trace actions only for claim rows while mobile exposes none", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const occurrence = packet.claim_occurrences[0];
  const relation = packet.relation_candidates[0];
  const question = packet.unresolved_questions[0];
  const selections = [
    {
      selection: {
        kind: "claim_occurrence" as const,
        id: occurrence.occurrence_id,
        label: "Prepared claim occurrence",
      },
      canTraceThread: true,
      traceLabel: "Candidate thread trace",
    },
    {
      selection: { kind: "relation" as const, id: relation.relation_id, label: "Candidate relation" },
      canTraceThread: false,
      traceLabel: null,
    },
    {
      selection: {
        kind: "unresolved_question" as const,
        id: question.question_id,
        label: "Open question 1",
      },
      canTraceThread: false,
      traceLabel: null,
    },
  ];
  let traceCalls = 0;
  let showFullMapCalls = 0;

  for (const { selection, canTraceThread, traceLabel } of selections) {
    const payload = getSiteReadyCaseDetail(packet, selection.kind, selection.id);
    assert.ok(payload);
    const mapViewActions = {
      canTraceThread,
      traceLabel: traceLabel ?? "Candidate thread trace",
      threadTraceActive: false,
      onTraceThread: () => { traceCalls += 1; },
      onShowFullMap: () => { showFullMapCalls += 1; },
    };
    const desktopHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
      packet,
      selection,
      payload,
      state: "idle",
      onClose: noop,
      mapViewActions,
      modelOverride: INSPECTOR_ACCESSIBILITY_MODELS.desktop,
    }));
    assert.match(desktopHtml, /aria-label="Focused map viewing actions"/);
    assert.match(desktopHtml, /Show full map/);
    if (canTraceThread) assert.match(desktopHtml, /Candidate thread trace/);
    else assert.doesNotMatch(desktopHtml, /Candidate thread trace/);

    const mobileHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
      packet,
      selection,
      payload,
      state: "idle",
      onClose: noop,
      mapViewActions,
      modelOverride: INSPECTOR_ACCESSIBILITY_MODELS.mobile,
    }));
    assert.doesNotMatch(mobileHtml, /Focused map viewing actions/);
    assert.doesNotMatch(mobileHtml, /Candidate thread trace/);
    assert.doesNotMatch(mobileHtml, /Show full map/);

    if (canTraceThread) mapViewActions.onTraceThread();
    mapViewActions.onShowFullMap();
  }

  assert.equal(traceCalls, 1);
  assert.equal(showFullMapCalls, 3);
  assert.equal(JSON.stringify(packet), before);

  const selectedMapHtml = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map: deriveInvestigationMap(packet, "event_time"),
    timeAxis: "event_time",
    coverageLens: "all",
    selectedKind: "claim_occurrence",
    selectedNodeId: occurrence.occurrence_id,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
  assert.match(selectedMapHtml, /Candidate thread · 2 occurrences · needs review/);
  assert.match(selectedMapHtml, /Candidate thread trace/);
  assert.match(selectedMapHtml, /class="focus-toolbar-actions"/);
  assert.equal((selectedMapHtml.match(/tabindex="-1"/g) ?? []).length, 2);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.result-layout\.has-detail \.focus-toolbar-actions \{ visibility: hidden; pointer-events: none; \}/);
  const mobileRules = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert.match(mobileRules, /\.detail-view-actions \{ display: none; \}/);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(explorerSource, /function showThreadTrace\(\)/);
  assert.match(explorerSource, /const scrollY = window\.scrollY;[\s\S]*setThreadTraceActive\(true\);[\s\S]*window\.scrollTo\(\{ top: scrollY, left: scrollX, behavior: "instant" \}\)/);
  assert.match(explorerSource, /onTraceThread=\{showThreadTrace\}/);
  assert.match(explorerSource, /onTraceThread: showThreadTrace/);
  assert.match(explorerSource, /onShowFullMap: closeDetail/);
});

test("map uses occurrence-primary claim rows with complete candidate relations and separate evidence gaps", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "event_time",
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));

  assert.deepEqual(EXPERIENCE_VIEWS, ["map", "timeline", "sources", "method"]);
  assert.deepEqual(EXPERIENCE_VIEWS.map((view) => VIEW_LABELS[view]), [
    "Map",
    "Timeline",
    "Sources",
    "Method",
  ]);
  assert.match(html, /Temporal claim-lineage matrix/);
  assert.match(html, /What changed in the public claims/);
  assert.match(html, /claim-matrix-stage/);
  assert.match(html, /claim-relation-layer/);
  assert.match(html, /Candidate thread · 2 occurrences · needs review/);
  assert.match(html, /Standalone claim occurrence · grouping unresolved/);
  assert.match(html, /Candidate connections/);
  assert.match(html, /Complete relation review ledger/);
  assert.match(html, /Unresolved evidence questions/);
  assert.match(html, /Not conclusions · Not chronological records/);
  assert.match(html, /Non-claim source records/);
  assert.match(html, /Context \/ interpretation/);
  assert.match(html, /Prepared source record/);
  assert.match(html, /Via matching claim/);
  assert.match(html, /Via action record/);
  assert.match(html, /Source-role coverage/);
  assert.match(html, /4 sources · 4 of 5 roles/);
  assert.match(html, /Original records/);
  assert.match(html, /0 · missing/);
  assert.equal((html.match(/data-occurrence-id=/g) ?? []).length, 3);
  assert.equal((html.match(/data-ledger-entry="true"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /Topic root/);
  assert.doesNotMatch(html, /mobile-investigation-path/);
  for (const question of packet.unresolved_questions) {
    assert.equal(
      (html.match(new RegExp(escapeRegex(question.question), "g")) ?? []).length,
      1,
    );
  }
});

test("Map relation language reads earlier to later without changing candidate semantics", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const eventHtml = renderMapMarkup(packet, "event_time");

  assert.match(eventHtml, /Superseded by/);
  assert.match(eventHtml, /Response follows/);
  assert.match(eventHtml, /Challenge/);
  assert.match(eventHtml, /Later Fictional City Emergency Management Office claim supersedes the earlier/);
  assert.match(eventHtml, /These claim occurrences challenge one another/);
  assert.doesNotMatch(eventHtml, />Replaces</);
  assert.doesNotMatch(eventHtml, />Responds</);

  const challenge = deriveInvestigationMap(packet, "event_time").relationLedger.find(
    (entry) => entry.relationType === "contradicts",
  );
  assert.ok(challenge);
  assert.equal(challenge.directionAsserted, false);
  assert.match(
    eventHtml,
    new RegExp(`data-relation-id="${escapeRegex(challenge.relationId)}" data-direction-asserted="false"`),
  );

  const retrievalHtml = renderMapMarkup(packet, "retrieval_time");
  assert.match(retrievalHtml, /Possible supersession between these claim occurrences/);
  assert.match(retrievalHtml, /Direction not established on Sisyphus retrieval time/);
  assert.match(retrievalHtml, /Supersession/);
  assert.doesNotMatch(retrievalHtml, /Superseded by/);
  assert.doesNotMatch(retrievalHtml, /Response follows/);
});

test("Map viewing lenses and broader provider work are separate public control regions", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const html = renderMapMarkup(packet, "event_time", true);
  const lensGroup = html.match(/<div class="lens-list"[^>]*>([\s\S]*?)<\/div><p class="lens-note">/)?.[1];
  assert.ok(lensGroup);
  assert.match(lensGroup, />All</);
  assert.match(lensGroup, />Open questions</);
  assert.doesNotMatch(lensGroup, /broader investigation|bounded provider/i);
  assert.match(html, /Run a broader investigation/);
  assert.match(html, /Starts a new bounded provider request/);
  assert.match(html, /current investigation remains unchanged/);
  assert.match(html, /Do not blindly retry while delivery status is unknown/);
  assert.match(html, /Filters only change what is emphasized/);
  assert.match(html, /never remove or alter the saved investigation/);
  assert.doesNotMatch(html, /class="focus-toolbar"/);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(explorerSource, /onExpandCoverage=\{\(\) => void runAnalysis\(\{[\s\S]*?discoveryProfile: "coverage_expansion"/);
});

test("Map removes idle and empty structural surfaces without weakening explicit Unplaced warnings", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const eventHtml = renderMapMarkup(packet, "event_time");
  assert.doesNotMatch(eventHtml, /class="unplaced-occurrence-band"/);
  assert.doesNotMatch(eventHtml, /Dated on Event time/);
  assert.match(eventHtml, /Unplaced on Event time/);
  assert.doesNotMatch(eventHtml, /No records in this selected-axis subgroup/);

  const publicationHtml = renderMapMarkup(packet, "publication_time");
  assert.match(publicationHtml, /Dated on Publication time/);
  assert.doesNotMatch(publicationHtml, /Unplaced on Publication time/);

  const unplacedPacket = buildUnplacedOccurrenceFixture();
  const unplacedHtml = renderMapMarkup(unplacedPacket, "event_time");
  assert.match(unplacedHtml, /class="unplaced-occurrence-band"/);
  assert.match(unplacedHtml, /Non-chronological region/);
  assert.match(unplacedHtml, /This is not a later chronological column/);
  assert.match(unplacedHtml, /no arrow direction is inferred through this region/);

  const bothPacket = structuredClone(packet);
  const contextSource = bothPacket.source_snapshot_summaries.find((source) =>
    !bothPacket.claim_occurrences.some((occurrence) =>
      occurrence.source_id === source.source_id
      && occurrence.snapshot_id === source.snapshot_id
    )
  );
  assert.ok(contextSource);
  bothPacket.source_snapshot_summaries.push({
    ...structuredClone(contextSource),
    source_id: "src_internal_nonclaim_unplaced_peer",
    snapshot_id: "snapshot_internal_nonclaim_unplaced_peer",
    title: "Internal unplaced non-claim peer",
    published_at: null,
    published_at_precision: null,
  });
  const bothHtml = renderMapMarkup(bothPacket, "publication_time");
  assert.match(bothHtml, /Dated on Publication time/);
  assert.match(bothHtml, /Unplaced on Publication time/);

  const zeroPacket = structuredClone(packet);
  zeroPacket.source_snapshot_summaries = zeroPacket.source_snapshot_summaries.filter(
    (source) => zeroPacket.claim_occurrences.some((occurrence) =>
      occurrence.source_id === source.source_id
      && occurrence.snapshot_id === source.snapshot_id
    ),
  );
  const zeroHtml = renderMapMarkup(zeroPacket, "event_time");
  assert.doesNotMatch(zeroHtml, /Non-claim source records/);
});

test("compact relation ledger remains complete, inspectable, and public-facing", () => {
  for (const sourceCount of [3, 5, 8] as const) {
    const packet = buildMapDensityFixture(sourceCount);
    const html = renderMapMarkup(packet, "publication_time");
    const map = deriveInvestigationMap(packet, "publication_time");
    assert.equal((html.match(/data-ledger-entry="true"/g) ?? []).length, map.relationLedger.length);
    for (const relation of map.relationLedger) {
      assert.equal(
        (html.match(new RegExp(`data-ledger-entry="true" data-relation-id="${escapeRegex(relation.relationId)}"`, "g")) ?? []).length,
        1,
      );
      assert.match(html, new RegExp(`>${escapeRegex(relation.publicNumber)}<`));
    }
    assert.match(html, /Needs review/);
    assert.match(html, /Full claims, sources, times, and reasoning/);
    assert.match(html, /First occurrence/);
    assert.match(html, /Second occurrence/);
  }

  const longClaimPacket = structuredClone(buildPreparedSiteReadyCasePacket());
  const relatedOccurrenceId = longClaimPacket.relation_candidates[0]?.left_occurrence_id;
  const relatedOccurrence = longClaimPacket.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relatedOccurrenceId,
  );
  assert.ok(relatedOccurrence);
  const fullLongClaim = `Full ledger claim ${"remains inspectable after compact summary ".repeat(6)}end.`;
  relatedOccurrence.original_claim_text = fullLongClaim;
  const longClaimHtml = renderMapMarkup(longClaimPacket, "event_time");
  assert.ok(
    (longClaimHtml.match(new RegExp(escapeRegex(fullLongClaim), "g")) ?? []).length >= 2,
  );
});

test("relation simplification is announced only when the spatial overview is simplified", () => {
  const preparedHtml = renderMapMarkup(buildPreparedSiteReadyCasePacket(), "event_time");
  assert.doesNotMatch(preparedHtml, /Spatial overview simplified/);
  assert.doesNotMatch(preparedHtml, /Matrix mode/);

  for (const sourceCount of [5, 8] as const) {
    const packet = buildMapDensityFixture(sourceCount);
    const map = deriveInvestigationMap(packet, "publication_time");
    const html = renderMapMarkup(packet, "publication_time");
    assert.match(
      html,
      new RegExp(`Spatial overview simplified · all ${map.relationLedger.length} candidate relations remain listed below`),
    );
    assert.equal((html.match(/data-ledger-entry="true"/g) ?? []).length, map.relationLedger.length);
  }
});

test("default Map copy presents product boundaries without implementation language", () => {
  const html = renderMapMarkup(buildPreparedSiteReadyCasePacket(), "event_time");
  assert.match(html, /claims as they appeared in each source|public claim as it appeared in its source/);
  assert.match(html, /Every candidate relation is listed once below/);
  assert.match(html, /See why this question remains open/);
  assert.match(html, /Viewing and filtering never changes the saved investigation/);
  for (const phrase of [
    "canonical_mutation: none",
    "accessibility membership",
    "one authoritative semantic ledger entry per relation ID",
    "typed origins and exact related IDs",
    "source-local claim occurrences",
  ]) {
    assert.doesNotMatch(html, new RegExp(escapeRegex(phrase), "i"));
  }
});

test("same-source relations remain occurrence-to-occurrence in spatial eligibility, ledger, and inspector", () => {
  const packet = buildSameSourceRelationFixture();
  const relationId = "relation_candidate_fixture_same_source_review";
  const map = deriveInvestigationMap(packet, "publication_time");
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "publication_time",
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));

  assert.match(html, /Every candidate relation is listed once below/);
  assert.match(html, new RegExp(`relation-ledger:relation:${relationId}`));
  assert.equal((html.match(new RegExp(`data-relation-id="${relationId}"`, "g")) ?? []).length, 1);
  assert.ok(spatialRelationEdges(map).some(
    (edge) => edge.relationId === relationId,
  ));
  const crossSourceRelationId = packet.relation_candidates.find(
    (relation) => relation.left_source_id !== relation.right_source_id,
  )?.relation_id;
  assert.ok(crossSourceRelationId);
  assert.ok(spatialRelationEdges(map).some(
    (edge) => edge.relationId === crossSourceRelationId,
  ));
  assert.match(html, new RegExp(`relation-ledger:relation:${crossSourceRelationId}`));
  const provenanceTriggers = [...html.matchAll(/data-focus-trigger="(occurrence-source-[^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(provenanceTriggers.length, map.occurrences.length);
  assert.equal(new Set(provenanceTriggers).size, provenanceTriggers.length);

  const detail = getSiteReadyCaseDetail(packet, "relation", relationId);
  assert.ok(detail);
  const inspector = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "relation", id: relationId, label: "Candidate relation" },
    payload: detail,
    state: "idle",
    onClose: noop,
  }));
  assert.match(inspector, /Two separate claim occurrences in one source/);
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
});

test("occurrence trace and relation inspection expose typed text states and exact support affordances", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const selectedOccurrenceId = map.occurrences[0].occurrenceId;
  const selectedHtml = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "event_time",
    coverageLens: "all",
    selectedKind: "claim_occurrence",
    selectedNodeId: selectedOccurrenceId,
    selectedEdgeId: null,
    threadTraceActive: true,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
  assert.match(selectedHtml, /Trace active/);
  assert.match(selectedHtml, /Candidate thread · 2 occurrences · needs review/);
  assert.match(selectedHtml, /Candidate thread trace/);
  assert.match(selectedHtml, /Show full map/);
  assert.match(selectedHtml, /is-dimmed/);

  const relation = packet.relation_candidates[0];
  const relationDetail = {
    case_id: packet.case_id,
    run_id: packet.run_id,
    focus_kind: "relation" as const,
    focus_id: relation.relation_id,
    detail: relation,
  };
  const detailHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: {
      kind: "relation",
      id: relation.relation_id,
      label: "Candidate relation",
    },
    payload: relationDetail,
    state: "idle",
    onClose: noop,
  }));
  assert.match(detailHtml, /Left support/);
  assert.match(detailHtml, /Right support/);
  assert.match(detailHtml, /Exact relation and support references/);
  assert.match(detailHtml, new RegExp(relation.left_occurrence_id));
  assert.match(detailHtml, new RegExp(relation.right_occurrence_id));
  assert.match(detailHtml, new RegExp(escapeRegex(relation.left_support_reference.evidence_reference)));
  assert.match(detailHtml, new RegExp(escapeRegex(relation.right_support_reference.evidence_reference)));
});

test("relation, question, and family selection preserve exact Map entity ownership", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const relation = map.relationLedger[0];
  assert.ok(relation);

  const renderMap = (
    selectedKind: FocusSelection["kind"] | null,
    selectedNodeId: string | null,
    selectedEdgeId: string | null,
  ) =>
    renderToStaticMarkup(createElement(InvestigationMapView, {
      packet,
      map,
      timeAxis: "event_time",
      coverageLens: "all",
      selectedKind,
      selectedNodeId,
      selectedEdgeId,
      threadTraceActive: false,
      liveEnabled: false,
      runBlocked: false,
      runStatusLabel: null,
      onTimeAxisChange: noop,
      onCoverageLensChange: noop,
      onFocus: noop,
      onTraceThread: noop,
      onShowFullMap: noop,
      onExpandCoverage: noop,
    }));
  const occurrenceArticle = (html: string, occurrenceId: string) => {
    const escapedId = escapeRegex(occurrenceId);
    const tag = html.match(new RegExp(`<article class="[^"]*" data-occurrence-id="${escapedId}"`))?.[0];
    assert.ok(tag);
    return tag;
  };

  const relationHtml = renderMap("relation", null, relation.relationId);
  assert.doesNotMatch(occurrenceArticle(relationHtml, relation.leftOccurrenceId), /is-dimmed/);
  assert.doesNotMatch(occurrenceArticle(relationHtml, relation.rightOccurrenceId), /is-dimmed/);
  const unrelatedOccurrence = map.occurrences.find((occurrence) =>
    occurrence.occurrenceId !== relation.leftOccurrenceId
      && occurrence.occurrenceId !== relation.rightOccurrenceId
  );
  assert.ok(unrelatedOccurrence);
  assert.match(occurrenceArticle(relationHtml, unrelatedOccurrence.occurrenceId), /is-dimmed/);

  const anchoredQuestion = map.questions.find((question) => question.occurrenceAnchorIds.length > 0);
  assert.ok(anchoredQuestion);
  const questionHtml = renderMap("unresolved_question", anchoredQuestion.nodeId, null);
  for (const occurrence of map.occurrences) {
    const tag = occurrenceArticle(questionHtml, occurrence.occurrenceId);
    if (anchoredQuestion.occurrenceAnchorIds.includes(occurrence.occurrenceId)) {
      assert.doesNotMatch(tag, /is-dimmed/);
    } else {
      assert.match(tag, /is-dimmed/);
    }
  }

  const familyRow = map.rows.find((row) => row.familyId);
  assert.ok(familyRow?.familyId);
  const familyHtml = renderMap("claim_family", familyRow.familyId, null);
  assert.doesNotMatch(familyHtml, /claim-occurrence-card is-selected/);
  assert.match(familyHtml, /claim-row row-candidate_thread is-selected/);
  assert.match(familyHtml, /claim-row-heading is-selected/);
  assert.match(familyHtml, new RegExp(`data-focus-id="${escapeRegex(familyRow.familyId)}"`));
});

test("the desktop Unplaced continuation does not duplicate a family inspection control", () => {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const family = packet.candidate_claim_families.find((candidate) =>
    candidate.occurrence_ids.length > 1
  );
  assert.ok(family);
  const unplacedOccurrence = packet.claim_occurrences.find((occurrence) =>
    occurrence.occurrence_id === family.occurrence_ids[1]
  );
  assert.ok(unplacedOccurrence);
  unplacedOccurrence.event_time_candidate = null;
  unplacedOccurrence.event_time_candidate_precision = null;
  const map = deriveInvestigationMap(packet, "event_time");
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "event_time",
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
  assert.equal(
    (html.match(new RegExp(`data-focus-trigger="claim-row:claim_family:${escapeRegex(family.family_id)}"`, "g")) ?? []).length,
    1,
  );
  assert.match(html, /claim-row-heading is-continuation/);
  assert.match(html, /Unplaced continuation/);
});

test("typed Map selection prevents packet-valid cross-kind ID collisions", () => {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const familyId = packet.candidate_claim_families.find((family) =>
    family.occurrence_ids.length > 1
  )?.family_id;
  const question = packet.unresolved_questions[0];
  assert.ok(familyId);
  assert.ok(question);
  question.question_id = familyId;
  const map = deriveInvestigationMap(packet, "event_time");

  const renderCollision = (selectedKind: FocusSelection["kind"]) =>
    renderToStaticMarkup(createElement(InvestigationMapView, {
      packet,
      map,
      timeAxis: "event_time",
      coverageLens: "all",
      selectedKind,
      selectedNodeId: familyId,
      selectedEdgeId: null,
      threadTraceActive: false,
      liveEnabled: false,
      runBlocked: false,
      runStatusLabel: null,
      onTimeAxisChange: noop,
      onCoverageLensChange: noop,
      onFocus: noop,
      onTraceThread: noop,
      onShowFullMap: noop,
      onExpandCoverage: noop,
    }));

  const questionSelection = renderCollision("unresolved_question");
  assert.match(questionSelection, /unresolved-question-card is-selected/);
  assert.doesNotMatch(questionSelection, /claim-row row-candidate_thread is-selected/);
  assert.doesNotMatch(questionSelection, /claim-row-heading is-selected/);

  const familySelection = renderCollision("claim_family");
  assert.match(familySelection, /claim-row row-candidate_thread is-selected/);
  assert.doesNotMatch(familySelection, /unresolved-question-card is-selected/);
});

test("source inspector prioritizes role, evidence, claims, changes, questions, and progressive provenance", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourceId = packet.source_snapshot_summaries[0].source_id;
  const sourceDetail = getPreparedCaseDetail(packet.case_id, "source", sourceId);
  assert.ok(sourceDetail);
  const html = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "source", id: sourceId, label: packet.source_snapshot_summaries[0].title },
    payload: {
      case_id: packet.case_id,
      run_id: packet.run_id,
      focus_kind: "source",
      focus_id: sourceId,
      detail: sourceDetail.detail,
    },
    state: "idle",
    onClose: noop,
  }));

  assert.match(html, /Source role/);
  assert.match(html, /Record status<\/strong><p>Prepared case record/);
  assert.doesNotMatch(html, /Record status<\/strong><p>canonical/);
  assert.match(html, /Publisher \/ domain/);
  assert.match(html, /Why this source matters/);
  assert.match(html, /Captured deterministic fixture evidence/);
  assert.match(html, /Claims found in this source/);
  assert.match(html, /Connected changes/);
  assert.match(html, /Related open questions/);
  assert.match(html, /Findings, actions, context, and limitations/);
  assert.match(html, /Hashes and provider identifiers/);
  assert.match(html, /Prepared fixture: no external citation URL/);
});

test("timeline keeps all four axes explicit and isolates missing selected-axis times", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.event_timeline_rows[0].event_time = null;
  const html = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "event_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  assert.match(html, /Selected time axis/);
  assert.match(html, /Time unavailable/);
  assert.match(html, /no other date is substituted/i);
  assert.match(html, /View all four timestamps/);
});

test("timeline renders a live candidate claim as claim content rather than a quotation", () => {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const candidateClaim = "Candidate live claim from a model-generated web-search summary.";
  const row = packet.event_timeline_rows[0];
  const occurrence = packet.claim_occurrences.find((item) =>
    row.occurrence_ids.includes(item.occurrence_id),
  );
  assert.ok(occurrence);

  packet.mode = "live";
  packet.status = "live";
  row.status = "candidate";
  row.summary = candidateClaim;
  occurrence.status = "candidate";
  occurrence.origin = "live_api";
  occurrence.original_claim_text = candidateClaim;
  packet.event_timeline_rows = [row];

  const html = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "event_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  assert.match(html, /Needs review/);
  assert.match(
    html,
    new RegExp(`<p class="timeline-claim-content">${escapeRegex(candidateClaim)}</p>`),
  );
  assert.doesNotMatch(html, /<blockquote(?:\s|>)/);
});

test("timeline explains the selected chronology without collapsing date semantics", () => {
  assert.match(
    timeAxisSemanticNote("publication_time"),
    /not necessarily when the described event occurred or when a claim was first made/i,
  );
  assert.match(
    timeAxisSemanticNote("event_time"),
    /missing event times remain unavailable; no other date is substituted/i,
  );
  assert.match(
    timeAxisSemanticNote("actor_assertion_time"),
    /actor's statement is dated, not necessarily when the described event occurred/i,
  );
  assert.match(
    timeAxisSemanticNote("retrieval_time"),
    /when Sisyphus saw the source, not when the event occurred or the claim was made/i,
  );

  const packet = buildPreparedSiteReadyCasePacket();
  const html = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "publication_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  assert.match(html, /Ordered by publication time/);
  assert.doesNotMatch(html, /Ordered by event time where explicitly available/);
});

test("null actor language describes the unfilled structured field without inferring from text", () => {
  assert.equal(actorLabel(null), "Actor not separately identified");
  assert.equal(actorLabel("CDC"), "CDC");
  assert.doesNotMatch(actorLabel(null), /Unknown actor/);
});

test("sources and method preserve provenance labels, coverage, and plain-language record separation", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourcesHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet,
    onFocus: noop,
  }));
  assert.match(sourcesHtml, /Captured deterministic fixture evidence/);
  assert.match(sourcesHtml, /Official notice/);
  assert.match(sourcesHtml, /Community report/);
  assert.match(sourcesHtml, /Official update/);
  assert.match(sourcesHtml, /Opinion \/ interpretation/);

  const live = structuredClone(packet);
  const source = live.source_snapshot_summaries[0];
  source.url = "https://public.example.org/changing-notice";
  source.snapshot_status = "partial";
  source.record_status = "candidate";
  source.content_kind = "model_generated_web_search_summary";
  source.retrieval_mode = "openai_web_search";
  source.source_text_captured = false;
  source.evidence_excerpt = null;
  source.web_search_grounded_candidate_summary = "A bounded candidate summary.";
  assert.match(sourceContentLabel(source), /not captured page text/);
  const liveHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet: live,
    onFocus: noop,
  }));
  assert.match(liveHtml, /not captured page text/);
  assert.match(liveHtml, /href="https:\/\/public\.example\.org\/changing-notice"/);

  const methodHtml = renderToStaticMarkup(createElement(MethodView, { packet }));
  assert.match(methodHtml, /Findings, actions, and claims stay separate/);
  assert.match(methodHtml, /Only statements attributed to an actor become claim records/);
  assert.doesNotMatch(methodHtml, /#43/);
  assert.match(methodHtml, /How relationships are treated/);
  assert.match(methodHtml, /Source inclusion is not endorsement or truth verification/);
  assert.match(methodHtml, /Browsing and focus controls cannot accept or canonically change candidate records/);
  assert.doesNotMatch(methodHtml, /Standalone time candidates|Theoretical pairs|Prefilter candidates|Hard pair limit|Model-classified pairs/);
  assert.match(methodHtml, /Prepared fixture coverage/);
});

test("Method does not turn event-only missing time into an assertion-time limitation", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const occurrence = packet.claim_occurrences[0];
  occurrence.event_time_candidate = null;
  occurrence.event_time_candidate_precision = null;
  assert.ok(occurrence.assertion_time_candidate);
  packet.limitations = [
    "src_candidate_live_event: event_time was not explicit; actor_assertion_time was explicit.",
  ];

  const text = publicMethodLimitations(packet).join(" ");
  assert.doesNotMatch(text, /event and assertion time remain unavailable/i);
  assert.doesNotMatch(text, /event or assertion fields/i);
  assert.doesNotMatch(text, /src_candidate_live_|event_time|actor_assertion_time/);
});

test("Method does not turn assertion-only missing time into an event-time limitation", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const occurrence = packet.claim_occurrences[0];
  occurrence.assertion_time_candidate = null;
  occurrence.assertion_time_candidate_precision = null;
  assert.ok(occurrence.event_time_candidate);
  packet.limitations = [
    "src_candidate_live_assertion: actor_assertion_time was not explicit; event_time was explicit.",
  ];

  const text = publicMethodLimitations(packet).join(" ");
  assert.doesNotMatch(text, /event and assertion time remain unavailable/i);
  assert.doesNotMatch(text, /event or assertion fields/i);
  assert.doesNotMatch(text, /src_candidate_live_|event_time|actor_assertion_time/);
});

test("Method omits publication-only technical date wording instead of changing its axis", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.limitations = [
    "src_candidate_live_publication: publication_time failed YYYY-MM-DD validation.",
  ];

  const text = publicMethodLimitations(packet).join(" ");
  assert.doesNotMatch(text, /event or assertion fields/i);
  assert.doesNotMatch(text, /publication_time|YYYY-MM-DD|src_candidate_live_/);
});

test("Method omits retrieval-only technical date wording instead of changing its axis", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.limitations = [
    "src_candidate_live_retrieval: retrieval_time failed timezone-qualified ISO date-time validation.",
  ];

  const text = publicMethodLimitations(packet).join(" ");
  assert.doesNotMatch(text, /event or assertion fields/i);
  assert.doesNotMatch(text, /retrieval_time|timezone-qualified|ISO date-time|src_candidate_live_/);
});

test("Method narrowly humanizes known time-candidate validation without raw IDs or schema vocabulary", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.limitations = [
    "src_candidate_live_6a9ed123: No exact YYYY-MM-DD or timezone-qualified ISO date-time was explicit, so time_candidate is null.",
    "src_candidate_live_other: No exact YYYY-MM-DD was explicit, so time_candidate is null.",
    "candidate_id validation_path did not match the structured field.",
    "Each extraction used exactly one source. Cross-source temporal relation analysis is not performed.",
  ];
  const limitations = publicMethodLimitations(packet);
  const text = limitations.join(" ");
  assert.match(
    text,
    /Some source summaries did not contain a precise date for one or more event or assertion fields, so those times remain unavailable/,
  );
  assert.equal(
    limitations.filter((limitation) => /precise date/i.test(limitation)).length,
    1,
  );
  assert.match(text, /Cross-source temporal relation analysis is not performed/);
  assert.match(text, /Source coverage is bounded and nonexhaustive/i);
  assert.match(text, /Source inclusion is not endorsement or truth verification/);
  assert.match(text, /Candidate relationships organize review/);
  assert.match(text, /cannot accept or canonically change candidate records/);
  assert.doesNotMatch(text, /src_candidate_live_|time_candidate|candidate_id|validation_path|YYYY-MM-DD|timezone-qualified/);

  const html = renderToStaticMarkup(createElement(MethodView, { packet }));
  assert.doesNotMatch(html, /src_candidate_live_|time_candidate|candidate_id|validation_path|YYYY-MM-DD|timezone-qualified/);
  assert.match(html, /What this investigation cannot establish/);
});

test("inspection actions have distinguishable accessible names on every repeated surface", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourcesHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet,
    onFocus: noop,
  }));
  for (const source of packet.source_snapshot_summaries) {
    assert.match(sourcesHtml, new RegExp(`aria-label="[^"]*: ${escapeRegex(source.title)}"`));
  }

  const timelineHtml = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "event_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  const timelineLabels = [...timelineHtml.matchAll(/aria-label="View all four timestamps: ([^"]+)"/g)];
  assert.equal(timelineLabels.length, packet.event_timeline_rows.length);
  assert.equal(new Set(timelineLabels.map((match) => match[1])).size, timelineLabels.length);

  const mapHtml = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map: deriveInvestigationMap(packet, "event_time"),
    timeAxis: "event_time",
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
  assert.match(mapHtml, /data-focus-trigger="claim-occurrence:claim_occurrence:/);
  assert.match(mapHtml, /data-focus-trigger="occurrence-source-[^"]+:source:/);
  assert.match(mapHtml, /data-focus-trigger="relation-ledger:relation:/);
  assert.match(mapHtml, /data-focus-trigger="unresolved-question:unresolved_question:/);
  assert.match(mapHtml, /aria-label="R1, candidate relation/);
  assert.match(mapHtml, new RegExp(escapeRegex(packet.claim_occurrences[0].original_claim_text)));
  const occurrenceButtonTag = mapHtml.match(/<button class="occurrence-body"[^>]*>/)?.[0];
  assert.ok(occurrenceButtonTag);
  assert.doesNotMatch(occurrenceButtonTag, /aria-label=/);
  const mapSource = readFileSync(
    new URL("../app/components/InvestigationMapView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(mapSource, /focusTriggerId\("spatial-relation", relationSelection\(entry\)\)/);
  assert.match(mapSource, /aria-hidden="true"/);
});

test("unresolved-question inspector exposes typed conservative origins and topic-level unknowns", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const question = packet.unresolved_questions[0];
  const payload = getSiteReadyCaseDetail(packet, "unresolved_question", question.question_id);
  assert.ok(payload);
  const html = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "unresolved_question", id: question.question_id, label: "Open question 1" },
    payload,
    state: "idle",
    onClose: noop,
  }));
  assert.match(html, /Related evidence origin/);
  assert.match(html, /Via matching claim occurrences/);
  assert.match(html, /actor claim resolves to every matching source-local occurrence/);
  assert.match(html, /Record status<\/strong><p>Prepared case record/);
  assert.doesNotMatch(html, /Record status<\/strong><p>canonical/);
  assert.match(html, /Conservative resolution details[\s\S]*Record status enum[\s\S]*canonical/);
  assert.match(html, /This record is related to the evidence gap, but the available evidence does not answer the question/);
  assert.match(html, /does not itself establish causation, contradiction, or truth\/falsity/);

  const unknownPacket = structuredClone(packet);
  unknownPacket.unresolved_questions[0].related_ids = ["unknown-external-record"];
  const unknownPayload = getSiteReadyCaseDetail(
    unknownPacket,
    "unresolved_question",
    question.question_id,
  );
  assert.ok(unknownPayload);
  const unknownHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet: unknownPacket,
    selection: { kind: "unresolved_question", id: question.question_id, label: "Open question 1" },
    payload: unknownPayload,
    state: "idle",
    onClose: noop,
  }));
  assert.match(unknownHtml, /Topic-level evidence gap/);
  assert.match(unknownHtml, /No claim-occurrence tether is added/);
  assert.match(unknownHtml, /topic_unknown/);
});

test("focused record statuses use public boundary labels while exact enums stay in technical disclosure", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const question = packet.unresolved_questions[0];
  const candidatePacket = structuredClone(packet);
  candidatePacket.unresolved_questions[0].record_status = "candidate";
  const candidateQuestionPayload = getSiteReadyCaseDetail(
    candidatePacket,
    "unresolved_question",
    question.question_id,
  );
  assert.ok(candidateQuestionPayload);
  const candidateQuestionHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet: candidatePacket,
    selection: {
      kind: "unresolved_question",
      id: question.question_id,
      label: "Open question 1",
    },
    payload: candidateQuestionPayload,
    state: "idle",
    onClose: noop,
  }));
  assert.match(candidateQuestionHtml, /Record status<\/strong><p>Needs review/);
  assert.doesNotMatch(candidateQuestionHtml, /Record status<\/strong><p>candidate/);
  assert.match(candidateQuestionHtml, /Conservative resolution details[\s\S]*Record status enum[\s\S]*candidate/);

  const occurrence = packet.claim_occurrences[0];
  const occurrencePayload = getSiteReadyCaseDetail(
    packet,
    "claim_occurrence",
    occurrence.occurrence_id,
  );
  assert.ok(occurrencePayload);
  const occurrenceHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: {
      kind: "claim_occurrence",
      id: occurrence.occurrence_id,
      label: "Claim occurrence",
    },
    payload: occurrencePayload,
    state: "idle",
    onClose: noop,
  }));
  assert.match(occurrenceHtml, /Record status<\/strong><p>Prepared case record|Record status<\/strong><p>Needs review/);
  assert.doesNotMatch(occurrenceHtml, /Record status<\/strong><p>(canonical|candidate)/);
  assert.match(occurrenceHtml, /Record status enum[\s\S]*Status enum[\s\S]*(canonical|candidate)/);

  assert.equal(focusedRecordStatusLabel("canonical"), "Prepared case record");
  assert.equal(focusedRecordStatusLabel("candidate"), "Needs review");
  assert.equal(JSON.stringify(packet).includes("#43"), false);
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
});

test("public copy avoids project shorthand and inaccurate no-network claims while preserving record boundaries", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
    liveEnabled: false,
  }));
  assert.doesNotMatch(html, /#43/);
  assert.doesNotMatch(html, /No network request/);
  assert.equal(recordBoundaryLabel("canonical"), "Prepared case record");
  assert.equal(recordBoundaryLabel("candidate"), "Needs review");
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
  assert.equal(packet.candidate_canonical_boundary.confidence_can_promote_to_canonical, false);
});

test("fallback, partial, loading, and error notices never mislabel the displayed packet", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const fallback = structuredClone(prepared);
  fallback.mode = "fallback";
  fallback.status = "fallback";
  assert.match(getRunNotice(fallback, false, null).message, /not a live investigation/);

  const rateLimited = structuredClone(fallback);
  rateLimited.warnings = ["rate_limited: raw provider detail must not render"];
  const rateNotice = getRunNotice(rateLimited, false, null);
  assert.equal(rateNotice.title, "Live request rate limited");
  assert.match(rateNotice.message, /prepared fallback is shown/i);
  assert.doesNotMatch(rateNotice.message, /raw provider detail/);

  const timeout = structuredClone(fallback);
  timeout.warnings = ["api_timeout: private stack detail must not render"];
  const timeoutNotice = getRunNotice(timeout, false, null);
  assert.equal(timeoutNotice.title, "Live provider request timed out");
  assert.match(timeoutNotice.message, /not a live result/i);
  assert.doesNotMatch(timeoutNotice.message, /private stack detail/);

  const providerFailure = structuredClone(fallback);
  providerFailure.warnings = ["provider_failure: hidden provider payload"];
  const unavailableNotice = getRunNotice(providerFailure, false, null);
  assert.equal(unavailableNotice.title, "Live investigation unavailable");
  assert.doesNotMatch(JSON.stringify(unavailableNotice), /hidden provider payload/);
  assert.doesNotMatch(JSON.stringify(unavailableNotice), /usage limit reached|spend limit reached/i);

  const partial = structuredClone(prepared);
  partial.mode = "live";
  partial.status = "live";
  partial.warnings = ["one bounded source failed"];
  assert.equal(getRunNotice(partial, false, null).title, "Partial live investigation");
  assert.match(getRunNotice(partial, false, null).message, /bounded review candidates/i);
  assert.doesNotMatch(getRunNotice(partial, false, null).message, /\bvalidated\b/i);

  const live = structuredClone(prepared);
  live.mode = "live";
  live.status = "live";
  live.warnings = [];
  assert.match(getRunNotice(live, false, null).message, /live result is a review draft/i);
  assert.match(getRunNotice(live, false, null).message, /does not accept or change any candidate record/i);
  assert.doesNotMatch(getRunNotice(live, false, null).message, /schema-checked review packet|prepared record|\bserver\b/i);
  assert.doesNotMatch(getRunNotice(live, false, null).message, /\bvalidated\b/i);

  const loading = getRunNotice(prepared, true, null);
  assert.equal(loading.title, "Building a bounded investigation map");
  assert.match(loading.message, /displayed packet stays intact/);
  assert.match(loading.message, /schema-checked response/i);

  const error = getRunNotice(prepared, false, "The route is unavailable.");
  assert.equal(error.tone, "error");
  assert.match(error.message, /displayed packet remains intact/);

  const cooldown = getRunNotice(prepared, false, null, 17);
  assert.equal(cooldown.title, "Live request cooldown");
  assert.match(cooldown.message, /17s/);
  assert.match(cooldown.message, /not strong abuse prevention/i);
});

test("server-only live flag defaults closed and the disabled route returns a bounded safe error", async () => {
  assert.equal(isLiveAnalysisEnabled(undefined), false);
  assert.equal(isLiveAnalysisEnabled("false"), false);
  assert.equal(isLiveAnalysisEnabled("1"), false);
  assert.equal(isLiveAnalysisEnabled(" TRUE "), true);

  const direct = liveAnalysisDisabledResponse();
  assert.equal(direct.status, 503);
  const directBody = await direct.json() as {
    error: { code: string };
    canonical_mutation: string;
  };
  assert.equal(directBody.error.code, "live_analysis_disabled");
  assert.equal(directBody.canonical_mutation, "none");

  const originalFlag = process.env.SISYPHUS_LIVE_ENABLED;
  process.env.SISYPHUS_LIVE_ENABLED = "false";
  try {
    const response = await postLineage(new Request("http://site.local/api/lineage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "How is public access changing for residents?",
        sourceLimit: 5,
      }),
    }));
    assert.equal(response.status, 503);
    const body = await response.json() as {
      error: { code: string };
      canonical_mutation: string;
    };
    assert.equal(body.error.code, "live_analysis_disabled");
    assert.equal(body.canonical_mutation, "none");
  } finally {
    if (originalFlag === undefined) delete process.env.SISYPHUS_LIVE_ENABLED;
    else process.env.SISYPHUS_LIVE_ENABLED = originalFlag;
  }
});

test("920px CSS transforms the same matrix into typed claim chapters with a complete ledger", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const tabletStart = css.indexOf("@media (max-width: 920px)");
  const mobileStart = css.indexOf("@media (max-width: 720px)");
  assert.ok(tabletStart > 0);
  assert.ok(mobileStart > tabletStart);
  const tabletRules = css.slice(tabletStart, mobileStart);
  assert.match(tabletRules, /\.claim-matrix-scroll \{ overflow: visible/);
  assert.match(tabletRules, /\.claim-time-header \{ display: none; \}/);
  assert.match(tabletRules, /\.claim-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(tabletRules, /\.claim-relation-layer,[\s\S]*?\.spatial-relation-shortcuts \{ display: none; \}/);
  assert.match(tabletRules, /\.relation-port-list \{/);
  assert.match(tabletRules, /\.relation-ledger-detail-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(tabletRules, /\.non-claim-source-section\.has-1-subgroups,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);

  const mobileRules = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert.match(mobileRules, /\.relation-ledger-summary \{ grid-template-columns: 36px minmax\(0, 1fr\)/);
  assert.match(mobileRules, /\.relation-port-list \{ display: grid/);
  assert.match(mobileRules, /\.focus-toolbar \{ min-height: 0/);
  assert.match(mobileRules, /\.detail-panel \{ inset: 8px; width: auto; height: calc\(100dvh - 16px\)/);
  assert.doesNotMatch(mobileRules, /width:\s*100vw/);
});

test("Map analytical typography preserves a readable primary and important hierarchy", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const mapStart = css.indexOf("/* Temporal Claim-Lineage Matrix v1 */");
  const responsiveStart = css.indexOf("@media (max-width: 1200px)");
  assert.ok(mapStart > 0);
  assert.ok(responsiveStart > mapStart);
  const mapRules = css.slice(mapStart, responsiveStart);

  assert.match(mapRules, /--map-font-primary-claim: 1rem/);
  assert.match(mapRules, /--map-font-primary-question: \.94rem/);
  assert.match(mapRules, /--map-font-prominent: \.875rem/);
  assert.match(mapRules, /--map-font-important: \.84rem/);
  assert.match(mapRules, /--map-font-supporting: \.8rem/);
  assert.match(mapRules, /--map-font-technical: \.75rem/);

  assert.match(mapRules, /\.occurrence-claim-text \{[\s\S]*?font-size: var\(--map-font-primary-claim\)/);
  assert.match(mapRules, /\.unresolved-question-card strong \{[^}]*font-size: var\(--map-font-primary-question\)/);
  assert.match(mapRules, /\.occurrence-actor \{[^}]*font-size: var\(--map-font-prominent\)/);
  assert.match(mapRules, /\.occurrence-time \{[^}]*font-size: var\(--map-font-important\)/);
  assert.match(mapRules, /\.occurrence-provenance \.source-role-badge \{[^}]*font-size: var\(--map-font-supporting\)/);
  assert.match(mapRules, /\.occurrence-provenance strong \{[^}]*font-size: var\(--map-font-important\)/);
  assert.match(mapRules, /\.relation-shortcut span \{[^}]*font-size: var\(--map-font-important\)/);
  assert.match(mapRules, /\.relation-port-list span,[\s\S]*?font-size: var\(--map-font-supporting\)/);
  assert.match(mapRules, /\.question-origin-chip b \{[^}]*font-size: var\(--map-font-important\)/);
  assert.match(mapRules, /\.ledger-endpoint strong \{[^}]*font-size: var\(--map-font-prominent\)/);
  assert.match(mapRules, /\.ledger-endpoint span \{[^}]*font-size: var\(--map-font-important\)/);
  assert.match(mapRules, /\.ledger-endpoint time \{[^}]*font-size: var\(--map-font-supporting\)/);
  assert.match(mapRules, /\.relation-ledger-summary-body > strong \{[^}]*font-size: var\(--map-font-important\)/);
  assert.match(mapRules, /\.non-claim-source-card span:not\(\.source-role-badge\) \{[^}]*font-size: var\(--map-font-prominent\)/);
  assert.match(mapRules, /\.non-claim-source-card time,[\s\S]*?font-size: var\(--map-font-supporting\)/);
  assert.match(mapRules, /\.map-coverage-strip dt \{[^}]*font-size: var\(--map-font-supporting\)/);
  assert.match(mapRules, /\.unplaced-occurrence-band > header p:last-child \{[^}]*font-size: var\(--map-font-supporting\)/);

  const compactRules = css.slice(css.indexOf("@media (max-width: 920px)"));
  assert.doesNotMatch(compactRules, /\.occurrence-claim-text \{[^}]*font-size:\s*\.(?:6|7)\d*rem/);
  assert.doesNotMatch(compactRules, /\.occurrence-provenance[^}]*font-size:\s*\.(?:6|7[0-4])\d*rem/);
  assert.doesNotMatch(compactRules, /\.ledger-endpoint[^}]*font-size:\s*\.(?:6|7[0-4])\d*rem/);
  assert.doesNotMatch(compactRules, /\.question-origin-chip[^}]*font-size:\s*\.(?:6|7[0-4])\d*rem/);
});

test("Map skip links are hidden at rest and visible on keyboard focus", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const mapRules = css.slice(
    css.indexOf("/* Temporal Claim-Lineage Matrix v1 */"),
    css.indexOf("@media (max-width: 1200px)"),
  );
  assert.match(mapRules, /\.map-skip-links \{[\s\S]*?width: 1px;[\s\S]*?clip-path: inset\(50%\)/);
  assert.match(mapRules, /\.map-skip-links:focus-within \{[\s\S]*?width: auto;[\s\S]*?clip-path: none/);
});

test("Map ships one semantic tree whose row identities survive the responsive transformation", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map: deriveInvestigationMap(packet, "event_time"),
    timeAxis: "event_time",
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled: false,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
  assert.equal((html.match(/data-occurrence-id=/g) ?? []).length, 3);
  assert.equal((html.match(/<section class="claim-row [^"]*"[^>]*data-row-kind="candidate_thread"/g) ?? []).length, 1);
  assert.equal((html.match(/<section class="claim-row [^"]*"[^>]*data-row-kind="standalone_occurrence"/g) ?? []).length, 1);
  assert.match(html, /Candidate thread · 2 occurrences · needs review/);
  assert.match(html, /Standalone claim occurrence · grouping unresolved/);
  assert.match(html, /href="#candidate-relations"/);
  assert.match(html, /href="#unresolved-evidence-questions"/);
  assert.doesNotMatch(html, /mobile-investigation-path/);
  assert.doesNotMatch(html, /aria-describedby="map-canvas-scroll-hint"/);
  assert.doesNotMatch(html, /id="map-canvas-scroll-hint"/);

  const mapSource = readFileSync(
    new URL("../app/components/InvestigationMapView.tsx", import.meta.url),
    "utf8",
  );
  assert.equal((mapSource.match(/<ClaimRow/g) ?? []).length, 1);
  assert.doesNotMatch(mapSource, /mobile-investigation-path|desktop-map/);
});

test("matrix activates keyboard scrolling only for measured horizontal overflow", () => {
  assert.equal(mapCanvasHasHorizontalOverflow(1150, 1150), false);
  assert.equal(mapCanvasHasHorizontalOverflow(1151, 1150), false);
  assert.equal(mapCanvasHasHorizontalOverflow(1152, 1150), true);
  assert.equal(mapCanvasHasHorizontalOverflow(1112, 773), true);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const matrixRules = css.slice(
    css.indexOf("/* Temporal Claim-Lineage Matrix v1 */"),
    css.indexOf("@media (max-width: 1200px)"),
  );
  assert.match(matrixRules, /\.claim-relation-layer \{/);
  assert.match(matrixRules, /\.map-primary-grid \{[\s\S]*?z-index: auto/);
  assert.match(matrixRules, /\.claim-relation-layer \{[\s\S]*?z-index: 2/);
  assert.match(matrixRules, /\.claim-occurrence-card \{[\s\S]*?z-index: 3/);
  assert.match(matrixRules, /\.claim-matrix-scroll \{[\s\S]*?overflow-x: auto/);
  assert.match(matrixRules, /\.claim-matrix-stage \{[\s\S]*?min-width: max/);
  assert.match(matrixRules, /\.claim-relation-path \{[\s\S]*?stroke-width:/);
  assert.match(matrixRules, /\.question-evidence-tether \{[\s\S]*?stroke-dasharray:/);
  assert.match(matrixRules, /\.occurrence-claim-text \{[\s\S]*?-webkit-line-clamp: 4/);
  const mapSource = readFileSync(
    new URL("../app/components/InvestigationMapView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(mapSource, /observer\.observe\(scrollContainer\)/);
  assert.match(mapSource, /role=\{matrixOverflowing \? "region" : undefined\}/);
  assert.match(mapSource, /tabIndex=\{matrixOverflowing \? 0 : undefined\}/);
  assert.match(mapSource, /aria-describedby=\{matrixOverflowing \? "map-canvas-scroll-hint" : undefined\}/);
  assert.match(mapSource, /onKeyDown=\{matrixOverflowing \? handleAnalyticalScrollKey : undefined\}/);
  assert.match(mapSource, /if \(!mapCanvasHasHorizontalOverflow\([\s\S]*?\)\) return;/);
  assert.match(mapSource, /container\.scrollLeft \+= scrollStep/);
  assert.match(mapSource, /container\.scrollLeft = maxScrollLeft/);
  assert.match(mapSource, /matrixOverflowing \? \([\s\S]*?id="map-canvas-scroll-hint"/);
});

function renderMapMarkup(
  packet: ReturnType<typeof buildPreparedSiteReadyCasePacket>,
  timeAxis: TimeAxis,
  liveEnabled = false,
): string {
  return renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map: deriveInvestigationMap(packet, timeAxis),
    timeAxis,
    coverageLens: "all",
    selectedKind: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    threadTraceActive: false,
    liveEnabled,
    runBlocked: false,
    runStatusLabel: null,
    onTimeAxisChange: noop,
    onCoverageLensChange: noop,
    onFocus: noop,
    onTraceThread: noop,
    onShowFullMap: noop,
    onExpandCoverage: noop,
  }));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
