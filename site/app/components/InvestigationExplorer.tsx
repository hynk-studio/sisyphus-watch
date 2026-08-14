"use client";

import {
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  AnalysisRoutePayload,
  AnalysisRunPacket,
} from "../lib/analysis/contracts";
import {
  EXPERIENCE_VIEWS,
  VIEW_LABELS,
  hasFocusedDetailKey,
  modeLabel,
  type ExperienceView,
  type TimeAxis,
} from "../lib/experience";
import {
  buildLineageRequest,
  deriveInvestigationMap,
  type CoverageLens,
} from "../lib/investigation-map";
import type {
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "../lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../lib/lineage/details";
import type { DiscoveryProfile } from "../lib/source-profile";
import { FocusedDetailPanel } from "./FocusedDetailPanel";
import { InvestigationMapView } from "./InvestigationMapView";
import {
  MethodView,
  SourcesView,
  TimelineView,
} from "./InvestigationResultViews";
import { SearchComposer } from "./SearchComposer";
import type { FocusSelection } from "./investigation-types";

export function CaseExplorer({
  preparedCase,
  liveEnabled = false,
}: {
  preparedCase: SiteReadyCasePacket;
  liveEnabled?: boolean;
}) {
  const [packet, setPacket] = useState(preparedCase);
  const [investigationStarted, setInvestigationStarted] = useState(false);
  const [activeView, setActiveView] = useState<ExperienceView>("map");
  const [timeAxis, setTimeAxis] = useState<TimeAxis>("event_time");
  const [question, setQuestion] = useState("");
  const [sourceLimit, setSourceLimit] = useState(5);
  const [discoveryProfile, setDiscoveryProfile] =
    useState<DiscoveryProfile>("standard");
  const [coverageLens, setCoverageLens] = useState<CoverageLens>("all");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [focus, setFocus] = useState<FocusSelection | null>(null);
  const [threadTraceActive, setThreadTraceActive] = useState(false);
  const [focusedDetail, setFocusedDetail] = useState<SiteReadyCaseDetail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const map = useMemo(
    () => deriveInvestigationMap(packet, timeAxis),
    [packet, timeAxis],
  );

  function closeDetail() {
    setFocus(null);
    setThreadTraceActive(false);
    setFocusedDetail(null);
    setDetailState("idle");
  }

  async function runAnalysis(input: {
    question: string;
    sourceLimit: number;
    discoveryProfile: DiscoveryProfile;
  }) {
    if (!liveEnabled) return;
    setRouteError(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/lineage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildLineageRequest(input)),
      });
      const payload = (await response.json()) as
        | SiteReadyCasePacket
        | Extract<AnalysisRoutePayload, { status: "error" }>;
      if (payload.status === "error") {
        setRouteError(payload.error.message);
        return;
      }
      if (!response.ok) {
        setRouteError("The bounded investigation request did not complete.");
        return;
      }
      setPacket(payload);
      setInvestigationStarted(true);
      setActiveView("map");
      setCoverageLens("all");
      closeDetail();
    } catch {
      setRouteError("The same-Site investigation route is unavailable.");
    } finally {
      setIsLoading(false);
    }
  }

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAnalysis({ question, sourceLimit, discoveryProfile });
  }

  function startPreparedExample() {
    setPacket(preparedCase);
    setInvestigationStarted(true);
    setActiveView("map");
    setTimeAxis("event_time");
    setCoverageLens("all");
    setRouteError(null);
    closeDetail();
    requestAnimationFrame(() => {
      document.getElementById("investigation-workspace")?.scrollIntoView({
        block: "start",
      });
    });
  }

  function startNewInvestigation() {
    setPacket(preparedCase);
    setInvestigationStarted(false);
    setActiveView("map");
    setCoverageLens("all");
    setRouteError(null);
    closeDetail();
    requestAnimationFrame(() => {
      document.getElementById("investigation-question")?.focus();
    });
  }

  async function openDetail(selection: FocusSelection) {
    if (!hasFocusedDetailKey(packet, selection.kind, selection.id)) return;
    setFocus(selection);
    setThreadTraceActive(false);
    setFocusedDetail(null);
    const local = getSiteReadyCaseDetail(packet, selection.kind, selection.id);
    if (packet.mode === "live") {
      setFocusedDetail(local);
      setDetailState(local ? "idle" : "error");
      return;
    }
    setDetailState("loading");
    try {
      const params = new URLSearchParams({
        focus: selection.kind,
        id: selection.id,
      });
      const response = await fetch(
        `/api/lineage/${encodeURIComponent(packet.case_id)}?${params.toString()}`,
      );
      if (!response.ok) throw new Error("focused detail unavailable");
      setFocusedDetail((await response.json()) as SiteReadyCaseDetail);
      setDetailState("idle");
    } catch {
      setFocusedDetail(local);
      setDetailState(local ? "idle" : "error");
    }
  }

  function selectView(view: ExperienceView) {
    setActiveView(view);
    closeDetail();
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % EXPERIENCE_VIEWS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + EXPERIENCE_VIEWS.length) % EXPERIENCE_VIEWS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = EXPERIENCE_VIEWS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextView = EXPERIENCE_VIEWS[nextIndex];
    selectView(nextView);
    requestAnimationFrame(() => {
      document.getElementById(`view-tab-${nextView}`)?.focus();
    });
  }

  const runNotice = getRunNotice(packet, isLoading, routeError);
  const selectedNodeId = focus?.kind === "source" || focus?.kind === "unresolved_question"
    ? focus.id
    : null;
  const selectedEdgeId = focus?.kind === "relation" ? focus.id : null;

  return (
    <main className="site-shell">
      <header className="masthead" aria-label="Sisyphus Watch">
        <a className="wordmark" href="#top" aria-label="Sisyphus Watch home">
          <span className="wordmark-mark" aria-hidden="true">S</span>
          <span>Sisyphus Watch</span>
        </a>
        <span className="header-note">A version map for changing public information</span>
      </header>

      <SearchComposer
        question={question}
        sourceLimit={sourceLimit}
        discoveryProfile={discoveryProfile}
        liveEnabled={liveEnabled}
        isLoading={isLoading}
        routeError={routeError}
        investigationStarted={investigationStarted}
        onQuestionChange={setQuestion}
        onSourceLimitChange={setSourceLimit}
        onDiscoveryProfileChange={setDiscoveryProfile}
        onSubmit={submitAnalysis}
        onPreparedExample={startPreparedExample}
      />

      {investigationStarted ? (
        <section
          className="workspace"
          id="investigation-workspace"
          aria-labelledby="case-title"
        >
          <div className="case-heading">
            <div>
              <div className="case-kicker-row">
                <span className={`mode-badge mode-${packet.mode}`}>
                  {modeLabel(packet)}
                </span>
                <span className="boundary-badge">
                  Relations need review · Browsing never changes the record
                </span>
              </div>
              <p className="eyebrow">Investigation map</p>
              <h2 id="case-title">{packet.normalized_public_interest_question}</h2>
              <p className="case-question">{packet.title}</p>
            </div>
            <button
              className="quiet-button"
              type="button"
              onClick={startNewInvestigation}
            >
              New investigation
            </button>
          </div>

          <div
            className={`run-notice run-notice-${runNotice.tone}`}
            role="status"
            aria-live="polite"
          >
            <strong>{runNotice.title}</strong>
            <span>{runNotice.message}</span>
          </div>

          <nav className="view-nav" aria-label="Investigation result views">
            <div
              className="tab-list"
              role="tablist"
              aria-label="Investigation result views"
            >
              {EXPERIENCE_VIEWS.map((view, index) => (
                <button
                  id={`view-tab-${view}`}
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={activeView === view}
                  aria-controls="case-view-panel"
                  tabIndex={activeView === view ? 0 : -1}
                  onClick={() => selectView(view)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                >
                  {VIEW_LABELS[view]}
                </button>
              ))}
            </div>
          </nav>

          <div className={`result-layout${focus ? " has-detail" : ""}`}>
            <section
              id="case-view-panel"
              className="view-panel"
              role="tabpanel"
              aria-labelledby={`view-tab-${activeView}`}
              tabIndex={0}
            >
              {activeView === "map" ? (
                <InvestigationMapView
                  packet={packet}
                  map={map}
                  timeAxis={timeAxis}
                  coverageLens={coverageLens}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  threadTraceActive={threadTraceActive}
                  liveEnabled={liveEnabled}
                  isLoading={isLoading}
                  onTimeAxisChange={setTimeAxis}
                  onCoverageLensChange={setCoverageLens}
                  onFocus={openDetail}
                  onTraceThread={() => setThreadTraceActive(true)}
                  onShowFullMap={closeDetail}
                  onExpandCoverage={() => void runAnalysis({
                    question: packet.normalized_public_interest_question,
                    sourceLimit: packet.requested_source_limit,
                    discoveryProfile: "coverage_expansion",
                  })}
                />
              ) : null}
              {activeView === "timeline" ? (
                <TimelineView
                  packet={packet}
                  timeAxis={timeAxis}
                  onTimeAxisChange={setTimeAxis}
                  onFocus={openDetail}
                />
              ) : null}
              {activeView === "sources" ? (
                <SourcesView packet={packet} onFocus={openDetail} />
              ) : null}
              {activeView === "method" ? <MethodView packet={packet} /> : null}
            </section>
            {focus ? (
              <FocusedDetailPanel
                packet={packet}
                selection={focus}
                payload={focusedDetail}
                state={detailState}
                onClose={closeDetail}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <footer className="site-footer">
        <p>Sources, findings, actor claims, actions, and open questions stay distinct.</p>
        <p>Candidate relations organize review; they never decide what is true.</p>
      </footer>
    </main>
  );
}

export function getRunNotice(
  packet: SiteReadyCasePacket,
  isLoading: boolean,
  error: string | null,
): {
  tone: "prepared" | "loading" | "live" | "partial" | "fallback" | "error";
  title: string;
  message: string;
} {
  if (isLoading) {
    return {
      tone: "loading",
      title: "Building a bounded investigation map",
      message: "The displayed packet stays intact until a new validated response is available.",
    };
  }
  if (error) {
    return {
      tone: "error",
      title: "Investigation update unavailable",
      message: `${error} The displayed packet remains intact.`,
    };
  }
  if (packet.mode === "fallback") {
    return {
      tone: "fallback",
      title: "Prepared fallback shown",
      message: "The live attempt did not succeed. This is the deterministic prepared example, not a live investigation.",
    };
  }
  if (packet.mode === "live" && packet.warnings.length) {
    return {
      tone: "partial",
      title: "Partial live investigation",
      message: "Validated candidates are shown with warnings and remain review-only.",
    };
  }
  if (packet.mode === "live") {
    return {
      tone: "live",
      title: "Bounded live investigation",
      message: "The server returned one validated candidate packet. No canonical state changed.",
    };
  }
  return {
    tone: "prepared",
    title: "Prepared demonstration",
    message: "This curated cooling-center packet was not produced by a newly executed search.",
  };
}

export function LineageResult({ run }: { run: SiteReadyCasePacket }) {
  return (
    <section className="run-panel" aria-labelledby="lineage-run-title">
      <p className="eyebrow">{run.status} Site-ready case packet</p>
      <h2 id="lineage-run-title">{run.normalized_public_interest_question}</h2>
      <p>
        {run.actual_source_count} sources · {run.claim_occurrences.length} occurrences · {run.relation_candidates.length} relation candidates
      </p>
      <p>All inferred records remain candidate/review-only. Canonical mutation: none.</p>
    </section>
  );
}

export function AnalysisResult({ run }: { run: AnalysisRunPacket }) {
  return (
    <section className="run-panel" aria-labelledby="run-title">
      <p className="eyebrow">{run.status} run packet</p>
      <h2 id="run-title">{run.normalized_question}</h2>
      <p>{run.actual_source_count} sources · {run.candidate_ids.length} candidates</p>
      <ul className="item-list">
        {run.candidates.map((candidate) => (
          <li className="source-item" key={candidate.candidate_id}>
            <p>{candidate.candidate_type} · candidate</p>
            <strong>{candidate.text}</strong>
            <p>{candidate.supporting_summary_span}</p>
            <a
              href={candidate.source_reference.url}
              target="_blank"
              rel="noreferrer"
            >
              {candidate.source_reference.kind === "url_citation"
                ? "Cited source"
                : "Web-search source"}: {candidate.source_reference.title}
            </a>
            <p>Source ref: {candidate.source_reference.source_id}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
