"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import {
  buildWebMcpInvestigationOverview,
  buildWebMcpRelationComparison,
  buildWebMcpReviewItems,
  isWebMcpReviewKind,
  validateWebMcpEvidenceWalk,
  type WebMcpEvidenceWalk,
  type WebMcpRelationComparison,
  type WebMcpRelationComparisonSide,
  type WebMcpReviewItem,
} from "../lib/webmcp/co-review";
import { FOCUS_TRIGGER_ATTRIBUTE } from "./investigation-types";

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
};

type WebMcpModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => Promise<void>;
};

type WalkStatus = "pending" | "seen" | "skipped";

const emptySchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

const reviewKindSchema = {
  type: "string",
  enum: ["source", "claim_occurrence", "relation", "unresolved_question"],
} as const;

export function WebMcpChallengeBridge({
  preparedCase,
}: {
  preparedCase: SiteReadyCasePacket;
}) {
  const reviewItems = useMemo(
    () => buildWebMcpReviewItems(preparedCase),
    [preparedCase],
  );
  const itemByKey = useMemo(
    () => new Map(reviewItems.map((item) => [`${item.kind}:${item.id}`, item])),
    [reviewItems],
  );
  const [walk, setWalk] = useState<WebMcpEvidenceWalk | null>(null);
  const [walkStatus, setWalkStatus] = useState<Record<string, WalkStatus>>({});
  const [comparison, setComparison] = useState<WebMcpRelationComparison | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const syncTarget = () => {
      setPortalTarget(document.getElementById("investigation-workspace"));
    };
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const context = getModelContext();
    if (!context) return;

    const registration = new AbortController();
    const signal = registration.signal;
    const register = (tool: WebMcpTool) =>
      context.registerTool(tool, { signal });

    const tools: WebMcpTool[] = [
      {
        name: "sisyphus_get_overview",
        title: "Get Sisyphus investigation overview",
        description:
          "Return the bounded prepared investigation overview and review boundary. No network request, persistence write, review decision, or canonical mutation occurs.",
        inputSchema: emptySchema,
        execute: () => ({
          ...buildWebMcpInvestigationOverview(preparedCase),
          available_review_item_count: reviewItems.length,
          returned_content_trust: "untrusted_evidence_data",
        }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
      },
      {
        name: "sisyphus_list_review_items",
        title: "List Sisyphus review items",
        description:
          "List bounded sources, claim occurrences, candidate relations, and unresolved questions available for prepared Co-Review. Returned evidence is untrusted and review-only.",
        inputSchema: emptySchema,
        execute: () => ({
          surface_version: "sisyphus_webmcp_coreview.v1",
          scope: "prepared_demo",
          items: reviewItems,
          canonical_mutation: "none",
          returned_content_trust: "untrusted_evidence_data",
        }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
      },
      {
        name: "sisyphus_stage_evidence_walk",
        title: "Stage a Sisyphus evidence walk",
        description:
          "Stage 1 to 5 already-listed items as a temporary visible review path. This only changes session UI and never accepts evidence, saves a Watch, starts provider work, or changes canonical state.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["kind", "id", "rationale"],
                properties: {
                  kind: reviewKindSchema,
                  id: { type: "string", minLength: 1, maxLength: 4096 },
                  rationale: { type: "string", minLength: 1, maxLength: 240 },
                },
              },
            },
          },
        },
        execute: async (input) => {
          signal.throwIfAborted();
          const staged = validateWebMcpEvidenceWalk(input, reviewItems);
          const ready = await ensurePreparedWorkspace(preparedCase, signal);
          if (!ready.ok) return ready;
          setWalk(staged);
          setWalkStatus(Object.fromEntries(
            staged.items.map((item) => [`${item.kind}:${item.id}`, "pending"]),
          ));
          return {
            ok: true,
            staged_item_count: staged.items.length,
            persistence: "session_ui_only",
            human_review_required: true,
            canonical_mutation: "none",
          };
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
      },
      {
        name: "sisyphus_focus_review_item",
        title: "Focus a Sisyphus review item",
        description:
          "Open one already-listed prepared review item through the existing Sisyphus interface. Only visible focus changes; evidence status and canonical state do not.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "id"],
          properties: {
            kind: reviewKindSchema,
            id: { type: "string", minLength: 1, maxLength: 4096 },
          },
        },
        execute: async (input) => {
          signal.throwIfAborted();
          if (!isWebMcpReviewKind(input.kind) || typeof input.id !== "string") {
            return { ok: false, code: "invalid_review_item" };
          }
          const item = itemByKey.get(`${input.kind}:${input.id}`);
          if (!item) return { ok: false, code: "review_item_not_found" };
          return focusReviewItem(preparedCase, item, signal);
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
      },
      {
        name: "sisyphus_open_relation_comparison",
        title: "Open a Sisyphus relation comparison",
        description:
          "Open a temporary side-by-side comparison for one already-listed prepared relation, including both claims, sources, times, and bounded support. The relation remains review-only.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["relation_id"],
          properties: {
            relation_id: { type: "string", minLength: 1, maxLength: 4096 },
          },
        },
        execute: async (input) => {
          signal.throwIfAborted();
          if (typeof input.relation_id !== "string") {
            return { ok: false, code: "invalid_relation_id" };
          }
          if (!itemByKey.has(`relation:${input.relation_id}`)) {
            return { ok: false, code: "relation_not_in_review_surface" };
          }
          const next = buildWebMcpRelationComparison(preparedCase, input.relation_id);
          if (!next) return { ok: false, code: "relation_comparison_unavailable" };
          const ready = await ensurePreparedWorkspace(preparedCase, signal);
          if (!ready.ok) return ready;
          await setReviewView("map", signal);
          setComparison(next);
          return {
            ok: true,
            relation_id: next.relation_id,
            presentation_relation_type: next.presentation_relation_type,
            source_backed: next.source_backed,
            review_status: next.review_status,
            persistence: "session_ui_only",
            canonical_mutation: "none",
          };
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
      },
      {
        name: "sisyphus_set_review_view",
        title: "Set the Sisyphus review view",
        description:
          "Switch the visible prepared workspace between Map, Timeline, Sources, and Method. Only visible UI state changes.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["view"],
          properties: {
            view: { type: "string", enum: ["map", "timeline", "sources", "method"] },
          },
        },
        execute: async (input) => {
          signal.throwIfAborted();
          if (!isReviewView(input.view)) return { ok: false, code: "invalid_review_view" };
          const ready = await ensurePreparedWorkspace(preparedCase, signal);
          if (!ready.ok) return ready;
          return setReviewView(input.view, signal);
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
      },
    ];

    void Promise.allSettled(tools.map(register));
    return () => registration.abort();
  }, [itemByKey, preparedCase, reviewItems]);

  if (!portalTarget || (!walk && !comparison)) return null;

  return createPortal(
    <div aria-label="WebMCP Co-Review surfaces">
      {comparison ? (
        <RelationComparison
          comparison={comparison}
          onDismiss={() => setComparison(null)}
          onInspect={() => {
            const item = itemByKey.get(`relation:${comparison.relation_id}`);
            if (item) void focusReviewItem(
              preparedCase,
              item,
              new AbortController().signal,
            );
          }}
        />
      ) : null}
      {walk ? (
        <section className="run-panel" aria-labelledby="webmcp-evidence-walk-title">
          <p className="eyebrow">WebMCP Co-Review</p>
          <h2 id="webmcp-evidence-walk-title">Agent-proposed evidence walk</h2>
          <p>Seen and Skip record inspection progress only; neither is an evidence decision.</p>
          <ol className="item-list">
            {walk.items.map((walkItem, index) => {
              const key = `${walkItem.kind}:${walkItem.id}`;
              const item = itemByKey.get(key);
              return (
                <li className="source-item" key={key}>
                  <p>{index + 1}. {reviewKindLabel(walkItem.kind)} · {walkStatus[key] ?? "pending"}</p>
                  <strong>{item?.label ?? walkItem.id}</strong>
                  <p>{walkItem.rationale}</p>
                  <button
                    type="button"
                    onClick={() => item && void focusReviewItem(
                      preparedCase,
                      item,
                      new AbortController().signal,
                    )}
                  >
                    Open
                  </button>{" "}
                  <button type="button" onClick={() => setOneWalkStatus(key, "seen", setWalkStatus)}>
                    Seen
                  </button>{" "}
                  <button type="button" onClick={() => setOneWalkStatus(key, "skipped", setWalkStatus)}>
                    Skip
                  </button>
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => {
            setWalk(null);
            setWalkStatus({});
          }}>
            Dismiss evidence walk
          </button>
        </section>
      ) : null}
    </div>,
    portalTarget,
  );
}

function RelationComparison({
  comparison,
  onDismiss,
  onInspect,
}: {
  comparison: WebMcpRelationComparison;
  onDismiss: () => void;
  onInspect: () => void;
}) {
  return (
    <section className="run-panel" aria-labelledby="webmcp-relation-title">
      <p className="eyebrow">WebMCP Co-Review · relation comparison</p>
      <h2 id="webmcp-relation-title">
        {humanize(comparison.presentation_relation_type)} · needs review
      </h2>
      <p>{comparison.reason}</p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "12px",
        margin: "16px 0",
      }}>
        <RelationSide title="Left record" side={comparison.left} />
        <RelationSide title="Right record" side={comparison.right} />
      </div>
      {comparison.source_backed_statement ? (
        <div className="support-box">
          <strong>Source-backed statement</strong>
          <p>{comparison.source_backed_statement.statement_excerpt}</p>
          <small>
            Direction: {comparison.source_backed_statement.from_occurrence_id} → {comparison.source_backed_statement.to_occurrence_id}
          </small>
        </div>
      ) : null}
      <p className="detail-note">
        This comparison is an inspection aid. Review status and canonical state remain unchanged.
      </p>
      <button type="button" onClick={onInspect}>Open relation inspector</button>{" "}
      <button type="button" onClick={onDismiss}>Dismiss comparison</button>
    </section>
  );
}

