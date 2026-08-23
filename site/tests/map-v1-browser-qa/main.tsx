import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import "../../app/globals.css";
import "./map-v1-browser-qa.css";

import { CaseExplorer } from "../../app/components/CaseExplorer";
import { FocusedDetailPanel } from "../../app/components/FocusedDetailPanel";
import { InvestigationDeltaPanel } from "../../app/components/InvestigationDeltaPanel";
import { InvestigationMapView } from "../../app/components/InvestigationMapView";
import { SearchComposer } from "../../app/components/SearchComposer";
import {
  type FocusHandler,
  type FocusSelection,
} from "../../app/components/investigation-types";
import {
  deriveInvestigationMapBase,
  projectInvestigationMap,
  type CoverageLens,
} from "../../app/lib/investigation-map";
import { compareInvestigationSnapshots } from "../../app/lib/investigation-delta";
import { buildPreparedSiteReadyCasePacket } from "../../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type SiteReadyCasePacket,
} from "../../app/lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../../app/lib/lineage/details";
import {
  buildLocalWatchSnapshot,
  readLocalWatch,
  validateLocalWatchSnapshot,
  type LocalWatchSnapshot,
  type LocalWatchStorage,
} from "../../app/lib/local-watch";
import type { TimeAxis } from "../../app/lib/experience";
import {
  buildMapDensityFixture,
  buildUnplacedOccurrenceFixture,
} from "../fixtures/map-density";
import { buildTemporalAcceptanceFixture } from "../fixtures/temporal-acceptance";
import {
  buildSavedWatchFallbackPacket,
  buildSavedWatchPacketA,
  buildSavedWatchPacketB,
} from "../fixtures/saved-watch";
import { buildSourceSupportedSitePacketV2Fixture } from "../fixtures/source-supported-site-packet";

const REQUESTED_SURFACE = new URLSearchParams(window.location.search).get("surface");
const STORAGE_UNAVAILABLE_SURFACE = "watch-storage-unavailable";
const EXECUTION_BOUNDARY_SURFACE_NAMES = [
  "public-default",
  "relay",
  "relay-failure",
  "watch",
  "sponsored",
] as const;
type ExecutionBoundarySurface = (typeof EXECUTION_BOUNDARY_SURFACE_NAMES)[number];
const EXECUTION_BOUNDARY_SURFACES = new Set<string>(
  EXECUTION_BOUNDARY_SURFACE_NAMES,
);

if (REQUESTED_SURFACE && EXECUTION_BOUNDARY_SURFACES.has(REQUESTED_SURFACE)) {
  installExecutionBoundaryFetchMock(REQUESTED_SURFACE as ExecutionBoundarySurface);
} else if (REQUESTED_SURFACE === STORAGE_UNAVAILABLE_SURFACE) {
  installSavedWatchFetchMock(true);
} else if (
  REQUESTED_SURFACE === "experience"
  || REQUESTED_SURFACE === "temporal"
  || REQUESTED_SURFACE === "live-relations"
  || REQUESTED_SURFACE === "source-backed"
  || REQUESTED_SURFACE === "loading"
  || REQUESTED_SURFACE?.startsWith("watch-delta-")
) {
  installNoRequestFetchGuard();
}

const FIXTURE_BUILDERS = {
  prepared: buildPreparedSiteReadyCasePacket,
  density3: () => buildMapDensityFixture(3),
  density5: () => buildMapDensityFixture(5),
  density8: () => buildMapDensityFixture(8),
  unplaced: buildUnplacedOccurrenceFixture,
  temporal: buildTemporalAcceptanceFixture,
  sourceBacked: buildSourceSupportedSitePacketV2Fixture,
} as const;

type FixtureName = keyof typeof FIXTURE_BUILDERS;

const FIXTURE_LABELS: Record<FixtureName, string> = {
  prepared: "Prepared cooling-center packet",
  density3: "3-source density fixture",
  density5: "5-source density fixture",
  density8: "8-source density fixture",
  unplaced: "Unplaced-occurrence fixture",
  temporal: "Temporal acceptance regression",
  sourceBacked: "Source-backed supersession v2",
};

