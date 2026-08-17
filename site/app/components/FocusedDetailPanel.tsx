"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  actorLabel,
  recordBoundaryLabel,
  relationDisplayLabel,
  sourceRoleLabel,
} from "../lib/experience";
import {
  deriveInvestigationMap,
  deriveQuestionInspectionOrigins,
  type QuestionInspectionOrigin,
} from "../lib/investigation-map";
import type {
  SiteDetailKind,
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "../lib/lineage/contracts";
import {
  formatReviewTimestamp,
  type TemporalPrecision,
} from "../lib/temporal";
import type { FocusSelection } from "./investigation-types";

export const INSPECTOR_ACCESSIBILITY_MODELS = {
  desktop: "nonmodal",
  mobile: "modal",
} as const;
export const MOBILE_INSPECTOR_MEDIA_QUERY = "(max-width: 720px)" as const;
export const INSPECTOR_CLOSE_KEY = "Escape" as const;
const INSPECTOR_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type InspectorAccessibilityModel =
  (typeof INSPECTOR_ACCESSIBILITY_MODELS)[keyof typeof INSPECTOR_ACCESSIBILITY_MODELS];

export type FocusedMapViewActions = {
  canTraceThread: boolean;
  threadTraceActive: boolean;
  onTraceThread: () => void;
  onShowFullMap: () => void;
};

export function FocusedDetailPanel({
  packet,
  selection,
  payload,
  state,
  onClose,
  mapViewActions,
  modelOverride,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  payload: SiteReadyCaseDetail | null;
  state: "idle" | "loading" | "error";
  onClose: () => void;
  mapViewActions?: FocusedMapViewActions;
  modelOverride?: InspectorAccessibilityModel;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const responsiveModel = useResponsiveInspectorModel();
  const model = modelOverride ?? responsiveModel;
  const visibleMapViewActions = model === INSPECTOR_ACCESSIBILITY_MODELS.desktop
    ? mapViewActions
    : undefined;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (model !== INSPECTOR_ACCESSIBILITY_MODELS.mobile || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      if (dialog.open) dialog.close();
    };
  }, [model]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [model, selection.id, selection.kind]);

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== INSPECTOR_CLOSE_KEY) return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const contents = (
    <>
      <div className="detail-header">
        <div className="detail-header-copy">
          <p className="eyebrow">Focused inspector</p>
          <h3 id="detail-panel-title">{selection.label}</h3>
          {visibleMapViewActions ? (
            <div
              className="detail-view-actions"
              role="group"
              aria-label="Focused map viewing actions"
            >
              <span>
                {visibleMapViewActions.threadTraceActive
                  ? "Thread trace active"
                  : "Map context"}
              </span>
              <div>
                {visibleMapViewActions.canTraceThread ? (
                  <button
                    type="button"
                    aria-pressed={visibleMapViewActions.threadTraceActive}
                    onClick={visibleMapViewActions.onTraceThread}
                  >
                    Trace this thread
                  </button>
                ) : null}
                <button type="button" onClick={visibleMapViewActions.onShowFullMap}>
                  Show full map
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button
          ref={closeButtonRef}
          className="close-button"
          type="button"
          onClick={onClose}
          aria-label="Close focused inspector"
        >
          ×
        </button>
      </div>
      <div className="detail-scroll">
        {state === "loading" ? (
          <p className="detail-loading" role="status">Loading bounded focused detail…</p>
        ) : null}
        {state === "error" ? (
          <p className="form-error" role="alert">
            Focused detail is unavailable. The packet remains unchanged.
          </p>
        ) : null}
        {payload ? (
          <DetailBody
            packet={packet}
            selection={selection}
            kind={selection.kind}
            detail={payload.detail}
          />
        ) : null}
        <details className="technical-details">
          <summary>Stable record identifier</summary>
          <p className="detail-kind">{selection.kind.replaceAll("_", " ")}</p>
          <code className="stable-id">{selection.id}</code>
        </details>
      </div>
    </>
  );

  if (model === INSPECTOR_ACCESSIBILITY_MODELS.mobile) {
    return (
      <dialog
        ref={dialogRef}
        className="detail-panel"
        aria-labelledby="detail-panel-title"
        aria-modal="true"
        data-inspector-model={model}
        onKeyDown={containMobileInspectorFocus}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        {contents}
      </dialog>
    );
  }

  return (
    <aside
      className="detail-panel"
      aria-labelledby="detail-panel-title"
      data-inspector-model={model}
    >
      {contents}
    </aside>
  );
}

function containMobileInspectorFocus(event: ReactKeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
    INSPECTOR_FOCUSABLE_SELECTOR,
  )].filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function subscribeToInspectorViewport(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_INSPECTOR_MEDIA_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getInspectorViewportSnapshot(): boolean {
  return window.matchMedia(MOBILE_INSPECTOR_MEDIA_QUERY).matches;
}

function getServerInspectorViewportSnapshot(): boolean {
  return false;
}

function useResponsiveInspectorModel(): InspectorAccessibilityModel {
  const isMobile = useSyncExternalStore(
    subscribeToInspectorViewport,
    getInspectorViewportSnapshot,
    getServerInspectorViewportSnapshot,
  );
  return isMobile
    ? INSPECTOR_ACCESSIBILITY_MODELS.mobile
    : INSPECTOR_ACCESSIBILITY_MODELS.desktop;
}

function DetailBody({
  packet,
  selection,
  kind,
  detail,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  kind: SiteDetailKind;
  detail: unknown;
}) {
  const item = asRecord(detail);
  if (kind === "source") {
    return (
      <SourceDetail
        packet={packet}
        selection={selection}
        item={item}
      />
    );
  }
  if (kind === "timeline_row") {
    return (
      <div className="detail-body">
        <DetailField label="Event time" value={formatReviewTimestamp(asNullableString(item.event_time), asTemporalPrecision(item.event_time_precision))} />
        <DetailField label="Actor assertion time" value={formatReviewTimestamp(asNullableString(item.actor_assertion_time), asTemporalPrecision(item.actor_assertion_time_precision))} />
        <DetailField label="Publication time" value={formatReviewTimestamp(asNullableString(item.publication_time), asTemporalPrecision(item.publication_time_precision))} />
        <DetailField label="Sisyphus retrieval time" value={formatReviewTimestamp(asNullableString(item.retrieval_time), asTemporalPrecision(item.retrieval_time_precision))} />
        <p className="detail-note">No time axis was inferred or substituted.</p>
      </div>
    );
  }
  if (kind === "relation") {
    return <RelationDetail selection={selection} item={item} />;
  }
  if (kind === "claim_occurrence") {
    return (
      <div className="detail-body">
        <DetailField
          label="Actor"
          value={typeof item.actor === "string" ? item.actor : "Unknown actor"}
        />
        <DetailField label="Claim" value={item.original_claim_text} />
        <DetailField label="Support kind" value={item.support_kind} />
        <DetailField label="Record status" value={focusedRecordStatusLabel(item.status)} />
        <details className="technical-details">
          <summary>Record status enum</summary>
          <DetailField label="Status enum" value={item.status} />
        </details>
      </div>
    );
  }
  return <QuestionDetail packet={packet} selection={selection} item={item} />;
}

function SourceDetail({
  packet,
  selection,
  item,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  item: Record<string, unknown>;
}) {
  const sourceSummary = packet?.source_snapshot_summaries.find(
    (source) => source.source_id === selection.id,
  );
  const selectionMetadata = asRecord(item.source_selection);
  const provenance = asRecord(item.api_provenance);
  const limitations = arrayValue(item.limitations);
  const sourceText = typeof item.source_text === "string" ? item.source_text : null;
  const evidenceExcerpt = typeof item.evidence_excerpt === "string"
    ? item.evidence_excerpt
    : sourceSummary?.evidence_excerpt ?? null;
  const candidateSummary = typeof item.web_search_grounded_candidate_summary === "string"
    ? item.web_search_grounded_candidate_summary
    : null;
  const claims = packet?.actor_claims.filter((claim) =>
    claim.source_ids.includes(selection.id),
  ) ?? [];
  const findings = packet?.source_bound_findings.filter((finding) =>
    finding.source_ids.includes(selection.id),
  ) ?? [];
  const actions = packet?.actions.filter((action) =>
    action.source_ids.includes(selection.id),
  ) ?? [];
  const changes = packet?.relation_candidates.filter((relation) =>
    relation.left_source_id === selection.id || relation.right_source_id === selection.id,
  ) ?? [];
  const relatedQuestions = packet
    ? deriveInvestigationMap(packet, "event_time").questions.filter((question) =>
        question.targetNodeIds.includes(selection.id),
      )
    : [];
  const citationUrl = asNullableString(item.canonical_url)
    ?? asNullableString(item.original_url)
    ?? sourceSummary?.url
    ?? null;

  return (
    <div className="detail-body">
      <DetailField
        label="Source role"
        value={sourceSummary ? sourceRoleLabel(sourceSummary) : "Source"}
      />
      <DetailField
        label="Record status"
        value={focusedRecordStatusLabel(item.record_status ?? sourceSummary?.record_status)}
      />
      <DetailField
        label="Publisher / domain"
        value={`${stringValue(item.publisher)}${sourceSummary?.domain ? ` · ${sourceSummary.domain}` : ""}`}
      />
      <DetailField
        label="Publication time"
        value={formatReviewTimestamp(
          asNullableString(item.published_at),
          asTemporalPrecision(item.published_at_precision)
            ?? sourceSummary?.published_at_precision
            ?? null,
        )}
      />
      <DetailField label="Why this source matters" value={selectionMetadata.why_included} />
      {sourceText ? (
        <div className="captured-text">
          <strong>Captured deterministic fixture evidence</strong>
          <p>{sourceText}</p>
        </div>
      ) : evidenceExcerpt ? (
        <div className="captured-text">
          <strong>Captured evidence excerpt from the prepared record</strong>
          <p>{evidenceExcerpt}</p>
        </div>
      ) : (
        <div className="captured-text">
          <strong>Model-generated web-search candidate summary · not captured page text</strong>
          <p>
            {candidateSummary
              ?? "Unavailable. This record preserves only bounded search provenance."}
          </p>
        </div>
      )}
      <InspectorList
        title="Claims found in this source"
        items={claims.map((claim) => `${actorLabel(claim.actor)}: ${claim.claim_text}`)}
        empty="No actor claims were found in this source."
      />
      <InspectorList
        title="Connected changes"
        items={changes.map((relation) =>
          `${relationDisplayLabel(relation.relation_type)} · needs review`,
        )}
        empty="No cross-source claim relation is connected to this source."
      />
      <InspectorList
        title="Related open questions"
        items={relatedQuestions.map((question) => question.question)}
        empty="No open question resolves to this source."
      />
      {citationUrl ? (
        <a
          className="citation-link"
          href={citationUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open cited source <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <p className="detail-note">Prepared fixture: no external citation URL is available.</p>
      )}
      <details className="detail-disclosure">
        <summary>Findings, actions, context, and limitations</summary>
        <div className="detail-disclosure-body">
          <InspectorList
            title="Source-bound findings"
            items={findings.map((finding) => finding.text)}
            empty="No finding record is attached."
          />
          <InspectorList
            title="Actions"
            items={actions.map((action) => `${actorLabel(action.actor)}: ${action.action_text}`)}
            empty="No action record is attached."
          />
          <DetailField label="Source context" value={humanize(selectionMetadata.source_context)} />
          <DetailField label="Information proximity" value={humanize(selectionMetadata.information_proximity)} />
          <DetailField label="Classification basis" value={humanize(selectionMetadata.classification_basis)} />
          <DetailField label="Classification status" value={humanize(selectionMetadata.classification_status)} />
          <DetailField label="Retrieval method" value={humanize(item.retrieval_mode)} />
          <DetailField
            label="Retrieved by Sisyphus"
            value={formatReviewTimestamp(asNullableString(item.retrieved_at), "instant")}
          />
          <p className="detail-note">
            Inclusion widens the review record. It does not establish reliability,
            representativeness, or truth.
          </p>
          {limitations.length ? (
            <InspectorList title="Limitations" items={limitations} empty="" />
          ) : null}
        </div>
      </details>
      <details className="technical-details source-technical-details">
        <summary>Hashes and provider identifiers</summary>
        <div className="detail-disclosure-body">
          <DetailField label="Source ID" value={selection.id} />
          <DetailField label="Snapshot ID" value={item.snapshot_id} />
          <DetailField label="Content hash" value={item.content_sha256} />
          <DetailField label="Candidate summary hash" value={item.candidate_summary_sha256} />
          <DetailField
            label="Record status enum"
            value={item.record_status ?? sourceSummary?.record_status}
          />
          <DetailField
            label="Comparison target source IDs"
            value={arrayValue(selectionMetadata.comparison_target_source_ids).join(" · ")}
          />
          <DetailField label="Provider search call ID" value={provenance.search_call_id} />
        </div>
      </details>
    </div>
  );
}

function RelationDetail({
  selection,
  item,
}: {
  selection: FocusSelection;
  item: Record<string, unknown>;
}) {
  const left = asRecord(item.left_support_reference);
  const right = asRecord(item.right_support_reference);
  return (
    <div className="detail-body">
      <DetailField
        label="Connection"
        value={relationDisplayLabel(stringValue(item.relation_type))}
      />
      <DetailField label="Reason" value={item.reason} />
      <DetailField label="Review status" value="Needs review" />
      <div className="support-box">
        <strong>Left support</strong>
        <p>{stringValue(left.bounded_excerpt)}</p>
        <small>{stringValue(left.proves)}</small>
      </div>
      <div className="support-box">
        <strong>Right support</strong>
        <p>{stringValue(right.bounded_excerpt)}</p>
        <small>{stringValue(right.proves)}</small>
      </div>
      <p className="detail-note">
        Both support references are inspection aids. A confidence score cannot
        turn this review candidate into an accepted record.
      </p>
      <details className="technical-details">
        <summary>Exact relation and support references</summary>
        <div className="detail-disclosure-body">
          <DetailField label="Relation ID" value={selection.id} />
          <DetailField label="Left occurrence ID" value={item.left_occurrence_id} />
          <DetailField label="Right occurrence ID" value={item.right_occurrence_id} />
          <DetailField label="Left source ID" value={item.left_source_id} />
          <DetailField label="Right source ID" value={item.right_source_id} />
          <DetailField label="Left support reference" value={left.evidence_reference} />
          <DetailField label="Right support reference" value={right.evidence_reference} />
          <DetailField label="Relation enum" value={item.relation_type} />
          <DetailField label="Review status enum" value={item.review_status} />
          <DetailField label="Confidence score" value={item.confidence_score} />
        </div>
      </details>
    </div>
  );
}

function QuestionDetail({
  packet,
  selection,
  item,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  item: Record<string, unknown>;
}) {
  const origins = packet
    ? deriveQuestionInspectionOrigins(
        deriveInvestigationMap(packet, "event_time"),
        selection.id,
      )
    : [];
  return (
    <div className="detail-body">
      <DetailField
        label="Open question"
        value={item.question ?? item.summary ?? "Focused record"}
      />
      <DetailField
        label="Record status"
        value={focusedRecordStatusLabel(
          item.record_status ?? item.review_status ?? item.status,
        )}
      />
      <div className="inspector-list">
        <strong>Related evidence origin</strong>
        {origins.length ? (
          <ul>
            {origins.map((origin, index) => (
              <li key={`${origin.relatedId ?? "topic-root"}-${index}`}>
                {questionOriginDescription(origin)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No conservative source resolution is available; the question remains connected only to the investigation topic.</p>
        )}
      </div>
      <p className="detail-note">
        This record is related to the evidence gap, but the available evidence
        does not answer the question.
      </p>
      <p className="detail-note">
        The connection does not itself establish causation, contradiction, or
        truth/falsity.
      </p>
      {arrayValue(item.related_ids).length ? (
        <details className="technical-details">
          <summary>Conservative resolution details</summary>
          <DetailField
            label="Related IDs"
            value={arrayValue(item.related_ids).join(" · ")}
          />
          <DetailField
            label="Resolution types"
            value={origins.map((origin) => origin.resolution).join(" · ")}
          />
          <DetailField label="Record status enum" value={item.record_status} />
          <DetailField label="Question status enum" value={item.status} />
        </details>
      ) : null}
    </div>
  );
}

function questionOriginDescription(origin: QuestionInspectionOrigin): string {
  if (origin.topicRootOnly) {
    return "Unknown related record: conservative resolution stops at the investigation topic; no source edge is added.";
  }
  const sourceDescription = origin.sourceNodes
    .map((source) => `${source.title} (${source.sourceRole})`)
    .join("; ");
  const connection = {
    source: "The question directly references this source record",
    claim: "A referenced actor claim resolves to this source record",
    action: "A referenced action resolves to this source record",
    occurrence: "A referenced claim occurrence resolves to this source record",
    unknown: "No source record was conservatively resolved",
  }[origin.resolution];
  return `${sourceDescription || "Investigation topic only"}. ${connection}.`;
}

function InspectorList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="inspector-list">
      <strong>{title}</strong>
      {items.length ? (
        <ul>{items.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul>
      ) : <p>{empty}</p>}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  return <div className="detail-field"><strong>{label}</strong><p>{stringValue(value)}</p></div>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asTemporalPrecision(value: unknown): TemporalPrecision {
  return value === "day" || value === "instant" ? value : null;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringValue(value: unknown): string {
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return String(value);
  }
  return "Unavailable";
}

function humanize(value: unknown): string {
  return stringValue(value).replaceAll("_", " ");
}

export function focusedRecordStatusLabel(value: unknown): string {
  return value === "canonical" || value === "candidate"
    ? recordBoundaryLabel(value)
    : humanize(value);
}
