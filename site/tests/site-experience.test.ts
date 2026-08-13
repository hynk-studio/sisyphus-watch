import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaseExplorer,
  FocusedDetailPanel,
  getRunNotice,
  LineageView,
  SourcesView,
  TimelineView,
  UnresolvedView,
} from "../app/components/CaseExplorer";
import {
  EXPERIENCE_VIEWS,
  VIEW_LABELS,
  actorLabel,
  orderTimelineRows,
  relationDisplayLabel,
  sourceContentLabel,
} from "../app/lib/experience";
import {
  isLiveAnalysisEnabled,
  liveAnalysisDisabledResponse,
} from "../app/lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import { getPreparedCaseDetail } from "../app/lib/read-model";
import { POST as postLineage } from "../app/api/lineage/route";

const noop = () => undefined;

test("renders the compressed public story, new navigation, and compact disabled live state without mutating the packet", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
    liveEnabled: false,
  }));

  assert.match(html, /Version history for public information/);
  assert.match(html, /See what changed, where it came from, and what is still unclear/);
  assert.match(html, /residents, caregivers, community organizers, nonprofit staff, and local journalists/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.deepEqual(EXPERIENCE_VIEWS, ["overview", "lineage", "timeline", "sources", "unresolved"]);
  assert.deepEqual(EXPERIENCE_VIEWS.map((view) => VIEW_LABELS[view]), [
    "Overview",
    "What changed",
    "Timeline",
    "Sources",
    "Open questions",
  ]);
  assert.ok(html.indexOf("Overview") < html.indexOf("What changed"));
  assert.ok(html.indexOf("What changed") < html.indexOf("Timeline"));
  assert.ok(html.indexOf("Timeline") < html.indexOf("Sources"));
  assert.ok(html.indexOf("Sources") < html.indexOf("Open questions"));
  assert.match(html, /Official notice/);
  assert.match(html, /Community access challenge/);
  assert.match(html, /Official correction \/ update/);
  assert.match(html, /Impact still unresolved/);
  assert.match(html, /What happened/);
  assert.match(html, /Why it matters/);
  assert.match(
    html,
    /<span class="story-stage">What changed<\/span><strong>Official correction \/ update<\/strong>/,
  );
  assert.match(html, /What remains unresolved/);
  assert.match(html, /Current picture from the available sources/);
  assert.match(html, /Prepared case summary/);
  assert.match(html, /Review-only · Nothing is accepted automatically/);
  assert.match(html, /OpenAI-assisted live analysis/);
  assert.match(html, /disabled in this public demo for a conservative release/);
  assert.match(html, /prepared case remains fully interactive/i);
  assert.match(
    html,
    /one question, a bounded source limit, and a discovery approach are sent to the same Site/i,
  );
  assert.doesNotMatch(html, /Site operator|hosted settings|configure the API key/i);
  assert.doesNotMatch(html, /<textarea/);
  assert.doesNotMatch(html, /id="discovery-profile"/);
  assert.match(html, /<details class="method-card"><summary>/);
  assert.doesNotMatch(html, /<details class="method-card" open/);
  assert.match(html, /Method &amp; coverage/);
  assert.match(html, /What kinds of sources are represented/);
  assert.match(html, /Prepared fixture coverage/);
  assert.match(html, /curated prepared-case coverage, not live discovery/i);
  assert.match(html, /Prepared case source type not represented: Original records/i);
  assert.match(html, /Official &amp; established/);
  assert.match(html, /Local &amp; firsthand/);
  assert.match(html, /Challenges &amp; corrections/);
  assert.doesNotMatch(html, /\d+\/\d+ baseline/);
  assert.doesNotMatch(html, /Kaggle|course|Apps SDK|MCP App/i);
  assert.equal(JSON.stringify(packet), before);
});

test("renders the bounded live form only when the server feature flag is enabled", () => {
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: buildPreparedSiteReadyCasePacket(),
    liveEnabled: true,
  }));

  assert.match(html, /for="analysis-question"/);
  assert.match(html, /minLength="12"/);
  assert.match(html, /maxLength="500"/);
  assert.match(html, /8 sources/);
  assert.match(html, /id="discovery-profile"/);
  assert.match(html, /Standard review/);
  assert.match(html, /Expand source coverage/);
  assert.match(html, /ordinary authority-ranked search may under-surface/);
  assert.match(html, /hard maximum 64 pairs/);
  assert.match(html, /No arbitrary URLs, crawling, or visitor history/);
  assert.doesNotMatch(html, /disabled in this public demo/);
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

test("timeline labels the selected axis, keeps missing times unavailable, and exposes focused detail", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.event_timeline_rows[0].event_time = null;
  const ordered = orderTimelineRows(packet.event_timeline_rows, "event_time");
  assert.equal(ordered.at(-1)?.event_time, null);

  const html = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "event_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  assert.match(html, /Selected time axis/);
  assert.match(html, /Event time/);
  assert.match(html, /Unavailable/);
  assert.match(html, /publication time is never substituted/i);
  assert.match(html, /View all four timestamps/);
});

