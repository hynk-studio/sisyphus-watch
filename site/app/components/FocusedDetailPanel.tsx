"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  actorLabel,
  projectPublicLimitations,
  recordBoundaryLabel,
  relationDisplayLabel,
  sourceRoleLabel,
} from "../lib/experience";
import {
  chooseInitialTimeAxis,
  deriveInvestigationMap,
  deriveQuestionInspectionOrigins,
  type QuestionInspectionOrigin,
} from "../lib/investigation-map";
import type {
  SiteDetailKind,
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "../lib/lineage/contracts";
import { publicRelationPresentation } from "../lib/relation-presentation";
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
const INSPECTOR_RECORD_KIND_LABELS: Record<SiteDetailKind, string> = {
  source: "Source record",
  finding: "Source-bound finding",
  action: "Action record",
  claim_occurrence: "Claim occurrence",
  claim_family: "Claim family",
  relation: "Candidate relation",
  timeline_row: "Timeline record",
  lineage_row: "Lineage record",
  unresolved_question: "Open question",
};

type InspectorAccessibilityModel =
  (typeof INSPECTOR_ACCESSIBILITY_MODELS)[keyof typeof INSPECTOR_ACCESSIBILITY_MODELS];

export type FocusedMapViewActions = {
  canTraceThread: boolean;
  traceLabel: string;
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
  const headerMetadata = focusedInspectorMetadata(packet, selection, payload);

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
          <div
            className="detail-record-meta"
            role="group"
            aria-label="Focused record type and status"
          >
            <span className="detail-record-kind">{headerMetadata.kind}</span>
            {headerMetadata.status ? (
              <span className="detail-record-status">{headerMetadata.status}</span>
            ) : null}
          </div>
          <h3 id="detail-panel-title">{selection.label}</h3>
          {visibleMapViewActions ? (
            <div
              className="detail-view-actions"
              role="group"
              aria-label="Focused map viewing actions"
            >
              <span>
                {visibleMapViewActions.threadTraceActive
                  ? `${visibleMapViewActions.traceLabel} active`
                  : "Map context"}
              </span>
              <div>
                {visibleMapViewActions.canTraceThread ? (
                  <button
                    type="button"
                    aria-pressed={visibleMapViewActions.threadTraceActive}
                    onClick={visibleMapViewActions.onTraceThread}
                  >
                    {visibleMapViewActions.traceLabel}
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

function focusedInspectorMetadata(
  packet: SiteReadyCasePacket | undefined,
  selection: FocusSelection,
  payload: SiteReadyCaseDetail | null,
): { kind: string; status: string | null } {
  const item = asRecord(payload?.detail);
  if (selection.kind === "relation") {
    return {
      kind: INSPECTOR_RECORD_KIND_LABELS[selection.kind],
      status: "Needs review",
    };
  }

  const sourceStatus = selection.kind === "source"
    ? packet?.source_snapshot_summaries.find(
        (source) => source.source_id === selection.id,
      )?.record_status
    : undefined;
  const status = item.record_status
    ?? sourceStatus
    ?? item.status
    ?? item.review_status;
  return {
    kind: INSPECTOR_RECORD_KIND_LABELS[selection.kind],
    status: status === undefined || status === null
      ? null
      : focusedRecordStatusLabel(status),
  };
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
  if (kind === "finding" || kind === "action") {
    return (
      <EvidenceRecordDetail
        packet={packet}
        selection={selection}
        kind={kind}
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
    return <RelationDetail packet={packet} selection={selection} item={item} />;
  }
  if (kind === "claim_family") {
    return (
      <ClaimFamilyDetail
        packet={packet}
        selection={selection}
        item={item}
      />
    );
  }
  if (kind === "claim_occurrence") {
    return (
      <ClaimOccurrenceDetail
        packet={packet}
        selection={selection}
        item={item}
      />
    );
  }
  return <QuestionDetail packet={packet} selection={selection} item={item} />;
}

function ClaimOccurrenceDetail({
  packet,
  selection,
  item,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  item: Record<string, unknown>;
}) {
  const support = asRecord(item.support_reference);
  const sourceId = asNullableString(item.source_id);
  const source = packet?.source_snapshot_summaries.find(
    (candidate) => candidate.source_id === sourceId,
  );
  const familyId = asNullableString(item.candidate_claim_family_id);

  return (
    <div className="detail-body">
      <DetailField
        label="Actor"
        value={actorLabel(typeof item.actor === "string" ? item.actor : null)}
      />
      <DetailField label="Claim" value={item.original_claim_text} />
      <DetailField
        label="Event time and precision"
        value={timestampWithPrecision(
          asNullableString(item.event_time_candidate),
          asTemporalPrecision(item.event_time_candidate_precision),
        )}
      />
      <DetailField
        label="Actor assertion time and precision"
        value={timestampWithPrecision(
          asNullableString(item.assertion_time_candidate),
          asTemporalPrecision(item.assertion_time_candidate_precision),
        )}
      />
      <DetailField
        label="Publication time and precision"
        value={timestampWithPrecision(
          asNullableString(item.source_publication_time),
          asTemporalPrecision(item.source_publication_time_precision),
        )}
      />
      <DetailField
        label="Sisyphus retrieval time and precision"
        value={timestampWithPrecision(
          asNullableString(item.source_retrieval_time),
          asTemporalPrecision(item.source_retrieval_time_precision),
        )}
      />
      <p className="detail-note">
        Each timestamp keeps its own meaning. Missing values are not replaced by another axis.
      </p>
      <DetailField label="Uncertainty" value={item.uncertainty} />
      <DetailField label="Confidence" value={humanize(item.confidence)} />
      <DetailField
        label="Support kind"
        value={supportKindLabel(item.support_kind ?? support.support_kind)}
      />
      <DetailField label="Support reference" value={support.evidence_reference} />
      <div className="support-box">
        <strong>Bounded support excerpt</strong>
        <p>{stringValue(support.bounded_excerpt)}</p>
        <small>{supportBoundaryLabel(support.proves)}</small>
      </div>
      <div className="support-box">
        <strong>Source attachment</strong>
        <p>
          {source
            ? `${sourceRoleLabel(source)} · ${source.title}`
            : "The source attachment is unavailable in the displayed packet."}
        </p>
        <small>
          {source
            ? `${source.publisher} · ${sourceRecordBoundaryLabel(source.record_status)}`
            : "Source detail unavailable"}
        </small>
      </div>
      <DetailField
        label="Candidate family membership"
        value={occurrenceFamilyMembershipLabel(
          packet,
          selection.id,
          familyId,
        )}
      />
      <DetailField label="Occurrence origin" value={lineageOriginLabel(item.origin)} />
      <DetailField label="Record status" value={focusedRecordStatusLabel(item.status)} />
      <DetailField
        label="Attached source boundary"
        value={sourceRecordBoundaryLabel(
          source?.record_status ?? item.source_record_status,
        )}
      />
      <ReviewTogetherSection
        packet={packet}
        selectedKind="claim_occurrence"
        selectedId={selection.id}
      />
    </div>
  );
}

function EvidenceRecordDetail({
  packet,
  selection,
  kind,
  item,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  kind: "finding" | "action";
  item: Record<string, unknown>;
}) {
  const sourceIds = arrayValue(item.source_ids);
  const source = packet?.source_snapshot_summaries.find((candidate) =>
    sourceIds.includes(candidate.source_id)
  );
  const link = packet?.evidence_claim_review_links.find(
    (candidate) =>
      candidate.evidence_record_kind === kind
      && candidate.evidence_record_id === selection.id,
  );
  const support = link?.evidence_support_reference;
  const text = kind === "finding"
    ? stringValue(item.text)
    : stringValue(item.action_text);

  return (
    <div className="detail-body">
      <DetailField label={kind === "finding" ? "Finding" : "Action"} value={text} />
      {kind === "action" ? (
        <>
          <DetailField
            label="Actor"
            value={actorLabel(typeof item.actor === "string" ? item.actor : null)}
          />
          <DetailField
            label="Event time and precision"
            value={timestampWithPrecision(
              asNullableString(item.event_time_candidate),
              asTemporalPrecision(item.event_time_candidate_precision),
            )}
          />
        </>
      ) : null}
      <div className="support-box">
        <strong>Source attachment</strong>
        <p>
          {source
            ? `${sourceRoleLabel(source)} · ${source.title}`
            : "The source attachment is unavailable in the displayed packet."}
        </p>
        <small>
          {source
            ? `${source.publisher} · ${source.domain} · ${sourceRecordBoundaryLabel(source.record_status)}`
            : "Source detail unavailable"}
        </small>
      </div>
      {support ? (
        <div className="support-box">
          <strong>Source-local bounded support</strong>
          <p>{support.bounded_excerpt}</p>
          <small>
            {supportKindLabel(support.support_kind)} · {supportBoundaryLabel(support.proves)}
          </small>
        </div>
      ) : (
        <p className="detail-note">
          No evidence-to-claim review link supplies source-local support for this record.
        </p>
      )}
      <ReviewTogetherSection
        packet={packet}
        selectedKind={kind}
        selectedId={selection.id}
      />
      <DetailField label="Record status" value={focusedRecordStatusLabel(item.status)} />
      <DetailField label="Record origin" value={lineageOriginLabel(item.origin)} />
    </div>
  );
}

function ReviewTogetherSection({
  packet,
  selectedKind,
  selectedId,
}: {
  packet?: SiteReadyCasePacket;
  selectedKind: "finding" | "action" | "claim_occurrence";
  selectedId: string;
}) {
  if (!packet) return null;
  const links = packet.evidence_claim_review_links.filter((link) =>
    selectedKind === "claim_occurrence"
      ? link.claim_occurrence_id === selectedId
      : link.evidence_record_kind === selectedKind
        && link.evidence_record_id === selectedId
  );
  if (!links.length) return null;

  return (
    <section className="support-box review-together" aria-labelledby={`review-together-${selectedId}`}>
      <strong id={`review-together-${selectedId}`}>Review together</strong>
      <p>
        These candidate links only indicate that bounded records may be worth
        reviewing together. They do not imply support, contradiction,
        correction, causality, truth, or a review outcome.
      </p>
      <ul>
        {links.map((link) => {
          const evidence = link.evidence_record_kind === "finding"
            ? packet.source_bound_findings.find(
                (item) => item.finding_id === link.evidence_record_id,
              )
            : packet.actions.find((item) => item.action_id === link.evidence_record_id);
          const occurrence = packet.claim_occurrences.find(
            (item) => item.occurrence_id === link.claim_occurrence_id,
          );
          const otherText = selectedKind === "claim_occurrence"
            ? link.evidence_record_kind === "finding"
              ? evidence && "text" in evidence ? evidence.text : "Evidence record unavailable"
              : evidence && "action_text" in evidence
                ? evidence.action_text
                : "Evidence record unavailable"
            : occurrence?.original_claim_text ?? "Claim occurrence unavailable";
          const otherKind = selectedKind === "claim_occurrence"
            ? link.evidence_record_kind === "finding" ? "Source-bound finding" : "Action record"
            : "Actor-claim occurrence";
          const otherSourceId = selectedKind === "claim_occurrence"
            ? link.evidence_source_id
            : link.claim_source_id;
          const otherSource = packet.source_snapshot_summaries.find(
            (source) => source.source_id === otherSourceId,
          );
          const otherSupport = selectedKind === "claim_occurrence"
            ? link.evidence_support_reference
            : link.claim_support_reference;
          return (
            <li key={link.link_id}>
              <strong>{otherKind}</strong>
              <p>{otherText}</p>
              <small>
                {otherSource
                  ? `${otherSource.title} · ${otherSource.domain}`
                  : "Source unavailable"}
                {` · Basis: ${humanize(link.link_basis)}`}
                {` · Shared topics: ${link.shared_topic_tokens.join(", ")}`}
                {` · ${supportKindLabel(otherSupport.support_kind)}`}
              </small>
            </li>
          );
        })}
      </ul>
      <small>Semantics: review together only · status: needs review</small>
    </section>
  );
}

function ClaimFamilyDetail({
  packet,
  selection,
  item,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  item: Record<string, unknown>;
}) {
  const occurrenceIds = arrayValue(item.occurrence_ids);
  const occurrences = occurrenceIds.map((occurrenceId) =>
    packet?.claim_occurrences.find(
      (candidate) => candidate.occurrence_id === occurrenceId,
    ),
  );
  const membershipState = claimFamilyMembershipLabel(
    packet,
    selection.id,
    occurrenceIds,
    item.unresolved === true,
  );

  return (
    <div className="detail-body">
      <DetailField label="Grouping state" value={membershipState} />
      <DetailField label="Grouping reason" value={item.grouping_reason} />
      <InspectorList
        title="Source-local claim occurrences"
        items={occurrences.map((occurrence) => {
          if (!occurrence) return "One listed occurrence is unavailable in the displayed packet.";
          const source = packet?.source_snapshot_summaries.find(
            (candidate) => candidate.source_id === occurrence.source_id,
          );
          return [
            `${actorLabel(occurrence.actor)}: ${occurrence.original_claim_text}`,
            source ? `${sourceRoleLabel(source)} · ${source.title}` : null,
            focusedRecordStatusLabel(occurrence.status),
          ].filter((value): value is string => Boolean(value)).join(" · ");
        })}
        empty="No source-local claim occurrence is listed for this candidate family."
      />
      <InspectorList
        title="Grouping signals"
        items={arrayValue(item.grouping_signals)}
        empty="No grouping signal is available."
      />
      <DetailField
        label="Unresolved grouping"
        value={item.unresolved === true ? "Yes · grouping remains unresolved" : "No · grouping still needs review"}
      />
      <DetailField label="Review status" value="Needs review" />
      <DetailField label="Family origin" value={lineageOriginLabel(item.origin)} />
      <p className="detail-note">
        Candidate family membership organizes review. It is not an established taxonomy or truth judgment.
      </p>
    </div>
  );
}

function timestampWithPrecision(
  value: string | null,
  precision: TemporalPrecision,
): string {
  const formatted = formatReviewTimestamp(value, precision);
  if (!value || !precision) return `${formatted} · no explicit value and precision`;
  return precision === "day"
    ? `${formatted} · day precision; no within-day order`
    : `${formatted} · exact instant`;
}

function supportKindLabel(value: unknown): string {
  if (value === "captured_fixture_source_evidence_excerpt") {
    return "Direct excerpt from prepared source";
  }
  if (value === "model_generated_web_search_summary_span") {
    return "Excerpt from a model-generated search summary · not captured page text";
  }
  return "Evidence boundary unavailable";
}

function supportBoundaryLabel(value: unknown): string {
  if (value === "captured_fixture_support") return "Direct excerpt from prepared source";
  if (value === "model_summary_containment_only") {
    return "Excerpt from a model-generated search summary · not captured page text";
  }
  return "Evidence boundary unavailable";
}

function sourceRecordBoundaryLabel(value: unknown): string {
  if (value === "canonical") return "Prepared source record";
  if (value === "candidate") return "Needs review";
  return "Source boundary unavailable";
}

function lineageOriginLabel(value: unknown): string {
  if (value === "deterministic_fixture") return "Prepared example";
  if (value === "live_api") return "Live review result";
  return "Origin unavailable";
}

function occurrenceFamilyMembershipLabel(
  packet: SiteReadyCasePacket | undefined,
  occurrenceId: string,
  familyId: string | null,
): string {
  if (!packet) {
    return familyId
      ? "Candidate family reference present · membership needs review"
      : "Ungrouped claim occurrence";
  }

  const containingFamilies = packet.candidate_claim_families.filter(
    (family) => family.occurrence_ids.includes(occurrenceId),
  );
  if (!familyId) {
    return containingFamilies.length
      ? "Ungrouped claim occurrence · family membership is inconsistent"
      : "Ungrouped claim occurrence";
  }

  const family = packet.candidate_claim_families.find(
    (candidate) => candidate.family_id === familyId,
  );
  const consistent = family
    && family.occurrence_ids.includes(occurrenceId)
    && containingFamilies.length === 1
    && containingFamilies[0].family_id === familyId;
  if (!consistent) {
    return "Ungrouped claim occurrence · family membership is missing or inconsistent";
  }
  if (family.occurrence_ids.length === 1 && family.unresolved) {
    return "Standalone claim occurrence · grouping unresolved";
  }
  if (family.occurrence_ids.length > 1) {
    return `Candidate thread membership · ${family.occurrence_ids.length} occurrences · needs review`;
  }
  return "Ungrouped claim occurrence · singleton grouping is not marked unresolved";
}

function claimFamilyMembershipLabel(
  packet: SiteReadyCasePacket | undefined,
  familyId: string,
  occurrenceIds: string[],
  unresolved: boolean,
): string {
  const uniqueOccurrenceIds = new Set(occurrenceIds);
  if (occurrenceIds.length === 0 || uniqueOccurrenceIds.size !== occurrenceIds.length) {
    return "Candidate family membership is missing or inconsistent · occurrences fail closed to Ungrouped";
  }

  if (packet) {
    const consistent = occurrenceIds.every((occurrenceId) => {
      const occurrence = packet.claim_occurrences.find(
        (candidate) => candidate.occurrence_id === occurrenceId,
      );
      const containingFamilies = packet.candidate_claim_families.filter(
        (family) => family.occurrence_ids.includes(occurrenceId),
      );
      return occurrence?.candidate_claim_family_id === familyId
        && containingFamilies.length === 1
        && containingFamilies[0].family_id === familyId;
    });
    if (!consistent) {
      return "Candidate family membership is missing or inconsistent · occurrences fail closed to Ungrouped";
    }
  }

  if (occurrenceIds.length === 1) {
    return unresolved
      ? "Standalone claim occurrence · grouping unresolved"
      : "One-occurrence family is not marked unresolved · occurrence fails closed to Ungrouped";
  }
  return `Candidate thread · ${occurrenceIds.length} occurrences · needs review`;
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
  const limitations = projectPublicLimitations(arrayValue(item.limitations));
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
    ? deriveInvestigationMap(
        packet,
        chooseInitialTimeAxis(packet),
      ).questions.filter((question) =>
        question.origins.some((origin) =>
          origin.sourceIdentities.some((source) => source.sourceId === selection.id)
        )
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
      {sourceText ? (
        <div className="captured-text">
          <strong>Prepared source evidence</strong>
          <p>{sourceText}</p>
        </div>
      ) : evidenceExcerpt ? (
        <div className="captured-text">
          <strong>Captured evidence excerpt</strong>
          <p>{evidenceExcerpt}</p>
        </div>
      ) : (
        <div className="captured-text">
          <strong>Model-generated search summary · not captured page text</strong>
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
        items={changes.map((relation) => {
          const presentation = packet
            ? publicRelationPresentation(packet, relation)
            : null;
          return presentation?.sourceBacked
            ? `${relationDisplayLabel(presentation.presentationRelationType)} · Source-backed · needs review`
            : `${relationDisplayLabel(relation.relation_type)} · needs review`;
        })}
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
        <p className="detail-note">Prepared example: no external citation URL is available.</p>
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
    </div>
  );
}

function RelationDetail({
  packet,
  selection,
  item,
}: {
  packet?: SiteReadyCasePacket;
  selection: FocusSelection;
  item: Record<string, unknown>;
}) {
  const left = asRecord(item.left_support_reference);
  const right = asRecord(item.right_support_reference);
  const relation = packet?.relation_candidates.find(
    (candidate) => candidate.relation_id === selection.id,
  );
  const presentation = packet && relation
    ? publicRelationPresentation(packet, relation)
    : null;
  const signal = presentation?.signal ?? null;
  const candidateLeftSupport = relation
    ? asRecord(relation.left_support_reference)
    : left;
  const candidateRightSupport = relation
    ? asRecord(relation.right_support_reference)
    : right;
  const directedSupports = relation && presentation
    ? presentation.fromOccurrenceId === relation.left_occurrence_id
      && presentation.toOccurrenceId === relation.right_occurrence_id
      ? { from: candidateLeftSupport, to: candidateRightSupport }
      : presentation.fromOccurrenceId === relation.right_occurrence_id
        && presentation.toOccurrenceId === relation.left_occurrence_id
        ? { from: candidateRightSupport, to: candidateLeftSupport }
        : null
    : null;
  if (
    packet
    && relation
    && presentation?.sourceBacked
    && signal
    && directedSupports
  ) {
    const fromSupport = directedSupports.from;
    const toSupport = directedSupports.to;
    const statementSource = packet.source_snapshot_summaries.find(
      (source) => source.source_id === signal.statement_source_id
        && source.snapshot_id === signal.statement_snapshot_id,
    );
    const targetSource = packet.source_snapshot_summaries.find(
      (source) => source.source_id === signal.target_source_id
        && source.snapshot_id === signal.target_snapshot_id,
    );
    const statementSourceUrl = publicHttpSourceUrl(statementSource?.url);
    const targetSourceUrl = publicHttpSourceUrl(targetSource?.url);
    return (
      <div className="detail-body">
        <DetailField
          label="Connection"
          value={relationDisplayLabel(presentation.presentationRelationType)}
        />
        <DetailField label="Evidence state" value="Source-backed · Needs review" />
        <section className="source-backed-relation-evidence" aria-labelledby="source-backed-relation-title">
          <h4 id="source-backed-relation-title">Why this is shown</h4>
          <blockquote>
            <p>{signal.statement_excerpt}</p>
          </blockquote>
          <p>
            <strong>{statementSource?.title ?? "The statement source"}</strong>
            {" directly states this relationship."}
          </p>
          <p>
            Referenced document: <strong>{targetSource?.title ?? "Referenced source"}</strong>
          </p>
          {statementSourceUrl || targetSourceUrl ? (
            <div className="source-backed-relation-links">
              {statementSourceUrl ? (
                <a
                  className="citation-link"
                  href={statementSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open statement source <span aria-hidden="true">↗</span>
                </a>
              ) : null}
              {targetSourceUrl ? (
                <a
                  className="citation-link"
                  href={targetSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open referenced document <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
        <details className="detail-disclosure">
          <summary>Other relation review context</summary>
          <div className="detail-disclosure-body">
            <DetailField label="Reason" value={item.reason} />
            <div className="support-box">
              <strong>From-side candidate support</strong>
              <p>{stringValue(fromSupport.bounded_excerpt)}</p>
              <small>{supportBoundaryLabel(fromSupport.proves)}</small>
            </div>
            <div className="support-box">
              <strong>To-side candidate support</strong>
              <p>{stringValue(toSupport.bounded_excerpt)}</p>
              <small>{supportBoundaryLabel(toSupport.proves)}</small>
            </div>
            <p className="detail-note">
              These additional references are inspection aids. This relationship still
              needs review and remains a review candidate.
            </p>
          </div>
        </details>
      </div>
    );
  }
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
        <small>{supportBoundaryLabel(left.proves)}</small>
      </div>
      <div className="support-box">
        <strong>Right support</strong>
        <p>{stringValue(right.bounded_excerpt)}</p>
        <small>{supportBoundaryLabel(right.proves)}</small>
      </div>
      <p className="detail-note">
        Both support references are inspection aids. A confidence score cannot
        change this review candidate&apos;s status.
      </p>
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
        deriveInvestigationMap(packet, chooseInitialTimeAxis(packet)),
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
    </div>
  );
}

function questionOriginDescription(origin: QuestionInspectionOrigin): string {
  if (origin.topicRootOnly) {
    return `${origin.label}: ${origin.conciseIdentity}. No claim-occurrence tether is added.`;
  }
  const sourceDescription = origin.sourceIdentities
    .map((source) => `${source.title} (${source.sourceRole})`)
    .join("; ");
  const connection = {
    source: "The question references a source record without borrowing a claim body",
    actor_claim: origin.drawsOccurrenceTether
      ? "The actor claim resolves to every matching source-local occurrence"
      : "No matching source-local occurrence exists, so this remains a typed actor-claim origin",
    action: "The action stays a typed action-record origin and is not tethered to an arbitrary claim",
    occurrence: "The question references this exact claim occurrence",
    topic_unknown: "No record was conservatively resolved",
  }[origin.originType];
  return `${origin.label}: ${origin.conciseIdentity}. ${sourceDescription || "No source identity resolved"}. ${connection}.`;
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

function publicHttpSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
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
