"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  COVERAGE_LENSES,
  COVERAGE_LENS_LABELS,
  deriveCoverageHighlight,
  deriveRelationPresentation,
  deriveRelationRoutes,
  deriveThreadTrace,
  type CoverageLens,
  type InvestigationClaimRow,
  type InvestigationMap,
  type InvestigationNonClaimSourceRecord,
  type InvestigationOccurrenceNode,
  type InvestigationQuestionNode,
  type InvestigationRelationLedgerEntry,
} from "../lib/investigation-map";
import {
  TIME_AXES,
  TIME_AXIS_LABELS,
  relationDisplayLabel,
  sourceCoverageNote,
  type TimeAxis,
} from "../lib/experience";
import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import { formatReviewTimestamp } from "../lib/temporal";
import {
  FOCUS_TRIGGER_ATTRIBUTE,
  focusTriggerId,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

export const MAP_COMPACT_MEDIA_QUERY = "(max-width: 920px)" as const;

export function mapCanvasHasHorizontalOverflow(
  scrollWidth: number,
  clientWidth: number,
): boolean {
  return scrollWidth - clientWidth > 1;
}

interface InvestigationMapViewProps {
  packet: SiteReadyCasePacket;
  map: InvestigationMap;
  timeAxis: TimeAxis;
  coverageLens: CoverageLens;
  selectedKind: FocusSelection["kind"] | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  threadTraceActive: boolean;
  liveEnabled: boolean;
  runBlocked: boolean;
  runStatusLabel: string | null;
  onTimeAxisChange: (axis: TimeAxis) => void;
  onCoverageLensChange: (lens: CoverageLens) => void;
  onFocus: FocusHandler;
  onTraceThread: () => void;
  onShowFullMap: () => void;
  onExpandCoverage: () => void;
}

interface RelationGeometry {
  relationId: string;
  path: string;
  terminalTickPath: string;
  labelX: number;
  labelY: number;
}

interface QuestionGeometry {
  tetherId: string;
  path: string;
}

interface GeometryState {
  width: number;
  height: number;
  relationPaths: RelationGeometry[];
  questionPaths: QuestionGeometry[];
  fullFieldCollisionCount: number;
}

interface SameRowGeometryState {
  key: string;
  readableRelationIds: string[];
}

const EMPTY_GEOMETRY: GeometryState = {
  width: 0,
  height: 0,
  relationPaths: [],
  questionPaths: [],
  fullFieldCollisionCount: 0,
};

export function InvestigationMapView({
  packet,
  map,
  timeAxis,
  coverageLens,
  selectedKind,
  selectedNodeId,
  selectedEdgeId,
  threadTraceActive,
  liveEnabled,
  runBlocked,
  runStatusLabel,
  onTimeAxisChange,
  onCoverageLensChange,
  onFocus,
  onTraceThread,
  onShowFullMap,
  onExpandCoverage,
}: InvestigationMapViewProps) {
  const compact = useSyncExternalStore(
    subscribeCompactMap,
    compactMapSnapshot,
    () => false,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const spatialShellRef = useRef<HTMLDivElement>(null);
  const [matrixOverflowing, setMatrixOverflowing] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(1280);
  const [geometry, setGeometry] = useState<GeometryState>(EMPTY_GEOMETRY);
  const [collisionState, setCollisionState] = useState({ key: "", count: 0 });
  const [sameRowGeometryState, setSameRowGeometryState] = useState<SameRowGeometryState>({
    key: "",
    readableRelationIds: [],
  });
  const relationLayoutBand = compact
    ? "compact"
    : availableWidth > 1000
      ? "wide"
      : "tablet";
  const collisionKey = `${map.packetRunId}:${map.selectedTimeAxis}:${relationLayoutBand}`;
  const collisionPressure = collisionState.key === collisionKey
    ? collisionState.count
    : 0;

  const drawableRelations = useMemo(
    () => map.relationLedger.filter((entry) => entry.geometryEligible),
    [map.relationLedger],
  );
  const crossRowRelationCount = useMemo(
    () => drawableRelations.filter((entry) => !entry.sameRow).length,
    [drawableRelations],
  );
  const relationPresentation = useMemo(
    () => deriveRelationPresentation({
      availableWidth,
      drawableRelationCount: drawableRelations.length,
      crossRowRelationCount,
      measuredCollisionCount: collisionPressure,
      compactResponsiveMode: compact,
      totalRelationCount: map.relationLedger.length,
    }),
    [
      availableWidth,
      compact,
      crossRowRelationCount,
      drawableRelations.length,
      collisionPressure,
      map.relationLedger.length,
    ],
  );
  const relationRoutes = useMemo(
    () => deriveRelationRoutes(
      map.relationLedger,
      relationPresentation.mode,
      selectedEdgeId,
      compact
        ? new Set<string>()
        : sameRowGeometryState.key === collisionKey
          ? new Set(sameRowGeometryState.readableRelationIds)
          : undefined,
    ),
    [
      collisionKey,
      compact,
      map.relationLedger,
      relationPresentation.mode,
      sameRowGeometryState,
      selectedEdgeId,
    ],
  );
  const spatialRelationIds = useMemo(
    () => new Set(relationRoutes.spatialRelationIds),
    [relationRoutes.spatialRelationIds],
  );
  const portRelationIds = useMemo(
    () => new Set(relationRoutes.portRelationIds),
    [relationRoutes.portRelationIds],
  );

  const coverageHighlight = useMemo(
    () => deriveCoverageHighlight(map, coverageLens),
    [coverageLens, map],
  );
  const selectedOccurrenceId = selectedKind === "claim_occurrence" ? selectedNodeId : null;
  const selectedSourceId = selectedKind === "source" ? selectedNodeId : null;
  const selectedQuestionId = selectedKind === "unresolved_question" ? selectedNodeId : null;
  const selectedFamilyId = selectedKind === "claim_family" ? selectedNodeId : null;
  const selectedFamilyRow = selectedFamilyId
    ? map.rows.find((row) => row.familyId === selectedFamilyId) ?? null
    : null;
  const traceTargetNodeId = selectedFamilyRow?.occurrenceNodeIds[0]
    ?? selectedOccurrenceId;
  const traceHighlight = traceTargetNodeId && threadTraceActive
    ? deriveThreadTrace(map, traceTargetNodeId)
    : null;
  const selectedRelation = selectedEdgeId
    ? map.relationLedger.find((entry) => entry.relationId === selectedEdgeId) ?? null
    : null;
  const selectedQuestion = selectedQuestionId
    ? map.questions.find((question) => question.nodeId === selectedQuestionId) ?? null
    : null;
  const selectionNodeIds = selectedRelation
    ? [selectedRelation.leftOccurrenceId, selectedRelation.rightOccurrenceId]
    : selectedQuestion
      ? [selectedQuestion.nodeId, ...selectedQuestion.occurrenceAnchorIds]
      : selectedFamilyRow
        ? [...selectedFamilyRow.occurrenceNodeIds]
      : null;
  const selectionRelationIds = selectedRelation
    ? [selectedRelation.relationId]
    : selectedQuestion
      ? []
      : null;
  const activeNodeIds = new Set(
    traceHighlight?.nodeIds ?? selectionNodeIds ?? coverageHighlight.nodeIds,
  );
  const activeRelationIds = new Set(
    traceHighlight?.relationIds ?? selectionRelationIds ?? coverageHighlight.relationIds,
  );
  const selectionQuestionTetherIds = selectedQuestion
    ? map.questionTethers
      .filter((tether) => tether.toQuestionId === selectedQuestion.questionId)
      .map((tether) => tether.tetherId)
    : selectedRelation || selectedFamilyRow
      ? []
      : null;
  const activeQuestionTetherIds = new Set(
    traceHighlight?.questionTetherIds
      ?? selectionQuestionTetherIds
      ?? coverageHighlight.questionTetherIds,
  );
  const selectedQuestionTetherIdSet = new Set(selectionQuestionTetherIds ?? []);

  const measure = useCallback(() => {
    const scrollContainer = scrollRef.current;
    const shell = spatialShellRef.current;
    if (!scrollContainer || !shell) return;
    setMatrixOverflowing(
      mapCanvasHasHorizontalOverflow(
        scrollContainer.scrollWidth,
        scrollContainer.clientWidth,
      ),
    );
    setAvailableWidth(shell.clientWidth);
    const shellRect = shell.getBoundingClientRect();
    const occurrenceRects = new Map<string, DOMRect>();
    shell.querySelectorAll<HTMLElement>("[data-occurrence-id]").forEach((element) => {
      const id = element.dataset.occurrenceId;
      if (id) occurrenceRects.set(id, element.getBoundingClientRect());
    });
    const questionRects = new Map<string, DOMRect>();
    shell.querySelectorAll<HTMLElement>("[data-question-id]").forEach((element) => {
      const id = element.dataset.questionId;
      if (id) questionRects.set(id, element.getBoundingClientRect());
    });
    const allPotentialPaths = drawableRelations
      .filter((entry) => entry.sameRow)
      .flatMap((entry) => {
        const left = occurrenceRects.get(entry.leftOccurrenceId);
        const right = occurrenceRects.get(entry.rightOccurrenceId);
        if (!left || !right) return [];
        return [relationGeometry(entry, left, right, shellRect)];
      });
    const readableRelationIds = drawableRelations
      .filter((entry) => entry.sameRow)
      .filter((entry) => {
        const left = occurrenceRects.get(entry.leftOccurrenceId);
        const right = occurrenceRects.get(entry.rightOccurrenceId);
        return Boolean(
          left
          && right
          && sameRowRelationGeometryIsReadable(entry, left, right),
        );
      })
      .map((entry) => entry.relationId)
      .sort();
    setSameRowGeometryState((current) => (
      current.key === collisionKey
      && current.readableRelationIds.join("\u0000") === readableRelationIds.join("\u0000")
        ? current
        : { key: collisionKey, readableRelationIds }
    ));
    const relationPaths = allPotentialPaths.filter((item) =>
      spatialRelationIds.has(item.relationId)
    );
    const questionPaths = map.questionTethers.flatMap((tether) => {
      const occurrence = occurrenceRects.get(tether.fromOccurrenceId);
      const question = questionRects.get(tether.toQuestionId);
      if (!occurrence || !question) return [];
      return [{
        tetherId: tether.tetherId,
        path: questionPath(occurrence, question, shellRect),
      }];
    });
    const fullFieldCollisionCount = countLabelCollisions(allPotentialPaths);
    setCollisionState((current) => {
      const nextCount = current.key === collisionKey
        ? Math.max(current.count, fullFieldCollisionCount)
        : fullFieldCollisionCount;
      return current.key === collisionKey && current.count === nextCount
        ? current
        : { key: collisionKey, count: nextCount };
    });
    setGeometry({
      width: shell.scrollWidth,
      height: shell.scrollHeight,
      relationPaths,
      questionPaths,
      fullFieldCollisionCount,
    });
  }, [collisionKey, drawableRelations, map.questionTethers, spatialRelationIds]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    const shell = spatialShellRef.current;
    if (!scrollContainer || !shell) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollContainer);
    observer.observe(shell);
    scrollContainer.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const occurrenceById = useMemo(
    () => new Map(map.occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence])),
    [map.occurrences],
  );
  const relationById = useMemo(
    () => new Map(map.relationLedger.map((entry) => [entry.relationId, entry])),
    [map.relationLedger],
  );
  const portRelationsByOccurrence = useMemo(() => {
    const result = new Map<string, InvestigationRelationLedgerEntry[]>();
    for (const relationId of portRelationIds) {
      const entry = relationById.get(relationId);
      if (!entry) continue;
      for (const occurrenceId of [entry.leftOccurrenceId, entry.rightOccurrenceId]) {
        result.set(occurrenceId, [...(result.get(occurrenceId) ?? []), entry]);
      }
    }
    return result;
  }, [portRelationIds, relationById]);
  const datedOccurrenceIds = new Set(
    map.occurrences
      .filter((occurrence) => occurrence.timeRegion === "dated")
      .map((occurrence) => occurrence.occurrenceId),
  );
  const unplacedOccurrenceIds = new Set(map.unplacedOccurrenceIds);
  const selectedOccurrence = map.occurrences.find(
    (occurrence) => occurrence.occurrenceId === selectedOccurrenceId,
  );
  const selectedRow = selectedOccurrence
    ? map.rows.find((row) => row.rowId === selectedOccurrence.rowId)
    : selectedFamilyRow;

  return (
    <section className="claim-lineage-map" aria-labelledby="map-grammar-title">
      <nav className="map-skip-links" aria-label="Map regions">
        <a href="#candidate-relations">Skip to candidate relations</a>
        <a href="#unresolved-evidence-questions">Skip to unresolved questions</a>
      </nav>

      <div className="map-command-deck">
        <div className="view-intro map-intro">
          <div>
            <p className="eyebrow">Temporal claim-lineage matrix</p>
            <h2 id="map-grammar-title">Map</h2>
            <p>
              Follow each public claim as it appeared in its source and see what came
              next. Connections need review; open questions remain unresolved.
            </p>
          </div>
          <label className="axis-control" htmlFor="map-time-axis">
            <span>Selected time axis</span>
            <select
              id="map-time-axis"
              value={timeAxis}
              onChange={(event) => onTimeAxisChange(event.target.value as TimeAxis)}
            >
              {TIME_AXES.map((axis) => (
                <option key={axis} value={axis}>{TIME_AXIS_LABELS[axis]}</option>
              ))}
            </select>
          </label>
        </div>
        <details className="map-toolbar map-lens-panel">
          <summary>
            <span>Coverage lens</span>
            <span className="map-lens-separator" aria-hidden="true">·</span>
            <strong>{COVERAGE_LENS_LABELS[coverageLens]}</strong>
          </summary>
          <div className="map-lens-panel-body">
            <div className="lens-list" role="group" aria-label="Map coverage lens">
              {COVERAGE_LENSES.map((lens) => (
                <button
                  key={lens}
                  type="button"
                  aria-pressed={coverageLens === lens}
                  onClick={() => onCoverageLensChange(lens)}
                >
                  {COVERAGE_LENS_LABELS[lens]}
                </button>
              ))}
            </div>
            <p className="lens-note">
              Filters only change what is emphasized. They never remove or alter the
              displayed investigation.
            </p>
          </div>
        </details>
        {selectedNodeId || selectedEdgeId ? (
          <div className="focus-toolbar">
            <div>
              <strong>{threadTraceActive ? "Trace active" : "Map selection"}</strong>
              <span>
                {selectedRow?.label
                  ?? (selectedEdgeId ? "Candidate relation selected" : "Focused record selected")}
              </span>
            </div>
            <div className="focus-toolbar-actions">
              {selectedRow ? (
                <button
                  type="button"
                  aria-pressed={threadTraceActive}
                  onClick={onTraceThread}
                >
                  {selectedRow.traceLabel}
                </button>
              ) : null}
              <button type="button" onClick={onShowFullMap}>Show full map</button>
            </div>
          </div>
        ) : null}
      </div>

      <CoverageStrip packet={packet} map={map} />

      <div
        className="map-spatial-shell"
        ref={spatialShellRef}
        data-relation-mode={relationPresentation.mode}
      >
        <svg
          className="claim-relation-layer"
          width={geometry.width || undefined}
          height={geometry.height || undefined}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id="candidate-relation-arrow-closed"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker
              id="candidate-relation-arrow-open"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path className="open-arrow-marker" d="M 0 0 L 10 5 L 0 10" />
            </marker>
          </defs>
          {(compact ? [] : geometry.relationPaths).map((geometryItem) => {
            const entry = relationById.get(geometryItem.relationId);
            if (!entry) return null;
            const dimmed = !activeRelationIds.has(entry.relationId);
            const stateClasses = `${selectedEdgeId === entry.relationId ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`;
            const markerEnd = entry.directionAsserted
              ? entry.visualFamily === "responsive"
                ? "url(#candidate-relation-arrow-open)"
                : "url(#candidate-relation-arrow-closed)"
              : undefined;
            return (
              <g key={entry.relationId}>
                <path
                  d={geometryItem.path}
                  className={`claim-relation-path relation-${entry.visualFamily} line-${entry.lineStyle}${stateClasses}`}
                  markerEnd={markerEnd}
                  data-relation-id={entry.relationId}
                  data-relation-route="spatial"
                  data-left-occurrence-id={entry.leftOccurrenceId}
                  data-right-occurrence-id={entry.rightOccurrenceId}
                  data-row-crossing="false"
                  data-direction-asserted={String(entry.directionAsserted)}
                />
                {entry.visualFamily === "tension" ? (
                  <path
                    d={geometryItem.terminalTickPath}
                    className={`relation-terminal-ticks${stateClasses}`}
                  />
                ) : null}
              </g>
            );
          })}
          {geometry.questionPaths.map((item) => {
            const selected = selectedQuestionTetherIdSet.has(item.tetherId);
            const dimmed = !activeQuestionTetherIds.has(item.tetherId);
            return (
              <path
                key={item.tetherId}
                d={item.path}
                className={`question-evidence-tether${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
              />
            );
          })}
        </svg>

        <div className="map-primary-grid">
          <div className="claim-matrix-column">
            {relationPresentation.simplified ? (
              <p className="relation-simplification-notice" role="status">
                {relationPresentation.announcement}
              </p>
            ) : null}
            {compact ? (
              <CompactClaimChapters
                map={map}
                occurrenceById={occurrenceById}
                portRelationsByOccurrence={portRelationsByOccurrence}
                activeNodeIds={activeNodeIds}
                selectedOccurrenceId={selectedOccurrenceId}
                selectedSourceId={selectedSourceId}
                selectedFamilyId={selectedFamilyId}
                selectedEdgeId={selectedEdgeId}
                onFocus={onFocus}
              />
            ) : (
              <>
                {matrixOverflowing ? (
                  <p className="map-canvas-scroll-hint" id="map-canvas-scroll-hint">
                    Analytical view scrolls horizontally. Use Left, Right, Home, or End while this region is focused.
                  </p>
                ) : null}
                <div
                  className="claim-matrix-scroll"
                  ref={scrollRef}
                  role={matrixOverflowing ? "region" : undefined}
                  aria-label={matrixOverflowing ? "Scrollable temporal claim-lineage matrix" : undefined}
                  aria-describedby={matrixOverflowing ? "map-canvas-scroll-hint" : undefined}
                  tabIndex={matrixOverflowing ? 0 : undefined}
                  onKeyDown={matrixOverflowing ? handleAnalyticalScrollKey : undefined}
                >
                  <div
                    className="claim-matrix-stage"
                    style={{ "--map-columns": map.columnCount } as CSSProperties}
                  >
                    <div className="claim-time-header" aria-label={`${map.selectedTimeAxisLabel} groups`}>
                      <div className="claim-row-axis-heading">
                        <strong>Claim rows</strong>
                        <span>Stable while the axis changes</span>
                      </div>
                      <div className="claim-time-groups">
                        {map.timeGroups.length ? map.timeGroups.map((group) => (
                          <div
                            key={group.groupId}
                            className={`claim-time-group is-${group.precision}`}
                          >
                            <strong>{formatCalendarDate(group.calendarDate)}</strong>
                            <small>{precisionGroupLabel(group.precision)}</small>
                          </div>
                        )) : (
                          <div className="claim-time-group is-empty">
                            <strong>No placed occurrences</strong>
                            <small>The selected axis remains explicit.</small>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="claim-matrix-rows">
                      {map.rows.map((row) => (
                        <ClaimRow
                          key={row.rowId}
                          row={row}
                          map={map}
                          occurrenceById={occurrenceById}
                          includedOccurrenceIds={datedOccurrenceIds}
                          portRelationsByOccurrence={portRelationsByOccurrence}
                          activeNodeIds={activeNodeIds}
                          selectedOccurrenceId={selectedOccurrenceId}
                          selectedSourceId={selectedSourceId}
                          selectedFamilyId={selectedFamilyId}
                          selectedEdgeId={selectedEdgeId}
                          onFocus={onFocus}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {map.unplacedOccurrenceIds.length ? (
                  <UnplacedBand
                    map={map}
                    occurrenceById={occurrenceById}
                    includedOccurrenceIds={unplacedOccurrenceIds}
                    portRelationsByOccurrence={portRelationsByOccurrence}
                    activeNodeIds={activeNodeIds}
                    selectedOccurrenceId={selectedOccurrenceId}
                    selectedSourceId={selectedSourceId}
                    selectedFamilyId={selectedFamilyId}
                    selectedEdgeId={selectedEdgeId}
                    onFocus={onFocus}
                  />
                ) : null}
              </>
            )}
          </div>

          <NonClaimSourceSection
            map={map}
            activeNodeIds={activeNodeIds}
            selectedSourceId={selectedSourceId}
            onFocus={onFocus}
          />

          <CompleteRelationLedger
            entries={map.relationLedger}
            selectedEdgeId={selectedEdgeId}
            activeRelationIds={activeRelationIds}
            onFocus={onFocus}
          />

          <UnresolvedRegion
            questions={map.questions}
            activeNodeIds={activeNodeIds}
            selectedQuestionId={selectedQuestionId}
            onFocus={onFocus}
          />
        </div>

        <div className="spatial-relation-shortcuts" aria-label="Visual relation shortcuts">
          {(compact ? [] : geometry.relationPaths).map((geometryItem) => {
            const entry = relationById.get(geometryItem.relationId);
            if (!entry) return null;
            return (
              <button
                key={entry.relationId}
                type="button"
                className={`relation-shortcut relation-${entry.visualFamily}${selectedEdgeId === entry.relationId ? " is-selected" : ""}${activeRelationIds.has(entry.relationId) ? "" : " is-dimmed"}`}
                style={{ left: geometryItem.labelX, top: geometryItem.labelY }}
                aria-label={relationAccessibleName(entry, map.selectedTimeAxisLabel)}
                aria-controls={`relation-ledger-${safeDomId(entry.relationId)}`}
                data-relation-id={entry.relationId}
                data-focus-kind="relation"
                data-focus-id={entry.relationId}
                {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId("spatial-relation", relationSelection(entry)) }}
                onClick={(event) => onFocus(relationSelection(entry), event.currentTarget)}
              >
                <span>{relationSpatialLabel(entry)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="map-boundary-note">
        Connections shown here are suggestions for review, not established facts. Source
        inclusion is not endorsement or truth verification. Viewing and filtering never
        changes the displayed investigation.
      </p>

      {liveEnabled ? (
        <section className="map-provider-action" aria-labelledby="broader-investigation-title">
          <div>
            <h3 id="broader-investigation-title">Run a broader investigation</h3>
            <p>
              Broader coverage starts a new bounded provider request. The current
              investigation stays visible until a new result is ready.
            </p>
          </div>
          <button
            className="expand-coverage-button"
            type="button"
            disabled={runBlocked}
            onClick={onExpandCoverage}
          >
            {runStatusLabel ?? "Run broader investigation"}
          </button>
        </section>
      ) : null}
    </section>
  );
}

function CoverageStrip({
  packet,
  map,
}: {
  packet: SiteReadyCasePacket;
  map: InvestigationMap;
}) {
  const missingRoles = map.coverage.roles
    .filter((role) => role.missingTarget)
    .map((role) => role.label);
  const absentRoleCount = map.coverage.roles.filter((role) => role.zero).length;
  const standardLiveReview = packet.coverage_summary.coverage_basis === "live_discovery"
    && packet.coverage_summary.discovery_profile === "standard";
  const targetGapStatus = standardLiveReview
    ? absentRoleCount > 0
      ? `${absentRoleCount} role ${absentRoleCount === 1 ? "category is" : "categories are"} not represented · Standard does not target every category`
      : "All 5 role categories represented · Standard does not target every category"
    : missingRoles.length
      ? `Target-role gaps: ${missingRoles.join(", ")}`
      : "All target role categories represented";
  return (
    <section className="map-coverage-strip" aria-labelledby="map-coverage-title">
      <details>
        <summary>
          <span className="eyebrow">Source-role coverage</span>
          <strong id="map-coverage-title">
            {map.coverage.totalSources} sources · {map.coverage.representedRoleCount} of {map.coverage.targetRoleCount} role categories represented
          </strong>
          <span>{targetGapStatus}</span>
        </summary>
        <div className="map-coverage-breakdown">
          <dl>
            {map.coverage.roles.map((role) => (
              <div key={role.lane} className={role.zero ? "is-zero" : undefined}>
                <dt>{role.label}</dt>
                <dd>{role.count}{role.missingTarget ? " · missing" : ""}</dd>
              </div>
            ))}
          </dl>
          <p>{sourceCoverageNote(packet)}</p>
        </div>
      </details>
    </section>
  );
}

function CompactClaimChapters({
  map,
  occurrenceById,
  portRelationsByOccurrence,
  activeNodeIds,
  selectedOccurrenceId,
  selectedSourceId,
  selectedFamilyId,
  selectedEdgeId,
  onFocus,
}: {
  map: InvestigationMap;
  occurrenceById: ReadonlyMap<string, InvestigationOccurrenceNode>;
  portRelationsByOccurrence: ReadonlyMap<string, InvestigationRelationLedgerEntry[]>;
  activeNodeIds: ReadonlySet<string>;
  selectedOccurrenceId: string | null;
  selectedSourceId: string | null;
  selectedFamilyId: string | null;
  selectedEdgeId: string | null;
  onFocus: FocusHandler;
}) {
  return (
    <div className="claim-chapter-list" aria-label="Typed claim chapters">
      <p className="claim-chapter-axis-note">
        {map.selectedTimeAxisLabel} runs top to bottom. Unplaced records are not
        chronological.
      </p>
      {map.rows.map((row) => {
        const occurrences = row.occurrenceNodeIds
          .map((id) => occurrenceById.get(id))
          .filter((occurrence): occurrence is InvestigationOccurrenceNode => Boolean(occurrence));
        const dated = occurrences.filter((occurrence) => occurrence.timeRegion === "dated");
        const unplaced = occurrences.filter((occurrence) => occurrence.timeRegion === "unplaced");
        return (
          <section
            key={row.rowId}
            className={`claim-chapter chapter-${row.rowKind}${row.familyId === selectedFamilyId ? " is-selected" : ""}`}
            aria-label={row.accessibleName}
            data-row-kind={row.rowKind}
            data-row-ordinal={row.rowOrdinal}
            data-row-id={row.rowId}
          >
            <RowHeading
              row={row}
              selected={row.familyId === selectedFamilyId}
              onFocus={onFocus}
            />
            <div className="claim-chapter-content">
              {map.timeGroups.map((group) => {
                const groupedOccurrences = dated.filter(
                  (occurrence) => occurrence.timeGroupId === group.groupId,
                );
                if (!groupedOccurrences.length) return null;
                return (
                  <section
                    key={`${row.rowId}:${group.groupId}`}
                    className={`claim-chapter-time-group is-${group.precision}`}
                    aria-label={`${formatCalendarDate(group.calendarDate)} · ${precisionGroupLabel(group.precision)}`}
                  >
                    <header>
                      <time dateTime={group.calendarDate}>{formatCalendarDate(group.calendarDate)}</time>
                      <small>{precisionGroupLabel(group.precision)}</small>
                    </header>
                    <div className="claim-chapter-card-list">
                      {groupedOccurrences.map((occurrence) => (
                        <OccurrenceCard
                          key={occurrence.occurrenceId}
                          occurrence={occurrence}
                          portRelations={portRelationsByOccurrence.get(occurrence.occurrenceId) ?? []}
                          active={activeNodeIds.has(occurrence.nodeId)}
                          selected={selectedOccurrenceId === occurrence.nodeId}
                          sourceSelected={selectedSourceId === occurrence.source.sourceId}
                          selectedEdgeId={selectedEdgeId}
                          onFocus={onFocus}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {!dated.length ? (
                <p className="claim-chapter-empty">No occurrence is dated on {map.selectedTimeAxisLabel}.</p>
              ) : null}
              {unplaced.length ? (
                <section
                  className="claim-chapter-unplaced"
                  aria-label={`${row.accessibleName} · ${map.unplacedRegionLabel}`}
                >
                  <header>
                    <strong>{map.unplacedRegionLabel}</strong>
                    <small>Not a later chronological position · other timestamps remain inspectable</small>
                  </header>
                  <div className="claim-chapter-card-list">
                    {unplaced.map((occurrence) => (
                      <OccurrenceCard
                        key={occurrence.occurrenceId}
                        occurrence={occurrence}
                        portRelations={portRelationsByOccurrence.get(occurrence.occurrenceId) ?? []}
                        active={activeNodeIds.has(occurrence.nodeId)}
                        selected={selectedOccurrenceId === occurrence.nodeId}
                        sourceSelected={selectedSourceId === occurrence.source.sourceId}
                        selectedEdgeId={selectedEdgeId}
                        onFocus={onFocus}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ClaimRow({
  row,
  map,
  occurrenceById,
  includedOccurrenceIds,
  portRelationsByOccurrence,
  activeNodeIds,
  selectedOccurrenceId,
  selectedSourceId,
  selectedFamilyId,
  selectedEdgeId,
  onFocus,
}: {
  row: InvestigationClaimRow;
  map: InvestigationMap;
  occurrenceById: ReadonlyMap<string, InvestigationOccurrenceNode>;
  includedOccurrenceIds: ReadonlySet<string>;
  portRelationsByOccurrence: ReadonlyMap<string, InvestigationRelationLedgerEntry[]>;
  activeNodeIds: ReadonlySet<string>;
  selectedOccurrenceId: string | null;
  selectedSourceId: string | null;
  selectedFamilyId: string | null;
  selectedEdgeId: string | null;
  onFocus: FocusHandler;
}) {
  const rowOccurrences = row.occurrenceNodeIds
    .filter((id) => includedOccurrenceIds.has(id))
    .map((id) => occurrenceById.get(id))
    .filter((occurrence): occurrence is InvestigationOccurrenceNode => Boolean(occurrence));
  return (
    <section
      className={`claim-row row-${row.rowKind}${row.familyId === selectedFamilyId ? " is-selected" : ""}`}
      aria-label={row.accessibleName}
      data-row-kind={row.rowKind}
      data-row-ordinal={row.rowOrdinal}
      data-row-id={row.rowId}
    >
      <RowHeading
        row={row}
        selected={row.familyId === selectedFamilyId}
        onFocus={onFocus}
      />
      <div className="claim-row-track">
        {map.timeGroups.map((group) => {
          const occurrences = rowOccurrences.filter(
            (occurrence) => occurrence.timeGroupId === group.groupId,
          );
          return (
            <div className="claim-time-cell" key={`${row.rowId}:${group.groupId}`}>
              {occurrences.map((occurrence) => (
                <OccurrenceCard
                  key={occurrence.occurrenceId}
                  occurrence={occurrence}
                  portRelations={portRelationsByOccurrence.get(occurrence.occurrenceId) ?? []}
                  active={activeNodeIds.has(occurrence.nodeId)}
                  selected={selectedOccurrenceId === occurrence.nodeId}
                  sourceSelected={selectedSourceId === occurrence.source.sourceId}
                  selectedEdgeId={selectedEdgeId}
                  onFocus={onFocus}
                />
              ))}
            </div>
          );
        })}
        {!rowOccurrences.length ? (
          <p className="claim-row-empty">No occurrence is placed on this axis; see the Unplaced band below.</p>
        ) : null}
      </div>
    </section>
  );
}

function RowHeading({
  row,
  selected,
  onFocus,
}: {
  row: InvestigationClaimRow;
  selected: boolean;
  onFocus: FocusHandler;
}) {
  const selection: FocusSelection | null = row.familyId
    ? { kind: "claim_family", id: row.familyId, label: row.label }
    : null;
  return (
    <header className={`claim-row-heading${selected ? " is-selected" : ""}`}>
      <span className="row-ordinal">{String(row.rowOrdinal).padStart(2, "0")}</span>
      {selection ? (
        <button
          type="button"
          data-focus-kind={selection.kind}
          data-focus-id={selection.id}
          aria-current={selected ? "true" : undefined}
          {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId("claim-row", selection) }}
          onClick={(event) => onFocus(selection, event.currentTarget)}
        >
          <strong>{row.displayThreadNumber ?? rowKindHeading(row.rowKind)}</strong>
          <span>{row.displayThreadNumber
            ? row.label.replace(`${row.displayThreadNumber} · `, "")
            : row.label}</span>
          <small>Inspect grouping evidence</small>
          {selected ? <span className="a11y-only">Selected claim row.</span> : null}
        </button>
      ) : (
        <div>
          <strong>{rowKindHeading(row.rowKind)}</strong>
          {row.rowKind === "standalone_occurrence" ? null : (
            <>
              <span>{row.label}</span>
              <small>No grouping asserted</small>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function RowContinuationHeading({
  row,
  selected,
}: {
  row: InvestigationClaimRow;
  selected: boolean;
}) {
  return (
    <header
      className={`claim-row-heading is-continuation${selected ? " is-selected" : ""}`}
      aria-hidden="true"
    >
      <span className="row-ordinal">{String(row.rowOrdinal).padStart(2, "0")}</span>
      <div>
        <strong>{row.displayThreadNumber ?? rowKindHeading(row.rowKind)}</strong>
        <span>{row.displayThreadNumber
          ? row.label.replace(`${row.displayThreadNumber} · `, "")
          : row.label}</span>
        <small>Unplaced continuation · grouping detail is available in the claim row above</small>
      </div>
    </header>
  );
}

function OccurrenceCard({
  occurrence,
  portRelations,
  active,
  selected,
  sourceSelected,
  selectedEdgeId,
  onFocus,
}: {
  occurrence: InvestigationOccurrenceNode;
  portRelations: readonly InvestigationRelationLedgerEntry[];
  active: boolean;
  selected: boolean;
  sourceSelected: boolean;
  selectedEdgeId: string | null;
  onFocus: FocusHandler;
}) {
  const occurrenceSelection: FocusSelection = {
    kind: "claim_occurrence",
    id: occurrence.occurrenceId,
    label: `${occurrence.actor ?? "Actor not separately identified"} claim occurrence`,
  };
  const sourceSelection: FocusSelection = {
    kind: "source",
    id: occurrence.source.sourceId,
    label: occurrence.source.title,
  };
  return (
    <article
      className={`claim-occurrence-card${selected ? " is-selected" : ""}${active ? "" : " is-dimmed"}`}
      data-occurrence-id={occurrence.occurrenceId}
      data-time-region={occurrence.timeRegion}
      data-row-kind={occurrence.rowKind}
    >
      <button
        className="occurrence-body"
        type="button"
        data-focus-kind={occurrenceSelection.kind}
        data-focus-id={occurrenceSelection.id}
        {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId("claim-occurrence", occurrenceSelection) }}
        onClick={(event) => onFocus(occurrenceSelection, event.currentTarget)}
      >
        <span className="a11y-only">{occurrenceRowTypeAccessibleName(occurrence.rowKind)}</span>
        <span className="occurrence-state">{occurrence.occurrenceBoundaryLabel}</span>
        <strong className="occurrence-actor">
          {occurrence.actor ?? "Actor not separately identified"}
        </strong>
        <span className="occurrence-claim-text">{occurrence.originalClaimText}</span>
        <span className={`occurrence-time is-${occurrence.timeRegion}`}>
          {occurrence.selectedTime
            ? `${formatReviewTimestamp(occurrence.selectedTime, occurrence.selectedTimePrecision)} · ${precisionLabel(occurrence.selectedTimePrecision)}`
            : `Unplaced on ${occurrence.selectedTimeAxisLabel}`}
        </span>
        <span className="a11y-only">
          Concise source provenance: {occurrence.source.sourceRole}; {occurrence.source.title}; {occurrence.source.publisher}; {occurrence.source.sourceBoundaryLabel}.
        </span>
        <span className="inspect-affordance" aria-hidden="true">Inspect claim →</span>
        <span className="a11y-only">
          Open the inspector for the full claim and all timestamp details.
        </span>
      </button>
      <button
        className={`occurrence-provenance${sourceSelected ? " is-selected" : ""}`}
        type="button"
        data-focus-kind={sourceSelection.kind}
        data-focus-id={sourceSelection.id}
        {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId(`occurrence-source-${occurrence.occurrenceId}`, sourceSelection) }}
        onClick={(event) => onFocus(sourceSelection, event.currentTarget)}
      >
        <span className="a11y-only">
          Source provenance for row {String(occurrence.rowOrdinal).padStart(2, "0")} occurrence,
          {" "}{occurrence.selectedTime
            ? formatReviewTimestamp(occurrence.selectedTime, occurrence.selectedTimePrecision)
            : `Unplaced on ${occurrence.selectedTimeAxisLabel}`},
          {" "}claim {boundedAccessibleClaim(occurrence.originalClaimText)}
        </span>
        <span className="source-role-badge">{occurrence.source.sourceRole}</span>
        <strong>{occurrence.source.title}</strong>
        <small>{occurrence.source.publisher}</small>
        <span className="a11y-only">
          Source record status: {occurrence.source.sourceBoundaryLabel}.
        </span>
      </button>
      {portRelations.length ? (
        <div className="relation-port-list" aria-label="Cross-row relation shortcuts">
          {portRelations.map((entry) => {
            const selection = relationSelection(entry);
            const other = entry.leftOccurrenceId === occurrence.occurrenceId
              ? entry.rightEndpoint
              : entry.leftEndpoint;
            return (
              <button
                key={entry.relationId}
                type="button"
                className={selectedEdgeId === entry.relationId ? "is-selected" : undefined}
                aria-label={`${relationAccessibleName(entry, occurrence.selectedTimeAxisLabel)}; other endpoint from this port: ${other.actor}, ${other.conciseClaim}; opens ${entry.publicNumber} in the Complete relation review ledger`}
                aria-controls={`relation-ledger-${safeDomId(entry.relationId)}`}
                data-relation-port={entry.relationId}
                data-relation-route="port"
                data-left-occurrence-id={entry.leftOccurrenceId}
                data-right-occurrence-id={entry.rightOccurrenceId}
                data-focus-kind={selection.kind}
                data-focus-id={selection.id}
                {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId(`relation-port-${occurrence.occurrenceId}`, selection) }}
                onClick={(event) => onFocus(selection, event.currentTarget)}
              >
                <strong>{entry.publicNumber} · {relationDisplayLabel(entry.relationType)}</strong>
                <span aria-label={entry.publicReviewLabel}>Review</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function UnplacedBand({
  map,
  occurrenceById,
  includedOccurrenceIds,
  portRelationsByOccurrence,
  activeNodeIds,
  selectedOccurrenceId,
  selectedSourceId,
  selectedFamilyId,
  selectedEdgeId,
  onFocus,
}: {
  map: InvestigationMap;
  occurrenceById: ReadonlyMap<string, InvestigationOccurrenceNode>;
  includedOccurrenceIds: ReadonlySet<string>;
  portRelationsByOccurrence: ReadonlyMap<string, InvestigationRelationLedgerEntry[]>;
  activeNodeIds: ReadonlySet<string>;
  selectedOccurrenceId: string | null;
  selectedSourceId: string | null;
  selectedFamilyId: string | null;
  selectedEdgeId: string | null;
  onFocus: FocusHandler;
}) {
  return (
    <section className="unplaced-occurrence-band" aria-labelledby="unplaced-occurrences-title">
      <header>
        <p className="eyebrow">Non-chronological region</p>
        <h3 id="unplaced-occurrences-title">{map.unplacedRegionLabel}</h3>
        <p>
          This is not a later chronological column. Other timestamps remain inspectable,
          and no arrow direction is inferred through this region.
        </p>
      </header>
      {map.unplacedOccurrenceIds.length ? (
        <div className="unplaced-row-list">
          {map.rows.map((row) => {
            const occurrences = row.occurrenceNodeIds
              .filter((id) => includedOccurrenceIds.has(id))
              .map((id) => occurrenceById.get(id))
              .filter((occurrence): occurrence is InvestigationOccurrenceNode => Boolean(occurrence));
            if (!occurrences.length) return null;
            return (
              <section
                key={row.rowId}
                className="unplaced-row"
                aria-label={`${row.accessibleName} · ${map.unplacedRegionLabel}`}
                data-row-kind={row.rowKind}
                data-row-ordinal={row.rowOrdinal}
              >
                <RowContinuationHeading
                  row={row}
                  selected={row.familyId === selectedFamilyId}
                />
                <div className="unplaced-card-list">
                  {occurrences.map((occurrence) => (
                    <OccurrenceCard
                      key={occurrence.occurrenceId}
                      occurrence={occurrence}
                      portRelations={portRelationsByOccurrence.get(occurrence.occurrenceId) ?? []}
                      active={activeNodeIds.has(occurrence.nodeId)}
                      selected={selectedOccurrenceId === occurrence.nodeId}
                      sourceSelected={selectedSourceId === occurrence.source.sourceId}
                      selectedEdgeId={selectedEdgeId}
                      onFocus={onFocus}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="unplaced-empty">Every claim occurrence has an explicit value on this axis.</p>
      )}
    </section>
  );
}

function UnresolvedRegion({
  questions,
  activeNodeIds,
  selectedQuestionId,
  onFocus,
}: {
  questions: readonly InvestigationQuestionNode[];
  activeNodeIds: ReadonlySet<string>;
  selectedQuestionId: string | null;
  onFocus: FocusHandler;
}) {
  return (
    <section
      className="unresolved-evidence-region"
      id="unresolved-evidence-questions"
      tabIndex={-1}
      aria-labelledby="unresolved-evidence-title"
    >
      <header>
        <p className="eyebrow">Evidence endpoint</p>
        <h3 id="unresolved-evidence-title">Unresolved evidence questions</h3>
        <p>Not conclusions · Not chronological records</p>
      </header>
      <div className="unresolved-question-list">
        {questions.map((question) => {
          const selection: FocusSelection = {
            kind: "unresolved_question",
            id: question.questionId,
            label: question.question,
          };
          return (
            <article
              key={question.questionId}
              className={`unresolved-question-card${selectedQuestionId === question.nodeId ? " is-selected" : ""}${activeNodeIds.has(question.nodeId) ? "" : " is-dimmed"}`}
              data-question-id={question.questionId}
            >
              <button
                type="button"
                data-focus-kind={selection.kind}
                data-focus-id={selection.id}
                {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId("unresolved-question", selection) }}
                onClick={(event) => onFocus(selection, event.currentTarget)}
              >
                <span className="question-boundary">{question.boundaryLabel}</span>
                <strong>{question.question}</strong>
                <span className="question-origin-list">
                  {question.origins.map((origin) => (
                    <span
                      key={origin.originId}
                      className={`question-origin-chip origin-${origin.originType}`}
                      data-question-origin-type={origin.originType}
                    >
                      <b>{questionOriginPublicLabel(origin.originType)}</b>
                    </span>
                  ))}
                </span>
                <span className="inspect-affordance" aria-hidden="true">Inspect question →</span>
                <span className="a11y-only">
                  Open the inspector to learn why this evidence question remains unresolved.
                </span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NonClaimSourceSection({
  map,
  activeNodeIds,
  selectedSourceId,
  onFocus,
}: {
  map: InvestigationMap;
  activeNodeIds: ReadonlySet<string>;
  selectedSourceId: string | null;
  onFocus: FocusHandler;
}) {
  const dated = map.nonClaimSources.filter((source) => source.timeRegion === "dated");
  const unplaced = map.nonClaimSources.filter((source) => source.timeRegion === "unplaced");
  if (!map.nonClaimSources.length) return null;
  const subgroupCount = Number(dated.length > 0) + Number(unplaced.length > 0);
  return (
    <section
      className={`non-claim-source-section has-${subgroupCount}-subgroups`}
      aria-labelledby="non-claim-source-title"
    >
      <header>
        <p className="eyebrow">Annotations and supporting records</p>
        <h3 id="non-claim-source-title">Non-claim source records</h3>
        <p>
          These records remain outside claim rows. Without a claim occurrence,
          they are never claim-relation endpoints.
        </p>
      </header>
      {dated.length ? (
        <NonClaimGroup
          title={`Dated on ${map.selectedTimeAxisLabel}`}
          records={dated}
          groups={map.nonClaimDatedGroups}
          activeNodeIds={activeNodeIds}
          selectedSourceId={selectedSourceId}
          onFocus={onFocus}
        />
      ) : null}
      {unplaced.length ? (
        <NonClaimGroup
          title={`Unplaced on ${map.selectedTimeAxisLabel}`}
          records={unplaced}
          groups={[]}
          activeNodeIds={activeNodeIds}
          selectedSourceId={selectedSourceId}
          onFocus={onFocus}
        />
      ) : null}
    </section>
  );
}

function NonClaimGroup({
  title,
  records,
  groups,
  activeNodeIds,
  selectedSourceId,
  onFocus,
}: {
  title: string;
  records: readonly InvestigationNonClaimSourceRecord[];
  groups: InvestigationMap["nonClaimDatedGroups"];
  activeNodeIds: ReadonlySet<string>;
  selectedSourceId: string | null;
  onFocus: FocusHandler;
}) {
  if (!records.length) return null;
  const recordByNodeId = new Map(records.map((record) => [record.nodeId, record]));
  return (
    <section className="non-claim-subgroup">
      <h4>{title}</h4>
      {records.length ? (
        groups.length ? (
          <div className="non-claim-date-group-list">
            {groups.map((group) => (
              <section
                key={group.groupId}
                className={`non-claim-date-group is-${group.precision}`}
                aria-label={`${formatCalendarDate(group.calendarDate)} · ${precisionGroupLabel(group.precision)}`}
              >
                <header>
                  <time dateTime={group.calendarDate}>{formatCalendarDate(group.calendarDate)}</time>
                  <small>{precisionGroupLabel(group.precision)}</small>
                </header>
                <div className="non-claim-record-list">
                  {group.sourceNodeIds.map((nodeId) => recordByNodeId.get(nodeId))
                    .filter((source): source is InvestigationNonClaimSourceRecord => Boolean(source))
                    .map((source) => (
                      <NonClaimRecordCard
                        key={source.nodeId}
                        source={source}
                        active={activeNodeIds.has(source.nodeId)}
                        selected={selectedSourceId === source.sourceId}
                        onFocus={onFocus}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="non-claim-record-list">
            {records.map((source) => (
              <NonClaimRecordCard
                key={source.nodeId}
                source={source}
                active={activeNodeIds.has(source.nodeId)}
                selected={selectedSourceId === source.sourceId}
                onFocus={onFocus}
              />
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}

function NonClaimRecordCard({
  source,
  active,
  selected,
  onFocus,
}: {
  source: InvestigationNonClaimSourceRecord;
  active: boolean;
  selected: boolean;
  onFocus: FocusHandler;
}) {
  const selection: FocusSelection = {
    kind: "source",
    id: source.sourceId,
    label: source.title,
  };
  return (
    <article
      className={`non-claim-source-card${selected ? " is-selected" : ""}${active ? "" : " is-dimmed"}`}
      data-nonclaim-subtype={source.subtype}
      data-time-region={source.timeRegion}
    >
      <button
        type="button"
        data-focus-kind={selection.kind}
        data-focus-id={selection.id}
        {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId("non-claim-source", selection) }}
        onClick={(event) => onFocus(selection, event.currentTarget)}
      >
        <span className="source-role-badge">{source.sourceRole}</span>
        <strong>{source.subtypeLabel}</strong>
        <span>{source.title}</span>
        <small>{source.publisher} · {source.sourceBoundaryLabel}</small>
        <time>
          {source.selectedTime
            ? `${formatReviewTimestamp(source.selectedTime, source.selectedTimePrecision)} · ${precisionLabel(source.selectedTimePrecision)}`
            : `Unplaced on ${source.selectedTimeAxisLabel}`}
        </time>
        <em>Not a claim occurrence · never a claim-relation endpoint</em>
      </button>
    </article>
  );
}

function CompleteRelationLedger({
  entries,
  selectedEdgeId,
  activeRelationIds,
  onFocus,
}: {
  entries: readonly InvestigationRelationLedgerEntry[];
  selectedEdgeId: string | null;
  activeRelationIds: ReadonlySet<string>;
  onFocus: FocusHandler;
}) {
  if (entries.length === 0) {
    return (
      <section
        className="complete-relation-ledger is-empty"
        id="candidate-relations"
        tabIndex={-1}
        aria-labelledby="relation-empty-title"
      >
        <h3 id="relation-empty-title">Candidate connections</h3>
        <p>No candidate relations found in this bounded investigation.</p>
      </section>
    );
  }

  return (
    <section
      className="complete-relation-ledger"
      id="candidate-relations"
      tabIndex={-1}
      aria-labelledby="relation-ledger-title"
    >
      <header>
        <p className="eyebrow">Candidate connections</p>
        <h3 id="relation-ledger-title">
          Review all {entries.length} relation{entries.length === 1 ? "" : "s"}
        </h3>
        <p>
          Every relation appears once in this compact index. Open one for its
          evidence and review context.
        </p>
      </header>
      <ol>
        {entries.map((entry) => {
          const selection = relationSelection(entry);
          return (
            <li
              key={entry.relationId}
              id={`relation-ledger-${safeDomId(entry.relationId)}`}
              className={`${selectedEdgeId === entry.relationId ? "is-selected" : ""}${activeRelationIds.has(entry.relationId) ? "" : " is-dimmed"}`}
              data-ledger-entry="true"
              data-relation-id={entry.relationId}
              data-direction-asserted={String(entry.directionAsserted)}
            >
              <button
                className="relation-ledger-summary"
                type="button"
                aria-label={relationLedgerAccessibleName(entry)}
                data-focus-kind={selection.kind}
                data-focus-id={selection.id}
                {...{ [FOCUS_TRIGGER_ATTRIBUTE]: focusTriggerId("relation-ledger", selection) }}
                onClick={(event) => onFocus(selection, event.currentTarget)}
              >
                <span className="relation-ledger-number">{entry.publicNumber}</span>
                <span className="relation-ledger-summary-body">
                  <span className="relation-ledger-route">
                    <span>{compactRelationEndpoint(entry.leftEndpoint)}</span>
                    <b aria-hidden="true">{entry.directionAsserted ? "→" : "↔"}</b>
                    <span>{compactRelationEndpoint(entry.rightEndpoint)}</span>
                  </span>
                  <strong>{relationDisplayLabel(entry.relationType)}</strong>
                  <span className="relation-ledger-meta">
                    {entry.sourceBacked ? <span className="source-backed-state">Source-backed</span> : null}
                    <span className="review-state">{entry.publicReviewLabel}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function relationGeometry(
  entry: InvestigationRelationLedgerEntry,
  left: DOMRect,
  right: DOMRect,
  shell: DOMRect,
): RelationGeometry {
  const leftCenterX = left.left - shell.left + left.width * 0.5;
  const leftCenterY = left.top - shell.top + left.height * 0.5;
  const rightCenterX = right.left - shell.left + right.width * 0.5;
  const rightCenterY = right.top - shell.top + right.height * 0.5;
  const leftToRight = rightCenterX >= leftCenterX;
  const startX = (leftToRight ? left.right : left.left) - shell.left;
  const endX = (leftToRight ? right.left : right.right) - shell.left;
  const overlapTop = Math.max(left.top, right.top) - shell.top;
  const overlapBottom = Math.min(left.bottom, right.bottom) - shell.top;
  const sharedY = overlapBottom > overlapTop
    ? (overlapTop + overlapBottom) / 2
    : (leftCenterY + rightCenterY) / 2;
  const startY = sharedY;
  const endY = sharedY;
  const length = Math.hypot(endX - startX, endY - startY) || 1;
  const tickX = (-(endY - startY) / length) * 6;
  const tickY = ((endX - startX) / length) * 6;
  return {
    relationId: entry.relationId,
    path: `M ${startX} ${startY} L ${endX} ${endY}`,
    terminalTickPath: `M ${startX - tickX} ${startY - tickY} L ${startX + tickX} ${startY + tickY} M ${endX - tickX} ${endY - tickY} L ${endX + tickX} ${endY + tickY}`,
    labelX: (startX + endX) / 2,
    labelY: (startY + endY) / 2 - 12 - entry.parallelIndex * 22,
  };
}

function sameRowRelationGeometryIsReadable(
  entry: InvestigationRelationLedgerEntry,
  left: DOMRect,
  right: DOMRect,
): boolean {
  if (!entry.sameRow) return false;
  const horizontalGap = right.left >= left.right
    ? right.left - left.right
    : left.left >= right.right
      ? left.left - right.right
      : -1;
  const verticalOverlap = Math.min(left.bottom, right.bottom)
    - Math.max(left.top, right.top);
  const estimatedLabelWidth = relationSpatialLabel(entry).length * 7.4 + 20;
  return horizontalGap >= estimatedLabelWidth + 28
    && verticalOverlap >= Math.min(left.height, right.height) * 0.35;
}

function questionPath(occurrence: DOMRect, question: DOMRect, shell: DOMRect): string {
  const startX = occurrence.right - shell.left;
  const startY = occurrence.top - shell.top + occurrence.height * 0.5;
  const endX = question.left - shell.left;
  const endY = question.top - shell.top + question.height * 0.5;
  const middleX = startX + (endX - startX) * 0.54;
  return `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`;
}

function countLabelCollisions(paths: readonly RelationGeometry[]): number {
  let collisions = 0;
  for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
      const left = paths[leftIndex];
      const right = paths[rightIndex];
      if (
        Math.abs(left.labelX - right.labelX) < 116
        && Math.abs(left.labelY - right.labelY) < 42
      ) collisions += 1;
    }
  }
  return collisions;
}

function handleAnalyticalScrollKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  const container = event.currentTarget;
  if (!mapCanvasHasHorizontalOverflow(container.scrollWidth, container.clientWidth)) return;
  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  const scrollStep = Math.max(220, Math.round(container.clientWidth * 0.7));
  if (event.key === "ArrowRight") {
    event.preventDefault();
    container.scrollLeft += scrollStep;
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    container.scrollLeft -= scrollStep;
  } else if (event.key === "Home") {
    event.preventDefault();
    container.scrollLeft = 0;
  } else if (event.key === "End") {
    event.preventDefault();
    container.scrollLeft = maxScrollLeft;
  }
}

function relationSelection(entry: InvestigationRelationLedgerEntry): FocusSelection {
  return {
    kind: "relation",
    id: entry.relationId,
    label: `${entry.publicNumber} · ${relationDisplayLabel(entry.relationType)} · ${entry.sourceBacked ? "Source-backed · " : ""}${entry.publicReviewLabel}`,
  };
}

function relationAccessibleName(
  entry: InvestigationRelationLedgerEntry,
  selectedTimeAxisLabel: string,
): string {
  const connector = entry.directionAsserted
    ? entry.sourceBacked
      ? `; source-backed connector ${relationSpatialLabel(entry)}`
      : `; earlier-to-later connector ${relationSpatialLabel(entry)}`
    : "";
  return `${entry.publicNumber}, candidate relation ${relationDisplayLabel(entry.relationType)}, ${entry.sourceBacked ? "Source-backed, " : ""}${entry.publicReviewLabel}${connector}; ${relationLedgerSentence(entry)}; first occurrence: ${relationEndpointAccessibleName(entry.leftEndpoint)}; second occurrence: ${relationEndpointAccessibleName(entry.rightEndpoint)}; ${relationDirectionState(entry, selectedTimeAxisLabel)}; opens the same relation detail as the Complete relation review ledger`;
}

function relationLedgerAccessibleName(
  entry: InvestigationRelationLedgerEntry,
): string {
  return `${entry.publicNumber}, ${relationDisplayLabel(entry.relationType)}, ${entry.sourceBacked ? "Source-backed, " : ""}${entry.publicReviewLabel}. ${compactRelationEndpoint(entry.leftEndpoint)} ${entry.directionAsserted ? "to" : "and"} ${compactRelationEndpoint(entry.rightEndpoint)}. Inspect relation.`;
}

function relationEndpointAccessibleName(
  endpoint: InvestigationRelationLedgerEntry["leftEndpoint"],
): string {
  return `${endpoint.actor}, claim ${endpoint.conciseClaim}, source ${endpoint.sourceIdentity}, selected-axis time ${endpoint.selectedTimeState}`;
}

export function relationSpatialLabel(entry: InvestigationRelationLedgerEntry): string {
  if (entry.sourceBacked && entry.relationType === "supersedes") return "Replaces";
  if (!entry.directionAsserted) return relationDisplayLabel(entry.relationType);
  if (entry.relationType === "supersedes") return "Superseded by";
  if (entry.relationType === "correction") return "Corrected by";
  if (entry.relationType === "narrows") return "Narrowed by";
  if (entry.relationType === "follow_up") return "Response follows";
  return relationDisplayLabel(entry.relationType);
}

function relationDirectionState(
  entry: InvestigationRelationLedgerEntry,
  selectedTimeAxisLabel: string,
): string {
  if (!isDirectionalRelationType(entry.relationType)) {
    return "Non-directional relation";
  }
  if (entry.sourceBacked && entry.directionAsserted) {
    return "Direction follows the source-backed statement";
  }
  return entry.directionAsserted
    ? `Earlier-to-later direction established on ${selectedTimeAxisLabel}`
    : `Direction not established on ${selectedTimeAxisLabel}`;
}

function isDirectionalRelationType(relationType: string): boolean {
  return relationType === "supersedes"
    || relationType === "correction"
    || relationType === "narrows"
    || relationType === "follow_up";
}

function relationLedgerSentence(entry: InvestigationRelationLedgerEntry): string {
  const earlierActor = boundedAccessibleClaim(entry.leftEndpoint.actor, 42);
  const laterActor = boundedAccessibleClaim(entry.rightEndpoint.actor, 42);
  if (entry.sourceBacked && entry.relationType === "supersedes") {
    return `${earlierActor} claim replaces the referenced ${laterActor} claim`;
  }
  if (!entry.directionAsserted) {
    if (entry.relationType === "supersedes") {
      return "Possible supersession between these claim occurrences";
    }
    if (entry.relationType === "correction") {
      return "Possible correction between these claim occurrences";
    }
    if (entry.relationType === "narrows") {
      return "Possible narrowing between these claim occurrences";
    }
    if (entry.relationType === "follow_up") {
      return "Possible follow-up between these claim occurrences";
    }
    if (entry.relationType === "contradicts") {
      return "These claim occurrences challenge one another";
    }
    if (entry.relationType === "corroborates") {
      return "These claim occurrences support one another";
    }
    if (entry.relationType === "same_event") {
      return "These claim occurrences describe the same event";
    }
    if (entry.relationType === "unresolved") {
      return "The connection between these claim occurrences remains unclear";
    }
    return "No direct change is identified between these claim occurrences";
  }
  if (entry.relationType === "supersedes") {
    return `Later ${laterActor} claim supersedes the earlier ${earlierActor} claim`;
  }
  if (entry.relationType === "correction") {
    return `Later ${laterActor} claim corrects the earlier ${earlierActor} claim`;
  }
  if (entry.relationType === "narrows") {
    return `Later ${laterActor} claim narrows the earlier ${earlierActor} claim`;
  }
  return `${laterActor} response follows the earlier ${earlierActor} claim`;
}

function compactRelationEndpoint(
  endpoint: InvestigationRelationLedgerEntry["leftEndpoint"],
): string {
  return `${boundedAccessibleClaim(endpoint.actor, 36)} · ${boundedAccessibleClaim(endpoint.conciseClaim, 64)}`;
}

function questionOriginPublicLabel(
  originType: InvestigationQuestionNode["origins"][number]["originType"],
): string {
  if (originType === "occurrence" || originType === "actor_claim") {
    return "Via matching claim";
  }
  if (originType === "action") return "Via action record";
  if (originType === "source") return "Via source record";
  return "Topic-level evidence gap";
}

function occurrenceRowTypeAccessibleName(
  rowKind: InvestigationClaimRow["rowKind"],
): string {
  if (rowKind === "candidate_thread") {
    return "Candidate thread claim occurrence, grouping needs review.";
  }
  if (rowKind === "standalone_occurrence") {
    return "Standalone claim occurrence, grouping unresolved.";
  }
  return "Ungrouped claim occurrence.";
}

function rowKindHeading(kind: InvestigationClaimRow["rowKind"]): string {
  if (kind === "candidate_thread") return "Candidate thread";
  if (kind === "standalone_occurrence") return "Standalone claim";
  return "Ungrouped occurrence";
}

function precisionGroupLabel(
  precision: InvestigationMap["timeGroups"][number]["precision"],
): string {
  if (precision === "mixed") return "Mixed precision · no artificial order";
  if (precision === "day") return "Day-level unordered peers";
  return "Exact instants retain clock order";
}

function precisionLabel(precision: InvestigationOccurrenceNode["selectedTimePrecision"]): string {
  return precision === "day" ? "Day precision" : "Exact instant";
}

function boundedAccessibleClaim(value: string, limit = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function formatCalendarDate(calendarDate: string): string {
  return formatReviewTimestamp(`${calendarDate}T00:00:00.000Z`, "day");
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function subscribeCompactMap(callback: () => void): () => void {
  const media = window.matchMedia(MAP_COMPACT_MEDIA_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function compactMapSnapshot(): boolean {
  return window.matchMedia(MAP_COMPACT_MEDIA_QUERY).matches;
}
