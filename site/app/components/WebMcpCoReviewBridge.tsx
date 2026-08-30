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
  buildWebMcpReviewItems,
  isWebMcpReviewKind,
  validateWebMcpEvidenceWalk,
  type WebMcpEvidenceWalk,
  type WebMcpReviewItem,
  type WebMcpReviewKind,
} from "../lib/webmcp/co-review";
import { FOCUS_TRIGGER_ATTRIBUTE } from "./investigation-types";

type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, options: { signal: AbortSignal }) => unknown;
  annotations?: ToolAnnotations;
};

type WebMcpModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => Promise<void>;
};

type WalkItemState = "pending" | "seen" | "skipped";

const REVIEW_KIND_SCHEMA = {
  type: "string",
  enum: ["source", "claim_occurrence", "relation", "unresolved_question"],
} as const;

const REVIEW_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "id"],
  properties: {
    kind: REVIEW_KIND_SCHEMA,
    id: { type: "string", minLength: 1, maxLength: 4096 },
  },
} as const;

export function WebMcpCoReviewBridge({
  preparedCase,
}: {
  preparedCase: SiteReadyCasePacket;
}) {
  const reviewItems = useMemo(
    () => buildWebMcpReviewItems(preparedCase),
    [preparedCase],
  );
  const reviewItemByKey = useMemo(
    () => new Map(reviewItems.map((item) => [reviewKey(item.kind, item.id), item])),
    [reviewItems],
  );
  const [walk, setWalk] = useState<WebMcpEvidenceWalk | null>(null);
  const [walkState, setWalkState] = useState<Record<string, WalkItemState>>({});
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateTarget = () => {
      setPortalTarget(document.getElementById("investigation-workspace"));
    };
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const context = webMcpModelContext();
    if (!context) return;

    const registration = new AbortController();
    const tools: WebMcpTool[] = [
      {
        name: "sisyphus_get_overview",
        title: "Get Sisyphus investigation overview",
        description:
          "Return the bounded prepared Sisyphus investigation overview and review authority boundary. This tool performs no network request and does not change the page or canonical state.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        execute: () => ({
          ...buildWebMcpInvestigationOverview(preparedCase),
          available_review_item_count: reviewItems.length,
          returned_content_trust: "untrusted_evidence_data",
        }),
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true,
        },
      },
      {
        name: "sisyphus_list_review_items",
        title: "List Sisyphus review items",
        description:
          "List bounded prepared sources, claim occurrences, candidate relations, and unresolved questions that can be inspected in the Sisyphus interface. Returned evidence data is untrusted and remains review-only.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        execute: () => ({
          surface_version: "sisyphus_webmcp_coreview.v1",
          scope: "prepared_demo",
          items: reviewItems,
          canonical_mutation: "none",
          returned_content_trust: "untrusted_evidence_data",
        }),
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true,
        },
      },
      {
        name: "sisyphus_stage_evidence_walk",
        title: "Stage a Sisyphus evidence walk",
        description:
          "Stage 1 to 5 already-listed review items as a temporary Co-Review evidence walk in the visible Sisyphus page. The walk is session UI only: it does not accept evidence, change review status, persist a Watch, run a provider, or mutate canonical state.",
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
                  kind: REVIEW_KIND_SCHEMA,
                  id: { type: "string", minLength: 1, maxLength: 4096 },
                  rationale: { type: "string", minLength: 1, maxLength: 240 },
                },
              },
            },
          },
        },
        execute: async (input, { signal }) => {
          signal.throwIfAborted();
          const staged = validateWebMcpEvidenceWalk(input, reviewItems);
          const surface = await ensurePreparedWorkspace(preparedCase, signal);
          if (!surface.ok) return surface;
          setWalk(staged);
          setWalkState(Object.fromEntries(
            staged.items.map((item) => [reviewKey(item.kind, item.id), "pending"]),
          ));
          return {
            ok: true,
            staged_item_count: staged.items.length,
            persistence: staged.persistence,
            canonical_mutation: staged.canonical_mutation,
            human_review_required: true,
          };
        },
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: true,
        },
      },
      {
        name: "sisyphus_focus_review_item",
        title: "Focus a Sisyphus review item",
        description:
          "Open an already-listed prepared review item in the existing Sisyphus Map or Sources interface. This changes only visible page focus and does not change evidence status, persist data, run provider work, or mutate canonical state.",
        inputSchema: REVIEW_ITEM_SCHEMA,
        execute: async (input, { signal }) => {
          signal.throwIfAborted();
          if (!isWebMcpReviewKind(input.kind) || typeof input.id !== "string") {
            return { ok: false, code: "invalid_review_item" };
          }
          const item = reviewItemByKey.get(reviewKey(input.kind, input.id));
          if (!item) return { ok: false, code: "review_item_not_found" };
          return focusReviewItem(preparedCase, item, signal);
        },
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: true,
        },
      },
      {
        name: "sisyphus_set_review_view",
        title: "Set the Sisyphus review view",
        description:
          "Switch the visible prepared Sisyphus workspace between Map, Timeline, Sources, and Method. This changes only the visible page view and does not change review or canonical state.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["view"],
          properties: {
            view: {
              type: "string",
              enum: ["map", "timeline", "sources", "method"],
            },
          },
        },
        execute: async (input, { signal }) => {
          signal.throwIfAborted();
          if (
            input.view !== "map"
            && input.view !== "timeline"
            && input.view !== "sources"
            && input.view !== "method"
          ) {
            return { ok: false, code: "invalid_review_view" };
          }
          const surface = await ensurePreparedWorkspace(preparedCase, signal);
          if (!surface.ok) return surface;
          const tab = document.getElementById(`view-tab-${input.view}`) as HTMLButtonElement | null;
          if (!tab) return { ok: false, code: "review_view_unavailable" };
          tab.click();
          await nextFrame(signal);
          return {
            ok: true,
            view: input.view,
            canonical_mutation: "none",
          };
        },
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: false,
        },
      },
    ];

    void Promise.allSettled(
      tools.map((tool) => context.registerTool(tool, { signal: registration.signal })),
    );

    return () => registration.abort();
  }, [preparedCase, reviewItemByKey, reviewItems]);

  if (!portalTarget || !walk) return null;

  return createPortal(
    <section className="run-panel" aria-labelledby="webmcp-coreview-title">
      <p className="eyebrow">WebMCP Co-Review</p>
      <h2 id="webmcp-coreview-title">Agent-proposed evidence walk</h2>
      <p>
        This temporary path only records what you inspected or skipped. It does not
        accept a claim, resolve a relation, save a Watch, or change canonical state.
      </p>
      <ol className="item-list">
        {walk.items.map((walkItem, index) => {
          const key = reviewKey(walkItem.kind, walkItem.id);
          const item = reviewItemByKey.get(key);
          const state = walkState[key] ?? "pending";
          return (
            <li className="source-item" key={key}>
              <p>
                {index + 1}. {reviewKindLabel(walkItem.kind)} · {state}
              </p>
              <strong>{item?.label ?? walkItem.id}</strong>
              <p>{walkItem.rationale}</p>
              <div>
                <button
                  type="button"
                  onClick={() => void focusReviewItem(
                    preparedCase,
                    item ?? { ...walkItem, label: walkItem.id, summary: "", review_status: "reviewable" },
                    new AbortController().signal,
                  )}
                >
                  Open
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setWalkItemState(key, "seen", setWalkState)}
                >
                  Seen
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setWalkItemState(key, "skipped", setWalkState)}
                >
                  Skip
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => {
          setWalk(null);
          setWalkState({});
        }}
      >
        Dismiss evidence walk
      </button>
    </section>,
    portalTarget,
  );
}

