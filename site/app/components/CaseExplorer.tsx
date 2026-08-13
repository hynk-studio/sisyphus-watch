"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { AnalysisRoutePayload, AnalysisRunPacket } from "../lib/analysis/contracts";
import {
  DISCOVERY_LANES,
  type DiscoveryProfile,
} from "../lib/source-profile";
import {
  EXPERIENCE_VIEWS,
  TIME_AXES,
  TIME_AXIS_LABELS,
  VIEW_LABELS,
  actorLabel,
  discoveryLaneLabel,
  hasFocusedDetailKey,
  modeLabel,
  orderTimelineRows,
  recordBoundaryLabel,
  relationDisplayLabel,
  relatedRecordLabel,
  sourceContentLabel,
  sourceCoverageLabel,
  sourceCoverageNote,
  sourceRoleLabel,
  timeValue,
  type ExperienceView,
  type TimeAxis,
} from "../lib/experience";
import type {
  SiteDetailKind,
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "../lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../lib/lineage/details";

export interface FocusSelection {
  kind: SiteDetailKind;
  id: string;
  label: string;
}

export function CaseExplorer({
  preparedCase,
  liveEnabled = false,
}: {
  preparedCase: SiteReadyCasePacket;
  liveEnabled?: boolean;
}) {
  const [packet, setPacket] = useState(preparedCase);
  const [activeView, setActiveView] = useState<ExperienceView>("overview");
  const [timeAxis, setTimeAxis] = useState<TimeAxis>("event_time");
  const [question, setQuestion] = useState("");
  const [sourceLimit, setSourceLimit] = useState(5);
  const [discoveryProfile, setDiscoveryProfile] =
    useState<DiscoveryProfile>("standard");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [focus, setFocus] = useState<FocusSelection | null>(null);
  const [focusedDetail, setFocusedDetail] = useState<SiteReadyCaseDetail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");

  function closeDetail() {
    setFocus(null);
    setFocusedDetail(null);
    setDetailState("idle");
  }

  async function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!liveEnabled) return;
    setRouteError(null);
    setIsLoading(true);
    closeDetail();
    try {
      const response = await fetch("/api/lineage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, sourceLimit, discoveryProfile }),
      });
      const payload = (await response.json()) as
        | SiteReadyCasePacket
        | Extract<AnalysisRoutePayload, { status: "error" }>;
      if (payload.status === "error") {
        setRouteError(payload.error.message);
        return;
      }
      if (!response.ok) {
        setRouteError("The bounded analysis request did not complete.");
        return;
      }
      setPacket(payload as SiteReadyCasePacket);
      setActiveView("overview");
    } catch {
      setRouteError("The same-Site analysis route is unavailable.");
    } finally {
      setIsLoading(false);
    }
  }

  function restorePreparedCase() {
    setPacket(preparedCase);
    setRouteError(null);
    setActiveView("overview");
    closeDetail();
  }

  async function openDetail(selection: FocusSelection) {
    if (focus?.kind === selection.kind && focus.id === selection.id) {
      closeDetail();
      return;
    }
    if (!hasFocusedDetailKey(packet, selection.kind, selection.id)) return;
    setFocus(selection);
    setFocusedDetail(null);
    const local = getSiteReadyCaseDetail(packet, selection.kind, selection.id);
    if (packet.mode === "live") {
      setFocusedDetail(local);
      setDetailState(local ? "idle" : "error");
      return;
    }
    setDetailState("loading");
    try {
      const params = new URLSearchParams({ focus: selection.kind, id: selection.id });
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
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + EXPERIENCE_VIEWS.length) % EXPERIENCE_VIEWS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = EXPERIENCE_VIEWS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextView = EXPERIENCE_VIEWS[nextIndex];
    selectView(nextView);
    requestAnimationFrame(() => document.getElementById(`view-tab-${nextView}`)?.focus());
  }

  const runNotice = getRunNotice(packet, isLoading, routeError);

  return (
    <main className="site-shell">
      <header className="masthead" aria-label="Sisyphus Watch">
        <a className="wordmark" href="#top" aria-label="Sisyphus Watch home">
          <span className="wordmark-mark" aria-hidden="true">S</span>
          <span>Sisyphus Watch</span>
        </a>
        <span className="header-note">Public-interest source lineage</span>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Version history for public information</p>
          <h1 id="hero-title">See what changed, where it came from, and what is still unclear.</h1>
          <p className="lede">
            Sisyphus Watch helps residents, caregivers, community organizers, nonprofit staff, and local journalists follow changing guidance without treating uncertain evidence as verified truth.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#case-workspace">Explore the prepared case</a>
            <span className="hero-assurance">Works without an API key or network</span>
          </div>
        </div>
        <aside className="prepared-preview" aria-label="Prepared case preview">
          <div className="preview-heading">
            <span className="mode-badge mode-prepared">Prepared case</span>
            <span className="boundary-badge">Deterministic fixture</span>
          </div>
          <h2>Cooling centers during a severe heatwave</h2>
          <ol className="preview-steps">
            <li><span>01</span> City availability claim</li>
            <li><span>02</span> Community access challenge</li>
            <li><span>03</span> Later city update</li>
            <li><span>04</span> Resident impact still unresolved</li>
          </ol>
          <p className="preview-note">Optional live analysis is bounded, server-only, and always review-only.</p>
        </aside>
      </section>

      <section className="workspace" id="case-workspace" aria-labelledby="case-title">
        <div className="case-heading">
          <div>
            <div className="case-kicker-row">
              <span className={`mode-badge mode-${packet.mode}`}>{modeLabel(packet)}</span>
              <span className="boundary-badge">Review-only · Nothing is accepted automatically</span>
            </div>
            <p className="eyebrow">Current case</p>
            <h2 id="case-title">{packet.title}</h2>
            <p className="case-question">{packet.normalized_public_interest_question}</p>
          </div>
          {packet.mode !== "deterministic" ? (
            <button className="quiet-button" type="button" onClick={restorePreparedCase}>Return to prepared case</button>
          ) : null}
        </div>

        <div className={`run-notice run-notice-${runNotice.tone}`} role="status" aria-live="polite">
          <strong>{runNotice.title}</strong><span>{runNotice.message}</span>
        </div>

        <nav className="view-nav" aria-label="Case views">
          <div className="tab-list" role="tablist" aria-label="Case result views">
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
                {view === "unresolved" ? <span className="tab-count" aria-label={`${packet.unresolved_questions.length} items`}>{packet.unresolved_questions.length}</span> : null}
              </button>
            ))}
          </div>
        </nav>

        <div className={`result-layout${focus ? " has-detail" : ""}`}>
          <section id="case-view-panel" className="view-panel" role="tabpanel" aria-labelledby={`view-tab-${activeView}`} tabIndex={0}>
            {activeView === "overview" ? (
              <OverviewView
                packet={packet}
                liveEnabled={liveEnabled}
                question={question}
                sourceLimit={sourceLimit}
                discoveryProfile={discoveryProfile}
                isLoading={isLoading}
                routeError={routeError}
                onQuestionChange={setQuestion}
                onSourceLimitChange={setSourceLimit}
                onDiscoveryProfileChange={setDiscoveryProfile}
                onSubmit={submitAnalysis}
              />
            ) : null}
            {activeView === "timeline" ? <TimelineView packet={packet} timeAxis={timeAxis} onTimeAxisChange={setTimeAxis} onFocus={openDetail} /> : null}
            {activeView === "lineage" ? <LineageView packet={packet} onFocus={openDetail} /> : null}
            {activeView === "sources" ? <SourcesView packet={packet} onFocus={openDetail} /> : null}
            {activeView === "unresolved" ? <UnresolvedView packet={packet} onFocus={openDetail} /> : null}
          </section>
          {focus ? <FocusedDetailPanel selection={focus} payload={focusedDetail} state={detailState} onClose={closeDetail} /> : null}
        </div>
      </section>

      <footer className="site-footer">
        <p>Sisyphus Watch keeps source records, candidate reasoning, and accepted fixture state visibly separate.</p>
        <p>Relation evidence never changes accepted state by itself.</p>
      </footer>
    </main>
  );
}

