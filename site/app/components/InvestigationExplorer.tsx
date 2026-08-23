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
  AnalysisRunPacket,
} from "../lib/analysis/contracts";
import { PUBLIC_DEFAULT_SOURCE_LIMIT } from "../lib/analysis/contracts";
import {
  ExecutionTransportError,
  executeInvestigationTransport,
  type ExecutionTransport,
} from "../lib/execution-transport";
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
  chooseInitialTimeAxis,
  deriveInvestigationMapBase,
  investigationTimeAxisReducer,
  projectInvestigationMap,
  type CoverageLens,
} from "../lib/investigation-map";
import {
  compareInvestigationSnapshots,
  type InvestigationDelta,
} from "../lib/investigation-delta";
import type {
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "../lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../lib/lineage/details";
import {
  LocalWatchContractError,
  advanceLocalWatch,
  createLocalWatch,
  forgetLocalWatch,
  isSameTrackedTopic,
  readLocalWatch,
  watchRecheckInput,
  writeLocalWatch,
  type LocalWatch,
  type LocalWatchStorage,
} from "../lib/local-watch";
import type { DiscoveryProfile } from "../lib/source-profile";
import {
  PublicLiveRunGuard,
  decidePublicRunResponse,
  fallbackFailureCode,
  publicRerunSourceLimit,
} from "../lib/public-live";
import {
  RelayContractError,
  forgetRelayConnection,
  negotiateRelayConnection,
  readRelayConnection,
  writeRelayConnection,
  type RelayConnection,
  type RelayStorage,
} from "../lib/relay";
import { FocusedDetailPanel } from "./FocusedDetailPanel";
import { ExportInvestigation } from "./ExportInvestigation";
import { FirstPayoff } from "./FirstPayoff";
import { InvestigationDeltaPanel } from "./InvestigationDeltaPanel";
import { InvestigationMapView } from "./InvestigationMapView";
import {
  MethodView,
  SourcesView,
  TimelineView,
} from "./InvestigationResultViews";
import { SearchComposer } from "./SearchComposer";
import { SavedWatchCard } from "./SavedWatchCard";
import {
  FOCUS_TRIGGER_ATTRIBUTE,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

export function SisyphusWordmark({
  resultMode,
  onReturnHome,
}: {
  resultMode: boolean;
  onReturnHome: () => void;
}) {
  const content = (
    <>
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
    </>
  );

  return resultMode ? (
    <button
      className="wordmark wordmark-home-button"
      type="button"
      aria-label="Sisyphus Watch home · start new investigation"
      onClick={onReturnHome}
      onKeyDown={(event) => activateButtonFromKeyboard(event, onReturnHome)}
    >
      {content}
    </button>
  ) : (
    <a className="wordmark" href="#top" aria-label="Sisyphus Watch home">
      {content}
    </a>
  );
}

export function StartNewInvestigationButton({
  onStart,
}: {
  onStart: () => void;
}) {
  return (
    <button
      className="start-new-investigation-button"
      type="button"
      onClick={onStart}
      onKeyDown={(event) => activateButtonFromKeyboard(event, onStart)}
    >
      Start new investigation
    </button>
  );
}

function activateButtonFromKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  activate: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activate();
}

export type InvestigationSubmissionInput = {
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
};

export function decideInvestigationSubmission(
  executionTransport: ExecutionTransport | null,
  input: InvestigationSubmissionInput,
):
  | { kind: "request_execution_transport"; input: InvestigationSubmissionInput }
  | { kind: "execute"; input: InvestigationSubmissionInput } {
  return executionTransport
    ? { kind: "execute", input }
    : { kind: "request_execution_transport", input };
}

export function CaseExplorer({
  preparedCase,
  operatorSponsoredReady = false,
  runGuardCooldownMs,
  localWatchStorage,
  relayStorage,
}: {
  preparedCase: SiteReadyCasePacket;
  operatorSponsoredReady?: boolean;
  runGuardCooldownMs?: number;
  localWatchStorage?: LocalWatchStorage | null;
  relayStorage?: RelayStorage | null;
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
  const [watchHydrated, setWatchHydrated] = useState(false);
  const [savedWatch, setSavedWatch] = useState<LocalWatch | null>(null);
  const [watchNotice, setWatchNotice] = useState<string | null>(null);
  const [replacementWatch, setReplacementWatch] = useState<LocalWatch | null>(null);
  const [activeRunKind, setActiveRunKind] = useState<PublicRunKind | null>(null);
  const [watchDelta, setWatchDelta] = useState<DisplayedWatchDelta | null>(null);
  const [relayHydrated, setRelayHydrated] = useState(false);
  const [storedRelay, setStoredRelay] = useState<RelayConnection | null>(null);
  const [activeRelay, setActiveRelay] = useState<RelayConnection | null>(null);
  const [relayUrlInput, setRelayUrlInput] = useState("");
  const [relayFormOpen, setRelayFormOpen] = useState(false);
  const [relayConnecting, setRelayConnecting] = useState(false);
  const [relayNotice, setRelayNotice] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [selectedExecutionKind, setSelectedExecutionKind] =
    useState<ExecutionTransport["kind"] | null>(null);
  const detailCache = useRef(new FocusedDetailSupplementCache());
  const runGuard = useRef(new PublicLiveRunGuard({ cooldownMs: runGuardCooldownMs }));
  const savedWatchRef = useRef<LocalWatch | null>(null);
  const relayConnectionAbort = useRef<AbortController | null>(null);
  const relayConnectionGeneration = useRef(0);
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
  const executionTransport = useMemo<ExecutionTransport | null>(() => {
    if (selectedExecutionKind === "relay" && activeRelay) {
      return { kind: "relay", connection: activeRelay };
    }
    if (selectedExecutionKind === "operator_sponsored" && operatorSponsoredReady) {
      return { kind: "operator_sponsored" };
    }
    return null;
  }, [activeRelay, operatorSponsoredReady, selectedExecutionKind]);
  const liveEnabled = executionTransport !== null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storage = localWatchStorage === undefined
        ? browserLocalStorage()
        : localWatchStorage;
      if (!storage) {
        setWatchNotice("Browser-local storage is unavailable. Saved Watch controls remain off.");
        setWatchHydrated(true);
        return;
      }
      const result = readLocalWatch(storage);
      if (result.status === "valid") {
        savedWatchRef.current = result.watch;
        setSavedWatch(result.watch);
      } else if (result.status === "unavailable") {
        setWatchNotice("Browser-local storage is unavailable. Saved Watch controls remain off.");
      } else if (result.status === "invalid") {
        setWatchNotice("An invalid browser-local Watch was ignored. It was not submitted or opened.");
      }
      setWatchHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [localWatchStorage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storage = relayStorage === undefined
        ? browserLocalStorage()
        : relayStorage;
      if (!storage) {
        setRelayNotice("Browser-local relay storage is unavailable. You can still use the prepared investigation.");
        setRelayHydrated(true);
        return;
      }
      const result = readRelayConnection(storage);
      if (result.status === "valid") {
        setStoredRelay(result.connection);
        setRelayUrlInput(result.connection.relay_base_url);
        setRelayNotice("Saved relay — reconnect to use. No network request was made automatically.");
      } else if (result.status === "unavailable") {
        setRelayNotice("Browser-local relay storage is unavailable. You can still use the prepared investigation.");
      } else if (result.status === "invalid") {
        setRelayNotice("An invalid saved relay entry was ignored without contacting it.");
      }
      setRelayHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [relayStorage]);

  useEffect(() => () => {
    relayConnectionGeneration.current += 1;
    relayConnectionAbort.current?.abort();
    relayConnectionAbort.current = null;
  }, []);

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

  useEffect(() => {
    if (!investigationStarted) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("investigation-workspace")?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [investigationStarted]);

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

  function openRelayConnection() {
    setRelayError(null);
    setRelayFormOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("relay-url")?.focus();
    });
  }

  async function connectRelay() {
    if (relayConnectionAbort.current) return;
    const controller = new AbortController();
    const generation = relayConnectionGeneration.current + 1;
    relayConnectionGeneration.current = generation;
    relayConnectionAbort.current = controller;
    setRelayConnecting(true);
    setRelayError(null);
    try {
      const connection = await negotiateRelayConnection(
        relayUrlInput,
        undefined,
        undefined,
        { signal: controller.signal },
      );
      if (
        controller.signal.aborted
        || generation !== relayConnectionGeneration.current
      ) return;
      const storage = relayStorage === undefined
        ? browserLocalStorage()
        : relayStorage;
      const writeResult = storage
        ? writeRelayConnection(storage, connection)
        : { ok: false as const, reason: "unavailable" as const };
      setActiveRelay(connection);
      setSelectedExecutionKind("relay");
      setStoredRelay(writeResult.ok ? connection : null);
      setRelayUrlInput(connection.relay_base_url);
      setRelayFormOpen(false);
      setRelayNotice(
        writeResult.ok
          ? "Connected to your relay. The verified endpoint was saved in this browser."
          : "Connected to your relay for this page, but the endpoint could not be saved in this browser.",
      );
      requestAnimationFrame(() => {
        document.getElementById("build-investigation-map")?.focus({ preventScroll: true });
      });
    } catch (error) {
      if (generation !== relayConnectionGeneration.current) return;
      setRelayError(
        error instanceof RelayContractError
          ? error.message
          : "The relay capability check could not be completed.",
      );
    } finally {
      if (generation === relayConnectionGeneration.current) {
        if (relayConnectionAbort.current === controller) {
          relayConnectionAbort.current = null;
        }
        setRelayConnecting(false);
      }
    }
  }

  function cancelRelayConnection() {
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const controller = relayConnectionAbort.current;
    if (controller) {
      relayConnectionGeneration.current += 1;
      relayConnectionAbort.current = null;
      controller.abort();
      setRelayConnecting(false);
    }
    setRelayFormOpen(false);
    setRelayError(null);
    setRelayNotice(
      "Relay setup closed. Your question and settings remain unchanged. No provider request was started.",
    );
    requestAnimationFrame(() => {
      document.getElementById("relay-connect-toggle")?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, left: scrollX, behavior: "instant" });
      });
    });
  }

  function disconnectRelay() {
    const storage = relayStorage === undefined
      ? browserLocalStorage()
      : relayStorage;
    const forgetResult = storage
      ? forgetRelayConnection(storage)
      : { ok: false as const, reason: "unavailable" as const };
    setActiveRelay(null);
    setStoredRelay(null);
    setRelayUrlInput("");
    setRelayFormOpen(false);
    setRelayError(null);
    if (selectedExecutionKind === "relay") setSelectedExecutionKind(null);
    setRelayNotice(
      forgetResult.ok
        ? "Relay forgotten from this browser. Saved Watch data was not changed."
        : "The relay was disconnected for this page, but browser storage was unavailable.",
    );
  }

  function selectOperatorSponsored() {
    if (!operatorSponsoredReady) return;
    setSelectedExecutionKind("operator_sponsored");
    setRelayError(null);
  }

  function leaveOperatorSponsored() {
    if (selectedExecutionKind === "operator_sponsored") {
      setSelectedExecutionKind(null);
    }
  }

  async function runAnalysis(
    input: InvestigationSubmissionInput,
    runKind: PublicRunKind = "normal",
    recheckBaseline?: LocalWatch,
  ) {
    const activeTransport = executionTransport;
    if (!activeTransport) return;
    const requestId = runGuard.current.begin();
    if (requestId === null) return;
    const hadDisplayedInvestigation = investigationStarted;
    let outcome: "success" | "failure" = "failure";
    let serverRetryAfterSeconds = 0;
    setRouteError(null);
    setIsLoading(true);
    setActiveRunKind(runKind);
    setReplacementWatch(null);
    try {
      const result = await executeInvestigationTransport(activeTransport, input);
      if (!runGuard.current.acceptsResponse(requestId)) return;
      serverRetryAfterSeconds = parseRetryAfterSeconds(
        result.retryAfter,
      );
      const decision = decidePublicRunResponse(result.payload, {
        responseOk: result.responseOk,
        hadDisplayedInvestigation: hadDisplayedInvestigation || runKind === "watch_recheck",
        retryAfterSeconds: serverRetryAfterSeconds,
      });
      if (decision.kind === "preserve") {
        setRouteError(decision.message);
        return;
      }
      const nextPacket = decision.packet;
      let pendingWatchUpdate: {
        baseline: LocalWatch;
        updated: LocalWatch;
        delta: InvestigationDelta;
      } | null = null;
      if (runKind === "watch_recheck" && nextPacket.mode === "live" && recheckBaseline) {
        const currentWatch = savedWatchRef.current;
        const sameStillSaved = currentWatch?.saved_at === recheckBaseline.saved_at
          && currentWatch.normalized_public_interest_question
            === recheckBaseline.normalized_public_interest_question;
        if (sameStillSaved) {
          try {
            const updated = advanceLocalWatch(recheckBaseline, nextPacket, new Date());
            pendingWatchUpdate = {
              baseline: recheckBaseline,
              updated,
              delta: compareInvestigationSnapshots(
                recheckBaseline.snapshot,
                updated.snapshot,
              ),
            };
          } catch (error) {
            setRouteError(localWatchBuildFailureMessage(error));
            return;
          }
        }
      }
      setPacket(nextPacket);
      dispatchTimeAxis({ type: "display_packet", packet: nextPacket });
      setInvestigationStarted(true);
      setActiveView("map");
      setCoverageLens("all");
      clearDetail();
      if (runKind !== "watch_recheck") setWatchDelta(null);
      if (pendingWatchUpdate) {
        const storage = localWatchStorage === undefined
          ? browserLocalStorage()
          : localWatchStorage;
        const writeResult = storage
          ? writeLocalWatch(storage, pendingWatchUpdate.updated)
          : { ok: false as const, reason: "unavailable" as const };
        if (writeResult.ok) {
          savedWatchRef.current = pendingWatchUpdate.updated;
          setSavedWatch(pendingWatchUpdate.updated);
          setWatchNotice("Saved Watch checked and browser baseline updated.");
        } else {
          setWatchNotice(
            "The comparison completed, but the prior browser baseline remains because the update could not be stored.",
          );
        }
        setWatchDelta({
          delta: pendingWatchUpdate.delta,
          previousSnapshot: pendingWatchUpdate.baseline.snapshot,
          currentSnapshot: pendingWatchUpdate.updated.snapshot,
          previousCheckedAt: pendingWatchUpdate.baseline.last_checked_at,
          baselineUpdateState: writeResult.ok ? "updated" : "failed",
        });
      }
      outcome = nextPacket.mode === "live" ? "success" : "failure";
    } catch (error) {
      if (runGuard.current.acceptsResponse(requestId)) {
        setRouteError(
          error instanceof ExecutionTransportError
            ? error.message
            : activeTransport.kind === "relay"
              ? "Your relay is unavailable. No sponsored request was attempted."
              : "The sponsored investigation route is unavailable.",
        );
      }
    } finally {
      if (runGuard.current.complete(
        requestId,
        outcome,
        serverRetryAfterSeconds,
      )) {
        const state = runGuard.current.state();
        setIsLoading(false);
        setActiveRunKind(null);
        setCooldownUntilMs(state.cooldownUntilMs);
        setCooldownRemainingSeconds(state.cooldownRemainingSeconds);
      }
    }
  }

  function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = decideInvestigationSubmission(executionTransport, {
      question,
      sourceLimit,
      discoveryProfile,
    });
    if (decision.kind === "request_execution_transport") {
      setRouteError(null);
      setRelayNotice(
        "Connect your Relay to run this investigation. Your question will stay here. Your API credentials stay on your Relay and are not entered into this Site.",
      );
      openRelayConnection();
      return;
    }
    void runAnalysis(decision.input);
  }

  function startPreparedExample() {
    runGuard.current.invalidateResponse();
    setPacket(preparedCase);
    setInvestigationStarted(true);
    setActiveView("map");
    dispatchTimeAxis({ type: "display_packet", packet: preparedCase });
    setCoverageLens("all");
    setRouteError(null);
    setWatchDelta(null);
    setReplacementWatch(null);
    clearDetail();
  }

  function startNewInvestigation() {
    runGuard.current.invalidateResponse();
    setPacket(preparedCase);
    setInvestigationStarted(false);
    setActiveView("map");
    setCoverageLens("all");
    setRouteError(null);
    setWatchDelta(null);
    setReplacementWatch(null);
    clearDetail();
    requestAnimationFrame(() => {
      document.getElementById("investigation-question")?.focus();
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

  function trackDisplayedPacket() {
    if (packet.mode !== "live") return;
    let candidate: LocalWatch;
    try {
      candidate = createLocalWatch(packet, new Date());
    } catch (error) {
      setWatchNotice(localWatchBuildFailureMessage(error));
      return;
    }
    const current = savedWatchRef.current;
    if (current && !isSameTrackedTopic(current, packet)) {
      setReplacementWatch(candidate);
      setWatchNotice(null);
      return;
    }
    if (current) {
      setWatchNotice(
        "This topic is already tracked. Use Check for changes to compare and advance its baseline.",
      );
      return;
    }
    persistTrackedWatch(candidate, false);
  }

  function persistTrackedWatch(candidate: LocalWatch, replacing: boolean) {
    const storage = localWatchStorage === undefined
      ? browserLocalStorage()
      : localWatchStorage;
    const result = storage
      ? writeLocalWatch(storage, candidate)
      : { ok: false as const, reason: "unavailable" as const };
    if (!result.ok) {
      setWatchNotice(
        result.reason === "oversized"
          ? "This result is too large for the bounded browser-local snapshot and was not saved."
          : "This browser could not store the Saved Watch. The current investigation remains unchanged.",
      );
      return;
    }
    savedWatchRef.current = candidate;
    setSavedWatch(candidate);
    setReplacementWatch(null);
    if (replacing) setWatchDelta(null);
    setWatchNotice(
      replacing
        ? "Saved Watch replaced after explicit confirmation. No comparison was synthesized."
        : "Saved Watch stored in this browser profile. No background check was started.",
    );
  }

  function checkSavedWatch() {
    const watch = savedWatchRef.current;
    if (!watch) return;
    setReplacementWatch(null);
    void runAnalysis(watchRecheckInput(watch), "watch_recheck", watch);
  }

  function forgetSavedWatchFromDevice() {
    const storage = localWatchStorage === undefined
      ? browserLocalStorage()
      : localWatchStorage;
    const result = storage
      ? forgetLocalWatch(storage)
      : { ok: false as const, reason: "unavailable" as const };
    if (!result.ok) {
      setWatchNotice("The Saved Watch could not be forgotten because browser storage is unavailable.");
      return;
    }
    savedWatchRef.current = null;
    setSavedWatch(null);
    setReplacementWatch(null);
    setWatchDelta(null);
    setWatchNotice("Saved Watch forgotten from this browser profile.");
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
        <SisyphusWordmark
          resultMode={investigationStarted}
          onReturnHome={startNewInvestigation}
        />
        <span className="header-note">A version map for changing public information</span>
      </header>

      {watchHydrated && savedWatch ? (
        <SavedWatchCard
          watch={savedWatch}
          executionAvailable={liveEnabled}
          isLoading={isLoading}
          isWatchRechecking={isLoading && activeRunKind === "watch_recheck"}
          cooldownRemainingSeconds={cooldownRemainingSeconds}
          onCheck={checkSavedWatch}
          onForget={forgetSavedWatchFromDevice}
        />
      ) : null}

      {watchHydrated && watchNotice ? (
        <p className="local-watch-notice" role="status" aria-live="polite">
          {watchNotice}
        </p>
      ) : null}

      <SearchComposer
        question={question}
        sourceLimit={sourceLimit}
        discoveryProfile={discoveryProfile}
        liveEnabled={liveEnabled}
        executionMode={executionTransport?.kind ?? null}
        operatorSponsoredReady={operatorSponsoredReady}
        relayHydrated={relayHydrated}
        activeRelay={activeRelay}
        storedRelay={storedRelay}
        relayUrlInput={relayUrlInput}
        relayFormOpen={relayFormOpen}
        relayConnecting={relayConnecting}
        relayNotice={relayNotice}
        relayError={relayError}
        isLoading={isLoading}
        cooldownRemainingSeconds={cooldownRemainingSeconds}
        routeError={routeError}
        investigationStarted={investigationStarted}
        onQuestionChange={setQuestion}
        onSourceLimitChange={setSourceLimit}
        onDiscoveryProfileChange={setDiscoveryProfile}
        onSubmit={submitAnalysis}
        onPreparedExample={startPreparedExample}
        onRelayUrlChange={setRelayUrlInput}
        onOpenRelay={openRelayConnection}
        onCancelRelay={cancelRelayConnection}
        onConnectRelay={() => void connectRelay()}
        onDisconnectRelay={disconnectRelay}
        onSelectOperatorSponsored={selectOperatorSponsored}
        onLeaveOperatorSponsored={leaveOperatorSponsored}
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
                  Viewing does not accept candidate records
                </span>
              </div>
              <p className="eyebrow">Investigation map</p>
              <h1 id="case-title">{packet.normalized_public_interest_question}</h1>
              <p className="case-question">{packet.title}</p>
            </div>
            <div className="case-actions">
              <ExportInvestigation packet={packet} />
              <StartNewInvestigationButton onStart={startNewInvestigation} />
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

          {watchDelta ? (
            <InvestigationDeltaPanel
              delta={watchDelta.delta}
              previousSnapshot={watchDelta.previousSnapshot}
              currentSnapshot={watchDelta.currentSnapshot}
              previousCheckedAt={watchDelta.previousCheckedAt}
              baselineUpdateState={watchDelta.baselineUpdateState}
            />
          ) : null}

          {packet.mode === "live" ? (
            <section className="track-watch-panel" aria-label="Track this live investigation">
              {savedWatch && isSameTrackedTopic(savedWatch, packet) ? (
                <div className="track-watch-status">
                  <strong>Tracked on this device</strong>
                  <span>
                    Ordinary runs do not reset the baseline. Use Check for changes from
                    Saved watch to compare and advance it.
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <strong>Continue this investigation later</strong>
                    <span>
                      Save one compact public-source snapshot in this browser profile.
                    </span>
                  </div>
                  <button type="button" onClick={trackDisplayedPacket}>
                    Track this topic on this device
                  </button>
                </>
              )}
              {replacementWatch ? (
                <div className="track-watch-replace" role="alert">
                  <p>
                    A different Saved Watch already exists. Replace it with {" “"}
                    {replacementWatch.normalized_public_interest_question}”?
                  </p>
                  <div>
                    <button type="button" onClick={() => setReplacementWatch(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => persistTrackedWatch(replacementWatch, true)}
                    >
                      Replace saved Watch
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

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
                    ? "Running broader investigation…"
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
                  }, "coverage_expansion")}
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
    ? ` A short cooldown helps prevent accidental repeat requests. Next live attempt in ${cooldownRemainingSeconds}s.`
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
      message: `The bounded result is ready.${cooldownMessage}`,
    };
  }
  if (cooldownRemainingSeconds > 0) {
    return {
      tone: "cooldown",
      title: "Live request cooldown",
      message: `A short cooldown helps prevent accidental repeat requests. Next live attempt in ${cooldownRemainingSeconds}s.`,
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

type PublicRunKind = "normal" | "coverage_expansion" | "watch_recheck";

interface DisplayedWatchDelta {
  delta: InvestigationDelta;
  previousSnapshot: LocalWatch["snapshot"];
  currentSnapshot: LocalWatch["snapshot"];
  previousCheckedAt: string;
  baselineUpdateState: "updated" | "failed";
}

function browserLocalStorage(): LocalWatchStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function localWatchBuildFailureMessage(error: unknown): string {
  if (error instanceof LocalWatchContractError && error.reason === "oversized") {
    return "The compact browser snapshot would exceed its explicit size bound. The displayed investigation and prior Saved Watch remain unchanged.";
  }
  return "The compact browser snapshot could not be validated safely. The displayed investigation and prior Saved Watch remain unchanged.";
}
