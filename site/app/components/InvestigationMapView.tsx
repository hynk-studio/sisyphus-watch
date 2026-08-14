import type { CSSProperties } from "react";
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
import type { FocusSelection } from "./investigation-types";

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
  onFocus: (selection: FocusSelection) => void;
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
          <div>
            {selectedNodeId && !threadTraceActive ? (
              <button type="button" onClick={onTraceThread}>Trace this thread</button>
            ) : null}
            <button type="button" onClick={onShowFullMap}>Show full map</button>
          </div>
        </div>
      ) : null}

      {threadTraceActive && trace ? (
        <ThreadTraceSummary map={map} trace={trace} selectedNodeId={selectedNodeId ?? ""} />
      ) : null}

      <div
        className="desktop-map"
        aria-label="Investigation map ordered by source role and selected time axis"
      >
        <article className="topic-node">
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
                      onFocus={onFocus}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <RelationLedger
          map={map}
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
                onFocus={onFocus}
              />
            ))}
          </div>
        </section>
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
  onFocus,
}: {
  source: InvestigationSourceNode;
  selected: boolean;
  dimmed: boolean;
  style?: CSSProperties;
  onFocus: (selection: FocusSelection) => void;
}) {
  return (
    <article
      className={`map-source-node${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
      data-map-state={selected ? "selected" : dimmed ? "dimmed" : "in context"}
      style={style}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${source.sourceRole} source node: ${source.title}. ${source.selectedTimeAxisLabel}: ${source.selectedTime ? formatDate(source.selectedTime) : "Time unavailable"}. ${selected ? "Selected" : "Not selected"}.`}
        onClick={() => onFocus({ kind: "source", id: source.sourceId, label: source.title })}
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
  onFocus,
}: {
  question: InvestigationQuestionNode;
  index: number;
  selected: boolean;
  dimmed: boolean;
  connectionDimmed: boolean;
  onFocus: (selection: FocusSelection) => void;
}) {
  return (
    <article className={`map-question-node${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}>
      <span className={`question-connector${connectionDimmed ? " is-dimmed" : ""}`}>
        Related evidence gap
      </span>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Open question node ${index + 1}: ${question.question}. ${selected ? "Selected" : "Not selected"}.`}
        onClick={() => onFocus({
          kind: "unresolved_question",
          id: question.questionId,
          label: `Open question ${index + 1}`,
        })}
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

function RelationLedger({
  map,
  selectedEdgeId,
  relationIsDimmed,
  onFocus,
}: {
  map: InvestigationMap;
  selectedEdgeId: string | null;
  relationIsDimmed: (edgeId: string) => boolean;
  onFocus: (selection: FocusSelection) => void;
}) {
  return (
    <section className="relation-ledger" aria-labelledby="relation-ledger-title">
      <div className="lane-heading">
        <h4 id="relation-ledger-title">Candidate connections</h4>
        <span>{map.relationEdges.length} inspectable relation{map.relationEdges.length === 1 ? "" : "s"}</span>
      </div>
      {map.relationEdges.length ? (
        <ol>
          {map.relationEdges.map((edge) => {
            const from = map.sources.find((source) => source.nodeId === edge.fromNodeId);
            const to = map.sources.find((source) => source.nodeId === edge.toNodeId);
            const selected = selectedEdgeId === edge.edgeId;
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
                  onClick={() => onFocus({ kind: "relation", id: edge.relationId, label: edge.label })}
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
    </section>
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
  onFocus: (selection: FocusSelection) => void;
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
                onFocus={onFocus}
              />
              {outgoing.map((edge) => {
                const otherId = edge.fromNodeId === source.nodeId
                  ? edge.toNodeId
                  : edge.fromNodeId;
                const other = map.sources.find((item) => item.nodeId === otherId);
                return (
                  <button
                    key={edge.edgeId}
                    className={`mobile-relation-label${selectedEdgeId === edge.edgeId ? " is-selected" : ""}${relationIsDimmed(edge.edgeId) ? " is-dimmed" : ""}`}
                    type="button"
                    aria-pressed={selectedEdgeId === edge.edgeId}
                    onClick={() => onFocus({ kind: "relation", id: edge.relationId, label: edge.label })}
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
            onFocus={onFocus}
          />
        ))}
      </div>
    </section>
  );
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
      <small>The canonical/candidate packet is unchanged; unrelated context remains visible but dimmed.</small>
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
