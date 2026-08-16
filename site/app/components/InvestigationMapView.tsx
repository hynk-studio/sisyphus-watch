import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  TIME_AXES,
  TIME_AXIS_LABELS,
  discoveryLaneLabel,
  type TimeAxis,
} from "../lib/experience";
import {
  COVERAGE_LENS_LABELS,
  deriveCoverageHighlight,
  deriveThreadTrace,
  type CoverageLens,
  type InvestigationMap,
  type InvestigationQuestionNode,
  type InvestigationRelationEdge,
  type InvestigationSourceNode,
  type MapHighlightState,
} from "../lib/investigation-map";
import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import {
  focusTriggerId,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

interface SpatialPoint {
  x: number;
  y: number;
}

interface SpatialRelationGeometry {
  edgeId: string;
  path: string;
  start: SpatialPoint;
  end: SpatialPoint;
  label: SpatialPoint;
}

interface SpatialQuestionGeometry {
  edgeId: string;
  path: string;
  start: SpatialPoint;
  end: SpatialPoint;
}

interface SpatialConnectionGeometry {
  width: number;
  height: number;
  relations: SpatialRelationGeometry[];
  questions: SpatialQuestionGeometry[];
}

const EMPTY_SPATIAL_GEOMETRY: SpatialConnectionGeometry = {
  width: 0,
  height: 0,
  relations: [],
  questions: [],
};

export function InvestigationMapView({
  packet,
  map,
  timeAxis,
  coverageLens,
  selectedNodeId,
  selectedEdgeId,
  threadTraceActive,
  liveEnabled,
  isLoading,
  onTimeAxisChange,
  onCoverageLensChange,
  onFocus,
  onTraceThread,
  onShowFullMap,
  onExpandCoverage,
}: {
  packet: SiteReadyCasePacket;
  map: InvestigationMap;
  timeAxis: TimeAxis;
  coverageLens: CoverageLens;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  threadTraceActive: boolean;
  liveEnabled: boolean;
  isLoading: boolean;
  onTimeAxisChange: (axis: TimeAxis) => void;
  onCoverageLensChange: (lens: CoverageLens) => void;
  onFocus: FocusHandler;
  onTraceThread: () => void;
  onShowFullMap: () => void;
  onExpandCoverage: () => void;
}) {
  const lensHighlight = deriveCoverageHighlight(map, coverageLens);
  const selectionHighlight = selectionHighlightState(map, selectedNodeId, selectedEdgeId);
  const availableLenses = coverageLensesForMap(map);
  const selectedSource = map.sources.find((source) => source.nodeId === selectedNodeId);
  const selectedQuestion = map.questions.find((question) => question.nodeId === selectedNodeId);
  const trace = selectedNodeId ? deriveThreadTrace(map, selectedNodeId) : null;
  const preparedComparison = packet.coverage_summary.coverage_basis === "prepared_fixture";
  const spatialStageRef = useRef<HTMLDivElement>(null);
  const spatialNodeRefs = useRef(new Map<string, HTMLElement>());
  const [spatialGeometry, setSpatialGeometry] = useState<SpatialConnectionGeometry>(
    EMPTY_SPATIAL_GEOMETRY,
  );

  function registerSpatialNode(nodeId: string, node: HTMLElement | null) {
    if (node) spatialNodeRefs.current.set(nodeId, node);
    else spatialNodeRefs.current.delete(nodeId);
  }

  useEffect(() => {
    const stage = spatialStageRef.current;
    if (!stage) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSpatialGeometry(measureSpatialConnections(stage, spatialNodeRefs.current, map));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  function nodeIsDimmed(nodeId: string): boolean {
    const outsideLens = !lensHighlight.nodeIds.includes(nodeId);
    const outsideSelection = selectionHighlight
      ? !selectionHighlight.nodeIds.includes(nodeId)
      : false;
    return outsideLens || outsideSelection;
  }

  function relationIsDimmed(edgeId: string): boolean {
    const outsideLens = !lensHighlight.relationEdgeIds.includes(edgeId);
    const outsideSelection = selectionHighlight
      ? !selectionHighlight.relationEdgeIds.includes(edgeId)
      : false;
    return outsideLens || outsideSelection;
  }

  function questionEdgeIsDimmed(edgeId: string): boolean {
    const outsideLens = !lensHighlight.questionEdgeIds.includes(edgeId);
    const outsideSelection = selectionHighlight
      ? !selectionHighlight.questionEdgeIds.includes(edgeId)
      : false;
    return outsideLens || outsideSelection;
  }

  return (
    <div className="map-view view-stack">
      <div className="view-intro map-intro">
        <div>
          <p className="eyebrow">Structured investigation map</p>
          <h3>Follow sources, candidate changes, and open questions</h3>
          <p>
            Time moves left to right. Source-role lanes stay fixed. Selection and
            coverage lenses only change emphasis.
          </p>
        </div>
        <label className="axis-control" htmlFor="map-time-axis">
          Map time axis
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

      <section className="map-toolbar" aria-labelledby="coverage-lens-title">
        <div>
          <p className="eyebrow">Coverage lens</p>
          <h4 id="coverage-lens-title">Highlight context without removing it</h4>
        </div>
        <div className="lens-list" role="group" aria-label="Map coverage lens">
          {availableLenses.map((lens) => (
            <button
              key={lens}
              type="button"
              aria-pressed={coverageLens === lens}
              onClick={() => onCoverageLensChange(lens)}
            >
              {preparedLensLabel(lens, preparedComparison)}
            </button>
          ))}
        </div>
        <p className="lens-note">
          {preparedComparison
            ? "Prepared comparison only: baseline versus the complete curated fixture. No new search runs, and the packet never changes."
            : "These controls highlight the selected discovery pass or source role. They do not combine, delete, or accept records."}
        </p>
        {packet.mode === "live" && packet.discovery_profile === "standard" ? (
          <button
            className="expand-coverage-button"
            type="button"
            disabled={!liveEnabled || isLoading}
            onClick={onExpandCoverage}
          >
            {isLoading ? "Expanding source coverage…" : "Expand source coverage"}
          </button>
        ) : null}
      </section>

      {selectedNodeId || selectedEdgeId ? (
        <div className="focus-toolbar" role="status" aria-live="polite">
          <div>
            <strong>{threadTraceActive ? "Thread trace active" : "Focused map context"}</strong>
            <span>
              {selectedSource?.title
                ?? selectedQuestion?.question
                ?? "Selected relation and both connected sources"}
            </span>
          </div>
          <div className="focus-toolbar-actions" aria-hidden="true">
            {selectedNodeId && !threadTraceActive ? (
              <button type="button" tabIndex={-1} onClick={onTraceThread}>
                Trace this thread
              </button>
            ) : null}
            <button type="button" tabIndex={-1} onClick={onShowFullMap}>
              Show full map
            </button>
          </div>
        </div>
      ) : (
        <div className="focus-toolbar focus-toolbar-idle" aria-label="Inspector guidance">
          <div>
            <strong>Select a record to inspect</strong>
            <span>Sources, candidate relations, and open questions open in the viewport inspector.</span>
          </div>
          <small>Closing returns focus and scroll position to the selected record.</small>
        </div>
      )}

      {threadTraceActive && trace ? (
        <ThreadTraceSummary map={map} trace={trace} selectedNodeId={selectedNodeId ?? ""} />
      ) : null}

      <div
        className="desktop-map"
        aria-label="Investigation map ordered by source role and selected time axis"
      >
        <div className="spatial-map-stage" ref={spatialStageRef}>
          <SpatialConnectionLayer
            map={map}
            geometry={spatialGeometry}
            selectedEdgeId={selectedEdgeId}
            relationIsDimmed={relationIsDimmed}
            questionEdgeIsDimmed={questionEdgeIsDimmed}
          />

          <article
            className="topic-node"
            ref={(node) => registerSpatialNode(map.topic.nodeId, node)}
          >
            <span>Topic root</span>
            <h4>{map.topic.title}</h4>
            <p>
              {map.sources.length} sources · {map.relationEdges.length} candidate relations · {map.questions.length} open questions
            </p>
          </article>

          <div
            className="map-time-scale"
            style={{ "--map-columns": map.columnCount } as CSSProperties}
            aria-label={`${map.selectedTimeAxisLabel} ordering`}
          >
            {map.sources.map((source) => (
              <div key={source.nodeId} style={{ gridColumn: source.column }}>
                <span>{source.selectedTime ? formatDate(source.selectedTime) : "Time unavailable"}</span>
                <small>{source.selectedTimeAxisLabel}</small>
              </div>
            ))}
          </div>

          <div className="map-lanes">
            {map.laneOrder.map((lane) => {
              const laneSources = map.sources.filter((source) => source.lane === lane);
              return (
                <section className="map-lane" key={lane} aria-labelledby={`lane-${lane}`}>
                  <div className="lane-heading">
                    <h4 id={`lane-${lane}`}>{discoveryLaneLabel(lane)}</h4>
                    <span>{laneSources.length} source{laneSources.length === 1 ? "" : "s"}</span>
                  </div>
                  <div
                    className="lane-grid"
                    style={{ "--map-columns": map.columnCount } as CSSProperties}
                  >
                    {laneSources.map((source) => (
                      <SourceMapNode
                        key={source.nodeId}
                        source={source}
                        selected={selectedNodeId === source.nodeId}
                        dimmed={nodeIsDimmed(source.nodeId)}
                        style={{ gridColumn: source.column }}
                        nodeRef={(node) => registerSpatialNode(source.nodeId, node)}
                        triggerSurface="desktop-map"
                        onFocus={onFocus}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <SpatialRelationControls
            map={map}
            geometry={spatialGeometry}
            selectedEdgeId={selectedEdgeId}
            relationIsDimmed={relationIsDimmed}
            onFocus={onFocus}
          />

          <section className="question-lane" aria-labelledby="question-lane-title">
            <div className="lane-heading">
              <h4 id="question-lane-title">Open questions</h4>
              <span>Visible endpoints · not conclusions</span>
            </div>
            <div className="question-node-grid">
              {map.questions.map((question, index) => (
                <QuestionMapNode
                  key={question.nodeId}
                  question={question}
                  index={index}
                  selected={selectedNodeId === question.nodeId}
                  dimmed={nodeIsDimmed(question.nodeId)}
                  connectionDimmed={questionEdgesFor(map, question.nodeId).every(
                    (edge) => questionEdgeIsDimmed(edge.edgeId),
                  )}
                  connectionLabel={questionConnectionLabel(map, question)}
                  nodeRef={(node) => registerSpatialNode(question.nodeId, node)}
                  triggerSurface="desktop-map"
                  onFocus={onFocus}
                />
              ))}
            </div>
          </section>
        </div>

        <RelationLedger
          map={map}
          selectedEdgeId={selectedEdgeId}
          relationIsDimmed={relationIsDimmed}
          onFocus={onFocus}
        />
      </div>

      <MobileInvestigationPath
        map={map}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        nodeIsDimmed={nodeIsDimmed}
        relationIsDimmed={relationIsDimmed}
        onFocus={onFocus}
      />

      <p className="map-boundary-note">
        Map edges come only from validated relation candidates and their claim-lineage rows.
        Findings and actions remain source detail; no evidence-to-claim edge is created.
      </p>
    </div>
  );
}

function SourceMapNode({
  source,
  selected,
  dimmed,
  style,
  nodeRef,
  triggerSurface,
  onFocus,
}: {
  source: InvestigationSourceNode;
  selected: boolean;
  dimmed: boolean;
  style?: CSSProperties;
  nodeRef?: (node: HTMLElement | null) => void;
  triggerSurface: string;
  onFocus: FocusHandler;
}) {
  const selection = { kind: "source" as const, id: source.sourceId, label: source.title };
  return (
    <article
      className={`map-source-node${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
      data-map-state={selected ? "selected" : dimmed ? "dimmed" : "in context"}
      style={style}
      ref={nodeRef}
    >
      <button
        type="button"
        data-focus-trigger={focusTriggerId(triggerSurface, selection)}
        aria-pressed={selected}
        aria-label={`${source.sourceRole} source node: ${source.title}. ${source.selectedTimeAxisLabel}: ${source.selectedTime ? formatDate(source.selectedTime) : "Time unavailable"}. ${selected ? "Selected" : "Not selected"}.`}
        onClick={(event) => onFocus(selection, event.currentTarget)}
        onKeyDown={(event) => {
          const trigger = event.currentTarget;
          activateWithKeyboard(event, () => onFocus(selection, trigger));
        }}
      >
        <span className="node-state-text">{selected ? "Selected source" : "Source node"}</span>
        <span className="source-role-badge">{source.sourceRole}</span>
        <strong>{source.title}</strong>
        <span className="map-source-publisher">{source.publisher} · {source.domain}</span>
        <span className={`map-node-time${source.timeRegion === "time_unavailable" ? " time-unavailable" : ""}`}>
          {source.selectedTimeAxisLabel}: {source.selectedTime ? formatDate(source.selectedTime) : "Time unavailable"}
        </span>
        <span className="preview-label">{source.previewLabel}</span>
        <span className="source-preview">{source.preview}</span>
        <span className="node-counts">
          {source.claimCount} claims · {source.findingCount} findings · {source.actionCount} actions
        </span>
        <span className="node-review-state">{source.recordBoundaryLabel}</span>
      </button>
      {source.citationUrl ? (
        <a href={source.citationUrl} target="_blank" rel="noopener noreferrer">
          Open cited source <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <span className="fixture-affordance">Prepared fixture · no external URL</span>
      )}
    </article>
  );
}

function QuestionMapNode({
  question,
  index,
  selected,
  dimmed,
  connectionDimmed,
  connectionLabel,
  nodeRef,
  triggerSurface,
  onFocus,
}: {
  question: InvestigationQuestionNode;
  index: number;
  selected: boolean;
  dimmed: boolean;
  connectionDimmed: boolean;
  connectionLabel: string;
  nodeRef?: (node: HTMLElement | null) => void;
  triggerSurface: string;
  onFocus: FocusHandler;
}) {
  const selection = {
    kind: "unresolved_question" as const,
    id: question.questionId,
    label: `Open question ${index + 1}`,
  };
  return (
    <article
      className={`map-question-node${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
      ref={nodeRef}
    >
      <span className={`question-connector${connectionDimmed ? " is-dimmed" : ""}`}>
        {connectionLabel}
      </span>
      <button
        type="button"
        data-focus-trigger={focusTriggerId(triggerSurface, selection)}
        aria-pressed={selected}
        aria-label={`Open question node ${index + 1}: ${question.question}. ${connectionLabel}. ${selected ? "Selected" : "Not selected"}.`}
        onClick={(event) => onFocus(selection, event.currentTarget)}
        onKeyDown={(event) => {
          const trigger = event.currentTarget;
          activateWithKeyboard(event, () => onFocus(selection, trigger));
        }}
      >
        <span className="question-mark" aria-hidden="true">?</span>
        <span className="node-state-text">
          {selected ? "Selected open question" : `Open question ${String(index + 1).padStart(2, "0")}`}
        </span>
        <strong>{question.question}</strong>
        <small>
          {question.resolvedReferences.some((reference) => reference.resolution === "unknown")
            ? "Unknown reference attached only to topic root"
            : `${question.targetNodeIds.length} conservatively resolved map connection${question.targetNodeIds.length === 1 ? "" : "s"}`}
        </small>
      </button>
    </article>
  );
}

function SpatialConnectionLayer({
  map,
  geometry,
  selectedEdgeId,
  relationIsDimmed,
  questionEdgeIsDimmed,
}: {
  map: InvestigationMap;
  geometry: SpatialConnectionGeometry;
  selectedEdgeId: string | null;
  relationIsDimmed: (edgeId: string) => boolean;
  questionEdgeIsDimmed: (edgeId: string) => boolean;
}) {
  const relationById = new Map(map.relationEdges.map((edge) => [edge.edgeId, edge]));
  const questionById = new Map(map.questionEdges.map((edge) => [edge.edgeId, edge]));
  return (
    <svg
      className="spatial-connection-layer"
      viewBox={`0 0 ${Math.max(geometry.width, 1)} ${Math.max(geometry.height, 1)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker id="candidate-relation-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
        <marker id="question-gap-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>
      {geometry.questions.map((connection) => {
        const edge = questionById.get(connection.edgeId);
        if (!edge) return null;
        return (
          <path
            key={edge.edgeId}
            className={`spatial-question-path${questionEdgeIsDimmed(edge.edgeId) ? " is-dimmed" : ""}`}
            d={connection.path}
            data-question-edge-id={edge.edgeId}
            data-from-node-id={edge.fromNodeId}
            data-to-node-id={edge.toNodeId}
            data-resolution={edge.resolution}
            markerEnd="url(#question-gap-arrow)"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {geometry.relations.map((connection) => {
        const edge = relationById.get(connection.edgeId);
        if (!edge) return null;
        return (
          <path
            key={edge.edgeId}
            className={`spatial-relation-path${selectedEdgeId === edge.edgeId ? " is-selected" : ""}${relationIsDimmed(edge.edgeId) ? " is-dimmed" : ""}`}
            d={connection.path}
            data-relation-id={edge.relationId}
            data-left-source-id={edge.leftSourceId}
            data-right-source-id={edge.rightSourceId}
            markerEnd="url(#candidate-relation-arrow)"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function SpatialRelationControls({
  map,
  geometry,
  selectedEdgeId,
  relationIsDimmed,
  onFocus,
}: {
  map: InvestigationMap;
  geometry: SpatialConnectionGeometry;
  selectedEdgeId: string | null;
  relationIsDimmed: (edgeId: string) => boolean;
  onFocus: FocusHandler;
}) {
  const geometryById = new Map(geometry.relations.map((item) => [item.edgeId, item]));
  return (
    <div className="spatial-relation-controls" aria-label="Spatial candidate relation controls">
      {map.relationEdges.map((edge) => {
        const position = geometryById.get(edge.edgeId);
        if (!position) return null;
        const from = map.sources.find((source) => source.nodeId === edge.fromNodeId);
        const to = map.sources.find((source) => source.nodeId === edge.toNodeId);
        const selected = selectedEdgeId === edge.edgeId;
        const selection: FocusSelection = {
          kind: "relation",
          id: edge.relationId,
          label: edge.label,
        };
        return (
          <button
            key={edge.edgeId}
            className={`${selected ? "is-selected " : ""}${relationIsDimmed(edge.edgeId) ? "is-dimmed" : ""}`}
            type="button"
            aria-pressed={selected}
            aria-label={`${edge.label} from ${from?.title ?? edge.leftSourceId} to ${to?.title ?? edge.rightSourceId}. Needs review. Inspect support from both sides.`}
            data-focus-trigger={focusTriggerId("spatial-relation", selection)}
            data-relation-id={edge.relationId}
            data-left-occurrence-id={edge.leftOccurrenceId}
            data-right-occurrence-id={edge.rightOccurrenceId}
            data-left-source-id={edge.leftSourceId}
            data-right-source-id={edge.rightSourceId}
            style={{ left: position.label.x, top: position.label.y }}
            onClick={(event) => onFocus(selection, event.currentTarget)}
            onKeyDown={(event) => {
              const trigger = event.currentTarget;
              activateWithKeyboard(event, () => onFocus(selection, trigger));
            }}
          >
            <span>{edge.label}</span>
            <small>
              Needs review
              {edge.parallelCount > 1
                ? ` · ${edge.parallelIndex + 1} of ${edge.parallelCount}`
                : ""}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function RelationLedger({
  map,
  selectedEdgeId,
  relationIsDimmed,
  onFocus,
}: {
  map: InvestigationMap;
  selectedEdgeId: string | null;
  relationIsDimmed: (edgeId: string) => boolean;
  onFocus: FocusHandler;
}) {
  return (
    <details className="relation-ledger">
      <summary>
        <strong>Accessible relation list</strong>
        <span>{map.relationEdges.length} candidate connection{map.relationEdges.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="relation-ledger-body">
        <div className="lane-heading">
          <h4>Candidate connections</h4>
          <span>Exact endpoint and support inspection fallback</span>
        </div>
        {map.relationEdges.length ? (
          <ol>
            {map.relationEdges.map((edge) => {
              const from = map.sources.find((source) => source.nodeId === edge.fromNodeId);
              const to = map.sources.find((source) => source.nodeId === edge.toNodeId);
              const selected = selectedEdgeId === edge.edgeId;
              const selection: FocusSelection = {
                kind: "relation",
                id: edge.relationId,
                label: edge.label,
              };
              return (
                <li
                  key={edge.edgeId}
                  className={`${selected ? "is-selected " : ""}${relationIsDimmed(edge.edgeId) ? "is-dimmed" : ""}`}
                >
                  <span className="edge-endpoint">{from?.title ?? edge.leftSourceId}</span>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${edge.label} from ${from?.title ?? edge.leftSourceId} to ${to?.title ?? edge.rightSourceId}. Needs review. Inspect support from both sides.`}
                    data-focus-trigger={focusTriggerId("relation-list", selection)}
                    onClick={(event) => onFocus(selection, event.currentTarget)}
                    onKeyDown={(event) => {
                      const trigger = event.currentTarget;
                      activateWithKeyboard(event, () => onFocus(selection, trigger));
                    }}
                  >
                    <span>{edge.label}</span>
                    <small>
                      Needs review
                      {edge.parallelCount > 1
                        ? ` · relation ${edge.parallelIndex + 1} of ${edge.parallelCount} for this source pair`
                        : ""}
                    </small>
                    <strong>Inspect support from both sides</strong>
                  </button>
                  <span className="edge-endpoint">{to?.title ?? edge.rightSourceId}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty-state">
            <strong>No source-to-source claim relations</strong>
            <p>Findings and actions remain available inside source details. Their presence does not create an edge.</p>
          </div>
        )}
      </div>
    </details>
  );
}

function MobileInvestigationPath({
  map,
  selectedNodeId,
  selectedEdgeId,
  nodeIsDimmed,
  relationIsDimmed,
  onFocus,
}: {
  map: InvestigationMap;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeIsDimmed: (nodeId: string) => boolean;
  relationIsDimmed: (edgeId: string) => boolean;
  onFocus: FocusHandler;
}) {
  return (
    <section className="mobile-investigation-path" aria-labelledby="mobile-path-title">
      <div className="lane-heading">
        <h4 id="mobile-path-title">Investigation path</h4>
        <span>{map.selectedTimeAxisLabel} · top to bottom</span>
      </div>
      <article className="mobile-topic-node">
        <span>Topic root</span>
        <strong>{map.topic.title}</strong>
      </article>
      <ol>
        {map.sources.map((source) => {
          const outgoing = mobileEdgesAfterSource(map, source.nodeId);
          return (
            <li key={source.nodeId}>
              <SourceMapNode
                source={source}
                selected={selectedNodeId === source.nodeId}
                dimmed={nodeIsDimmed(source.nodeId)}
                triggerSurface="mobile-map"
                onFocus={onFocus}
              />
              {outgoing.map((edge) => {
                const otherId = edge.fromNodeId === source.nodeId
                  ? edge.toNodeId
                  : edge.fromNodeId;
                const other = map.sources.find((item) => item.nodeId === otherId);
                const selection: FocusSelection = {
                  kind: "relation",
                  id: edge.relationId,
                  label: edge.label,
                };
                return (
                  <button
                    key={edge.edgeId}
                    className={`mobile-relation-label${selectedEdgeId === edge.edgeId ? " is-selected" : ""}${relationIsDimmed(edge.edgeId) ? " is-dimmed" : ""}`}
                    type="button"
                    aria-pressed={selectedEdgeId === edge.edgeId}
                    aria-label={`${edge.label} from ${source.title} to ${other?.title ?? otherId}. Needs review. Inspect support from both sides.`}
                    data-focus-trigger={focusTriggerId("mobile-relation", selection)}
                    onClick={(event) => onFocus(selection, event.currentTarget)}
                    onKeyDown={(event) => {
                      const trigger = event.currentTarget;
                      activateWithKeyboard(event, () => onFocus(selection, trigger));
                    }}
                  >
                    <span>{edge.label}</span>
                    <small>To {other?.title ?? otherId} · Needs review</small>
                    <strong>Inspect support from both sides</strong>
                  </button>
                );
              })}
            </li>
          );
        })}
      </ol>
      <div className="mobile-open-questions">
        {map.questions.map((question, index) => (
          <QuestionMapNode
            key={question.nodeId}
            question={question}
            index={index}
            selected={selectedNodeId === question.nodeId}
            dimmed={nodeIsDimmed(question.nodeId)}
            connectionDimmed={false}
            connectionLabel={questionConnectionLabel(map, question)}
            triggerSurface="mobile-map"
            onFocus={onFocus}
          />
        ))}
      </div>
    </section>
  );
}

interface SpatialNodeBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

function measureSpatialConnections(
  stage: HTMLElement,
  nodes: Map<string, HTMLElement>,
  map: InvestigationMap,
): SpatialConnectionGeometry {
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) return EMPTY_SPATIAL_GEOMETRY;
  const boxes = new Map<string, SpatialNodeBox>();
  for (const [nodeId, node] of nodes) {
    const rect = node.getBoundingClientRect();
    boxes.set(nodeId, {
      left: rect.left - stageRect.left,
      right: rect.right - stageRect.left,
      top: rect.top - stageRect.top,
      bottom: rect.bottom - stageRect.top,
      centerX: rect.left - stageRect.left + rect.width / 2,
      centerY: rect.top - stageRect.top + rect.height / 2,
    });
  }

  const occupiedLabelBoxes: SpatialNodeBox[] = [];
  const relations = map.relationEdges.flatMap((edge) => {
    const from = boxes.get(edge.fromNodeId);
    const to = boxes.get(edge.toNodeId);
    if (!from || !to) return [];
    const horizontal = Math.abs(to.centerX - from.centerX) >= 54;
    const directionX = to.centerX >= from.centerX ? 1 : -1;
    const directionY = to.centerY >= from.centerY ? 1 : -1;
    const parallelOffset = (edge.parallelIndex - (edge.parallelCount - 1) / 2) * 22;
    const start = horizontal
      ? { x: directionX > 0 ? from.right : from.left, y: from.centerY }
      : { x: from.centerX, y: directionY > 0 ? from.bottom : from.top };
    const end = horizontal
      ? { x: directionX > 0 ? to.left : to.right, y: to.centerY }
      : { x: to.centerX, y: directionY > 0 ? to.top : to.bottom };
    const path = horizontal
      ? horizontalConnectionPath(start, end, parallelOffset)
      : verticalConnectionPath(start, end, parallelOffset);
    const label = relationLabelPoint(
      start,
      end,
      horizontal,
      parallelOffset,
      [...boxes.values(), ...occupiedLabelBoxes],
      stageRect.width,
      stageRect.height,
    );
    occupiedLabelBoxes.push(labelCollisionBox(label));
    return [{ edgeId: edge.edgeId, path, start, end, label }];
  });

  const questions = map.questionEdges.flatMap((edge) => {
    const from = boxes.get(edge.fromNodeId);
    const to = boxes.get(edge.toNodeId);
    if (!from || !to) return [];
    const start = { x: from.centerX, y: from.bottom };
    const end = { x: to.centerX, y: to.top };
    return [{
      edgeId: edge.edgeId,
      path: verticalConnectionPath(start, end, 0),
      start,
      end,
    }];
  });

  return {
    width: Math.round(stageRect.width),
    height: Math.round(stageRect.height),
    relations,
    questions,
  };
}

function horizontalConnectionPath(
  start: SpatialPoint,
  end: SpatialPoint,
  offset: number,
): string {
  const controlX = (start.x + end.x) / 2 + offset;
  return `M ${rounded(start.x)} ${rounded(start.y)} C ${rounded(controlX)} ${rounded(start.y)}, ${rounded(controlX)} ${rounded(end.y)}, ${rounded(end.x)} ${rounded(end.y)}`;
}

function verticalConnectionPath(
  start: SpatialPoint,
  end: SpatialPoint,
  offset: number,
): string {
  const controlY = (start.y + end.y) / 2 + offset;
  return `M ${rounded(start.x)} ${rounded(start.y)} C ${rounded(start.x)} ${rounded(controlY)}, ${rounded(end.x)} ${rounded(controlY)}, ${rounded(end.x)} ${rounded(end.y)}`;
}

function relationLabelPoint(
  start: SpatialPoint,
  end: SpatialPoint,
  horizontal: boolean,
  offset: number,
  occupied: SpatialNodeBox[],
  stageWidth: number,
  stageHeight: number,
): SpatialPoint {
  const fractions = [0.5, 0.35, 0.65, 0.25, 0.75];
  const candidates = fractions.map((fraction) => {
    const point = horizontal
      ? pointOnHorizontalConnection(start, end, offset, fraction)
      : pointOnVerticalConnection(start, end, offset, fraction);
    return {
      x: clamp(point.x + (horizontal ? 0 : 74 + offset), 92, stageWidth - 92),
      y: clamp(point.y, 42, stageHeight - 42),
    };
  });
  return candidates.find((candidate) => (
    occupied.every((box) => !spatialBoxesOverlap(labelCollisionBox(candidate), box, 6))
  )) ?? candidates[0];
}

function pointOnHorizontalConnection(
  start: SpatialPoint,
  end: SpatialPoint,
  offset: number,
  fraction: number,
): SpatialPoint {
  const controlX = (start.x + end.x) / 2 + offset;
  return cubicPoint(
    start,
    { x: controlX, y: start.y },
    { x: controlX, y: end.y },
    end,
    fraction,
  );
}

function pointOnVerticalConnection(
  start: SpatialPoint,
  end: SpatialPoint,
  offset: number,
  fraction: number,
): SpatialPoint {
  const controlY = (start.y + end.y) / 2 + offset;
  return cubicPoint(
    start,
    { x: start.x, y: controlY },
    { x: end.x, y: controlY },
    end,
    fraction,
  );
}

function cubicPoint(
  start: SpatialPoint,
  firstControl: SpatialPoint,
  secondControl: SpatialPoint,
  end: SpatialPoint,
  fraction: number,
): SpatialPoint {
  const inverse = 1 - fraction;
  return {
    x: inverse ** 3 * start.x
      + 3 * inverse ** 2 * fraction * firstControl.x
      + 3 * inverse * fraction ** 2 * secondControl.x
      + fraction ** 3 * end.x,
    y: inverse ** 3 * start.y
      + 3 * inverse ** 2 * fraction * firstControl.y
      + 3 * inverse * fraction ** 2 * secondControl.y
      + fraction ** 3 * end.y,
  };
}

function labelCollisionBox(point: SpatialPoint): SpatialNodeBox {
  const halfWidth = 88;
  const halfHeight = 40;
  return {
    left: point.x - halfWidth,
    right: point.x + halfWidth,
    top: point.y - halfHeight,
    bottom: point.y + halfHeight,
    centerX: point.x,
    centerY: point.y,
  };
}

function spatialBoxesOverlap(
  left: SpatialNodeBox,
  right: SpatialNodeBox,
  gap: number,
): boolean {
  return left.left < right.right + gap
    && left.right > right.left - gap
    && left.top < right.bottom + gap
    && left.bottom > right.top - gap;
}

function questionConnectionLabel(
  map: InvestigationMap,
  question: InvestigationQuestionNode,
): string {
  const labels = question.targetNodeIds.map((nodeId) => {
    if (nodeId === map.topic.nodeId) return "topic root (unknown reference)";
    return map.sources.find((source) => source.nodeId === nodeId)?.title ?? nodeId;
  });
  return `Evidence gap from ${labels.join(" · ")}`;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function ThreadTraceSummary({
  map,
  trace,
  selectedNodeId,
}: {
  map: InvestigationMap;
  trace: MapHighlightState;
  selectedNodeId: string;
}) {
  const sourceTitles = map.sources
    .filter((source) => trace.nodeIds.includes(source.nodeId))
    .map((source) => source.title);
  const questions = map.questions.filter((question) => trace.nodeIds.includes(question.nodeId));
  return (
    <section className="thread-trace-summary" aria-labelledby="thread-trace-title">
      <p className="eyebrow">Viewing operation only</p>
      <h4 id="thread-trace-title">Thread trace</h4>
      <p>Selected node: {mapNodeLabel(map, selectedNodeId)}</p>
      <dl>
        <div><dt>Connected source nodes</dt><dd>{sourceTitles.length}</dd></div>
        <div><dt>Direct relation edges</dt><dd>{trace.relationEdgeIds.length}</dd></div>
        <div><dt>Related open questions</dt><dd>{questions.length}</dd></div>
      </dl>
      <p className="trace-detail">{sourceTitles.join(" · ") || "No connected source node"}</p>
      <small>The prepared and review-candidate records are unchanged; unrelated context remains visible but dimmed.</small>
    </section>
  );
}

function selectionHighlightState(
  map: InvestigationMap,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
): MapHighlightState | null {
  if (selectedNodeId) return deriveThreadTrace(map, selectedNodeId);
  if (!selectedEdgeId) return null;
  const edge = map.relationEdges.find((item) => item.edgeId === selectedEdgeId);
  if (!edge) return null;
  const nodeIds = [edge.fromNodeId, edge.toNodeId];
  const questionEdges = map.questionEdges.filter((item) => nodeIds.includes(item.fromNodeId));
  return {
    nodeIds: [...nodeIds, ...questionEdges.map((item) => item.toNodeId)],
    relationEdgeIds: [edge.edgeId],
    questionEdgeIds: questionEdges.map((item) => item.edgeId),
  };
}

function coverageLensesForMap(map: InvestigationMap): CoverageLens[] {
  const lenses: CoverageLens[] = ["all", "baseline"];
  if (map.sources.some((source) => source.discoveryPass === "coverage_expansion")) {
    lenses.push("coverage_expansion");
  }
  lenses.push(
    "official_established",
    "local_firsthand",
    "challenges_corrections",
    "open_questions",
  );
  return lenses;
}

function preparedLensLabel(lens: CoverageLens, prepared: boolean): string {
  if (!prepared) return COVERAGE_LENS_LABELS[lens];
  if (lens === "all") return "Complete prepared set";
  if (lens === "baseline") return "Prepared baseline";
  if (lens === "coverage_expansion") return "Prepared expanded set";
  return COVERAGE_LENS_LABELS[lens];
}

function mobileEdgesAfterSource(
  map: InvestigationMap,
  sourceId: string,
): InvestigationRelationEdge[] {
  const columnById = new Map(map.sources.map((source) => [source.nodeId, source.column]));
  return map.relationEdges.filter((edge) => {
    const fromColumn = columnById.get(edge.fromNodeId) ?? Number.MAX_SAFE_INTEGER;
    const toColumn = columnById.get(edge.toNodeId) ?? Number.MAX_SAFE_INTEGER;
    const earlierId = fromColumn <= toColumn ? edge.fromNodeId : edge.toNodeId;
    return earlierId === sourceId;
  });
}

function questionEdgesFor(map: InvestigationMap, questionNodeId: string) {
  return map.questionEdges.filter((edge) => edge.toNodeId === questionNodeId);
}

function mapNodeLabel(map: InvestigationMap, nodeId: string): string {
  if (map.topic.nodeId === nodeId) return map.topic.title;
  return map.sources.find((source) => source.nodeId === nodeId)?.title
    ?? map.questions.find((question) => question.nodeId === nodeId)?.question
    ?? nodeId;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function activateWithKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  action: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}