export function OverviewView({
  packet,
  liveEnabled,
  question,
  sourceLimit,
  discoveryProfile,
  isLoading,
  routeError,
  onQuestionChange,
  onSourceLimitChange,
  onDiscoveryProfileChange,
  onSubmit,
}: {
  packet: SiteReadyCasePacket;
  liveEnabled: boolean;
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
  isLoading: boolean;
  routeError: string | null;
  onQuestionChange: (value: string) => void;
  onSourceLimitChange: (value: number) => void;
  onDiscoveryProfileChange: (value: DiscoveryProfile) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const preparedCoolingCase =
    packet.case_id === "city_heatwave_cooling_centers" &&
    packet.coverage_summary.coverage_basis === "prepared_fixture";
  const preparedRoles = [
    "Official notice",
    "Community access challenge",
    "Official correction / update",
  ];
  const storyStages = preparedCoolingCase
    ? ["What happened", "Why it matters", "What happened"]
    : ["What the sources say", "What the sources say", "What the sources say"];
  const storyItems = packet.current_source_bound_candidate_synthesis
    .slice(0, 3)
    .map((summary, index) => ({
      stage: storyStages[index] ?? "What happened",
      role: preparedCoolingCase
        ? preparedRoles[index]
        : `Source-bound summary ${index + 1}`,
      summary,
    }));
  const impactQuestion =
    packet.unresolved_questions.find((item) =>
      item.question.toLowerCase().includes("reach vulnerable residents"),
    ) ?? packet.unresolved_questions[0];
  if (impactQuestion) {
    storyItems.push({
      stage: "What remains unresolved",
      role: preparedCoolingCase ? "Impact still unresolved" : "Open question",
      summary: impactQuestion.question,
    });
  }

  return (
    <div className="view-stack">
      <section className="synthesis-card" aria-labelledby="synthesis-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Current picture from the available sources</p>
            <h3 id="synthesis-title">What happened — and what is still unclear</h3>
          </div>
          <span className="review-label">{packet.mode === "deterministic" ? "Prepared case summary" : "Review-only summary"}</span>
        </div>
        <ol className="story-flow">
          {storyItems.map((item, index) => (
            <li key={`${item.role}-${item.summary}`}>
              <span className="story-stage">{item.stage}</span>
              <strong>{item.role}</strong>
              <p>{item.summary}</p>
              {index < storyItems.length - 1 ? <span className="story-arrow" aria-hidden="true">→</span> : null}
            </li>
          ))}
        </ol>
        <p className="boundary-callout">This view organizes what the available sources say. It does not independently verify the claims or decide what is true.</p>
      </section>

      <details className="method-card">
        <summary>
          <span>
            <strong>Method &amp; coverage</strong>
            <small>Source mix, record boundaries, and bounded review workload</small>
          </span>
          <span className="review-label">{sourceCoverageLabel(packet)}</span>
        </summary>
        <div className="method-card-body">
          <section className="metric-grid method-metrics" aria-label="Case counts">
            <Metric value={packet.actual_source_count} label="Sources" />
            <Metric value={packet.claim_occurrences.length} label="Claims found in sources" />
            <Metric value={packet.relation_candidates.length} label="Possible changes to review" />
            <Metric value={packet.unresolved_questions.length} label="Open questions" />
          </section>

          <section className="standard-card coverage-card" aria-labelledby="source-coverage-title">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Source coverage</p>
                <h3 id="source-coverage-title">What kinds of sources are represented?</h3>
              </div>
            </div>
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
                <span>{packet.coverage_summary.expansion_returned}/{packet.coverage_summary.expansion_requested} coverage-expansion results</span>
                <span>{packet.coverage_summary.unique_domain_count} unique domains</span>
                <span>{packet.coverage_summary.duplicate_url_count} duplicate URLs removed</span>
              </div>
            ) : (
              <div className="coverage-summary-line">
                <span>{packet.coverage_summary.fixture_source_count} curated prepared-case sources</span>
              </div>
            )}
            <p className="card-note">{sourceCoverageNote(packet)}</p>
          </section>

          <div className="overview-grid">
            <section className="standard-card" aria-labelledby="record-lanes-title">
              <p className="eyebrow">What we keep separate</p>
              <h3 id="record-lanes-title">Different record types stay distinct</h3>
              <dl className="lane-list">
                <div><dt>Source-bound findings</dt><dd>{packet.source_bound_findings.length}</dd></div>
                <div><dt>Actor claims</dt><dd>{packet.actor_claims.length}</dd></div>
                <div><dt>Actions</dt><dd>{packet.actions.length}</dd></div>
                <div><dt>Standalone time candidates</dt><dd>{packet.time_candidates.length}</dd></div>
              </dl>
              <p className="card-note">Only actual actor claims become claims found in sources. Findings, actions, and standalone time candidates keep their own record types.</p>
            </section>

            <section className="standard-card" aria-labelledby="bounds-title">
              <p className="eyebrow">Technical workload</p>
              <h3 id="bounds-title">Bounded for human review</h3>
              <dl className="lane-list">
                <div><dt>Theoretical pairs</dt><dd>{packet.bounded_work_summary.theoretical_pair_count}</dd></div>
                <div><dt>Prefilter candidates</dt><dd>{packet.bounded_work_summary.prefilter_candidate_count}</dd></div>
                <div><dt>Hard pair limit</dt><dd>{packet.bounded_work_summary.configured_maximum_pair_count}</dd></div>
                <div><dt>Model-classified</dt><dd>{packet.bounded_work_summary.model_classified_count}</dd></div>
              </dl>
              <p className="card-note">
                {packet.bounded_work_summary.configured_bound_reached
                  ? `${packet.bounded_work_summary.deferred_pair_count} pairs were deferred when the configured bound was reached.`
                  : "The configured relation-work bound was not reached."}
              </p>
            </section>
          </div>
        </div>
      </details>

      <section className={`analysis-card${liveEnabled ? "" : " analysis-card-compact"}`} aria-labelledby="analysis-title">
        {liveEnabled ? (
          <>
            <div className="analysis-intro">
              <p className="eyebrow">OpenAI-assisted live analysis</p>
              <h3 id="analysis-title">Ask one bounded public-interest question</h3>
              <p>The browser sends only the question, source limit, and selected discovery profile to a same-Site route. OpenAI requests stay server-side, and every live result remains a review-only candidate.</p>
              <ul className="safeguard-list">
                <li>Question: 12–500 characters</li>
                <li>Sources: default 5, hard maximum 8</li>
                <li>Relation work: hard maximum 64 pairs</li>
                <li>No arbitrary URLs, crawling, or visitor history</li>
              </ul>
            </div>
          <form className="analysis-form" onSubmit={onSubmit}>
            <label htmlFor="analysis-question">Public-interest question</label>
            <textarea
              id="analysis-question"
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              minLength={12}
              maxLength={500}
              placeholder="How has access to cooling centers changed during the current heatwave?"
              required
            />
            <div className="profile-control">
              <label htmlFor="discovery-profile">Discovery profile</label>
              <select
                id="discovery-profile"
                value={discoveryProfile}
                onChange={(event) =>
                  onDiscoveryProfileChange(event.target.value as DiscoveryProfile)
                }
              >
                <option value="standard">Standard review</option>
                <option value="coverage_expansion">Expand source coverage</option>
              </select>
              <p>
                {discoveryProfile === "coverage_expansion"
                  ? "Also seek primary, local, specialist, firsthand, contradictory, or corrective sources that ordinary authority-ranked search may under-surface."
                  : "Use one conventional, authority-oriented discovery pass. Coverage expansion also seeks primary, local, specialist, firsthand, contradictory, or corrective sources that ordinary authority-ranked search may under-surface."}
              </p>
            </div>
            <div className="analysis-controls">
              <label htmlFor="source-limit">Source limit</label>
              <select id="source-limit" value={sourceLimit} onChange={(event) => onSourceLimitChange(Number(event.target.value))}>
                <option value={3}>3 sources</option>
                <option value={5}>5 sources</option>
                <option value={8}>8 sources</option>
              </select>
              <button type="submit" disabled={isLoading}>{isLoading ? "Running bounded analysis…" : "Run live analysis"}</button>
            </div>
            <p className="form-note">Live search may be unavailable or return the prepared fallback. A fallback is never labeled live.</p>
            {routeError ? <p className="form-error" role="alert">{routeError}</p> : null}
          </form>
          </>
        ) : (
          <div className="disabled-live" role="status">
            <span className="disabled-icon" aria-hidden="true">—</span>
            <div>
              <p className="eyebrow">Optional workflow</p>
              <h3 id="analysis-title">OpenAI-assisted live analysis</h3>
              <p>The bounded live workflow is implemented but disabled in this public demo for a conservative release. The prepared case remains fully interactive.</p>
              <details className="live-explainer">
                <summary>How it works</summary>
                <p>When enabled, one question and a bounded source limit are sent to the same Site. Results remain review-only and never change accepted records automatically.</p>
              </details>
            </div>
          </div>
        )}
      </section>

      <section className="limitations-card" aria-labelledby="limitations-title">
        <div><p className="eyebrow">Limits and boundary</p><h3 id="limitations-title">What this case does not establish</h3></div>
        <ul>{packet.limitations.slice(0, 6).map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}</ul>
      </section>
    </div>
  );
}