function MapQaApp() {
  const surface = REQUESTED_SURFACE;
  const [fixtureName, setFixtureName] = useState<FixtureName>("prepared");
  const packet = useMemo(
    () => FIXTURE_BUILDERS[fixtureName](),
    [fixtureName],
  );

  useEffect(() => {
    let animationFrame = 0;
    const recordSkipLinkState = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const surface = document.querySelector<HTMLElement>(".map-skip-links");
        if (!surface) return;
        const focused = surface.matches(":focus-within");
        const rect = surface.getBoundingClientRect();
        const insideViewport = !focused || (
          rect.left >= 0
          && rect.right <= window.innerWidth
          && rect.top >= 0
          && rect.bottom <= window.innerHeight
        );
        const pageOverflow = document.documentElement.scrollWidth
          - document.documentElement.clientWidth;
        surface.dataset.qaFocused = String(focused);
        surface.dataset.qaInsideViewport = String(insideViewport);
        surface.dataset.qaPageOverflow = String(pageOverflow);
        if (focused && (!insideViewport || pageOverflow !== 0)) {
          console.error("Map QA skip-link containment regression", {
            insideViewport,
            pageOverflow,
            viewportWidth: window.innerWidth,
          });
        }
      });
    };

    document.addEventListener("focusin", recordSkipLinkState);
    document.addEventListener("focusout", recordSkipLinkState);
    window.addEventListener("resize", recordSkipLinkState);
    recordSkipLinkState();
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("focusin", recordSkipLinkState);
      document.removeEventListener("focusout", recordSkipLinkState);
      window.removeEventListener("resize", recordSkipLinkState);
    };
  }, []);

  if (surface === "loading") return <LoadingComposerHarness />;
  if (surface?.startsWith("watch-delta-")) {
    return <WatchDeltaHarness scenario={surface.slice("watch-delta-".length)} />;
  }

  if (
    surface === "public-default"
    || surface === "relay"
    || surface === "relay-failure"
    || surface === "watch"
    || surface === "sponsored"
    || surface === STORAGE_UNAVAILABLE_SURFACE
  ) {
    return (
      <CaseExplorer
        preparedCase={buildPreparedSiteReadyCasePacket()}
        operatorSponsoredReady={surface === "sponsored"}
        runGuardCooldownMs={0}
        localWatchStorage={surface === STORAGE_UNAVAILABLE_SURFACE
          ? unavailableStorage
          : undefined}
      />
    );
  }

  if (
    surface === "experience"
    || surface === "temporal"
    || surface === "live-relations"
    || surface === "source-backed"
  ) {
    return (
      <CaseExplorer
        preparedCase={surface === "temporal"
          ? buildTemporalAcceptanceFixture()
          : surface === "source-backed"
            ? buildSourceSupportedSitePacketV2Fixture()
          : surface === "live-relations"
            ? buildLiveRelationPresentationFixture()
            : buildPreparedSiteReadyCasePacket()}
        operatorSponsoredReady={true}
      />
    );
  }

  return (
    <main className="site-shell map-qa-shell" id="top">
      <header className="map-qa-header">
        <div>
          <p className="eyebrow">Test-only browser harness</p>
          <h1>Sisyphus Map Grammar v1</h1>
          <p>
            Production Map and Inspector components mounted with deterministic local
            packets. This page has no production route and makes no API or provider
            request.
          </p>
        </div>
        <label htmlFor="map-qa-fixture">
          <span>QA packet</span>
          <select
            id="map-qa-fixture"
            data-qa-fixture-selector
            value={fixtureName}
            onChange={(event) => setFixtureName(event.target.value as FixtureName)}
          >
            {Object.keys(FIXTURE_BUILDERS).map((name) => (
              <option key={name} value={name}>
                {FIXTURE_LABELS[name as FixtureName]}
              </option>
            ))}
          </select>
        </label>
      </header>
      <MountedMap key={fixtureName} packet={packet} fixtureName={fixtureName} />
    </main>
  );
}