test("lineage surfaces relations before collapsed family metadata without mutating packet state", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.claim_occurrences[0].actor = null;
  const publisher = packet.source_snapshot_summaries[0].publisher;
  const beforeRender = JSON.stringify(packet);
  assert.equal(actorLabel(null), "Unknown actor");

  const html = renderToStaticMarkup(createElement(LineageView, {
    packet,
    onFocus: noop,
  }));
  assert.match(html, /<h4>Unknown actor<\/h4><blockquote>Residents could find safe/);
  assert.notEqual("Unknown actor", publisher);
  assert.match(html, /Claim lineage across sources/);
  const firstRelationIndex = html.indexOf("Earlier source-bound claim");
  const supportIndex = html.indexOf("Inspect support from both sides");
  const groupingIndex = html.indexOf("Related claim groupings");
  assert.ok(firstRelationIndex >= 0);
  assert.ok(supportIndex > firstRelationIndex);
  assert.ok(groupingIndex > supportIndex);
  assert.match(html, /<details class="family-strip"><summary>/);
  assert.doesNotMatch(html, /<details class="family-strip" open/);
  assert.match(html, /Related claim groupings \(2\)/);
  assert.match(html, /Family 01/);
  assert.match(html, /Family 02/);
  assert.match(html, /Candidate grouping · review only/);
  assert.match(html, /Grouping unresolved · review only/);
  assert.match(html, /Needs review/);
  assert.match(html, /Inspect support from both sides/);
  assert.match(html, /Replaces earlier guidance/);
  assert.equal(relationDisplayLabel("contradicts"), "Challenges the earlier claim");
  assert.equal(relationDisplayLabel("follow_up"), "Responds to the earlier report");
  assert.equal(relationDisplayLabel("corroborates"), "Supports the earlier report");
  assert.equal(relationDisplayLabel("narrows"), "Makes the earlier claim more specific");
  assert.equal(relationDisplayLabel("unresolved"), "Connection remains unclear");
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
  assert.ok(packet.relation_candidates.every((relation) => relation.review_status === "pending_review"));
  assert.equal(JSON.stringify(packet), beforeRender);
});

test("source cards are concise while focused detail preserves context, limitations, and technical provenance", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const preparedHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet: prepared,
    onFocus: noop,
  }));
  assert.match(preparedHtml, /Captured deterministic fixture evidence/);
  assert.match(preparedHtml, /Official notice/);
  assert.match(preparedHtml, /Community report/);
  assert.match(preparedHtml, /Official update/);
  assert.match(preparedHtml, /Opinion \/ interpretation/);
  assert.match(preparedHtml, /Read demo source/);
  assert.match(preparedHtml, /Why this source matters/);
  assert.doesNotMatch(preparedHtml, /Source context/);
  assert.doesNotMatch(preparedHtml, /Information proximity/);
  assert.doesNotMatch(preparedHtml, /Retrieved by Sisyphus/);
  assert.doesNotMatch(preparedHtml, /stable ID/);

  const sourceId = prepared.source_snapshot_summaries[0].source_id;
  const sourceDetail = getPreparedCaseDetail(prepared.case_id, "source", sourceId);
  assert.ok(sourceDetail);
  const detailHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    selection: { kind: "source", id: sourceId, label: prepared.source_snapshot_summaries[0].title },
    payload: {
      case_id: prepared.case_id,
      run_id: prepared.run_id,
      focus_kind: "source",
      focus_id: sourceId,
      detail: sourceDetail.detail,
    },
    state: "idle",
    onClose: noop,
  }));
  assert.match(detailHtml, /Captured deterministic fixture text/);
  assert.match(detailHtml, /Source context &amp; limitations/);
  assert.match(detailHtml, /Information proximity/);
  assert.match(detailHtml, /Classification basis/);
  assert.match(detailHtml, /Retrieval method/);
  assert.match(detailHtml, /Source provenance identifiers/);
  assert.match(detailHtml, /Technical details/);
  assert.match(detailHtml, new RegExp(sourceId));
  assert.ok(detailHtml.indexOf("Captured deterministic fixture text") < detailHtml.indexOf("Technical details"));

  const live = structuredClone(prepared);
  live.mode = "live";
  live.status = "live";
  const source = live.source_snapshot_summaries[0];
  source.url = "https://public.example.org/changing-notice";
  source.snapshot_status = "partial";
  source.record_status = "candidate";
  source.content_kind = "model_generated_web_search_summary";
  source.retrieval_mode = "openai_web_search";
  source.source_text_captured = false;
  source.evidence_excerpt = null;
  source.web_search_grounded_candidate_summary = "A bounded model-generated search-grounded candidate summary.";
  source.source_selection = {
    discovery_pass: "coverage_expansion",
    discovery_lane: "local_or_firsthand",
    source_context: "community_organization",
    information_proximity: "firsthand_observation",
    why_included: "Adds local street-level observations.",
    classification_basis: "model_generated_web_search_classification",
    classification_status: "candidate_review_only",
    comparison_target_source_ids: [],
  };
  live.source_snapshot_summaries = [source];
  live.actual_source_count = 1;
  assert.match(sourceContentLabel(source), /not captured page text/);

  const liveHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet: live,
    onFocus: noop,
  }));
  assert.match(liveHtml, /Model-generated web-search candidate summary · not captured page text/);
  assert.match(liveHtml, /href="https:\/\/public\.example\.org\/changing-notice"/);
  assert.match(liveHtml, /target="_blank"/);
  assert.match(liveHtml, /rel="noopener noreferrer"/);
  assert.match(liveHtml, /local street-level observations/i);
  assert.match(liveHtml, /Needs review/);
  assert.match(liveHtml, /View source details/);
  assert.doesNotMatch(liveHtml, /Captured deterministic fixture evidence/);
  assert.doesNotMatch(liveHtml, /Source context/);
});

