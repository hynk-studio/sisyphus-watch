import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaseExplorer,
  FocusedDetailPanel,
  InvestigationMapView,
  MethodView,
  SearchComposer,
  SourcesView,
  TimelineView,
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
import { focusTriggerId } from "../app/components/investigation-types";
import {
  PUBLIC_LIVE_COOLDOWN_MS,
  PublicLiveRunGuard,
  publicRerunSourceLimit,
} from "../app/lib/public-live";
import { buildSameSourceRelationFixture } from "./fixtures/map-density";

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
  assert.match(mapHtml, /day-level positions are not chronological/);
  assert.match(mapHtml, /endpoint order is not chronological/);
  assert.match(
    mapHtml,
    /data-endpoint-ordering="non_chronological_mixed_precision"/,
  );
  assert.doesNotMatch(`${timeline}${sources}${mapHtml}`, /Jul 14/);
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

test("desktop inspector keeps one nonmutating map-action surface for source, relation, and question focus while mobile exposes none", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const source = packet.source_snapshot_summaries[0];
  const relation = packet.relation_candidates[0];
  const question = packet.unresolved_questions[0];
  const selections = [
    {
      selection: { kind: "source" as const, id: source.source_id, label: source.title },
      canTraceThread: true,
    },
    {
      selection: { kind: "relation" as const, id: relation.relation_id, label: "Candidate relation" },
      canTraceThread: false,
    },
    {
      selection: {
        kind: "unresolved_question" as const,
        id: question.question_id,
        label: "Open question 1",
      },
      canTraceThread: true,
    },
  ];
  let traceCalls = 0;
  let showFullMapCalls = 0;

  for (const { selection, canTraceThread } of selections) {
    const payload = getSiteReadyCaseDetail(packet, selection.kind, selection.id);
    assert.ok(payload);
    const mapViewActions = {
      canTraceThread,
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
    if (canTraceThread) assert.match(desktopHtml, /Trace this thread/);
    else assert.doesNotMatch(desktopHtml, /Trace this thread/);

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
    assert.doesNotMatch(mobileHtml, /Trace this thread/);
    assert.doesNotMatch(mobileHtml, /Show full map/);

    if (canTraceThread) mapViewActions.onTraceThread();
    mapViewActions.onShowFullMap();
  }

  assert.equal(traceCalls, 2);
  assert.equal(showFullMapCalls, 3);
  assert.equal(JSON.stringify(packet), before);

  const selectedMapHtml = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map: deriveInvestigationMap(packet, "event_time"),
    timeAxis: "event_time",
    coverageLens: "all",
    selectedNodeId: source.source_id,
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
  assert.match(selectedMapHtml, /class="focus-toolbar-actions" aria-hidden="true"/);
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

test("map is the primary result model with four top-level views and visible question nodes", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "event_time",
    coverageLens: "all",
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
  assert.match(html, /Structured investigation map/);
  assert.match(html, /Calendar dates move left to right/);
  assert.match(html, /Topic root/);
  assert.match(html, /spatial-map-stage/);
  assert.match(html, /spatial-connection-layer/);
  assert.match(html, /Spatial candidate relation controls/);
  assert.match(html, /Candidate connections/);
  assert.match(html, /Accessible relation list/);
  assert.match(html, /Open questions/);
  assert.match(html, /Visible endpoints · not conclusions/);
  assert.match(html, /Evidence gap from/);
  assert.match(html, /Fictional city updates cooling center list and adds transport support/);
  assert.match(html, /Inspect support from both sides/);
  assert.match(html, /Prepared comparison only/);
  assert.match(html, /Prepared baseline/);
  assert.match(html, /Complete prepared set/);
  assert.match(html, /Select a record to inspect/);
  assert.match(html, /Closing returns focus and scroll position/);
  assert.match(html, /mobile-investigation-path/);
  for (const question of packet.unresolved_questions) {
    assert.match(html, new RegExp(escapeRegex(question.question)));
  }
});

test("same-source relations stay in the accessible ledger and inspector but not spatial paths", () => {
  const packet = buildSameSourceRelationFixture();
  const relationId = "relation_candidate_fixture_same_source_review";
  const map = deriveInvestigationMap(packet, "publication_time");
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "publication_time",
    coverageLens: "all",
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

  assert.match(html, new RegExp(`${map.relationEdges.length} candidate relations`));
  assert.match(html, new RegExp(`relation-list:relation:${relationId}`));
  assert.doesNotMatch(html, new RegExp(`spatial-relation:relation:${relationId}`));
  assert.doesNotMatch(html, new RegExp(`mobile-relation:relation:${relationId}`));
  const crossSourceRelationId = packet.relation_candidates.find(
    (relation) => relation.left_source_id !== relation.right_source_id,
  )?.relation_id;
  assert.ok(crossSourceRelationId);
  assert.ok(spatialRelationEdges(map).some(
    (edge) => edge.relationId === crossSourceRelationId,
  ));
  assert.match(
    html,
    new RegExp(`mobile-relation:relation:${crossSourceRelationId}`),
  );

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

test("source selection and relation inspection expose text states and exact support affordances", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const selectedSourceId = map.sources[0].sourceId;
  const selectedHtml = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map,
    timeAxis: "event_time",
    coverageLens: "all",
    selectedNodeId: selectedSourceId,
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
  assert.match(selectedHtml, /Thread trace active/);
  assert.match(selectedHtml, /Selected source/);
  assert.match(selectedHtml, /Trace this thread|Thread trace/);
  assert.match(selectedHtml, /Show full map/);
  assert.match(selectedHtml, /unrelated context remains visible but dimmed/);
  assert.match(selectedHtml, /data-map-state="dimmed"/);

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

test("Method derives truthful public limitations without raw record IDs or schema vocabulary", () => {
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
    /Some source summaries did not contain a precise date, so event and assertion time remain unavailable/,
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
  assert.match(mapHtml, /data-focus-trigger="mobile-relation:relation:/);
  assert.match(mapHtml, /data-focus-trigger="relation-list:relation:/);
  assert.match(mapHtml, /aria-label="Open question node 1:/);
  const mapSource = readFileSync(
    new URL("../app/components/InvestigationMapView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(mapSource, /focusTriggerId\("spatial-relation", selection\)/);
});

test("open-question inspector shows only conservatively resolved evidence origins and topic-root unknowns", () => {
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
  assert.match(unknownHtml, /resolution stops at the investigation topic; no source edge is added/);
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

test("mobile CSS switches to a vertical path with usable controls and no page-width overflow rule", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const mobileRules = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert.match(mobileRules, /\.desktop-map \{ display: none; \}/);
  assert.match(mobileRules, /\.mobile-investigation-path \{ display: grid/);
  assert.match(mobileRules, /\.map-orientation-desktop \{ display: none; \}/);
  assert.match(mobileRules, /\.map-orientation-mobile \{ display: inline; \}/);
  assert.match(mobileRules, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobileRules, /\.mobile-relation-label \{/);
  assert.match(mobileRules, /min-height: 42px/);
  assert.match(mobileRules, /\.focus-toolbar \{ min-height: 150px/);
  assert.match(mobileRules, /\.detail-panel \{ inset: 8px; width: auto; height: calc\(100dvh - 16px\)/);
  assert.doesNotMatch(mobileRules, /width:\s*100vw/);
});

test("Map ships distinct desktop and mobile orientation copy with CSS-only visibility", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const html = renderToStaticMarkup(createElement(InvestigationMapView, {
    packet,
    map: deriveInvestigationMap(packet, "event_time"),
    timeAxis: "event_time",
    coverageLens: "all",
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
  assert.match(html, /map-orientation-desktop[^>]*>\s*Calendar dates move left to right/);
  assert.match(html, /map-orientation-mobile[^>]*>\s*Calendar dates run top to bottom on this screen/);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const defaultRules = css.slice(0, css.indexOf("@media (max-width: 720px)"));
  assert.match(defaultRules, /\.map-orientation-mobile \{ display: none; \}/);
});

test("desktop map renders anchored connection layers with a public metadata floor", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const desktopRules = css.slice(
    css.indexOf(".desktop-map"),
    css.indexOf(".mobile-investigation-path { display: none; }") + 46,
  );
  assert.match(desktopRules, /\.spatial-connection-layer \{/);
  assert.match(desktopRules, /\.spatial-relation-path \{[\s\S]*?stroke-width: 2\.4/);
  assert.match(desktopRules, /\.spatial-question-path \{[\s\S]*?stroke-dasharray: 7 6/);
  assert.match(desktopRules, /\.spatial-relation-controls button span,[\s\S]*?font-size: \.72rem/);
  assert.match(desktopRules, /\.map-time-scale small \{[\s\S]*?font-size: \.72rem/);
  assert.match(desktopRules, /\.node-state-text,[\s\S]*?font-size: \.72rem/);
  assert.match(desktopRules, /\.map-source-publisher \{[\s\S]*?font-size: \.75rem/);
  assert.match(desktopRules, /\.map-node-time \{[\s\S]*?font-size: \.72rem/);
  assert.match(desktopRules, /\.question-connector \{[\s\S]*?font-size: \.72rem/);
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
