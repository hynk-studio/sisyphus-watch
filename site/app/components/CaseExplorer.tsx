"use client";

import { useState, type FormEvent } from "react";
import type {
  AnalysisRoutePayload,
  AnalysisRunPacket,
} from "../lib/analysis/contracts";
import type { PreparedCaseReadModel } from "../lib/contracts";

export function CaseExplorer({
  preparedCase,
}: {
  preparedCase: PreparedCaseReadModel;
}) {
  const [question, setQuestion] = useState("");
  const [sourceLimit, setSourceLimit] = useState(5);
  const [run, setRun] = useState<AnalysisRunPacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, sourceLimit }),
      });
      const payload = (await response.json()) as AnalysisRoutePayload;
      if (payload.status === "error") {
        setRun(null);
        setError(payload.error.message);
        return;
      }
      if (!response.ok) {
        setRun(null);
        setError("The bounded analysis request did not complete.");
        return;
      }
      setRun(payload);
    } catch {
      setRun(null);
      setError("The same-Site analysis route is unavailable.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="site-shell">
      <p className="eyebrow">Source-bound public reasoning</p>
      <h1>Sisyphus Watch</h1>
      <p className="lede">{preparedCase.problem_statement}</p>

      <div className="status-row" aria-label="Prepared case runtime status">
        <span className="status-pill">
          {run?.status === "live" ? "Live candidates" : "Deterministic fixture"}
        </span>
        <span className="status-pill">
          {run?.status === "live" ? "Server-only OpenAI" : "No API key required"}
        </span>
        <span className="status-pill">
          {run?.status === "live" ? "Bounded web search" : "No network required"}
        </span>
        <span className="status-pill">Canonical mutation: none</span>
      </div>

      <section className="analysis-panel" aria-labelledby="analysis-title">
        <div>
          <p className="eyebrow">Optional bounded analysis</p>
          <h2 id="analysis-title">Ask a public-interest question</h2>
          <p className="item-copy">
            The browser sends only this question and source limit to a same-Site
            route. Live results remain review-only candidates; failures return the
            prepared deterministic case.
          </p>
        </div>
        <form className="analysis-form" onSubmit={submitAnalysis}>
          <label>
            Question
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              minLength={12}
              maxLength={500}
              placeholder="How has access to cooling centers changed during the current heatwave?"
              required
            />
          </label>
          <div className="analysis-controls">
            <label>
              Source limit
              <select
                value={sourceLimit}
                onChange={(event) => setSourceLimit(Number(event.target.value))}
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={8}>8</option>
              </select>
            </label>
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Analyzing…" : "Run bounded analysis"}
            </button>
          </div>
        </form>
        {error ? <p className="analysis-error" role="alert">{error}</p> : null}
      </section>

      {run ? <AnalysisResult run={run} /> : null}

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
                  {source.publisher} · published {formatOptionalDate(source.published_at)}
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

function AnalysisResult({ run }: { run: AnalysisRunPacket }) {
  return (
    <section className="run-panel" aria-labelledby="run-title">
      <div className="run-header">
        <div>
          <p className="eyebrow">{run.status} run packet</p>
          <h2 id="run-title">{run.normalized_question}</h2>
        </div>
        <p className="run-count">
          {run.actual_source_count} sources · {run.candidate_ids.length} candidates
        </p>
      </div>

      {run.warnings.length > 0 ? (
        <ul className="warning-list">
          {run.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}

      <div className="run-grid">
        <div>
          <h3>Source snapshot refs</h3>
          <ul className="item-list">
            {run.source_snapshot_summaries.map((source) => (
              <li className="source-item" key={source.source_id}>
                <p className="item-title">
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  ) : source.title}
                </p>
                <p className="item-meta">
                  {source.domain} · {source.snapshot_status} · {source.record_status}
                </p>
                <p className="item-copy">{source.evidence_excerpt}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Validated candidate records</h3>
          {run.candidates.length > 0 ? (
            <ul className="item-list">
              {run.candidates.map((candidate) => (
                <li className="source-item" key={candidate.candidate_id}>
                  <p className="item-meta">{candidate.candidate_type} · candidate</p>
                  <p className="item-title">{candidate.text}</p>
                  <p className="item-copy">{candidate.evidence_excerpt}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="item-copy">
              No live candidates were accepted. The deterministic prepared case is
              shown instead.
            </p>
          )}
        </div>
      </div>
    </section>
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

function formatOptionalDate(value: string | null): string {
  return value ? formatDate(value) : "date unavailable";
}