export function TimelineView({
  packet,
  timeAxis,
  onTimeAxisChange,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  timeAxis: TimeAxis;
  onTimeAxisChange: (axis: TimeAxis) => void;
  onFocus: (selection: FocusSelection) => void;
}) {
  const rows = orderTimelineRows(packet.event_timeline_rows, timeAxis);
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <p className="eyebrow">Temporal view</p>
          <h3>Claims found in sources over time</h3>
          <p>Choose one explicit axis. Missing values stay unavailable; publication time is never substituted for event or assertion time.</p>
        </div>
        <label className="axis-control" htmlFor="time-axis">
          Selected time axis
          <select id="time-axis" value={timeAxis} onChange={(event) => onTimeAxisChange(event.target.value as TimeAxis)}>
            {TIME_AXES.map((axis) => <option key={axis} value={axis}>{TIME_AXIS_LABELS[axis]}</option>)}
          </select>
        </label>
      </div>
      {rows.length ? (
        <ol className="temporal-list">
          {rows.map((row, index) => {
            const occurrence = packet.claim_occurrences.find((item) => row.occurrence_ids.includes(item.occurrence_id));
            const selectedTime = timeValue(row, timeAxis);
            return (
              <li key={row.timeline_row_id} className="temporal-row">
                <div className="time-rail" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span></div>
                <article>
                  <div className="row-meta">
                    <span>{TIME_AXIS_LABELS[timeAxis]}</span>
                    <time dateTime={selectedTime ?? undefined}>{formatTimestamp(selectedTime)}</time>
                    <span className={`record-state record-${row.status}`}>{recordBoundaryLabel(row.status)}</span>
                  </div>
                  <h4>{actorLabel(occurrence?.actor ?? null)}</h4>
                  <blockquote>{row.summary}</blockquote>
                  <button className="detail-button" type="button" onClick={() => onFocus({ kind: "timeline_row", id: row.timeline_row_id, label: `Timeline row ${index + 1}` })}>
                    View all four timestamps <span aria-hidden="true">→</span>
                  </button>
                </article>
              </li>
            );
          })}
        </ol>
      ) : <EmptyState title="No claim timeline" message="This run contains no actual actor-claim occurrences, so no timeline rows were created." />}
    </div>
  );
}