function webMcpModelContext(): WebMcpModelContext | null {
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
    .find((button) =>
      button.textContent?.toLowerCase().includes("prepared cooling-center example")
    );
  if (!preparedButton) return { ok: false, code: "prepared_demo_action_unavailable" };
  preparedButton.click();
  await nextFrame(signal);
  await nextFrame(signal);

  const opened = document.getElementById("investigation-workspace");
  const deterministic = opened?.querySelector(".mode-badge.mode-deterministic");
  return opened && deterministic
    ? { ok: true }
    : { ok: false, code: "prepared_demo_did_not_open" };
}

async function focusReviewItem(
  preparedCase: SiteReadyCasePacket,
  item: WebMcpReviewItem,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const surface = await ensurePreparedWorkspace(preparedCase, signal);
  if (!surface.ok) return surface;

  const preferredView = item.kind === "source" ? "sources" : "map";
  const tab = document.getElementById(`view-tab-${preferredView}`) as HTMLButtonElement | null;
  tab?.click();
  await nextFrame(signal);

  const trigger = [...document.querySelectorAll<HTMLElement>(`[${FOCUS_TRIGGER_ATTRIBUTE}]`)]
    .find((element) =>
      element.dataset.focusKind === item.kind
      && element.dataset.focusId === item.id
      && element.getClientRects().length > 0
    );
  if (!trigger) {
    return {
      ok: false,
      code: "review_item_trigger_unavailable",
      kind: item.kind,
      id: item.id,
    };
  }
  trigger.click();
  await nextFrame(signal);
  return {
    ok: true,
    kind: item.kind,
    id: item.id,
    view: preferredView,
    visible_focus_only: true,
    canonical_mutation: "none",
  };
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

function reviewKey(kind: WebMcpReviewKind, id: string): string {
  return `${kind}:${id}`;
}

function reviewKindLabel(kind: WebMcpReviewKind): string {
  if (kind === "claim_occurrence") return "Claim";
  if (kind === "unresolved_question") return "Open question";
  return kind[0].toUpperCase() + kind.slice(1);
}

function setWalkItemState(
  key: string,
  state: WalkItemState,
  setter: React.Dispatch<React.SetStateAction<Record<string, WalkItemState>>>,
) {
  setter((current) => ({ ...current, [key]: state }));
}