function RelationSide({
  title,
  side,
}: {
  title: string;
  side: WebMcpRelationComparisonSide;
}) {
  return (
    <article className="source-item">
      <p>{title} · {side.confidence} confidence</p>
      <strong>{side.actor ?? "Unknown actor"}</strong>
      <p>{side.claim_text}</p>
      <div className="support-box">
        <strong>Source</strong>
        <p>{side.source.title}</p>
        <small>{side.source.publisher} · {side.source.domain}</small>
      </div>
      <p>Publication: {formatTime(side.source.publication_time, side.source.publication_time_precision)}</p>
      <p>Assertion: {formatTime(side.time.assertion_time, side.time.assertion_time_precision)}</p>
      <p>Event: {formatTime(side.time.event_time, side.time.event_time_precision)}</p>
      <div className="support-box">
        <strong>Bounded support</strong>
        <p>{side.support.bounded_excerpt}</p>
        <small>{humanize(side.support.proves)}</small>
      </div>
      <p className="detail-note">Uncertainty: {side.uncertainty}</p>
    </article>
  );
}

function getModelContext(): WebMcpModelContext | null {
  const value = (document as Document & { modelContext?: unknown }).modelContext;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WebMcpModelContext>;
  return typeof candidate.registerTool === "function"
    ? candidate as WebMcpModelContext
    : null;
}