function WatchDeltaHarness({ scenario }: { scenario: string }) {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  const sourceBacked = buildLocalWatchSnapshot(packet);
  const withoutSignal = buildLocalWatchSnapshot(validateSiteReadyCasePacket({
    ...structuredClone(packet),
    source_supported_relation_signals: [],
  }));
  let previousSnapshot: LocalWatchSnapshot = withoutSignal;
  let currentSnapshot: LocalWatchSnapshot = withoutSignal;

  if (scenario === "clarified") {
    currentSnapshot = sourceBacked;
  } else if (scenario === "legacy") {
    previousSnapshot = validateLocalWatchSnapshot({
      ...structuredClone(withoutSignal),
      relation_evidence_observation: "unavailable",
    });
    currentSnapshot = sourceBacked;
  } else if (scenario === "not-reobserved") {
    previousSnapshot = sourceBacked;
    currentSnapshot = withoutSignal;
  } else if (scenario === "unavailable") {
    previousSnapshot = sourceBacked;
    currentSnapshot = validateLocalWatchSnapshot({
      ...structuredClone(withoutSignal),
      relation_evidence_observation: "unavailable",
    });
  } else if (scenario === "direction") {
    previousSnapshot = sourceBacked;
    const reversed = structuredClone(sourceBacked);
    const direction = reversed.source_backed_relations[0];
    [direction.from_claim_identity, direction.to_claim_identity] = [
      direction.to_claim_identity,
      direction.from_claim_identity,
    ];
    currentSnapshot = validateLocalWatchSnapshot(reversed);
  }

  return (
    <main className="site-shell map-qa-shell" data-qa-watch-delta={scenario}>
      <InvestigationDeltaPanel
        delta={compareInvestigationSnapshots(previousSnapshot, currentSnapshot)}
        previousSnapshot={previousSnapshot}
        currentSnapshot={currentSnapshot}
        previousCheckedAt="2030-09-21T10:00:00.000Z"
        baselineUpdateState="updated"
      />
    </main>
  );
}

function installNoRequestFetchGuard() {
  const root = document.documentElement;
  root.dataset.qaFetchCalls = "0";
  window.fetch = async (input) => {
    const count = Number(root.dataset.qaFetchCalls ?? "0") + 1;
    root.dataset.qaFetchCalls = String(count);
    const requestUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
    throw new Error(`Browser QA blocks request: ${requestUrl}`);
  };
}

