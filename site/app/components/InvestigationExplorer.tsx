"use client";

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  AnalysisRoutePayload,
  AnalysisRunPacket,
} from "../lib/analysis/contracts";
import { PUBLIC_DEFAULT_SOURCE_LIMIT } from "../lib/analysis/contracts";
import {
  EXPERIENCE_VIEWS,
  VIEW_LABELS,
  hasFocusedDetailKey,
  modeLabel,
  type ExperienceView,
} from "../lib/experience";
import {
  FocusedDetailSupplementCache,
  focusedDetailKey,
  needsPreparedDetailSupplement,
} from "../lib/focused-detail";
import {
  buildLineageRequest,
  chooseInitialTimeAxis,
  deriveInvestigationMapBase,
  investigationTimeAxisReducer,
  projectInvestigationMap,
  type CoverageLens,
} from "../lib/investigation-map";
import type {
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "../lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../lib/lineage/details";
import type { DiscoveryProfile } from "../lib/source-profile";
import {
  PublicLiveRunGuard,
  decidePublicRunResponse,
  fallbackFailureCode,
  publicRerunSourceLimit,
} from "../lib/public-live";
import { FocusedDetailPanel } from "./FocusedDetailPanel";
import { ExportInvestigation } from "./ExportInvestigation";
import { FirstPayoff } from "./FirstPayoff";
import { InvestigationMapView } from "./InvestigationMapView";
import {
  MethodView,
  SourcesView,
  TimelineView,
} from "./InvestigationResultViews";
import { SearchComposer } from "./SearchComposer";
import {
  FOCUS_TRIGGER_ATTRIBUTE,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

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
  const [timeAxis, dispatchTimeAxis] = useReducer(
    investigationTimeAxisReducer,
    preparedCase,
    chooseInitialTimeAxis,
  );
  const [question, setQuestion] = useState("");
  const [sourceLimit, setSourceLimit] = useState(PUBLIC_DEFAULT_SOURCE_LIMIT);
  const [discoveryProfile, setDiscoveryProfile] =
    useState<DiscoveryProfile>("standard");
  const [coverageLens, setCoverageLens] = useState<CoverageLens>("all");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState(0);
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);
  const [focus, setFocus] = useState<FocusSelection | null>(null);
  const [threadTraceActive, setThreadTraceActive] = useState(false);
  const [focusedDetail, setFocusedDetail] = useState<SiteReadyCaseDetail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const detailCache = useRef(new FocusedDetailSupplementCache());
  const runGuard = useRef(new PublicLiveRunGuard());
  const activeDetailKey = useRef<string | null>(null);
  const activatingElement = useRef<HTMLElement | null>(null);
  const activatingTriggerId = useRef<string | null>(null);
  const activatingSelection = useRef<FocusSelection | null>(null);
  const activatingScrollY = useRef(0);
  const mapBase = useMemo(
    () => deriveInvestigationMapBase(packet),
    [packet],
  );
  const map = useMemo(
    () => projectInvestigationMap(mapBase, timeAxis),
    [mapBase, timeAxis],
  );

  useEffect(() => {
    if (cooldownUntilMs === 0) return;
    const updateCooldown = () => {
      const remaining = runGuard.current.cooldownRemainingSeconds();
      setCooldownRemainingSeconds(remaining);
      if (remaining === 0) setCooldownUntilMs(0);
    };
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntilMs]);

  function clearDetail() {
    activeDetailKey.current = null;
    setFocus(null);
    setThreadTraceActive(false);
    setFocusedDetail(null);
    setDetailState("idle");
  }

  function closeDetail() {
    const trigger = activatingElement.current;
    const triggerId = activatingTriggerId.current;
    const selection = activatingSelection.current;
    const scrollY = activatingScrollY.current;
    clearDetail();
    requestAnimationFrame(() => {
      const focusTriggers = [
        ...document.querySelectorAll<HTMLElement>(`[${FOCUS_TRIGGER_ATTRIBUTE}]`),
      ];
      const exactFallback = triggerId
        ? focusTriggers.find((element) =>
          element.getAttribute(FOCUS_TRIGGER_ATTRIBUTE) === triggerId
          && isVisibleFocusTarget(element)
        )
        : null;
      const entityFallback = selection
        ? focusTriggers.find((element) =>
          element.dataset.focusKind === selection.kind
          && element.dataset.focusId === selection.id
          && isVisibleFocusTarget(element)
        )
        : null;
      const restoreTarget = trigger && isVisibleFocusTarget(trigger)
        ? trigger
        : exactFallback ?? entityFallback;
      if (restoreTarget) {
        restoreTarget.focus({ preventScroll: true });
      } else {
        document.getElementById("case-view-panel")?.focus({ preventScroll: true });
      }
      window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "instant" });
    });
  }

  function showThreadTrace() {
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    setThreadTraceActive(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: scrollX, behavior: "instant" });
    });
  }

  async function runAnalysis(input: {
    question: string;
    sourceLimit: number;
    discoveryProfile: DiscoveryProfile;
  }) {
    if (!liveEnabled) return;
    const requestId = runGuard.current.begin();
    if (requestId === null) return;
    const hadDisplayedInvestigation = investigationStarted;
    let outcome: "success" | "failure" = "failure";
    let serverRetryAfterSeconds = 0;
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
      if (!runGuard.current.acceptsResponse(requestId)) return;
      serverRetryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get("Retry-After"),
      );
      const decision = decidePublicRunResponse(payload, {
        responseOk: response.ok,
        hadDisplayedInvestigation,
        retryAfterSeconds: serverRetryAfterSeconds,
      });
      if (decision.kind === "preserve") {
        setRouteError(decision.message);
        return;
      }
      const nextPacket = decision.packet;
      setPacket(nextPacket);
      dispatchTimeAxis({ type: "display_packet", packet: nextPacket });
      setInvestigationStarted(true);
      setActiveView("map");
      setCoverageLens("all");
      clearDetail();
      outcome = nextPacket.mode === "live" ? "success" : "failure";
    } catch {
      if (runGuard.current.acceptsResponse(requestId)) {
        setRouteError("The same-Site investigation route is unavailable.");
      }
    } finally {
      if (runGuard.current.complete(
        requestId,
        outcome,
        serverRetryAfterSeconds,
      )) {
        const state = runGuard.current.state();
        setIsLoading(false);
        setCooldownUntilMs(state.cooldownUntilMs);
        setCooldownRemainingSeconds(state.cooldownRemainingSeconds);
      }
    }
  }

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAnalysis({ question, sourceLimit, discoveryProfile });
  }

  function startPreparedExample() {
    runGuard.current.invalidateResponse();
    setPacket(preparedCase);
    setInvestigationStarted(true);
    setActiveView("map");
    dispatchTimeAxis({ type: "display_packet", packet: preparedCase });
    setCoverageLens("all");
    setRouteError(null);
    clearDetail();
    requestAnimationFrame(() => {
      document.getElementById("investigation-workspace")?.scrollIntoView({
        block: "start",
      });
    });
  }

  function startNewInvestigation() {
    runGuard.current.invalidateResponse();
    setPacket(preparedCase);
    setInvestigationStarted(false);
    setActiveView("map");
    setCoverageLens("all");
    setRouteError(null);
    clearDetail();
    requestAnimationFrame(() => {
      document.getElementById(
        liveEnabled ? "investigation-question" : "prepared-investigation-cta",
      )?.focus();
    });
  }

  function openDetailSelection(
    selection: FocusSelection,
    trigger: HTMLElement,
    loadSupplement: boolean,
  ) {
    if (!hasFocusedDetailKey(packet, selection.kind, selection.id)) return;
    const key = focusedDetailKey(packet, selection.kind, selection.id);
    const scrollY = window.scrollY;
    activeDetailKey.current = key;
    activatingElement.current = trigger;
    activatingTriggerId.current = trigger.getAttribute(FOCUS_TRIGGER_ATTRIBUTE);
    activatingSelection.current = selection;
    activatingScrollY.current = scrollY;
    setFocus(selection);
    setThreadTraceActive(false);
    const local = getSiteReadyCaseDetail(packet, selection.kind, selection.id);
    setFocusedDetail(local);
    setDetailState(local ? "idle" : "error");
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "instant" });
    });

    if (
      !loadSupplement
      || !local
      || !needsPreparedDetailSupplement(packet, selection.kind)
    ) return;
    const params = new URLSearchParams({
      focus: selection.kind,
      id: selection.id,
    });
    void detailCache.current.load(key, async () => {
      const response = await fetch(
        `/api/lineage/${encodeURIComponent(packet.case_id)}?${params.toString()}`,
      );
      if (!response.ok) throw new Error("focused detail unavailable");
      return (await response.json()) as SiteReadyCaseDetail;
    }).then((supplement) => {
      if (activeDetailKey.current !== key) return;
      setFocusedDetail(supplement);
    }).catch(() => {
      // Keep the immediately available local packet detail intact.
    });
  }

  const openDetail: FocusHandler = (selection, trigger) => {
    openDetailSelection(selection, trigger, true);
  };

  const openPayoffSource: FocusHandler = (selection, trigger) => {
    openDetailSelection(selection, trigger, false);
  };

  function selectView(view: ExperienceView) {
    setActiveView(view);
    clearDetail();
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

  const runNotice = getRunNotice(
    packet,
    isLoading,
    routeError,
    cooldownRemainingSeconds,
  );
  const selectedNodeId = focus?.kind === "claim_occurrence"
    || focus?.kind === "source"
    || focus?.kind === "unresolved_question"
    || focus?.kind === "claim_family"
    ? focus.id
    : null;
  const selectedEdgeId = focus?.kind === "relation" ? focus.id : null;
  const canTraceSelection = focus?.kind === "claim_occurrence"
    || focus?.kind === "claim_family";
  const selectedTraceRow = selectedNodeId
    ? map.rows.find((row) =>
      row.occurrenceNodeIds.includes(selectedNodeId)
      || row.familyId === selectedNodeId
    )
    : null;

  return (
    <main className="site-shell" id="top">
      <header className="masthead" aria-label="Sisyphus Watch">
        <a className="wordmark" href="#top" aria-label="Sisyphus Watch home">
          <span className="wordmark-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" focusable="false">
              <rect width="32" height="32" rx="7" fill="#14213d" />
              <path
                d="M8 22c3.2-7.7 7.7-11.7 15-12M9 23h14"
                fill="none"
                stroke="#f6c453"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="23" cy="10" r="3" fill="#f7f4eb" />
            </svg>
          </span>
          <span className="wordmark-copy">
            <strong className="wordmark-name">Sisyphus Watch</strong>
            <small className="wordmark-descriptor">Public-interest investigation ledger</small>
          </span>
        </a>
        <span className="header-note">A version map for changing public information</span>
      </header>

      <SearchComposer
        question={question}
        sourceLimit={sourceLimit}
        discoveryProfile={discoveryProfile}
        liveEnabled={liveEnabled}
        isLoading={isLoading}
        cooldownRemainingSeconds={cooldownRemainingSeconds}
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
              <h1 id="case-title">{packet.normalized_public_interest_question}</h1>
              <p className="case-question">{packet.title}</p>
            </div>
            <div className="case-actions">
              <ExportInvestigation packet={packet} />
              <button
                className="quiet-button"
                type="button"
                onClick={startNewInvestigation}
              >
                New investigation
              </button>
            </div>
          </div>

          <div
            className={`run-notice run-notice-${runNotice.tone}`}
            role="status"
            aria-live="polite"
          >
            <strong>{runNotice.title}</strong>
            <span>{runNotice.message}</span>
          </div>

          <FirstPayoff packet={packet} onFocus={openPayoffSource} />

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
                  selectedKind={focus?.kind ?? null}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  threadTraceActive={threadTraceActive}
                  liveEnabled={liveEnabled}
                  runBlocked={isLoading || cooldownRemainingSeconds > 0}
                  runStatusLabel={isLoading
                    ? "Expanding source coverage…"
                    : cooldownRemainingSeconds > 0
                      ? `Try again in ${cooldownRemainingSeconds}s`
                      : null}
                  onTimeAxisChange={(axis) =>
                    dispatchTimeAxis({ type: "select_axis", axis })
                  }
                  onCoverageLensChange={setCoverageLens}
                  onFocus={openDetail}
                  onTraceThread={showThreadTrace}
                  onShowFullMap={closeDetail}
                  onExpandCoverage={() => void runAnalysis({
                    question: packet.normalized_public_interest_question,
                    sourceLimit: publicRerunSourceLimit(packet.requested_source_limit),
                    discoveryProfile: "coverage_expansion",
                  })}
                />
              ) : null}
              {activeView === "timeline" ? (
                <TimelineView
                  packet={packet}
                  timeAxis={timeAxis}
                  onTimeAxisChange={(axis) =>
                    dispatchTimeAxis({ type: "select_axis", axis })
                  }
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
                mapViewActions={activeView === "map" ? {
                  canTraceThread: canTraceSelection,
                  traceLabel: selectedTraceRow?.traceLabel ?? "Trace claim occurrence",
                  threadTraceActive,
                  onTraceThread: showThreadTrace,
                  onShowFullMap: closeDetail,
                } : undefined}
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

function parseRetryAfterSeconds(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? Math.min(seconds, 86_400) : 0;
}

function isVisibleFocusTarget(element: HTMLElement): boolean {
  return element.isConnected
    && element.getClientRects().length > 0
    && !element.hidden
    && element.getAttribute("aria-hidden") !== "true";
}

export function getRunNotice(
  packet: SiteReadyCasePacket,
  isLoading: boolean,
  error: string | null,
  cooldownRemainingSeconds = 0,
): {
  tone:
    | "prepared"
    | "loading"
    | "cooldown"
    | "live"
    | "partial"
    | "fallback"
    | "rate-limited"
    | "timeout"
    | "error";
  title: string;
  message: string;
} {
  if (isLoading) {
    return {
      tone: "loading",
      title: "Building a bounded investigation map",
      message: "The displayed packet stays intact until a new schema-checked response is available.",
    };
  }
  if (error) {
    return {
      tone: "error",
      title: "Investigation update unavailable",
      message: `${error} The displayed packet remains intact.`,
    };
  }
  const cooldownMessage = cooldownRemainingSeconds > 0
    ? ` Next live attempt in ${cooldownRemainingSeconds}s; this in-memory accidental-repeat guard is not strong abuse prevention.`
    : "";
  if (packet.mode === "fallback") {
    const failureCode = fallbackFailureCode(packet);
    if (failureCode === "rate_limited") {
      return {
        tone: "rate-limited",
        title: "Live request rate limited",
        message: `The live attempt did not succeed. A prepared fallback is shown and is not a live result.${cooldownMessage}`,
      };
    }
    if (failureCode === "api_timeout") {
      return {
        tone: "timeout",
        title: "Live provider request timed out",
        message: `The live attempt did not succeed. A prepared fallback is shown and is not a live result.${cooldownMessage}`,
      };
    }
    return {
      tone: "fallback",
      title: "Live investigation unavailable",
      message: `The provider attempt did not complete. This is the deterministic prepared fallback, not a live investigation.${cooldownMessage}`,
    };
  }
  if (packet.mode === "live" && packet.warnings.length) {
    return {
      tone: "partial",
      title: "Partial live investigation",
      message: `Bounded review candidates are shown with warnings and remain review-only.${cooldownMessage}`,
    };
  }
  if (packet.mode === "live") {
    return {
      tone: "live",
      title: "Bounded live investigation",
      message: `This live result is a review draft. Exploring it does not accept or change any candidate record.${cooldownMessage}`,
    };
  }
  if (cooldownRemainingSeconds > 0) {
    return {
      tone: "cooldown",
      title: "Live request cooldown",
      message: `${cooldownRemainingSeconds}s until another live attempt. This in-memory accidental-repeat guard is not strong abuse prevention.`,
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
      <p>All inferred records remain review candidates. Browsing does not change the accepted prepared record.</p>
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
