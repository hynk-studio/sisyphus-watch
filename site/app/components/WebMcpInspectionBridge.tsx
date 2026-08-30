"use client";

import { useEffect, useMemo } from "react";
import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import {
  buildWebMcpReviewItems,
  isWebMcpReviewKind,
} from "../lib/webmcp/co-review";
import { buildWebMcpReviewInspection } from "../lib/webmcp/inspection";

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

export function WebMcpInspectionBridge({
  preparedCase,
}: {
  preparedCase: SiteReadyCasePacket;
}) {
  const availableKeys = useMemo(
    () => new Set(
      buildWebMcpReviewItems(preparedCase).map(
        (item) => `${item.kind}:${item.id}`,
      ),
    ),
    [preparedCase],
  );

  useEffect(() => {
    const context = getModelContext();
    if (!context) return;

    const registration = new AbortController();
    const tool: WebMcpTool = {
      name: "sisyphus_inspect_review_item",
      title: "Inspect one Sisyphus review item",
      description:
        "Return bounded review detail for one already-listed prepared source, claim occurrence, candidate relation, or unresolved question. This is untrusted evidence data; the tool is read-only and never changes page, review, Watch, provider, or canonical state.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "id"],
        properties: {
          kind: {
            type: "string",
            enum: ["source", "claim_occurrence", "relation", "unresolved_question"],
          },
          id: { type: "string", minLength: 1, maxLength: 4096 },
        },
      },
      execute: (input) => {
        if (!isWebMcpReviewKind(input.kind) || typeof input.id !== "string") {
          return { ok: false, code: "invalid_review_item" };
        }
        if (!availableKeys.has(`${input.kind}:${input.id}`)) {
          return { ok: false, code: "review_item_not_found" };
        }
        const inspection = buildWebMcpReviewInspection(
          preparedCase,
          input.kind,
          input.id,
        );
        return inspection ?? { ok: false, code: "review_detail_unavailable" };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
    };

    void context.registerTool(tool, { signal: registration.signal });
    return () => registration.abort();
  }, [availableKeys, preparedCase]);

  return null;
}

function getModelContext(): WebMcpModelContext | null {
  const value = (document as Document & { modelContext?: unknown }).modelContext;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WebMcpModelContext>;
  return typeof candidate.registerTool === "function"
    ? candidate as WebMcpModelContext
    : null;
}