export function LineageView({
  packet,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  onFocus: (selection: FocusSelection) => void;
}) {
  return (
    <div className="view-stack">
      <div className="view-intro lineage-intro">
        <div>
          <p className="eyebrow">What changed</p>
          <h3>How claims relate over time</h3>
          <p className="view-subtitle">Claim lineage across sources</p>
          <p>These labels come directly from the validated packet. Candidate relations organize review; they do not adjudicate truth or mutate canonical state.</p>
        </div>
        <div className="lineage-summary" aria-label="Lineage counts">
          <strong>{packet.candidate_claim_families.length}</strong> families
          <strong>{packet.claim_lineage_rows.length}</strong> links
        </div>
      </div>

      {packet.candidate_claim_families.length ? (
        <section className="family-strip" aria-labelledby="families-title">
          <h4 id="families-title">Related claims</h4>
          <div className="family-grid">
            {packet.candidate_claim_families.map((family, index) => (
              <button
                key={family.family_id}
                className="family-card"
                type="button"
                onClick={() => onFocus({ kind: "claim_family", id: family.family_id, label: `Claim family ${index + 1}` })}
              >
                <span>Family {String(index + 1).padStart(2, "0")}</span>
                <strong>{family.occurrence_ids.length} claim{family.occurrence_ids.length === 1 ? "" : "s"} found in sources</strong>
                <small>{family.unresolved ? "Grouping unresolved · review only" : "Candidate grouping · review only"}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {packet.claim_lineage_rows.length ? (
        <ol className="lineage-list">
          {packet.claim_lineage_rows.map((row, index) => {
            const from = packet.claim_occurrences.find((item) => item.occurrence_id === row.from_occurrence_id);
            const to = packet.claim_occurrences.find((item) => item.occurrence_id === row.to_occurrence_id);
            const fromSource = packet.source_snapshot_summaries.find((item) => item.source_id === from?.source_id);
            const toSource = packet.source_snapshot_summaries.find((item) => item.source_id === to?.source_id);
            return (
              <li key={row.lineage_row_id} className="lineage-card">
                <div className="lineage-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                <div className="claim-node claim-node-from">
                  <span className="node-label">Earlier source-bound claim</span>
                  <h4>{actorLabel(from?.actor ?? null)}</h4>
                  <blockquote>{from?.original_claim_text ?? "Claim text unavailable"}</blockquote>
                  <p>{fromSource?.title ?? "Source unavailable"}</p>
                </div>
                <div className="relation-bridge">
                  <span className={`relation-label relation-${row.relation_type}`}>{relationDisplayLabel(row.relation_type)}</span>
                  <span className="bridge-line" aria-hidden="true">→</span>
                  <small>Needs review</small>
                </div>
                <div className="claim-node claim-node-to">
                  <span className="node-label">Later related claim</span>
                  <h4>{actorLabel(to?.actor ?? null)}</h4>
                  <blockquote>{to?.original_claim_text ?? "Claim text unavailable"}</blockquote>
                  <p>{toSource?.title ?? "Source unavailable"}</p>
                </div>
                <div className="lineage-reason">
                  <p>{row.summary}</p>
                  <button className="detail-button" type="button" onClick={() => onFocus({ kind: "relation", id: row.relation_id, label: relationDisplayLabel(row.relation_type) })}>
                    Inspect support from both sides <span aria-hidden="true">→</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <EmptyState title="No claim lineage" message="This run contains no reviewable cross-source claim relations. Findings and actions remain available in their separate packet lanes." />}
    </div>
  );
}

export function SourcesView({
  packet,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  onFocus: (selection: FocusSelection) => void;
}) {
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <p className="eyebrow">Provenance</p>
          <h3>Sources and snapshot boundaries</h3>
          <p>Each source says what was captured, what was only summarized, and what its record cannot prove.</p>
        </div>
      </div>
      <ol className="source-grid">
        {packet.source_snapshot_summaries.map((source, index) => {
          const candidateSummary = source.web_search_grounded_candidate_summary;
          const evidence = candidateSummary ?? source.evidence_excerpt;
          return (
            <li key={source.source_id} className="source-card">
              <div className="source-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
              <div className="source-card-body">
                <div className="source-status-row">
                  <span className="source-role-badge">{sourceRoleLabel(source)}</span>
                  <span className={`record-state record-${source.record_status}`}>{recordBoundaryLabel(source.record_status)}</span>
                </div>
                <h4>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title} <span className="external-mark" aria-label="opens in a new tab">↗</span>
                    </a>
                  ) : source.title}
                </h4>
                <p className="source-publisher">{source.publisher}</p>
                <dl className="source-times">
                  <div><dt>Published</dt><dd>{formatTimestamp(source.published_at)}</dd></div>
                </dl>
                <div className={`provenance-note ${candidateSummary ? "provenance-partial" : ""}`}>
                  <strong>{sourceContentLabel(source)}</strong>
                  <p>{evidence ?? "No bounded evidence or candidate summary is available."}</p>
                </div>
                <div className="source-why">
                  <strong>Why this source matters</strong>
                  <p>{source.source_selection.why_included}</p>
                </div>
                <button className="detail-button" type="button" onClick={() => onFocus({ kind: "source", id: source.source_id, label: source.title })}>
                  {source.source_text_captured ? "Read demo source" : "View source details"} <span aria-hidden="true">→</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function UnresolvedView({
  packet,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  onFocus: (selection: FocusSelection) => void;
}) {
  return (
    <div className="view-stack">
      <div className="view-intro unresolved-intro">
        <div>
          <p className="eyebrow">Useful uncertainty</p>
          <h3>Open questions the available sources cannot yet answer</h3>
          <p>These are evidence gaps to investigate, not system errors. Related references show where the question came from.</p>
        </div>
      </div>
      {packet.unresolved_questions.length ? (
        <ol className="question-list">
          {packet.unresolved_questions.map((question, index) => (
            <li key={question.question_id} className="question-card">
              <span className="question-number">Open question {String(index + 1).padStart(2, "0")}</span>
              <h4>{question.question}</h4>
              <div className="related-records">
                <strong>Related record{question.related_ids.length === 1 ? "" : "s"}</strong>
                {question.related_ids.length ? <ul>{question.related_ids.map((id) => <li key={id}>{relatedRecordLabel(packet, id)}</li>)}</ul> : <p>No related record was supplied.</p>}
              </div>
              <p className="question-status">Status: unresolved · {recordBoundaryLabel(question.record_status)}</p>
              <button className="detail-button" type="button" onClick={() => onFocus({ kind: "unresolved_question", id: question.question_id, label: `Open question ${index + 1}` })}>
                See question details <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ol>
      ) : <EmptyState title="No unresolved questions were returned" message="The absence of an unresolved record does not imply that the public-interest question is fully resolved." />}
    </div>
  );
}

export function FocusedDetailPanel({
  selection,
  payload,
  state,
  onClose,
}: {
  selection: FocusSelection;
  payload: SiteReadyCaseDetail | null;
  state: "idle" | "loading" | "error";
  onClose: () => void;
}) {
  return (
    <aside className="detail-panel" aria-labelledby="detail-panel-title">
      <div className="detail-header">
        <div><p className="eyebrow">Focused detail</p><h3 id="detail-panel-title">{selection.label}</h3></div>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close focused detail">×</button>
      </div>
      {state === "loading" ? <p className="detail-loading" role="status">Loading bounded focused detail…</p> : null}
      {state === "error" ? <p className="form-error" role="alert">Focused detail is unavailable. The summary record remains unchanged.</p> : null}
      {payload ? <DetailBody kind={selection.kind} detail={payload.detail} /> : null}
      <details className="technical-details">
        <summary>Technical details</summary>
        <p className="detail-kind">{selection.kind.replaceAll("_", " ")} · stable ID</p>
        <code className="stable-id">{selection.id}</code>
      </details>
    </aside>
  );
}

function DetailBody({ kind, detail }: { kind: SiteDetailKind; detail: unknown }) {
  const item = asRecord(detail);
  if (kind === "source") {
    const selection = asRecord(item.source_selection);
    const provenance = asRecord(item.api_provenance);
    const limitations = arrayValue(item.limitations);
    const sourceText = typeof item.source_text === "string" ? item.source_text : null;
    const candidateSummary = typeof item.web_search_grounded_candidate_summary === "string"
      ? item.web_search_grounded_candidate_summary
      : null;
    return (
      <div className="detail-body">
        <DetailField label="Publisher" value={item.publisher} />
        <DetailField label="Publication time" value={formatTimestamp(asNullableString(item.published_at))} />
        <DetailField label="Why this source matters" value={selection.why_included} />
        {sourceText ? (
          <div className="captured-text"><strong>Captured deterministic fixture text</strong><p>{sourceText}</p></div>
        ) : (
          <div className="captured-text">
            <strong>Model-generated web-search candidate summary · not captured page text</strong>
            <p>{candidateSummary ?? "Unavailable. This record preserves only bounded search provenance."}</p>
          </div>
        )}
        <details className="detail-disclosure">
          <summary>Source context &amp; limitations</summary>
          <div className="detail-disclosure-body">
            <DetailField label="Source context" value={humanize(selection.source_context)} />
            <DetailField label="Information proximity" value={humanize(selection.information_proximity)} />
            <DetailField label="Classification basis" value={humanize(selection.classification_basis)} />
            <DetailField label="Classification status" value={humanize(selection.classification_status)} />
            <DetailField label="Retrieval method" value={humanize(item.retrieval_mode)} />
            <DetailField label="Retrieved by Sisyphus" value={formatTimestamp(asNullableString(item.retrieved_at))} />
            <DetailField label="Snapshot status" value={humanize(item.snapshot_status)} />
            <p className="detail-note">Inclusion widens the review record. It does not establish reliability, representativeness, or truth.</p>
            {limitations.length ? (
              <div className="detail-limitations"><strong>Limitations</strong><ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div>
            ) : null}
          </div>
        </details>
        <details className="technical-details source-technical-details">
          <summary>Source provenance identifiers</summary>
          <div className="detail-disclosure-body">
            <DetailField label="Snapshot ID" value={item.snapshot_id} />
            <DetailField label="Content hash" value={item.content_sha256} />
            <DetailField label="Candidate summary hash" value={item.candidate_summary_sha256} />
            <DetailField label="Comparison target source IDs" value={arrayValue(selection.comparison_target_source_ids).join(" · ")} />
            <DetailField label="Provider search call ID" value={provenance.search_call_id} />
          </div>
        </details>
      </div>
    );
  }
  if (kind === "timeline_row") {
    return (
      <div className="detail-body">
        <DetailField label="Event time" value={formatTimestamp(asNullableString(item.event_time))} />
        <DetailField label="Actor assertion time" value={formatTimestamp(asNullableString(item.actor_assertion_time))} />
        <DetailField label="Publication time" value={formatTimestamp(asNullableString(item.publication_time))} />
        <DetailField label="Sisyphus retrieval time" value={formatTimestamp(asNullableString(item.retrieval_time))} />
        <p className="detail-note">No time axis was inferred or substituted.</p>
      </div>
    );
  }
  if (kind === "relation") {
    const left = asRecord(item.left_support_reference);
    const right = asRecord(item.right_support_reference);
    return (
      <div className="detail-body">
        <DetailField label="Connection" value={relationDisplayLabel(stringValue(item.relation_type))} />
        <DetailField label="Reason" value={item.reason} />
        <DetailField label="Review status" value="Needs review" />
        <div className="support-box"><strong>Left support</strong><p>{stringValue(left.bounded_excerpt)}</p><small>{stringValue(left.proves)}</small></div>
        <div className="support-box"><strong>Right support</strong><p>{stringValue(right.bounded_excerpt)}</p><small>{stringValue(right.proves)}</small></div>
        <p className="detail-note">A confidence score cannot change this candidate into canonical state.</p>
        <details className="technical-details">
          <summary>Relation technical details</summary>
          <div className="detail-disclosure-body">
            <DetailField label="Relation enum" value={item.relation_type} />
            <DetailField label="Review status enum" value={item.review_status} />
            <DetailField label="Confidence score" value={item.confidence_score} />
          </div>
        </details>
      </div>
    );
  }
  if (kind === "claim_occurrence") {
    return (
      <div className="detail-body">
        <DetailField label="Actor" value={typeof item.actor === "string" ? item.actor : "Unknown actor"} />
        <DetailField label="Claim" value={item.original_claim_text} />
        <DetailField label="Support kind" value={item.support_kind} />
        <DetailField label="Status" value={item.status} />
      </div>
    );
  }
  if (kind === "claim_family") {
    return (
      <div className="detail-body">
        <DetailField label="Grouping reason" value={item.grouping_reason} />
        <DetailField label="Review status" value="Needs review" />
        <p className="detail-note">A candidate family does not collapse different actors or propositions into one truth state.</p>
        <details className="technical-details">
          <summary>Related claim identifiers</summary>
          <DetailField label="Occurrence IDs" value={arrayValue(item.occurrence_ids).join(" · ")} />
        </details>
      </div>
    );
  }
  return (
    <div className="detail-body">
      <DetailField label="Summary" value={item.summary ?? item.question ?? "Focused record"} />
      <DetailField label="Status" value={humanize(item.review_status ?? item.record_status ?? item.status)} />
      {arrayValue(item.related_ids).length ? (
        <details className="technical-details">
          <summary>Related record identifiers</summary>
          <DetailField label="Related IDs" value={arrayValue(item.related_ids).join(" · ")} />
        </details>
      ) : null}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  return <div className="detail-field"><strong>{label}</strong><p>{stringValue(value)}</p></div>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{message}</p></div>;
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
  if (isLoading) return { tone: "loading", title: "Running bounded live analysis", message: "Discovering up to the requested source limit and validating each source-local record." };
  if (error) return { tone: "error", title: "Live analysis unavailable", message: `${error} The prepared case remains intact.` };
  if (packet.mode === "fallback") return { tone: "fallback", title: "Prepared fallback shown", message: "The live attempt did not succeed. This is the deterministic prepared case, not a live result." };
  if (packet.mode === "live" && packet.warnings.length) return { tone: "partial", title: "Partial live result", message: "Validated candidates are shown with warnings and remain review-only." };
  if (packet.mode === "live") return { tone: "live", title: "Bounded live candidates", message: "The server returned a validated candidate packet. No canonical state changed." };
  return { tone: "prepared", title: "Prepared community case ready", message: "Deterministic, source-bound, and available without an API key or network." };
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "Unavailable";
}

function humanize(value: unknown): string {
  return stringValue(value).replaceAll("_", " ");
}

export function LineageResult({ run }: { run: SiteReadyCasePacket }) {
  return (
    <section className="run-panel" aria-labelledby="lineage-run-title">
      <p className="eyebrow">{run.status} Site-ready case packet</p>
      <h2 id="lineage-run-title">{run.normalized_public_interest_question}</h2>
      <p>{run.actual_source_count} sources · {run.claim_occurrences.length} occurrences · {run.relation_candidates.length} relation candidates</p>
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
            <a href={candidate.source_reference.url} target="_blank" rel="noreferrer">
              {candidate.source_reference.kind === "url_citation" ? "Cited source" : "Web-search source"}: {candidate.source_reference.title}
            </a>
            <p>Source ref: {candidate.source_reference.source_id}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
