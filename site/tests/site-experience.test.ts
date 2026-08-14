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
  sourceContentLabel,
} from "../app/lib/experience";
import { deriveInvestigationMap } from "../app/lib/investigation-map";
import {
  isLiveAnalysisEnabled,
  liveAnalysisDisabledResponse,
} from "../app/lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import { getPreparedCaseDetail } from "../app/lib/read-model";
import { POST as postLineage } from "../app/api/lineage/route";

const noop = () => undefined;

test("search-first landing makes the question composer the first product action and tells the truth when live is disabled", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
    liveEnabled: false,
  }));

  assert.match(html, /What do you want to investigate\?/);
  assert.match(html, /Topic or public-interest question/);
  assert.match(html, /Build investigation map/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Standard review/);
  assert.match(html, /Start with official and established sources/);
  assert.match(html, /Expand source coverage/);
  assert.match(html, /Also look for local, firsthand, specialist, and corrective sources/);
  assert.match(html, /3 sources/);
  assert.match(html, /5 sources/);
  assert.match(html, /8 sources · maximum/);
  assert.match(html, /Try the cooling-center example/);
  assert.match(html, /Live source discovery is not enabled on this public version/);
  assert.match(html, /Arbitrary questions cannot run here yet/);
  assert.doesNotMatch(html, /id="investigation-workspace"/);
  assert.doesNotMatch(html, /Prepared demonstration/);
  assert.equal(JSON.stringify(packet), before);
});

test("live composer exposes the existing bounded request controls without claiming success", () => {
  const html = renderToStaticMarkup(createElement(SearchComposer, {
    question: "How is public access changing?",
    sourceLimit: 5,
    discoveryProfile: "standard",
    liveEnabled: true,
    isLoading: false,
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
  assert.match(html, /Bounded live discovery is available/);
  assert.match(html, /live, partial, or a clearly labeled prepared fallback/);
  assert.doesNotMatch(html, /disabled=""/);
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
    isLoading: false,
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
  assert.match(html, /Time moves left to right/);
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
  assert.match(html, /mobile-investigation-path/);
  for (const question of packet.unresolved_questions) {
    assert.match(html, new RegExp(escapeRegex(question.question)));
  }
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
    isLoading: false,
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
  assert.match(html, /no other axis is substituted/i);
  assert.match(html, /View all four timestamps/);
});

test("sources and method preserve provenance labels, coverage, and the no-#43 boundary", () => {
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
  assert.match(methodHtml, /No #43 evidence-to-claim inference/);
  assert.match(methodHtml, /Only actor claims become claim occurrences/);
  assert.match(methodHtml, /Maximum 8 sources and 64 relation-pair workload/);
  assert.match(methodHtml, /Prepared fixture coverage/);
});

test("fallback, partial, loading, and error notices never mislabel the displayed packet", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const fallback = structuredClone(prepared);
  fallback.mode = "fallback";
  fallback.status = "fallback";
  assert.match(getRunNotice(fallback, false, null).message, /not a live investigation/);

  const partial = structuredClone(prepared);
  partial.mode = "live";
  partial.status = "live";
  partial.warnings = ["one bounded source failed"];
  assert.equal(getRunNotice(partial, false, null).title, "Partial live investigation");
  assert.match(getRunNotice(partial, false, null).message, /review-only/);

  const loading = getRunNotice(prepared, true, null);
  assert.equal(loading.title, "Building a bounded investigation map");
  assert.match(loading.message, /displayed packet stays intact/);

  const error = getRunNotice(prepared, false, "The route is unavailable.");
  assert.equal(error.tone, "error");
  assert.match(error.message, /displayed packet remains intact/);
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
  assert.match(mobileRules, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobileRules, /\.mobile-relation-label \{/);
  assert.match(mobileRules, /min-height: 42px/);
  assert.doesNotMatch(mobileRules, /width:\s*100vw/);
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