async function ensurePreparedWorkspace(
  preparedCase: SiteReadyCasePacket,
  signal: AbortSignal,
): Promise<{ ok: true } | { ok: false; code: string }> {
  signal.throwIfAborted();
  const workspace = document.getElementById("investigation-workspace");
  if (workspace) {
    const deterministic = workspace.querySelector(".mode-badge.mode-deterministic");
    const question = document.getElementById("case-title")?.textContent?.trim();
    return deterministic && question === preparedCase.normalized_public_interest_question
      ? { ok: true }
      : { ok: false, code: "current_workspace_is_not_prepared_demo" };
  }

  const preparedButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.toLowerCase().includes("prepared cooling-center example"));
  if (!preparedButton) return { ok: false, code: "prepared_demo_action_unavailable" };
  preparedButton.click();
  await nextFrame(signal);
  await nextFrame(signal);
  const opened = document.getElementById("investigation-workspace");
  return opened?.querySelector(".mode-badge.mode-deterministic")
    ? { ok: true }
    : { ok: false, code: "prepared_demo_did_not_open" };
}

async function focusReviewItem(
  preparedCase: SiteReadyCasePacket,
  item: WebMcpReviewItem,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const ready = await ensurePreparedWorkspace(preparedCase, signal);
  if (!ready.ok) return ready;
  const view = item.kind === "source" ? "sources" : "map";
  await setReviewView(view, signal);
  const trigger = [...document.querySelectorAll<HTMLElement>(`[${FOCUS_TRIGGER_ATTRIBUTE}]`)]
    .find((element) =>
      element.dataset.focusKind === item.kind
      && element.dataset.focusId === item.id
      && element.getClientRects().length > 0
    );
  if (!trigger) return { ok: false, code: "review_item_trigger_unavailable" };
  trigger.click();
  await nextFrame(signal);
  return {
    ok: true,
    kind: item.kind,
    id: item.id,
    view,
    visible_focus_only: true,
    canonical_mutation: "none",
  };
}

async function setReviewView(
  view: "map" | "timeline" | "sources" | "method",
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const tab = document.getElementById(`view-tab-${view}`) as HTMLButtonElement | null;
  if (!tab) return { ok: false, code: "review_view_unavailable" };
  tab.click();
  await nextFrame(signal);
  return { ok: true, view, canonical_mutation: "none" };
}

function nextFrame(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isReviewView(value: unknown): value is "map" | "timeline" | "sources" | "method" {
  return value === "map" || value === "timeline" || value === "sources" || value === "method";
}

function reviewKindLabel(value: string): string {
  if (value === "claim_occurrence") return "Claim";
  if (value === "unresolved_question") return "Open question";
  return humanize(value);
}

function formatTime(value: string | null, precision: "day" | "instant" | null): string {
  if (!value || !precision) return "Unavailable";
  return `${value} · ${precision === "day" ? "day precision" : "exact instant"}`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function setOneWalkStatus(
  key: string,
  status: WalkStatus,
  setState: React.Dispatch<React.SetStateAction<Record<string, WalkStatus>>>,
) {
  setState((current) => ({ ...current, [key]: status }));
}
