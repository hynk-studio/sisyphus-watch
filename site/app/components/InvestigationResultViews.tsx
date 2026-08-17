import {
  TIME_AXES,
  TIME_AXIS_LABELS,
  actorLabel,
  discoveryLaneLabel,
  groupTimelineRowsByPrecision,
  orderTimelineRows,
  recordBoundaryLabel,
  sourceContentLabel,
  sourceCoverageLabel,
  sourceCoverageNote,
  sourceRoleLabel,
  timePrecision,
  timeValue,
  type TimeAxis,
} from "../lib/experience";
import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import { DISCOVERY_LANES } from "../lib/source-profile";
import { formatReviewTimestamp } from "../lib/temporal";
import {
  focusTriggerId,
  type FocusHandler,
} from "./investigation-types";

export function TimelineView({
  packet,
  timeAxis,
  onTimeAxisChange,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  timeAxis: TimeAxis;
  onTimeAxisChange: (axis: TimeAxis) => void;
  onFocus: FocusHandler;
}) {
  const rows = orderTimelineRows(packet.event_timeline_rows, timeAxis);
  const availableRows = rows.filter((row) => timeValue(row, timeAxis));
  const unavailableRows = rows.filter((row) => !timeValue(row, timeAxis));
  const availableGroups = groupTimelineRowsByPrecision(availableRows, timeAxis);
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <p className="eyebrow">Temporal view</p>
          <h3>Claims found in sources over time</h3>
          <p>
            Choose one explicit axis. Missing values remain in a labeled Time
            unavailable region; no other axis is substituted. Same-day mixed
            precision is grouped: exact instants keep clock order, while
            day-level records have no implied within-day position.
          </p>
        </div>
        <label className="axis-control" htmlFor="time-axis">
          Selected time axis
          <select
            id="time-axis"
            value={timeAxis}
            onChange={(event) => onTimeAxisChange(event.target.value as TimeAxis)}
          >
            {TIME_AXES.map((axis) => (
              <option key={axis} value={axis}>{TIME_AXIS_LABELS[axis]}</option>
            ))}
          </select>
        </label>
      </div>
      {rows.length ? (
        <>
          <TimelinePrecisionGroups
            packet={packet}
            groups={availableGroups}
            timeAxis={timeAxis}
            onFocus={onFocus}
          />
          {unavailableRows.length ? (
            <section className="time-unavailable-region" aria-labelledby="time-unavailable-title">
              <h4 id="time-unavailable-title">Time unavailable</h4>
              <p>
                {unavailableRows.length} row{unavailableRows.length === 1 ? " has" : "s have"}
                {" "}no explicit {TIME_AXIS_LABELS[timeAxis].toLowerCase()} value.
              </p>
              <TimelineRows
                packet={packet}
                rows={unavailableRows}
                timeAxis={timeAxis}
                onFocus={onFocus}
              />
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No claim timeline"
          message="This packet contains no actor-claim occurrences, so no timeline rows were created."
        />
      )}
    </div>
  );
}

function TimelinePrecisionGroups({
  packet,
  groups,
  timeAxis,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  groups: ReturnType<typeof groupTimelineRowsByPrecision>;
  timeAxis: TimeAxis;
  onFocus: FocusHandler;
}) {
  return groups.map((group) => {
    if (group.precision !== "mixed") {
      return (
        <TimelineRows
          key={group.calendarDate}
          packet={packet}
          rows={group.items}
          timeAxis={timeAxis}
          onFocus={onFocus}
        />
      );
    }
    const exactRows = group.items.filter(
      (row) => timePrecision(row, timeAxis) === "instant",
    );
    const dayRows = group.items.filter(
      (row) => timePrecision(row, timeAxis) === "day",
    );
    return (
      <section
        className="mixed-precision-time-group"
        aria-label={`${group.calendarDate} same-day mixed precision group`}
        key={group.calendarDate}
      >
        <p className="eyebrow">Same-day mixed precision group</p>
        <h4>{formatReviewTimestamp(
          `${group.calendarDate}T00:00:00.000Z`,
          "day",
        )}</h4>
        <p>
          Exact instants are clock-ordered within this date. Day-level records
          are review peers and are not positioned before or after them.
        </p>
        <div className="mixed-precision-subgroup">
          <h5>Exact instants · clock order</h5>
          <TimelineRows
            packet={packet}
            rows={exactRows}
            timeAxis={timeAxis}
            onFocus={onFocus}
          />
        </div>
        <div className="mixed-precision-subgroup day-level-subgroup">
          <h5>Day-level records · no within-day position</h5>
          <TimelineRows
            packet={packet}
            rows={dayRows}
            timeAxis={timeAxis}
            onFocus={onFocus}
          />
        </div>
      </section>
    );
  });
}

function TimelineRows({
  packet,
  rows,
  timeAxis,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  rows: SiteReadyCasePacket["event_timeline_rows"];
  timeAxis: TimeAxis;
  onFocus: FocusHandler;
}) {
  return (
    <ol className="temporal-list">
      {rows.map((row, index) => {
        const occurrence = packet.claim_occurrences.find((item) =>
          row.occurrence_ids.includes(item.occurrence_id),
        );
        const selectedTime = timeValue(row, timeAxis);
        const selection = {
          kind: "timeline_row" as const,
          id: row.timeline_row_id,
          label: `Timeline row ${index + 1}`,
        };
        return (
          <li key={row.timeline_row_id} className="temporal-row">
            <div className="time-rail" aria-hidden="true">
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
            <article>
              <div className="row-meta">
                <span>{TIME_AXIS_LABELS[timeAxis]}</span>
                <time dateTime={selectedTime ?? undefined}>
                  {formatReviewTimestamp(selectedTime, timePrecision(row, timeAxis))}
                </time>
                <span className={`record-state record-${row.status}`}>
                  {recordBoundaryLabel(row.status)}
                </span>
              </div>
              <h4>{actorLabel(occurrence?.actor ?? null)}</h4>
              <blockquote>{row.summary}</blockquote>
              <button
                className="detail-button"
                type="button"
                aria-label={`View all four timestamps: ${actorLabel(occurrence?.actor ?? null)} — ${row.summary}`}
                data-focus-trigger={focusTriggerId("timeline-row", selection)}
                onClick={(event) => onFocus(selection, event.currentTarget)}
              >
                View all four timestamps <span aria-hidden="true">→</span>
              </button>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

export function SourcesView({
  packet,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  onFocus: FocusHandler;
}) {
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <p className="eyebrow">Provenance</p>
          <h3>Sources and snapshot boundaries</h3>
          <p>
            Each source says what was captured, what was only summarized, and what
            its record cannot prove.
          </p>
        </div>
      </div>
      <ol className="source-grid">
        {packet.source_snapshot_summaries.map((source, index) => {
          const candidateSummary = source.web_search_grounded_candidate_summary;
          const evidence = candidateSummary ?? source.evidence_excerpt;
          const selection = {
            kind: "source" as const,
            id: source.source_id,
            label: source.title,
          };
          return (
            <li key={source.source_id} className="source-card">
              <div className="source-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="source-card-body">
                <div className="source-status-row">
                  <span className="source-role-badge">{sourceRoleLabel(source)}</span>
                  <span className={`record-state record-${source.record_status}`}>
                    {recordBoundaryLabel(source.record_status)}
                  </span>
                </div>
                <h4>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title} <span className="external-mark" aria-label="opens in a new tab">↗</span>
                    </a>
                  ) : source.title}
                </h4>
                <p className="source-publisher">{source.publisher} · {source.domain}</p>
                <dl className="source-times">
                  <div>
                    <dt>Publication time</dt>
                    <dd>{formatReviewTimestamp(source.published_at, source.published_at_precision)}</dd>
                  </div>
                </dl>
                <div className={`provenance-note ${candidateSummary ? "provenance-partial" : ""}`}>
                  <strong>{sourceContentLabel(source)}</strong>
                  <p>{evidence ?? "No bounded evidence or candidate summary is available."}</p>
                </div>
                <div className="source-why">
                  <strong>Why this source matters</strong>
                  <p>{source.source_selection.why_included}</p>
                </div>
                <button
                  className="detail-button"
                  type="button"
                  aria-label={`${source.source_text_captured ? "Inspect source evidence" : "View source details"}: ${source.title}`}
                  data-focus-trigger={focusTriggerId("sources-card", selection)}
                  onClick={(event) => onFocus(selection, event.currentTarget)}
                >
                  {source.source_text_captured ? "Inspect source evidence" : "View source details"}
                  {" "}<span aria-hidden="true">→</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function MethodView({ packet }: { packet: SiteReadyCasePacket }) {
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <p className="eyebrow">Method and coverage</p>
          <h3>What this map contains—and what it cannot establish</h3>
          <p>
            Coverage metadata, record boundaries, and workload limits remain
            inspectable without crowding the map.
          </p>
        </div>
        <span className="review-label">{sourceCoverageLabel(packet)}</span>
      </div>
      <section className="metric-grid" aria-label="Packet counts">
        <Metric value={packet.actual_source_count} label="Sources" />
        <Metric value={packet.claim_occurrences.length} label="Actor-claim occurrences" />
        <Metric value={packet.relation_candidates.length} label="Candidate relations" />
        <Metric value={packet.unresolved_questions.length} label="Open questions" />
      </section>
      <section className="standard-card coverage-card" aria-labelledby="source-coverage-title">
        <p className="eyebrow">Source coverage</p>
        <h3 id="source-coverage-title">Represented source roles</h3>
        <dl className="coverage-lanes">
          {DISCOVERY_LANES.map((lane) => (
            <div key={lane}>
              <dt>{discoveryLaneLabel(lane)}</dt>
              <dd>{packet.coverage_summary.lane_counts[lane]}</dd>
            </div>
          ))}
        </dl>
        {packet.coverage_summary.coverage_basis === "live_discovery" ? (
          <div className="coverage-summary-line">
            <span>{packet.coverage_summary.baseline_returned}/{packet.coverage_summary.baseline_requested} baseline results</span>
            <span>{packet.coverage_summary.expansion_returned}/{packet.coverage_summary.expansion_requested} expansion results</span>
            <span>{packet.coverage_summary.unique_domain_count} unique domains</span>
            <span>{packet.coverage_summary.duplicate_url_count} duplicate URLs removed</span>
          </div>
        ) : (
          <div className="coverage-summary-line">
            <span>{packet.coverage_summary.fixture_source_count} curated prepared sources</span>
          </div>
        )}
        <p className="card-note">{sourceCoverageNote(packet)}</p>
      </section>
      <div className="method-grid">
        <section className="standard-card">
          <p className="eyebrow">Separate records</p>
          <h3>Findings, actions, and claims stay separate</h3>
          <dl className="lane-list">
            <div><dt>Source-bound findings</dt><dd>{packet.source_bound_findings.length}</dd></div>
            <div><dt>Actor claims</dt><dd>{packet.actor_claims.length}</dd></div>
            <div><dt>Actions</dt><dd>{packet.actions.length}</dd></div>
            <div><dt>Standalone time candidates</dt><dd>{packet.time_candidates.length}</dd></div>
          </dl>
          <p className="card-note">
            Only statements attributed to an actor become claim records. Findings
            and actions stay attached to their sources and do not automatically
            create claim relationships.
          </p>
        </section>
        <section className="standard-card">
          <p className="eyebrow">Bounded work</p>
          <h3>Deterministic and reviewable</h3>
          <dl className="lane-list">
            <div><dt>Theoretical pairs</dt><dd>{packet.bounded_work_summary.theoretical_pair_count}</dd></div>
            <div><dt>Prefilter candidates</dt><dd>{packet.bounded_work_summary.prefilter_candidate_count}</dd></div>
            <div><dt>Hard pair limit</dt><dd>{packet.bounded_work_summary.configured_maximum_pair_count}</dd></div>
            <div><dt>Model-classified pairs</dt><dd>{packet.bounded_work_summary.model_classified_count}</dd></div>
          </dl>
          <p className="card-note">
            Public runs accept at most 5 sources. Internal analysis retains an
            8-source hard maximum and 64 relation-pair workload. Browser focus
            and coverage lenses cannot mutate the packet.
          </p>
        </section>
      </div>
      <section className="limitations-card" aria-labelledby="limitations-title">
        <div>
          <p className="eyebrow">Limits</p>
          <h3 id="limitations-title">What this packet does not establish</h3>
        </div>
        <ul>
          {packet.limitations.map((limitation, index) => (
            <li key={`${index}-${limitation}`}>{limitation}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{message}</p></div>;
}
