import type {
  ChangedCandidateRecord,
  InvestigationDelta,
} from "../lib/investigation-delta";
import type {
  LocalWatchCandidate,
  LocalWatchRelation,
  LocalWatchSnapshot,
  LocalWatchSource,
} from "../lib/local-watch";
import { formatWatchTimestamp } from "./SavedWatchCard";

const DETAIL_LIMIT = 3;

export function InvestigationDeltaPanel({
  delta,
  previousSnapshot,
  currentSnapshot,
  previousCheckedAt,
  baselineUpdateState,
}: {
  delta: InvestigationDelta;
  previousSnapshot: LocalWatchSnapshot;
  currentSnapshot: LocalWatchSnapshot;
  previousCheckedAt: string;
  baselineUpdateState: "updated" | "failed";
}) {
  const candidateByIdentity = new Map([
    ...previousSnapshot.candidates,
    ...currentSnapshot.candidates,
  ].map((candidate) => [candidate.identity, candidate]));

  return (
    <section className="investigation-delta-panel" aria-labelledby="delta-panel-title">
      <div className="delta-panel-heading">
        <div>
          <p className="eyebrow">Manual bounded comparison</p>
          <h2 id="delta-panel-title">Since last check</h2>
        </div>
        <p>
          Compared with the browser baseline checked {" "}
          <time dateTime={previousCheckedAt}>{formatWatchTimestamp(previousCheckedAt)}</time>.
        </p>
      </div>

      <div className="delta-metrics" aria-label="Since-last-check counts">
        <DeltaMetric label="New sources" count={delta.new_sources.length} />
        <DeltaMetric label="New candidate records" count={delta.new_candidates.length} />
        <DeltaMetric label="Changed candidate records" count={delta.changed_candidates.length} />
        <DeltaMetric
          label="New contradiction signals"
          count={delta.new_contradiction_signals.length}
        />
      </div>

      {!delta.has_deterministic_differences ? (
        <div className="delta-no-difference" role="status">
          <strong>No deterministic differences were found between these two bounded checks.</strong>
          <span>This does not prove that nothing changed.</span>
        </div>
      ) : (
        <div className="delta-detail-grid">
          <DeltaDetailList
            title="New sources"
            items={delta.new_sources}
            render={(source) => sourceLabel(source)}
          />
          <DeltaDetailList
            title="New candidate records"
            items={delta.new_candidates}
            render={(candidate) => candidateLabel(candidate)}
          />
          <DeltaDetailList
            title="Changed candidate records"
            items={delta.changed_candidates}
            render={(change) => changedCandidateLabel(change)}
          />
          <DeltaDetailList
            title="New review signals"
            items={[
              ...delta.new_contradiction_signals,
              ...delta.new_correction_signals,
              ...delta.new_supersession_signals,
            ]}
            render={(relation) => relationLabel(relation, candidateByIdentity)}
          />
        </div>
      )}

      <div className="delta-neutral-summary">
        <p>
          <strong>{delta.sources_not_returned.length}</strong> prior {plural(
            delta.sources_not_returned.length,
            "source",
          )} not returned in this bounded run · {" "}
          <strong>{delta.candidates_not_returned.length}</strong> prior candidate {plural(
            delta.candidates_not_returned.length,
            "record",
          )} not returned.
        </p>
        <p>
          New correction signals: {delta.new_correction_signals.length} · New supersession
          signals: {delta.new_supersession_signals.length}.
        </p>
      </div>

      <div
        className={`delta-baseline-status delta-baseline-${baselineUpdateState}`}
        role={baselineUpdateState === "failed" ? "alert" : "status"}
      >
        {baselineUpdateState === "updated" ? (
          <>
            <strong>Browser baseline updated.</strong>
            <span>The next manual check will compare against this result.</span>
          </>
        ) : (
          <>
            <strong>Browser baseline could not be updated.</strong>
            <span>This comparison remains visible for this session, but the prior stored baseline remains in place.</span>
          </>
        )}
      </div>

      <p className="delta-boundary-copy">
        Records and relations remain review candidates. Absence from one bounded recheck is
        not evidence of deletion, retraction, or resolution, and this comparison does not
        verify a real-world change.
      </p>
    </section>
  );
}

function DeltaMetric({ label, count }: { label: string; count: number }) {
  return (
    <div>
      <strong>{count}</strong>
      <span>{label}</span>
    </div>
  );
}

function DeltaDetailList<T>({
  title,
  items,
  render,
}: {
  title: string;
  items: T[];
  render: (item: T) => string;
}) {
  if (items.length === 0) return null;
  const visible = items.slice(0, DETAIL_LIMIT);
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {visible.map((item, index) => <li key={index}>{render(item)}</li>)}
      </ul>
      {items.length > DETAIL_LIMIT ? (
        <p>and {items.length - DETAIL_LIMIT} more</p>
      ) : null}
    </section>
  );
}

function sourceLabel(source: LocalWatchSource): string {
  return `${source.title} · ${source.publisher}`;
}

function candidateLabel(candidate: LocalWatchCandidate): string {
  return candidate.actor ? `${candidate.actor}: ${candidate.text}` : candidate.text;
}

function changedCandidateLabel(change: ChangedCandidateRecord): string {
  return `${candidateLabel(change.current)} · changed ${change.changed_dimensions.join(", ")}`;
}

function relationLabel(
  relation: LocalWatchRelation,
  candidates: Map<string, LocalWatchCandidate>,
): string {
  const left = candidates.get(relation.left_claim_identity);
  const right = candidates.get(relation.right_claim_identity);
  const type = relation.relation_type === "contradicts"
    ? "New contradiction signal"
    : relation.relation_type === "correction"
      ? "New correction signal"
      : "New supersession signal";
  const connector = relation.relation_type === "contradicts" ? "↔" : "→";
  return `${type}: ${left?.text ?? "Candidate record"} ${connector} ${right?.text ?? "candidate record"}`;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