function buildLiveRelationPresentationFixture(): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  packet.mode = "live";
  packet.status = "live";
  packet.title = "Candidate lineage review";
  packet.discovery_profile = "standard";
  packet.coverage_summary = {
    coverage_basis: "live_discovery",
    discovery_profile: "standard",
    baseline_requested: packet.actual_source_count,
    baseline_returned: packet.actual_source_count,
    expansion_requested: 0,
    expansion_returned: 0,
    lane_counts: { ...packet.coverage_summary.lane_counts },
    missing_target_lanes: [...packet.coverage_summary.missing_target_lanes],
    unique_domain_count: packet.actual_source_count,
    duplicate_url_count: 0,
    source_limit_reached: true,
    expansion_attempted: false,
    expansion_completed_successfully: false,
  };
  for (const source of packet.source_snapshot_summaries) {
    source.snapshot_status = "partial";
    source.retrieval_mode = "openai_web_search";
    source.content_kind = "model_generated_web_search_summary";
    source.source_text_captured = false;
    source.content_sha256 = null;
    source.candidate_summary_sha256 = null;
    source.record_status = "candidate";
    source.web_search_grounded_candidate_summary = source.evidence_excerpt ?? source.title;
    source.evidence_excerpt = null;
    source.limitations = [
      "Live source pages were not captured; model-generated web-search summaries remain partial review material.",
    ];
    source.source_selection.classification_basis =
      "model_generated_web_search_classification";
    source.source_selection.classification_status = "candidate_review_only";
  }
  packet.source_bound_findings.forEach((record) => {
    record.status = "candidate";
    record.origin = "live_api";
  });
  packet.actor_claims.forEach((record) => {
    record.status = "candidate";
    record.origin = "live_api";
  });
  packet.actions.forEach((record) => {
    record.status = "candidate";
    record.origin = "live_api";
  });
  packet.claim_occurrences.forEach((occurrence) => {
    occurrence.source_record_status = "candidate";
    occurrence.claim_kind = "actor_claim";
    occurrence.support_kind = "model_generated_web_search_summary_span";
    occurrence.support_reference.support_kind =
      "model_generated_web_search_summary_span";
    occurrence.support_reference.evidence_reference =
      "Synthetic live-relation browser QA summary span";
    occurrence.support_reference.proves = "model_summary_containment_only";
    occurrence.status = "candidate";
    occurrence.origin = "live_api";
  });
  packet.candidate_claim_families.forEach((family) => {
    family.origin = "live_api";
  });
  packet.relation_candidates.forEach((relation) => {
    relation.generated_by = "deterministic_rule";
    for (const support of [relation.left_support_reference, relation.right_support_reference]) {
      support.support_kind = "model_generated_web_search_summary_span";
      support.evidence_reference = "Synthetic live-relation browser QA summary span";
      support.proves = "model_summary_containment_only";
    }
    relation.left_support_kind = "model_generated_web_search_summary_span";
    relation.right_support_kind = "model_generated_web_search_summary_span";
  });
  packet.event_timeline_rows.forEach((row) => {
    row.status = "candidate";
  });
  packet.unresolved_questions.forEach((question) => {
    question.record_status = "candidate";
    question.origin = "live_api";
  });
  packet.warnings = [];
  packet.limitations = [
    "Live source pages were not captured; model-generated web-search summaries remain partial review material.",
    "Cross-source temporal relationships were not analyzed in this bounded run.",
    "Source inclusion is not endorsement.",
  ];
  return validateSiteReadyCasePacket(packet);
}

function installExecutionBoundaryFetchMock(
  surface: ExecutionBoundarySurface,
) {
  const packetA = buildSavedWatchPacketA();
  const packetB = buildSavedWatchPacketB();
  const packetASnapshot = JSON.stringify(buildLocalWatchSnapshot(packetA));
  const root = document.documentElement;
  const counts = { capability: 0, relay: 0, operator: 0 };
  const record = (
    kind: keyof typeof counts,
    requestUrl: URL,
    init?: RequestInit,
  ) => {
    counts[kind] += 1;
    root.dataset.qaCapabilityCalls = String(counts.capability);
    root.dataset.qaRelayCalls = String(counts.relay);
    root.dataset.qaOperatorCalls = String(counts.operator);
    root.dataset.qaLastTarget = requestUrl.toString();
    root.dataset.qaLastCredentials = String(init?.credentials ?? "default");
    root.dataset.qaLastRedirect = String(init?.redirect ?? "default");
  };
  root.dataset.qaCapabilityCalls = "0";
  root.dataset.qaRelayCalls = "0";
  root.dataset.qaOperatorCalls = "0";

  window.fetch = async (input, init) => {
    const requestUrl = new URL(
      typeof input === "string" || input instanceof URL ? String(input) : input.url,
      window.location.href,
    );
    if (
      requestUrl.origin === "https://relay.example"
      && requestUrl.pathname === "/v1/capabilities"
      && init?.method === "GET"
    ) {
      record("capability", requestUrl, init);
      return Response.json({
        contract_version: "sisyphus_relay_capabilities.v1",
        lineage_response_contract: "site_ready_case_packet.v1",
        supported_source_limits: [3, 5],
        supported_discovery_profiles: ["standard", "coverage_expansion"],
        relay_display_name: "Browser QA relay",
      });
    }
    if (
      requestUrl.origin === "https://relay.example"
      && requestUrl.pathname === "/v1/lineage"
      && init?.method === "POST"
    ) {
      record("relay", requestUrl, init);
      if (surface === "relay-failure" && counts.relay > 1) {
        return Response.json({ malformed: true });
      }
      const stored = readLocalWatch(window.localStorage);
      const packet = stored.status === "valid"
        && JSON.stringify(stored.watch.snapshot) === packetASnapshot
        ? packetB
        : packetA;
      return Response.json(packet);
    }
    if (
      requestUrl.origin === window.location.origin
      && requestUrl.pathname === "/api/lineage"
      && init?.method === "POST"
      && surface === "sponsored"
    ) {
      record("operator", requestUrl, init);
      return Response.json(packetA);
    }
    throw new Error(`Browser QA blocks non-mock request: ${requestUrl.toString()}`);
  };
}

