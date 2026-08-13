import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaseExplorer,
  getRunNotice,
  LineageView,
  SourcesView,
  TimelineView,
  UnresolvedView,
} from "../app/components/CaseExplorer";
import {
  actorLabel,
  orderTimelineRows,
  sourceContentLabel,
} from "../app/lib/experience";
import {
  isLiveAnalysisEnabled,
  liveAnalysisDisabledResponse,
} from "../app/lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import { POST as postLineage } from "../app/api/lineage/route";

const noop = () => undefined;

test("renders the public product story, prepared case, accessible navigation, and disabled live state", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
    liveEnabled: false,
  }));

  assert.match(html, /See what changed, which source changed it, and what remains unresolved/);
  assert.match(html, /residents, reporters, researchers, and public servants/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /Live analysis is disabled on this server/);
  assert.match(html, /prepared case remains fully available/i);
  assert.doesNotMatch(html, /<textarea/);
  assert.doesNotMatch(html, /id="discovery-profile"/);
  assert.match(html, /Source coverage/i);
  assert.match(html, /Prepared fixture coverage/);
  assert.match(html, /Fixture lane not represented: Primary or origin/i);
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

test("lineage renders actual or explicit unknown actors without substituting publisher", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  packet.claim_occurrences[0].actor = null;
  const publisher = packet.source_snapshot_summaries[0].publisher;
  assert.equal(actorLabel(null), "Unknown actor");

  const html = renderToStaticMarkup(createElement(LineageView, {
    packet,
    onFocus: noop,
  }));
  assert.match(html, /<h4>Unknown actor<\/h4><blockquote>Residents could find safe/);
  assert.notEqual("Unknown actor", publisher);
  assert.match(html, /Candidate · pending review/);
  assert.match(html, /supersedes/);
});

test("sources distinguish captured fixture evidence from live partial summaries and render safe citations", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const preparedHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet: prepared,
    onFocus: noop,
  }));
  assert.match(preparedHtml, /Captured deterministic fixture evidence/);
  assert.match(preparedHtml, /Read focused fixture evidence/);
  assert.match(preparedHtml, /Why found/);
  assert.match(preparedHtml, /Source context/);
  assert.match(preparedHtml, /Information proximity/);
  assert.match(preparedHtml, /Inclusion does not establish reliability, representativeness, or truth/);

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
  assert.match(liveHtml, /candidate metadata · review only/i);
  assert.match(liveHtml, /local street-level observations/i);
  assert.doesNotMatch(liveHtml, /Captured deterministic fixture evidence/);
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
  assert.match(fallbackHtml, /lane counts belong to the prepared fallback record/);
  assert.match(fallbackHtml, /Fixture lane not represented/);
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