test("unresolved view presents evidence gaps with related record labels", () => {
  const html = renderToStaticMarkup(createElement(UnresolvedView, {
    packet: buildPreparedSiteReadyCasePacket(),
    onFocus: noop,
  }));
  assert.match(html, /Useful uncertainty/);
  assert.match(html, /evidence gaps to investigate, not system errors/i);
  assert.match(html, /Related record/);
  assert.match(html, /Fictional Neighborhood Volunteer Network/);
});

test("fallback and partial-live states are never mislabeled as successful live analysis", () => {
  const fallback = buildPreparedSiteReadyCasePacket();
  fallback.mode = "fallback";
  fallback.status = "fallback";
  fallback.discovery_profile = "coverage_expansion";
  const fallbackHtml = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: fallback,
    liveEnabled: true,
  }));
  assert.match(fallbackHtml, /Prepared fallback shown/);
  assert.match(fallbackHtml, /not a live result/);
  assert.match(fallbackHtml, /Prepared fallback coverage/);
  assert.match(fallbackHtml, /The live attempt failed/);
  assert.match(fallbackHtml, /prepared fallback, not live discovery/);
  assert.match(fallbackHtml, /Prepared case source type not represented/);
  assert.doesNotMatch(fallbackHtml, /\d+\/\d+ expansion/);

  const partial = buildPreparedSiteReadyCasePacket();
  partial.mode = "live";
  partial.status = "live";
  partial.discovery_profile = "standard";
  partial.coverage_summary = {
    coverage_basis: "live_discovery",
    discovery_profile: "standard",
    baseline_requested: 5,
    baseline_returned: 4,
    expansion_requested: 0,
    expansion_returned: 0,
    lane_counts: structuredClone(fallback.coverage_summary.lane_counts),
    missing_target_lanes: [],
    unique_domain_count: 1,
    duplicate_url_count: 0,
    source_limit_reached: false,
    expansion_attempted: false,
    expansion_completed_successfully: false,
  };
  partial.warnings = ["one source extraction failed"];
  const partialHtml = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: partial,
    liveEnabled: true,
  }));
  assert.match(partialHtml, /Partial live result/);
  assert.match(partialHtml, /review-only/);
  assert.match(partialHtml, /Standard live review/);

  const expansion = structuredClone(partial);
  expansion.discovery_profile = "coverage_expansion";
  expansion.coverage_summary = {
    coverage_basis: "live_discovery",
    discovery_profile: "coverage_expansion",
    baseline_requested: 2,
    baseline_returned: 2,
    expansion_requested: 3,
    expansion_returned: 2,
    lane_counts: structuredClone(partial.coverage_summary.lane_counts),
    missing_target_lanes: ["primary_or_origin"],
    unique_domain_count: 1,
    duplicate_url_count: 0,
    source_limit_reached: false,
    expansion_attempted: true,
    expansion_completed_successfully: true,
  };
  const expansionHtml = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: expansion,
    liveEnabled: true,
  }));
  assert.match(expansionHtml, /Live coverage expansion/);
});

test("loading and route-unavailable states use bounded public copy", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  assert.deepEqual(getRunNotice(packet, true, null), {
    tone: "loading",
    title: "Running bounded live analysis",
    message: "Discovering up to the requested source limit and validating each source-local record.",
  });
  const error = getRunNotice(packet, false, "The same-Site analysis route is unavailable.");
  assert.equal(error.tone, "error");
  assert.match(error.message, /prepared case remains intact/i);
  assert.doesNotMatch(error.message, /stack|provider|OPENAI_API_KEY/i);
});

test("mobile result navigation keeps all five views visible without horizontal discovery loss", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const mobileRules = css.slice(css.indexOf("@media (max-width: 720px)"));

  assert.match(mobileRules, /\.tab-list \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(mobileRules, /\.tab-list button \{[^}]*white-space: normal/);
  assert.match(mobileRules, /\.tab-list button \{[^}]*min-height: 60px/);
});