const unavailableStorage: LocalWatchStorage = {
  getItem() {
    throw new Error("Deterministic QA storage read unavailable");
  },
  setItem() {
    throw new Error("Deterministic QA storage write unavailable");
  },
  removeItem() {
    throw new Error("Deterministic QA storage remove unavailable");
  },
};

function installSavedWatchFetchMock(storageUnavailable: boolean) {
  const packetA = buildSavedWatchPacketA();
  const packetB = buildSavedWatchPacketB();
  const fallback = buildSavedWatchFallbackPacket();
  const packetASnapshot = JSON.stringify(buildLocalWatchSnapshot(packetA));
  const packetBSnapshot = JSON.stringify(buildLocalWatchSnapshot(packetB));

  window.fetch = async (input, init) => {
    const requestUrl = new URL(
      typeof input === "string" || input instanceof URL ? String(input) : input.url,
      window.location.href,
    );
    if (requestUrl.pathname !== "/api/lineage" || init?.method !== "POST") {
      throw new Error(`Browser QA blocks non-mock request: ${requestUrl.pathname}`);
    }
    const body = typeof init.body === "string"
      ? JSON.parse(init.body) as { question?: unknown }
      : {};
    let packet: SiteReadyCasePacket = packetA;
    if (!storageUnavailable) {
      const stored = readLocalWatch(window.localStorage);
      if (
        stored.status === "valid"
        && typeof body.question === "string"
        && body.question !== stored.watch.normalized_public_interest_question
      ) {
        packet = structuredClone(packetA);
        packet.run_id = "watch_fixture_different_topic";
        packet.normalized_public_interest_question = body.question;
        packet.title = "Candidate lineage review";
      } else if (stored.status === "valid") {
        const storedSnapshot = JSON.stringify(stored.watch.snapshot);
        packet = storedSnapshot === packetASnapshot
          ? packetB
          : storedSnapshot === packetBSnapshot
            ? fallback
            : packetA;
      }
    }
    console.info("Saved Watch browser-QA mock response", {
      run: packet.run_id,
      mode: packet.mode,
      localOnly: true,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    return new Response(JSON.stringify(packet), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function LoadingComposerHarness() {
  return (
    <main className="site-shell map-qa-shell" id="top">
      <header className="map-qa-header">
        <div>
          <p className="eyebrow">Test-only browser harness</p>
          <h1>Simulated live-loading state</h1>
          <p>No request is started; production composer controls receive a local loading state.</p>
        </div>
      </header>
      <SearchComposer
        question="How did a public schedule change?"
        sourceLimit={3}
        discoveryProfile="standard"
        liveEnabled={true}
        isLoading={true}
        cooldownRemainingSeconds={0}
        routeError={null}
        investigationStarted={false}
        onQuestionChange={() => undefined}
        onSourceLimitChange={() => undefined}
        onDiscoveryProfileChange={() => undefined}
        onSubmit={(event) => event.preventDefault()}
        onPreparedExample={() => undefined}
      />
    </main>
  );
}

function MountedMap({
  packet,
  fixtureName,
}: {
  packet: SiteReadyCasePacket;
  fixtureName: FixtureName;
}) {
  const base = useMemo(() => deriveInvestigationMapBase(packet), [packet]);
  const [timeAxis, setTimeAxis] = useState<TimeAxis>(base.initialTimeAxis);
  const [coverageLens, setCoverageLens] = useState<CoverageLens>("all");
  const [focus, setFocus] = useState<FocusSelection | null>(null);
  const [threadTraceActive, setThreadTraceActive] = useState(false);
  const activatingElement = useRef<HTMLElement | null>(null);
  const activatingScrollY = useRef(0);
  const map = useMemo(
    () => projectInvestigationMap(base, timeAxis),
    [base, timeAxis],
  );
  const detail = focus
    ? getSiteReadyCaseDetail(packet, focus.kind, focus.id)
    : null;
  const selectedNodeId = focus?.kind === "claim_occurrence"
    || focus?.kind === "source"
    || focus?.kind === "unresolved_question"
    || focus?.kind === "claim_family"
    ? focus.id
    : null;
  const selectedEdgeId = focus?.kind === "relation" ? focus.id : null;
  const selectedRow = selectedNodeId
    ? map.rows.find((row) =>
      row.occurrenceNodeIds.includes(selectedNodeId)
      || row.familyId === selectedNodeId
    )
    : null;
  const canTraceSelection = focus?.kind === "claim_occurrence"
    || focus?.kind === "claim_family";

  const openDetail: FocusHandler = (selection, trigger) => {
    activatingElement.current = trigger;
    activatingScrollY.current = window.scrollY;
    setFocus(selection);
    setThreadTraceActive(false);
  };

  function closeDetail() {
    const trigger = activatingElement.current;
    const scrollY = activatingScrollY.current;
    setFocus(null);
    setThreadTraceActive(false);
    requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
      } else {
        document.getElementById("map-qa-view-panel")?.focus({ preventScroll: true });
      }
      window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "instant" });
    });
  }

  return (
    <>
      <section className="map-qa-facts" aria-label="Mounted packet facts">
        <strong data-qa-fixture={fixtureName}>{FIXTURE_LABELS[fixtureName]}</strong>
        <span>{map.occurrences.length} occurrences</span>
        <span>{map.rows.length} claim rows</span>
        <span>{map.relationLedger.length} candidate relations</span>
        <span>{map.questions.length} unresolved questions</span>
        <span>{map.nonClaimSources.length} non-claim sources</span>
        <span>Initial axis: {base.initialTimeAxis}</span>
      </section>
      <div className={`result-layout map-qa-result${focus ? " has-detail" : ""}`}>
        <section
          id="map-qa-view-panel"
          className="view-panel map-qa-view-panel"
          aria-label="Mounted production Map view"
          tabIndex={-1}
        >
          <InvestigationMapView
            packet={packet}
            map={map}
            timeAxis={timeAxis}
            coverageLens={coverageLens}
            selectedKind={focus?.kind ?? null}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            threadTraceActive={threadTraceActive}
            liveEnabled={true}
            runBlocked={false}
            runStatusLabel={null}
            onTimeAxisChange={setTimeAxis}
            onCoverageLensChange={setCoverageLens}
            onFocus={openDetail}
            onTraceThread={() => setThreadTraceActive(true)}
            onShowFullMap={closeDetail}
            onExpandCoverage={() => undefined}
          />
        </section>
        {focus ? (
          <FocusedDetailPanel
            packet={packet}
            selection={focus}
            payload={detail}
            state={detail ? "idle" : "error"}
            onClose={closeDetail}
            mapViewActions={{
              canTraceThread: canTraceSelection,
              traceLabel: selectedRow?.traceLabel ?? "Trace claim occurrence",
              threadTraceActive,
              onTraceThread: () => setThreadTraceActive(true),
              onShowFullMap: closeDetail,
            }}
          />
        ) : null}
      </div>
      <p className="map-qa-boundary">
        Fixture switching, axis changes, lenses, selection, and trace are local
        presentation operations only. <code>canonical_mutation: none</code>
      </p>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Map v1 QA root unavailable");

createRoot(root).render(
  <StrictMode>
    <MapQaApp />
  </StrictMode>,
);
