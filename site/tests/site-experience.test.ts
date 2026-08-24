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
  SisyphusWordmark,
  StartNewInvestigationButton,
  SourcesView,
  TimelineView,
  firstPayoffForPacket,
  getRunNotice,
} from "../app/components/CaseExplorer";
import { decideInvestigationSubmission } from "../app/components/InvestigationExplorer";
import {
  EXPERIENCE_VIEWS,
  VIEW_LABELS,
  actorLabel,
  groupSupportingDatedEvidenceRowsByPrecision,
  modeLabel,
  publicMethodLimitations,
  recordBoundaryLabel,
  sourceContentLabel,
  sourceCoverageNote,
  supportingDatedEvidenceRows,
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
  OPERATOR_LIVE_ENVIRONMENT_FLAG,
} from "../app/lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import type { SiteReadyCasePacket } from "../app/lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../app/lib/lineage/details";
import { getPreparedCaseDetail } from "../app/lib/read-model";
import { POST as postLineage } from "../app/api/lineage/route";
import {
  INSPECTOR_ACCESSIBILITY_MODELS,
  INSPECTOR_CLOSE_KEY,
  MOBILE_INSPECTOR_MEDIA_QUERY,
  focusedRecordStatusLabel,
} from "../app/components/FocusedDetailPanel";
import {
  mapCanvasHasHorizontalOverflow,
  relationSpatialLabel,
} from "../app/components/InvestigationMapView";
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
import { buildTemporalAcceptanceFixture } from "./fixtures/temporal-acceptance";
import {
  SOURCE_SUPPORTED_STATEMENT,
  buildSourceSupportedSitePacketV2Fixture,
} from "./fixtures/source-supported-site-packet";

const noop = () => undefined;

test("Site metadata declares a repository-contained icon", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const icon = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
  assert.match(layout, /icons:\s*\{[\s\S]*?icon:\s*"\/icon\.svg"/);
  assert.match(icon, /^<svg[\s\S]*viewBox="0 0 32 32"/);
  assert.doesNotMatch(icon, /(?:href|src)=["']https?:\/\//);
});

test("fresh public landing is question-first without claiming that execution is ready", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
  }));

  assert.match(html, /What do you want to investigate\?/);
  assert.match(html, /<textarea[^>]*id="investigation-question"/);
  assert.match(html, /minLength="12"/);
  assert.match(html, /maxLength="500"/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.match(html, /Standard review/);
  assert.match(html, /Expand source coverage/);
  assert.match(html, /<select id="source-limit">/);
  assert.match(html, /Build investigation map/);
  assert.match(html, /Try the prepared cooling-center example/);
  assert.match(html, /Connect your Relay/);
  assert.match(html, /What is a Relay\?/);
  assert.match(html, /A Relay is a small backend you control/);
  assert.match(html, /using your own OpenAI API key/);
  assert.match(html, /Your API key stays on the Relay/);
  assert.match(html, /this Site connects only to its URL/);
  assert.match(
    html,
    /href="https:\/\/github\.com\/hynk-studio\/sisyphus-watch#use-your-own-relay"/,
  );
  assert.match(html, /How to set up a Relay/);
  assert.doesNotMatch(html, /name="[^"]*(?:api|provider)[^"]*key/i);
  assert.doesNotMatch(html, /Relay ready|Sponsored capacity ready/);
  assert.doesNotMatch(html, /data-live-capability="available"/);
  assert.doesNotMatch(html, /id="investigation-workspace"/);
  assert.doesNotMatch(html, /Prepared demonstration/);
  assert.ok(html.indexOf("What do you want to investigate?") < html.indexOf("Build investigation map"));
  assert.ok(html.indexOf("Build investigation map") < html.indexOf("Try the prepared cooling-center example"));
  assert.ok(html.indexOf("Try the prepared cooling-center example") < html.indexOf("Connect your Relay"));
  assert.equal(JSON.stringify(packet), before);
});

