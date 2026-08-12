"use client";

import type { PreparedCaseReadModel } from "../lib/contracts";

export function CaseExplorer({
  preparedCase,
}: {
  preparedCase: PreparedCaseReadModel;
}) {
  return (
    <main className="site-shell">
      <p className="eyebrow">Source-bound public reasoning</p>
      <h1>Sisyphus Watch</h1>
      <p className="lede">{preparedCase.problem_statement}</p>

      <div className="status-row" aria-label="Prepared case runtime status">
        <span className="status-pill">Deterministic fixture</span>
        <span className="status-pill">No API key</span>
        <span className="status-pill">No network</span>
      </div>

      <label className="case-picker">
        Prepared case
        <select value={preparedCase.case_id} onChange={() => undefined}>
          <option value={preparedCase.case_id}>{preparedCase.title}</option>
        </select>
      </label>

      <section className="summary-card" aria-labelledby="case-summary-title">
        <p className="eyebrow">Current source-bound summary</p>
        <h2 id="case-summary-title">{preparedCase.title}</h2>
        <ol className="summary-list">
          {preparedCase.source_bound_summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <div className="content-grid">
        <section className="panel" aria-labelledby="sources-title">
          <h2 id="sources-title">Source snapshots</h2>
          <ul className="item-list">
            {preparedCase.sources.map((source) => (
              <li className="source-item" key={source.source_id}>
                <p className="item-title">{source.title}</p>
                <p className="item-meta">
                  {source.publisher} · published {formatDate(source.published_at)}
                </p>
                <p className="item-copy">{source.evidence_excerpt}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="unresolved-title">
          <h2 id="unresolved-title">Unresolved items</h2>
          <ul className="unresolved-list">
            {preparedCase.unresolved_questions.map((item) => (
              <li className="unresolved-item" key={item.question_id}>
                {item.question}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-wide" aria-labelledby="timeline-title">
          <h2 id="timeline-title">Timeline preview</h2>
          <ol className="timeline">
            {preparedCase.timeline.map((event) => (
              <li className="timeline-item" key={event.timeline_id}>
                <time className="timeline-date" dateTime={event.occurred_at}>
                  {formatDate(event.occurred_at)}
                </time>
                <div>
                  <p className="item-title">{event.summary}</p>
                  <p className="item-copy">{event.judgment_at_time}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className="footer-note">
        {preparedCase.limitations.join(" ")} Full fixture text is available only
        through the focused server detail boundary.
      </p>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
