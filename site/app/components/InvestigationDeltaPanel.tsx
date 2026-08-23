import type {
  ChangedCandidateRecord,
  InvestigationDelta,
} from "../lib/investigation-delta";
import type {
  LocalWatchCandidate,
  LocalWatchRelation,
  LocalWatchSnapshot,
  LocalWatchSource,
  LocalWatchSourceBackedRelation,
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
  const previousCandidateByIdentity = new Map(
    previousSnapshot.candidates.map((candidate) => [candidate.identity, candidate]),
  );
  const currentCandidateByIdentity = new Map(
    currentSnapshot.candidates.map((candidate) => [candidate.identity, candidate]),
  );
  const candidateByIdentity = new Map([
    ...previousSnapshot.candidates,
    ...currentSnapshot.candidates,
  ].map((candidate) => [candidate.identity, candidate]));
  const hasTraditionalDetail = [
    delta.new_sources,
    delta.new_candidates,
    delta.changed_candidates,
    delta.new_contradiction_signals,
    delta.new_correction_signals,
    delta.new_supersession_signals,
  ].some((items) => items.length > 0);

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

      {delta.clarified_source_backed_relations.length > 0 ? (
        <div className="delta-source-backed-summary" role="status">
          <strong>
            {delta.clarified_source_backed_relations.length} {plural(
              delta.clarified_source_backed_relations.length,
              "relation",
            )} became Source-backed.
          </strong>
          <span>
            Captured source text now directly supports the supersession. It still needs review.
          </span>
        </div>
      ) : null}

      {!delta.has_deterministic_differences ? (
        <div className="delta-no-difference" role="status">
          <strong>No deterministic differences were found between these two bounded checks.</strong>
          <span>This does not prove that nothing changed.</span>
        </div>
      ) : hasTraditionalDetail ? (
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
      ) : null}

      <RelationEvidenceDelta
        delta={delta}
        candidates={candidateByIdentity}
        previousCandidates={previousCandidateByIdentity}
        currentCandidates={currentCandidateByIdentity}
      />

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

function RelationEvidenceDelta({
  delta,
  candidates,
  previousCandidates,
  currentCandidates,
}: {
  delta: InvestigationDelta;
  candidates: Map<string, LocalWatchCandidate>;
  previousCandidates: Map<string, LocalWatchCandidate>;
  currentCandidates: Map<string, LocalWatchCandidate>;
}) {
  const comparisonUnavailable = delta.relation_evidence_comparison === "current_unavailable"
    || delta.relation_evidence_comparison === "unavailable";
  if (
    delta.clarified_source_backed_relations.length === 0
    && delta.new_source_backed_relations.length === 0
    && delta.source_backed_relations_without_comparable_baseline.length === 0
    && delta.source_backed_relations_not_reobserved.length === 0
    && delta.source_backed_direction_changes.length === 0
    && !comparisonUnavailable
  ) {
    return null;
  }

  return (
    <div className="delta-relation-evidence">
      {delta.clarified_source_backed_relations.length > 0 ? (
        <DeltaDetailList
          title="Relations clarified"
          items={delta.clarified_source_backed_relations}
          render={(relation) =>
            `Source-backed supersession: ${sourceBackedRelationLabel(relation, candidates)}`
          }
        />
      ) : null}
      {delta.new_source_backed_relations.length > 0 ? (
        <DeltaDetailList
          title="New Source-backed relations"
          items={delta.new_source_backed_relations}
          render={(relation) =>
            `New Source-backed supersession: ${sourceBackedRelationLabel(relation, candidates)}`
          }
        />
      ) : null}
      {delta.source_backed_relations_without_comparable_baseline.length > 0 ? (
        <p className="delta-evidence-neutral">
          Source-backed relation observed on this check. The previous Watch did not
          preserve a comparable evidence state, so no before/after claim is made.
        </p>
      ) : null}
      {delta.source_backed_relations_not_reobserved.length > 0 ? (
        <div className="delta-evidence-caution">
          <strong>
            {delta.source_backed_relations_not_reobserved.length} previously Source-backed {plural(
              delta.source_backed_relations_not_reobserved.length,
              "relation",
            )} {delta.source_backed_relations_not_reobserved.length === 1 ? "was" : "were"} not
            re-observed in this bounded check.
          </strong>
          <span>This does not show reversal or retraction.</span>
        </div>
      ) : null}
      {comparisonUnavailable ? (
        <p className="delta-evidence-neutral">
          Relation evidence-state comparison was unavailable for this check. No
          Source-backed change was inferred.
        </p>
      ) : null}
      {delta.source_backed_direction_changes.map((change) => (
        <div className="delta-evidence-caution" key={change.relation_identity}>
          <strong>Source-backed direction differed from the previous check and needs review.</strong>
          <span>
            Previous: {sourceBackedRelationLabel(change.previous, previousCandidates)} · Current: {sourceBackedRelationLabel(change.current, currentCandidates)}
          </span>
        </div>
      ))}
    </div>
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

function sourceBackedRelationLabel(
  relation: LocalWatchSourceBackedRelation,
  candidates: Map<string, LocalWatchCandidate>,
): string {
  const from = candidates.get(relation.from_claim_identity);
  const to = candidates.get(relation.to_claim_identity);
  return `${from?.text ?? "Candidate record"} → ${to?.text ?? "candidate record"}`;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