test("submission decision preserves the exact authored question and settings until transport is explicit", () => {
  const input = {
    question: "  How is public access changing for residents?  ",
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion" as const,
  };
  const before = JSON.stringify(input);
  const decision = decideInvestigationSubmission(null, input);
  assert.equal(decision.kind, "request_execution_transport");
  assert.equal(decision.input, input);
  assert.equal(JSON.stringify(input), before);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  const submitStart = explorerSource.indexOf("function submitAnalysis(");
  const submitEnd = explorerSource.indexOf("function startPreparedExample()", submitStart);
  const submitSource = explorerSource.slice(submitStart, submitEnd);
  assert.match(submitSource, /decision\.kind === "request_execution_transport"/);
  assert.match(
    submitSource,
    /Connect your Relay to run this investigation\. Your question will stay here\. Your API credentials stay on your Relay and are not entered into this Site\./,
  );
  assert.match(submitSource, /openRelayConnection\(\)/);
  assert.ok(submitSource.indexOf("return;") < submitSource.indexOf("runAnalysis(decision.input)"));
  assert.doesNotMatch(submitSource, /setQuestion|setSourceLimit|setDiscoveryProfile|fetch\(/);

  const preparedStart = explorerSource.indexOf("function startPreparedExample()");
  const preparedEnd = explorerSource.indexOf("function startNewInvestigation()", preparedStart);
  const preparedSource = explorerSource.slice(preparedStart, preparedEnd);
  assert.match(preparedSource, /setPacket\(preparedCase\)/);
  assert.doesNotMatch(
    preparedSource,
    /fetch\(|runAnalysis|executeInvestigationTransport|negotiateRelayConnection/,
  );
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

test("result-mode home controls expose one shared local reset path", () => {
  const wordmarkHtml = renderToStaticMarkup(createElement(SisyphusWordmark, {
    resultMode: true,
    onReturnHome: noop,
  }));
  const actionHtml = renderToStaticMarkup(createElement(StartNewInvestigationButton, {
    onStart: noop,
  }));
  assert.match(wordmarkHtml, /^<button/);
  assert.match(wordmarkHtml, /Sisyphus Watch home · start new investigation/);
  assert.doesNotMatch(wordmarkHtml, /href="#top"/);
  assert.match(actionHtml, /class="start-new-investigation-button"/);
  assert.match(actionHtml, />Start new investigation</);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    explorerSource,
    /<SisyphusWordmark[\s\S]*?onReturnHome=\{startNewInvestigation\}/,
  );
  assert.match(
    explorerSource,
    /<StartNewInvestigationButton onStart=\{startNewInvestigation\}/,
  );
  assert.equal(
    (explorerSource.match(/activateButtonFromKeyboard\(event, on(?:ReturnHome|Start)\)/g) ?? []).length,
    2,
  );
  assert.match(
    explorerSource,
    /if \(!investigationStarted\) return;[\s\S]*?"investigation-workspace"[\s\S]*?behavior: "instant"/,
  );
  const resetStart = explorerSource.indexOf("function startNewInvestigation()");
  const resetEnd = explorerSource.indexOf("function openDetailSelection", resetStart);
  assert.ok(resetStart > 0 && resetEnd > resetStart);
  const resetSource = explorerSource.slice(resetStart, resetEnd);
  assert.match(resetSource, /runGuard\.current\.invalidateResponse\(\)/);
  assert.match(resetSource, /setInvestigationStarted\(false\)/);
  assert.match(resetSource, /clearDetail\(\)/);
  assert.match(resetSource, /"investigation-question"/);
  assert.doesNotMatch(resetSource, /"prepared-investigation-cta"/);
  assert.match(resetSource, /\.focus\(\)/);
  assert.doesNotMatch(resetSource, /fetch\(|\/api\/lineage/);
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
  assert.match(html, /Sponsored capacity ready/);
  assert.match(html, /Explicitly operator-funded/);
  assert.match(html, /subject to strict capacity limits/);
  assert.match(html, /bounded limits apply/);
  assert.match(html, /availability-note availability-idle-ready/);
  assert.match(html, /data-live-capability="available"/);
  assert.match(html, /Privacy &amp; limits/);
  assert.match(html, /D1-backed aggregate capacity limits/);
  assert.match(html, /failed relay request never falls back to sponsored compute/);
  assert.match(html, /records and relations remain review candidates/);
  assert.doesNotMatch(html, /Bounded live discovery is available/);
  assert.doesNotMatch(html, /availability-note live-ready/);
  assert.doesNotMatch(html, /\bvalidated\b/i);
  assert.doesNotMatch(html, /disabled=""/);
  assert.ok(html.indexOf("Build investigation map") < html.indexOf("Try the prepared cooling-center example"));
});

test("composer presentation disables blank and normalized-short questions without submitting", () => {
  const renderQuestion = (question: string) => renderToStaticMarkup(createElement(SearchComposer, {
    question,
    sourceLimit: 3,
    discoveryProfile: "standard",
    liveEnabled: false,
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

  const blank = renderQuestion("   ");
  assert.match(blank, /build-map-button" type="submit" disabled=""/);
  assert.doesNotMatch(blank, /question-input-hint|aria-invalid/);

  const short = renderQuestion("  too    short  ");
  assert.match(short, /build-map-button" type="submit" disabled=""/);
  assert.match(short, /aria-invalid="true"/);
  assert.match(short, /aria-describedby="[^"]*question-input-hint"/);
  assert.match(short, /Use at least 12 characters after spaces are normalized/);

  const valid = renderQuestion("  twelve chars  ");
  assert.doesNotMatch(valid, /build-map-button" type="submit" disabled/);
  assert.doesNotMatch(valid, /question-input-hint|aria-invalid/);
});

test("page hierarchy emits the primary composer or current workspace before Saved Watch", () => {
  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  const landingComposer = explorerSource.indexOf("{!investigationStarted ? composer : null}");
  const landingWatch = explorerSource.indexOf("{!investigationStarted ? savedWatchSurface : null}");
  const workspace = explorerSource.indexOf("{investigationStarted ? (", landingWatch);
  const activeComposer = explorerSource.indexOf("{investigationStarted ? composer : null}", workspace);
  const activeWatch = explorerSource.indexOf("{investigationStarted ? savedWatchSurface : null}", activeComposer);
  assert.ok(landingComposer > 0 && landingComposer < landingWatch);
  assert.ok(workspace > landingWatch && workspace < activeComposer);
  assert.ok(activeComposer < activeWatch);
  const activeRegion = explorerSource.slice(workspace, activeComposer);
  assert.ok(activeRegion.indexOf("<h1 id=\"case-title\">") < activeRegion.indexOf("<InvestigationMapView"));

  const landing = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: buildPreparedSiteReadyCasePacket(),
  }));
  assert.ok(landing.indexOf("<h1 id=\"composer-title\">") < landing.indexOf("<h2 id=\"execution-support-title\">"));
});

test("loading and cooldown retain their distinct availability treatments", () => {
  const renderState = (isLoading: boolean, cooldownRemainingSeconds: number) =>
    renderToStaticMarkup(createElement(SearchComposer, {
      question: "How is public access changing?",
      sourceLimit: 3,
      discoveryProfile: "standard",
      liveEnabled: true,
      isLoading,
      cooldownRemainingSeconds,
      routeError: null,
      investigationStarted: false,
      onQuestionChange: noop,
      onSourceLimitChange: noop,
      onDiscoveryProfileChange: noop,
      onSubmit: noop,
      onPreparedExample: noop,
    }));
  const loading = renderState(true, 0);
  assert.match(loading, /availability-note availability-loading/);
  assert.match(loading, /Bounded live investigation running/);
  assert.match(loading, /prepared-example-button" type="button" disabled=""/);
  const cooldown = renderState(false, 12);
  assert.match(cooldown, /availability-note availability-cooldown/);
  assert.match(cooldown, /Next live attempt available in 12s/);
  assert.doesNotMatch(cooldown, /prepared-example-button" type="button" disabled/);
});

test("first payoff resolves one existing source-bound finding without fabricating fallback evidence", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const intendedSource = packet.source_snapshot_summaries[1];
  const otherSource = packet.source_snapshot_summaries[0];
  packet.source_bound_findings[0].text = "One existing source-bound finding.";
  packet.source_bound_findings[0].source_ids = [intendedSource.source_id];
  packet.source_bound_findings = [packet.source_bound_findings[0]];
  packet.actor_claims = [];
  packet.actions = [];

  const payoff = firstPayoffForPacket(packet);
  assert.equal(payoff?.kind, "finding");
  assert.equal(payoff?.source.source_id, intendedSource.source_id);
  assert.equal(payoff?.text, "One existing source-bound finding.");
  assert.ok(payoff?.kind === "finding");
  assert.equal(payoff.record, packet.source_bound_findings[0]);

  const html = renderToStaticMarkup(createElement(FirstPayoff, {
    packet,
    onFocus: noop,
  }));
  assert.match(html, /Start here/);
  assert.match(html, /Finding/);
  assert.match(html, /Prepared example/);
  assert.match(html, /One existing source-bound finding/);
  assert.match(html, /<p class="first-payoff-text">One existing source-bound finding\.<\/p>/);
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
  assert.match(liveHtml, /Finding/);
  assert.match(
    liveHtml,
    /Based on a model-generated web-search summary · not captured page text/,
  );
  assert.match(liveHtml, /<p class="first-payoff-text">/);
  assert.doesNotMatch(liveHtml, /<blockquote/);
  assert.doesNotMatch(liveHtml, /Prepared example/);
  assert.doesNotMatch(liveHtml, /Browsing does not change the record/);

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
  unsupported.actor_claims = [];
  unsupported.actions = [];
  assert.equal(firstPayoffForPacket(unsupported), null);

  const source = readFileSync(
    new URL("../app/components/FirstPayoff.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|\/api\//);
});

test("first payoff deterministically prefers a question-relevant existing finding and keeps stable fallback order", () => {
  const packet = buildTemporalAcceptanceFixture();
  const before = JSON.stringify(packet);
  const payoff = firstPayoffForPacket(packet);
  assert.ok(payoff?.kind === "finding");
  assert.equal(payoff.record.finding_id, "candidate_live_finding_schedule_change");
  assert.equal(
    payoff.text,
    "The agency moved maintenance exercise 97 from September 13 to September 18 after an unexpected suit sensor reading prompted a safety review.",
  );
  assert.ok(packet.source_bound_findings.includes(payoff.record));
  assert.equal(firstPayoffForPacket(packet)?.record, payoff.record);
  assert.equal(JSON.stringify(packet), before);

  const tied = structuredClone(packet);
  tied.normalized_public_interest_question = "Which agency exercise record changed?";
  tied.source_bound_findings = tied.source_bound_findings.slice(0, 2);
  tied.source_bound_findings[0].text = "Agency exercise record changed.";
  tied.source_bound_findings[1].text = "Agency exercise record changed.";
  tied.source_bound_findings[1].source_ids = [...tied.source_bound_findings[0].source_ids];
  tied.actor_claims = [];
  tied.actions = [];
  const tiedPayoff = firstPayoffForPacket(tied);
  assert.ok(tiedPayoff?.kind === "finding");
  assert.equal(tiedPayoff.record.finding_id, tied.source_bound_findings[0].finding_id);

  const linkedSourceTie = structuredClone(tied);
  const [firstSource, secondSource] = linkedSourceTie.source_snapshot_summaries;
  secondSource.title = firstSource.title;
  secondSource.publisher = firstSource.publisher;
  secondSource.domain = firstSource.domain;
  secondSource.source_selection.why_included = firstSource.source_selection.why_included;
  linkedSourceTie.source_bound_findings = [linkedSourceTie.source_bound_findings[0]];
  linkedSourceTie.source_bound_findings[0].source_ids = [
    secondSource.source_id,
    firstSource.source_id,
  ];
  assert.equal(firstPayoffForPacket(linkedSourceTie)?.source.source_id, secondSource.source_id);

  const noOverlap = structuredClone(packet);
  noOverlap.normalized_public_interest_question = "Why are harbor permits delayed?";
  noOverlap.source_bound_findings = noOverlap.source_bound_findings.slice(0, 2);
  noOverlap.source_bound_findings[0].text = "Orchids bloom indoors.";
  noOverlap.source_bound_findings[1].text = "Copper roofs weather slowly.";
  noOverlap.actor_claims = [];
  noOverlap.actions = [];
  const noOverlapPayoff = firstPayoffForPacket(noOverlap);
  assert.ok(noOverlapPayoff?.kind === "finding");
  assert.equal(noOverlapPayoff.record.finding_id, noOverlap.source_bound_findings[0].finding_id);
});

test("first payoff lets existing actor claims and actions win without rewriting or promoting them", () => {
  const claimPacket = buildTemporalAcceptanceFixture();
  claimPacket.source_bound_findings.forEach((finding) => {
    finding.text = "The September 18 schedule is current.";
  });
  claimPacket.actions.forEach((action) => {
    action.action_text = "The agency published a maintenance notice.";
  });
  const claim = claimPacket.actor_claims[0];
  claim.claim_text = "The agency moved the schedule from September 13 to September 18 because a safety review was required.";
  const claimBefore = JSON.stringify(claimPacket);
  const claimPayoff = firstPayoffForPacket(claimPacket);
  assert.ok(claimPayoff?.kind === "actor_claim");
  assert.equal(claimPayoff.record, claim);
  assert.equal(claimPayoff.text, claim.claim_text);
  assert.ok(claim.source_ids.includes(claimPayoff.source.source_id));
  assert.equal(JSON.stringify(claimPacket), claimBefore);
  assert.equal(firstPayoffForPacket(claimPacket)?.record, claim);

  const claimHtml = renderToStaticMarkup(createElement(FirstPayoff, {
    packet: claimPacket,
    onFocus: noop,
  }));
  assert.match(claimHtml, /Actor claim/);
  assert.match(claimHtml, new RegExp(escapeRegex(claim.claim_text)));

  const actionPacket = buildTemporalAcceptanceFixture();
  actionPacket.source_bound_findings.forEach((finding) => {
    finding.text = "The September 18 schedule is current.";
  });
  actionPacket.actor_claims.forEach((actorClaim) => {
    actorClaim.claim_text = "The agency published a maintenance notice.";
  });
  actionPacket.actions[0].action_text = "The agency published a maintenance notice.";
  const action = actionPacket.actions[1];
  action.action_text = "The agency moved the schedule from September 13 to September 18 because a safety review was required.";
  action.source_ids = ["missing_source", actionPacket.source_snapshot_summaries[1].source_id];
  const actionBefore = JSON.stringify(actionPacket);
  const actionPayoff = firstPayoffForPacket(actionPacket);
  assert.ok(actionPayoff?.kind === "action");
  assert.equal(actionPayoff.record, action);
  assert.equal(actionPayoff.text, action.action_text);
  assert.equal(actionPayoff.source.source_id, action.source_ids[1]);
  assert.ok(actionPacket.actions.includes(actionPayoff.record));
  assert.equal(JSON.stringify(actionPacket), actionBefore);
  assert.equal(firstPayoffForPacket(actionPacket)?.record, action);

  const actionHtml = renderToStaticMarkup(createElement(FirstPayoff, {
    packet: actionPacket,
    onFocus: noop,
  }));
  assert.match(actionHtml, /Action record/);
  assert.match(actionHtml, new RegExp(escapeRegex(action.action_text)));

  const crossTypeTie = structuredClone(actionPacket);
  const sharedSourceId = crossTypeTie.source_snapshot_summaries[0].source_id;
  crossTypeTie.normalized_public_interest_question = "Which agency record changed?";
  crossTypeTie.source_bound_findings = [crossTypeTie.source_bound_findings[0]];
  crossTypeTie.actor_claims = [crossTypeTie.actor_claims[0]];
  crossTypeTie.actions = [crossTypeTie.actions[0]];
  crossTypeTie.source_bound_findings[0].text = "Agency record changed.";
  crossTypeTie.actor_claims[0].claim_text = "Agency record changed.";
  crossTypeTie.actions[0].action_text = "Agency record changed.";
  crossTypeTie.source_bound_findings[0].source_ids = [sharedSourceId];
  crossTypeTie.actor_claims[0].source_ids = [sharedSourceId];
  crossTypeTie.actions[0].source_ids = [sharedSourceId];
  assert.equal(firstPayoffForPacket(crossTypeTie)?.kind, "finding");
});

test("Timeline surfaces typed source-bound actions and findings without promoting them to claims", () => {
  const packet = buildTemporalAcceptanceFixture();
  const before = JSON.stringify({
    claims: packet.actor_claims,
    occurrences: packet.claim_occurrences,
    timeline: packet.event_timeline_rows,
    boundary: packet.candidate_canonical_boundary,
  });
  const eventRows = supportingDatedEvidenceRows(packet, "event_time");
  const scheduleChange = eventRows.find(
    (row) => row.recordId === "candidate_live_action_schedule_change",
  );
  const scheduleFinding = eventRows.find(
    (row) => row.recordId === "candidate_live_finding_schedule_change",
  );
  assert.ok(scheduleChange);
  assert.equal(scheduleChange.recordKind, "action");
  assert.equal(scheduleChange.selectedTime, "2030-09-18T00:00:00.000Z");
  assert.equal(scheduleChange.selectedTimePrecision, "day");
  assert.equal(scheduleChange.selectedTimeLabel, "Event time");
  assert.ok(scheduleFinding);
  assert.equal(scheduleFinding.recordKind, "finding");
  assert.equal(scheduleFinding.selectedTime, null);
  assert.equal(scheduleFinding.selectedTimePrecision, null);

  const publicationRows = supportingDatedEvidenceRows(packet, "publication_time");
  const publishedFinding = publicationRows.find(
    (row) => row.recordId === "candidate_live_finding_schedule_change",
  );
  assert.ok(publishedFinding);
  assert.equal(publishedFinding.selectedTime, "2030-09-07T00:00:00.000Z");
  assert.equal(publishedFinding.selectedTimeLabel, "Linked source publication time");
  assert.ok(groupSupportingDatedEvidenceRowsByPrecision(publicationRows).length > 0);
  const retrievalFinding = supportingDatedEvidenceRows(packet, "retrieval_time").find(
    (row) => row.recordId === "candidate_live_finding_schedule_change",
  );
  assert.ok(retrievalFinding);
  assert.equal(retrievalFinding.selectedTime, "2030-09-20T12:00:00.000Z");
  assert.equal(
    retrievalFinding.selectedTimeLabel,
    "Linked source Sisyphus retrieval time",
  );
  assert.ok(supportingDatedEvidenceRows(packet, "actor_assertion_time").every(
    (row) => row.selectedTime === null,
  ));

  const multiSource = structuredClone(packet);
  multiSource.actions[1].source_ids = [
    packet.source_snapshot_summaries[0].source_id,
    packet.source_snapshot_summaries[1].source_id,
  ];
  const multiSourceRows = supportingDatedEvidenceRows(
    multiSource,
    "publication_time",
  ).filter((row) => row.recordId === "candidate_live_action_schedule_change");
  assert.deepEqual(
    multiSourceRows.map((row) => row.selectedTime),
    ["2030-09-01T00:00:00.000Z", "2030-09-07T00:00:00.000Z"],
  );

  const html = renderToStaticMarkup(createElement(TimelineView, {
    packet,
    timeAxis: "publication_time",
    onTimeAxisChange: noop,
    onFocus: noop,
  }));
  assert.match(html, /Actor-claim timeline/);
  assert.match(html, /Only statements attributed to an actor appear in this section/);
  assert.match(html, /Source-bound actions and findings/);
  assert.match(html, /Not an actor claim/);
  assert.match(html, /moved maintenance exercise 97 from September 13 to September 18/);
  assert.match(html, /unexpected suit sensor reading prompted a safety review/);
  assert.match(html, /Linked source publication time/);
  assert.equal(packet.claim_occurrences.length, 1);
  assert.equal(packet.event_timeline_rows.length, 1);
  assert.equal(JSON.stringify({
    claims: packet.actor_claims,
    occurrences: packet.claim_occurrences,
    timeline: packet.event_timeline_rows,
    boundary: packet.candidate_canonical_boundary,
  }), before);
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
});

test("Map coverage copy separates actual representation from profile target gaps", () => {
  const standard = buildTemporalAcceptanceFixture();
  const standardHtml = renderMapMarkup(standard, "publication_time", true);
  assert.match(standardHtml, /3 sources · 1 of 5 role categories represented/);
  assert.match(standardHtml, /4 role categories are not represented/);
  assert.match(standardHtml, /Standard does not target every category/);
  assert.doesNotMatch(standardHtml, /All target roles represented/);
  assert.doesNotMatch(standardHtml, /Target-role gaps:/);
  assert.match(sourceCoverageNote(standard), /4 role categories are not represented/);

  const expansion = structuredClone(standard);
  expansion.discovery_profile = "coverage_expansion";
  assert.equal(expansion.coverage_summary.coverage_basis, "live_discovery");
  if (expansion.coverage_summary.coverage_basis !== "live_discovery") {
    throw new Error("temporal acceptance fixture must use live discovery coverage");
  }
  expansion.coverage_summary.discovery_profile = "coverage_expansion";
  expansion.coverage_summary.missing_target_lanes = [
    "primary_or_origin",
    "local_or_firsthand",
    "specialist_context",
    "challenge_or_correction",
  ];
  const expansionHtml = renderMapMarkup(expansion, "publication_time", true);
  assert.match(expansionHtml, /Target-role gaps: Original records, Local &amp; firsthand, Specialist context, Challenges &amp; corrections/);
  assert.match(sourceCoverageNote(expansion), /Coverage-expansion target-role gap/);

  const prepared = buildPreparedSiteReadyCasePacket();
  const preparedHtml = renderMapMarkup(prepared, "event_time");
  assert.match(preparedHtml, /4 sources · 4 of 5 role categories represented/);
  assert.match(preparedHtml, /Target-role gaps: Original records/);
  assert.match(sourceCoverageNote(prepared), /Prepared case target role not represented: Original records/);
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

  assert.match(html, /separately enabled operator-sponsored route/i);
  assert.match(html, /operator funds provider work under bounded admission limits/i);
  assert.match(html, /personal, confidential, sensitive, or identifying information/i);
  assert.match(html, /does not persist visitor questions or results/i);
  assert.match(html, /Results may be incomplete or wrong/i);
  assert.match(html, /records and relations remain review candidates/i);
  assert.match(html, /Privacy &amp; limits/);
  assert.match(html, /Source inclusion is not endorsement or truth verification/i);
  assert.match(html, /20-second per-request timeout/i);
  assert.match(html, /short cooldown to prevent accidental repeat requests/i);
  assert.doesNotMatch(html, /in-memory|not strong abuse prevention/i);
  assert.match(html, /Your API key stays on the Relay/i);
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
  assert.ok(explorerSource.indexOf("runGuard.current.begin()") < explorerSource.indexOf("executeInvestigationTransport(activeTransport"));
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

  const guardImplementation = readFileSync(
    new URL("../app/lib/public-live.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(guardImplementation, /localStorage|sessionStorage|document\.cookie|indexedDB/);
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
  assert.match(html, /Captured evidence excerpt/);
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
  assert.match(html, /<h2 id="map-grammar-title">Map<\/h2>/);
  assert.match(html, /claim-matrix-stage/);
  assert.match(html, /claim-relation-layer/);
  assert.match(html, /Candidate thread · 2 occurrences · needs review/);
  assert.match(html, /<strong>Standalone claim<\/strong>/);
  assert.doesNotMatch(html, /<small>No grouping asserted<\/small>/);
  assert.match(html, /Candidate connections/);
  assert.match(html, /Review all 3 relations/);
  assert.doesNotMatch(html, /Full claims, sources, times, and reasoning/);
  assert.match(html, /Unresolved evidence questions/);
  assert.match(html, /Not conclusions · Not chronological records/);
  assert.match(html, /Non-claim source records/);
  assert.match(html, /Context \/ interpretation/);
  assert.match(html, /Prepared source record/);
  assert.match(html, /Via matching claim/);
  assert.match(html, /Via action record/);
  assert.match(html, /Source-role coverage/);
  assert.match(html, /4 sources · 4 of 5 role categories represented/);
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

test("Map keeps the relation region addressable while rendering a compact zero-relation state", () => {
  const packet = buildTemporalAcceptanceFixture();
  assert.deepEqual(packet.relation_candidates, []);
  const html = renderMapMarkup(packet, "publication_time");
  assert.match(html, /id="candidate-relations"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /No candidate relations found in this bounded investigation/);
  assert.doesNotMatch(html, /Complete relation review ledger/);
  assert.doesNotMatch(html, /Every candidate relation is listed once below/);
  assert.doesNotMatch(html, /Full claims, sources, times, and reasoning/);
  assert.match(html, /href="#candidate-relations"/);
});

test("Map relation language reads earlier to later without changing candidate semantics", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const eventHtml = renderMapMarkup(packet, "event_time");
  const eventMap = deriveInvestigationMap(packet, "event_time");
  const supersedes = eventMap.relationLedger.find(
    (entry) => entry.relationType === "supersedes",
  );
  const challenge = eventMap.relationLedger.find(
    (entry) => entry.relationType === "contradicts",
  );
  const followUp = eventMap.relationLedger.find(
    (entry) => entry.relationType === "follow_up",
  );
  assert.ok(supersedes);
  assert.ok(challenge);
  assert.ok(followUp);

  assert.equal(relationSpatialLabel(supersedes), "Superseded by");
  assert.match(eventHtml, /R2 · Challenge/);
  assert.match(eventHtml, /R3 · Follow-up/);
  assert.equal(
    (eventHtml.match(new RegExp(`data-relation-port="${escapeRegex(challenge.relationId)}"`, "g")) ?? []).length,
    2,
  );
  assert.equal(
    (eventHtml.match(new RegExp(`data-relation-port="${escapeRegex(followUp.relationId)}"`, "g")) ?? []).length,
    2,
  );
  for (const entry of [challenge, followUp]) {
    assert.match(
      eventHtml,
      new RegExp(
        `data-relation-port="${escapeRegex(entry.relationId)}"[\\s\\S]*?data-focus-kind="relation" data-focus-id="${escapeRegex(entry.relationId)}"`,
      ),
    );
  }
  assert.doesNotMatch(eventHtml, />Response follows</);
  assert.match(eventHtml, /relation-ledger-summary/);
  assert.match(eventHtml, />Supersession</);
  assert.match(eventHtml, />Challenge</);
  assert.doesNotMatch(eventHtml, />Replaces</);
  assert.doesNotMatch(eventHtml, />Responds</);

  assert.equal(challenge.directionAsserted, false);
  assert.match(
    eventHtml,
    new RegExp(`data-relation-id="${escapeRegex(challenge.relationId)}" data-direction-asserted="false"`),
  );

  const retrievalHtml = renderMapMarkup(packet, "retrieval_time");
  assert.match(retrievalHtml, /data-direction-asserted="false"/);
  assert.match(retrievalHtml, /Supersession/);
  assert.doesNotMatch(retrievalHtml, /Superseded by/);
  assert.doesNotMatch(retrievalHtml, /Response follows/);
});

test("source-backed v2 reuses one relation across Map, ledger, inspector, and source detail", () => {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  const relation = packet.relation_candidates[0];
  const signal = packet.source_supported_relation_signals[0];
  const map = deriveInvestigationMap(packet, "publication_time");
  const entry = map.relationLedger[0];
  const html = renderMapMarkup(packet, "publication_time");

  assert.equal(relation.relation_type, "unresolved");
  assert.equal(entry.candidateRelationType, "unresolved");
  assert.equal(entry.relationType, "supersedes");
  assert.equal(entry.sourceBacked, true);
  assert.equal(entry.fromNodeId, signal.from_occurrence_id);
  assert.equal(entry.toNodeId, signal.to_occurrence_id);
  assert.equal(relation.left_occurrence_id, signal.to_occurrence_id);
  assert.equal(relation.right_occurrence_id, signal.from_occurrence_id);
  const fromOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === signal.from_occurrence_id,
  )!;
  const toOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === signal.to_occurrence_id,
  )!;
  const fromSupport = relation.right_support_reference;
  const toSupport = relation.left_support_reference;
  assert.equal(fromSupport.source_id, fromOccurrence.source_id);
  assert.equal(fromSupport.snapshot_id, fromOccurrence.snapshot_id);
  assert.equal(toSupport.source_id, toOccurrence.source_id);
  assert.equal(toSupport.snapshot_id, toOccurrence.snapshot_id);
  assert.equal(relationSpatialLabel(entry), "Replaces");
  assert.match(html, /Supersession/);
  assert.match(html, /Source-backed/);
  assert.match(html, /Needs review/);
  assert.doesNotMatch(html, /source-backed connector Replaces;[\s\S]*?Earlier-to-later direction/);
  assert.doesNotMatch(html, /Source-backed means captured source text directly states/);
  assert.doesNotMatch(html, /Source-backed visual family|Signal tab|Proof tab/);

  const relationPayload = getSiteReadyCaseDetail(
    packet,
    "relation",
    relation.relation_id,
  );
  assert.ok(relationPayload);
  const relationHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: { kind: "relation", id: relation.relation_id, label: "Candidate relation" },
    payload: relationPayload,
    state: "idle",
    onClose: noop,
  }));
  assert.match(relationHtml, /Connection[\s\S]*?Supersession/);
  assert.match(relationHtml, /Evidence state[\s\S]*?Source-backed · Needs review/);
  assert.match(relationHtml, /Why this is shown/);
  assert.match(relationHtml, new RegExp(escapeRegex(SOURCE_SUPPORTED_STATEMENT)));
  assert.match(relationHtml, /Guidance G-2[\s\S]*?directly states this relationship/);
  assert.match(relationHtml, /Referenced document:[\s\S]*?Guidance G-1/);
  assert.match(relationHtml, /Open statement source/);
  assert.match(relationHtml, /Open referenced document/);
  assert.match(relationHtml, /Other relation review context/);
  assert.match(relationHtml, /From-side candidate support/);
  assert.match(relationHtml, /To-side candidate support/);
  assert.doesNotMatch(relationHtml, /occurrence ID|support source ID|support snapshot ID|support reference/i);
  assert.doesNotMatch(relationHtml, new RegExp(escapeRegex(fromOccurrence.occurrence_id)));
  assert.doesNotMatch(relationHtml, new RegExp(escapeRegex(toOccurrence.occurrence_id)));
  assert.doesNotMatch(relationHtml, /First occurrence ID|Second occurrence ID|First relation support|Second relation support/);
  assert.ok(
    relationHtml.indexOf("Why this is shown")
      < relationHtml.indexOf("Other relation review context"),
  );
  assert.doesNotMatch(
    relationHtml,
    /target_identity|proof[_ ](?:id|status|basis)|capture[_ ]id|captured_body_sha256|normalized_text_sha256|assessment[_ ]id|identity_anchor/i,
  );
  const unsafeUrlPacket = structuredClone(packet);
  unsafeUrlPacket.source_snapshot_summaries.forEach((source) => {
    source.url = "javascript:alert(1)";
  });
  const unsafeUrlHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet: unsafeUrlPacket,
    selection: { kind: "relation", id: relation.relation_id, label: "Candidate relation" },
    payload: relationPayload,
    state: "idle",
    onClose: noop,
  }));
  assert.doesNotMatch(unsafeUrlHtml, /Open statement source|Open referenced document/);

  const statementPayload = getSiteReadyCaseDetail(
    packet,
    "source",
    signal.statement_source_id,
  );
  assert.ok(statementPayload);
  const sourceHtml = renderToStaticMarkup(createElement(FocusedDetailPanel, {
    packet,
    selection: {
      kind: "source",
      id: signal.statement_source_id,
      label: "Statement source",
    },
    payload: statementPayload,
    state: "idle",
    onClose: noop,
  }));
  assert.match(sourceHtml, /Connected changes/);
  assert.match(sourceHtml, /Supersession · Source-backed · needs review/);

  const preparedHtml = renderMapMarkup(
    buildPreparedSiteReadyCasePacket(),
    "event_time",
  );
  assert.doesNotMatch(preparedHtml, /Source-backed/);
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
  assert.match(html, /Broader coverage starts a new bounded provider request/);
  assert.match(html, /current investigation stays visible until a new result is ready/);
  assert.doesNotMatch(html, /Do not blindly retry while delivery status is unknown/);
  assert.match(html, /Filters only change what is emphasized/);
  assert.match(html, /never remove or alter the displayed investigation/);
  assert.doesNotMatch(html, /saved investigation/i);
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
    assert.match(html, new RegExp(`Review all ${map.relationLedger.length} relation`));
    assert.doesNotMatch(html, /Full claims, sources, times, and reasoning/);
    assert.doesNotMatch(html, /First occurrence|Second occurrence/);
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
  assert.equal(
    (longClaimHtml.match(new RegExp(escapeRegex(fullLongClaim), "g")) ?? []).length,
    1,
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
  assert.match(html, /Every relation appears once in this compact index/);
  assert.match(html, /See why this question remains open/);
  assert.match(html, /Viewing and filtering never changes the displayed investigation/);
  assert.doesNotMatch(html, /saved investigation/i);
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

  assert.match(html, /Every relation appears once in this compact index/);
  assert.match(html, new RegExp(`relation-ledger:relation:${relationId}`));
  assert.equal((html.match(new RegExp(`data-relation-id="${relationId}"`, "g")) ?? []).length, 1);
  assert.equal(spatialRelationEdges(map).some(
    (edge) => edge.relationId === relationId,
  ), false);
  assert.equal(map.relationRoutes.portRelationIds.includes(relationId), true);
  assert.equal(
    (html.match(new RegExp(`data-relation-port="${relationId}"`, "g")) ?? []).length,
    2,
  );
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

test("occurrence trace and relation inspection expose typed text states without internal references", () => {
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
  assert.match(detailHtml, /Direct excerpt from prepared source/);
  assert.doesNotMatch(detailHtml, /Exact relation and support references/);
  assert.doesNotMatch(detailHtml, new RegExp(relation.left_occurrence_id));
  assert.doesNotMatch(detailHtml, new RegExp(relation.right_occurrence_id));
  assert.doesNotMatch(detailHtml, new RegExp(escapeRegex(relation.left_support_reference.evidence_reference)));
  assert.doesNotMatch(detailHtml, new RegExp(escapeRegex(relation.right_support_reference.evidence_reference)));
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

test("source inspector owns evidence without repeating source-selection or implementation detail", () => {
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
  assert.doesNotMatch(html, /Why this source matters/);
  assert.match(html, /Prepared source evidence|Captured evidence excerpt/);
  assert.match(html, /Claims found in this source/);
  assert.match(html, /Connected changes/);
  assert.match(html, /Related open questions/);
  assert.match(html, /Findings, actions, context, and limitations/);
  assert.doesNotMatch(html, /Hashes and provider identifiers|Provider search call ID|Stable record identifier/);
  assert.match(html, /Prepared example: no external citation URL/);
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

test("Sources remains an index and Method subordinates coverage detail", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourcesHtml = renderToStaticMarkup(createElement(SourcesView, {
    packet,
    onFocus: noop,
  }));
  assert.match(sourcesHtml, /Captured source evidence/);
  assert.match(sourcesHtml, /Bounded source evidence is available in the Inspector/);
  for (const source of packet.source_snapshot_summaries) {
    if (source.evidence_excerpt) {
      assert.doesNotMatch(sourcesHtml, new RegExp(escapeRegex(source.evidence_excerpt)));
    }
  }
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
  assert.match(methodHtml, /How to read this investigation/);
  assert.match(methodHtml, /Coverage details/);
  assert.match(methodHtml, /Only statements attributed to an actor become claim records/);
  assert.doesNotMatch(methodHtml, /#43/);
  assert.match(methodHtml, /Source inclusion is not endorsement or truth verification/);
  assert.match(methodHtml, /Browsing and focus controls do not change review records/);
  assert.doesNotMatch(methodHtml, /Standalone time candidates|Theoretical pairs|Prefilter candidates|Hard pair limit|Model-classified pairs/);
  assert.match(methodHtml, /Prepared example coverage/);
});

test("ordinary rendered review surfaces do not expose internal identifiers, enums, or status jargon", () => {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  const relation = packet.relation_candidates[0];
  const relationPayload = getSiteReadyCaseDetail(packet, "relation", relation.relation_id);
  const source = packet.source_snapshot_summaries[0];
  const sourcePayload = getSiteReadyCaseDetail(packet, "source", source.source_id);
  assert.ok(relationPayload);
  assert.ok(sourcePayload);
  const rendered = [
    renderMapMarkup(packet, "publication_time"),
    renderToStaticMarkup(createElement(SourcesView, { packet, onFocus: noop })),
    renderToStaticMarkup(createElement(MethodView, { packet })),
    renderToStaticMarkup(createElement(FocusedDetailPanel, {
      packet,
      selection: { kind: "relation", id: relation.relation_id, label: "Candidate relation" },
      payload: relationPayload,
      state: "idle",
      onClose: noop,
    })),
    renderToStaticMarkup(createElement(FocusedDetailPanel, {
      packet,
      selection: { kind: "source", id: source.source_id, label: source.title },
      payload: sourcePayload,
      state: "idle",
      onClose: noop,
    })),
  ].join(" ");
  const visibleText = rendered.replace(/<[^>]+>/g, " ");
  for (const phrase of [
    "captured_fixture_support",
    "deterministic_fixture",
    "model_summary_containment_only",
    "deterministic_rule",
    "source_supported_relation_observation",
    "assessment_id",
    "proof_id",
    "capture_id",
    "normalized_text_sha256",
    "captured_body_sha256",
    "canonical_mutation",
    "Provider search call ID",
    "Hashes and provider identifiers",
    "Stable record identifier",
  ]) {
    assert.doesNotMatch(visibleText, new RegExp(escapeRegex(phrase), "i"));
  }
  assert.doesNotMatch(visibleText, /\b(?:Verified|Confirmed|Proven|Accepted|Canonical)\b/);
});

test("each investigation view starts with one semantic H2 before its subsections", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const views = [
    renderMapMarkup(packet, "event_time"),
    renderToStaticMarkup(createElement(TimelineView, {
      packet,
      timeAxis: "event_time",
      onTimeAxisChange: noop,
      onFocus: noop,
    })),
    renderToStaticMarkup(createElement(SourcesView, { packet, onFocus: noop })),
    renderToStaticMarkup(createElement(MethodView, { packet })),
  ];
  for (const html of views) {
    const headings = [...html.matchAll(/<h([2-6])(?:\s[^>]*)?>/g)].map((match) => Number(match[1]));
    assert.equal(headings[0], 2);
    assert.equal(headings.filter((level) => level === 2).length, 1);
    assert.ok(headings.slice(1).every((level) => level >= 3));
  }
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
  assert.match(text, /Cross-source temporal relationships were not analyzed in this bounded run/);
  assert.match(text, /Source coverage is bounded and nonexhaustive/i);
  assert.match(text, /Source inclusion is not endorsement or truth verification/);
  assert.match(text, /Candidate relationships organize review/);
  assert.match(text, /Browsing and focus controls do not change review records/);
  assert.doesNotMatch(text, /src_candidate_live_|time_candidate|candidate_id|validation_path|YYYY-MM-DD|timezone-qualified/);

  const html = renderToStaticMarkup(createElement(MethodView, { packet }));
  assert.doesNotMatch(html, /src_candidate_live_|time_candidate|candidate_id|validation_path|YYYY-MM-DD|timezone-qualified/);
  assert.match(html, /Keep these limits in view/);
});

test("Method conservatively collapses known summary-capture and cross-source wording families", () => {
  const packet = buildTemporalAcceptanceFixture();
  packet.limitations.push(
    "The supplied material is a bounded model-generated summary, not independently verified source text.",
    "No cross-source temporal relationship or factual truth determination was made.",
    "A distinct publication date is unavailable for the final listing.",
  );
  const limitations = publicMethodLimitations(packet);
  assert.equal(
    limitations.filter((limitation) =>
      limitation === "Live source pages were not captured; model-generated web-search summaries remain partial review material."
    ).length,
    1,
  );
  assert.equal(
    limitations.filter((limitation) =>
      limitation === "Cross-source temporal relationships were not analyzed in this bounded run."
    ).length,
    1,
  );
  assert.ok(limitations.includes("A distinct publication date is unavailable for the final listing."));
  assert.ok(limitations.includes("Source coverage is bounded and nonexhaustive."));
  assert.ok(limitations.includes("Source inclusion is not endorsement or truth verification."));
  assert.equal(
    limitations.filter((limitation) => /Source inclusion is not endorsement/i.test(limitation)).length,
    1,
  );
  assert.ok(limitations.includes(
    "Candidate relationships organize review; they do not establish truth or causation.",
  ));
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
  assert.match(mapHtml, /aria-label="R1, Supersession, Needs review\./);
  const ledgerRelationLabel = mapHtml.match(
    /<button class="relation-ledger-summary"[^>]*aria-label="([^"]+)"/,
  )?.[1];
  assert.ok(ledgerRelationLabel);
  assert.doesNotMatch(ledgerRelationLabel, /first occurrence:|source |selected-axis time|reason/i);
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
  assert.doesNotMatch(html, /Conservative resolution details|Record status enum|question status enum/i);
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
  assert.doesNotMatch(unknownHtml, /topic_unknown/);
});

test("focused record statuses use public labels and do not expose exact enums", () => {
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
  assert.doesNotMatch(candidateQuestionHtml, /Conservative resolution details|Record status enum|candidate<\/p>/);

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
  assert.doesNotMatch(occurrenceHtml, /Record status enum|Status enum|Origin enum/);

  assert.equal(focusedRecordStatusLabel("canonical"), "Prepared case record");
  assert.equal(focusedRecordStatusLabel("candidate"), "Needs review");
  assert.equal(JSON.stringify(packet).includes("#43"), false);
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
});

test("public copy avoids project shorthand and inaccurate no-network claims while preserving record boundaries", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
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
  assert.equal(getRunNotice(live, false, null).message, "The bounded result is ready.");
  assert.doesNotMatch(getRunNotice(live, false, null).message, /review draft/i);
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
  assert.match(cooldown.message, /short cooldown helps prevent accidental repeat requests/i);
  assert.doesNotMatch(cooldown.message, /in-memory|guard|not strong abuse prevention/i);

  const partialCooldown = getRunNotice(partial, false, null, 8);
  assert.match(partialCooldown.message, /remain review-only/i);
  assert.match(partialCooldown.message, /short cooldown helps prevent accidental repeat requests/i);
  assert.match(partialCooldown.message, /Next live attempt in 8s/i);
  assert.doesNotMatch(
    partialCooldown.message,
    /in-memory|guard|not strong abuse prevention/i,
  );
});

test("live primary presentation keeps one global review boundary without repeating local warnings", () => {
  const live = buildTemporalAcceptanceFixture();
  const payoffHtml = renderToStaticMarkup(createElement(FirstPayoff, {
    packet: live,
    onFocus: noop,
  }));
  const notice = getRunNotice(live, false, null);
  const primaryPresentation = [
    modeLabel(live),
    "Viewing does not change review status",
    notice.title,
    notice.message,
    payoffHtml,
  ].join(" ");

  assert.match(primaryPresentation, /Live · review only/);
  assert.match(primaryPresentation, /Viewing does not change review status/);
  assert.match(primaryPresentation, /Source inclusion is not endorsement or truth verification/);
  assert.doesNotMatch(primaryPresentation, /Relations need review/);
  assert.doesNotMatch(primaryPresentation, /This live result is a review draft/);
  assert.doesNotMatch(primaryPresentation, /Candidate finding · review only/);
  assert.doesNotMatch(primaryPresentation, /Browsing does not change the record/);

  const explorerSource = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(explorerSource, /Viewing does not change review status/);
  assert.doesNotMatch(explorerSource, /Relations need review · Browsing never changes the record/);
});

test("operator and lower-level live flags default closed with distinct bounded route errors", async () => {
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
  const originalOperatorFlag = process.env[OPERATOR_LIVE_ENVIRONMENT_FLAG];
  process.env[OPERATOR_LIVE_ENVIRONMENT_FLAG] = "true";
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
    if (originalOperatorFlag === undefined) {
      delete process.env[OPERATOR_LIVE_ENVIRONMENT_FLAG];
    } else {
      process.env[OPERATOR_LIVE_ENVIRONMENT_FLAG] = originalOperatorFlag;
    }
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
  assert.doesNotMatch(tabletRules, /\.relation-ledger-detail-grid/);
  assert.match(tabletRules, /\.non-claim-source-section\.has-1-subgroups,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);

  const mobileRules = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert.match(mobileRules, /\.relation-ledger-summary \{ min-height: 82px; grid-template-columns: 34px minmax\(0, 1fr\)/);
  assert.match(mobileRules, /\.detail-button \{[^}]*min-height: 44px/);
  assert.match(mobileRules, /\.relation-port-list \{ display: grid/);
  assert.match(mobileRules, /\.focus-toolbar \{ min-height: 0/);
  assert.match(mobileRules, /\.detail-panel \{ inset: 8px; width: auto; height: calc\(100dvh - 16px\)/);
  assert.doesNotMatch(mobileRules, /width:\s*100vw/);
});

test("result actions and Map lens controls preserve practical target sizes", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.start-new-investigation-button \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.export-toggle \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.export-actions button \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.lens-list \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.lens-list button \{[^}]*min-height: 44px/);
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
  assert.match(mapRules, /\.relation-port-list span \{[^}]*font-size: var\(--map-font-supporting\)/);
  assert.match(mapRules, /\.question-origin-chip b \{[^}]*font-size: var\(--map-font-important\)/);
  assert.doesNotMatch(mapRules, /\.ledger-endpoint/);
  assert.match(mapRules, /\.relation-ledger-route \{[^}]*font-size: var\(--map-font-important\)/);
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
  assert.match(mapRules, /\.map-skip-links:focus-within \{[\s\S]*?width: auto;[\s\S]*?max-width: calc\(100% - 8px\);[\s\S]*?flex-wrap: wrap;[\s\S]*?clip-path: none;[\s\S]*?white-space: normal/);
  assert.match(mapRules, /\.map-skip-links a \{[\s\S]*?max-width: 100%;[\s\S]*?white-space: nowrap/);
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
  assert.match(html, /<strong>Standalone claim<\/strong>/);
  assert.doesNotMatch(html, /<small>No grouping asserted<\/small>/);
  assert.match(html, /href="#candidate-relations"/);
  assert.match(html, /href="#unresolved-evidence-questions"/);
  assert.doesNotMatch(html, /mobile-investigation-path/);
  assert.doesNotMatch(html, /aria-describedby="map-canvas-scroll-hint"/);
  assert.doesNotMatch(html, /id="map-canvas-scroll-hint"/);

  const liveStandaloneHtml = renderMapMarkup(
    buildTemporalAcceptanceFixture(),
    "publication_time",
  );
  assert.match(liveStandaloneHtml, /Regional Operations Agency/);
  assert.match(liveStandaloneHtml, /separate September 25 inspection remained scheduled/);
  assert.match(liveStandaloneHtml, /Sep 7, 2030 · Day precision/);
  assert.match(liveStandaloneHtml, /Source record status: Needs review/);
  const occurrenceCard = liveStandaloneHtml.match(
    /<article class="claim-occurrence-card"[\s\S]*?<\/article>/,
  )?.[0];
  assert.ok(occurrenceCard);
  assert.match(occurrenceCard, /<small>Regional Operations Agency<\/small>/);
  assert.doesNotMatch(occurrenceCard, /Regional Operations Agency · Needs review/);
  assert.doesNotMatch(occurrenceCard, /unordered peer/i);

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
  assert.match(matrixRules, /\.question-evidence-tether \{[^}]*opacity: 0/);
  assert.match(matrixRules, /\.question-evidence-tether\.is-selected \{[^}]*opacity: 1/);
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
  packet: SiteReadyCasePacket,
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
