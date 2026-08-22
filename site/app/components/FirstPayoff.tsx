"use client";

import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import { isSuitableForProminentReviewText } from "../lib/reviewer-text";
import {
  focusTriggerId,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

type PayoffSource = SiteReadyCasePacket["source_snapshot_summaries"][number];

export type FirstPayoffRecord =
  | {
      kind: "finding";
      record: SiteReadyCasePacket["source_bound_findings"][number];
      source: PayoffSource;
      text: string;
    }
  | {
      kind: "actor_claim";
      record: SiteReadyCasePacket["actor_claims"][number];
      source: PayoffSource;
      text: string;
    }
  | {
      kind: "action";
      record: SiteReadyCasePacket["actions"][number];
      source: PayoffSource;
      text: string;
    };

const QUESTION_STOPWORDS = new Set([
  "a", "about", "and", "as", "at", "be", "between", "by", "did", "do",
  "does", "for", "from", "had", "has", "have", "how", "in", "into", "is",
  "it", "of", "on", "or", "over", "public", "that", "the", "their", "this",
  "to", "was", "were", "what", "where", "which", "who", "with",
]);

const TOKEN_ALIASES: Record<string, string> = {
  changed: "change",
  changes: "change",
  changing: "change",
  delayed: "delay",
  delays: "delay",
  delaying: "delay",
  explained: "explain",
  explaining: "explain",
  explanation: "explain",
  explanations: "explain",
  moved: "move",
  moves: "move",
  moving: "move",
  postponed: "postpone",
  postponement: "postpone",
  postponements: "postpone",
  rescheduled: "reschedule",
  rescheduling: "reschedule",
  scheduled: "schedule",
  schedules: "schedule",
  scheduling: "schedule",
  timelines: "timeline",
  updated: "update",
  updates: "update",
  updating: "update",
};

const QUESTION_CONCEPTS = [
  new Set(["change", "delay", "move", "postpone", "reschedule", "shift", "update"]),
  new Set(["date", "deadline", "schedule", "timeline", "when"]),
  new Set(["because", "cause", "due", "explain", "reason", "why"]),
  new Set(["advice", "guidance", "recommendation"]),
  new Set(["assessment", "evaluation", "status"]),
] as const;

const DATE_TOKENS = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
]);

type WithoutSource<T> = T extends unknown ? Omit<T, "source"> : never;
type PayoffRecordWithoutSource = WithoutSource<FirstPayoffRecord>;

type PayoffCandidate = FirstPayoffRecord & {
  packetIndex: number;
  sourceIndex: number;
  relevance: number;
};

export function firstPayoffForPacket(
  packet: SiteReadyCasePacket,
): FirstPayoffRecord | null {
  if (packet.mode === "fallback") return null;

  const sources = new Map(
    packet.source_snapshot_summaries.map((source) => [source.source_id, source]),
  );
  const records: PayoffRecordWithoutSource[] = [
    ...packet.source_bound_findings.map((record) => ({
      kind: "finding" as const,
      record,
      text: record.text,
    })),
    ...packet.actor_claims.map((record) => ({
      kind: "actor_claim" as const,
      record,
      text: record.claim_text,
    })),
    ...packet.actions.map((record) => ({
      kind: "action" as const,
      record,
      text: record.action_text,
    })),
  ];
  const candidates: PayoffCandidate[] = [];
  for (const [packetIndex, payoffRecord] of records.entries()) {
    if (!payoffRecord.text.trim()) continue;
    if (
      packet.mode === "live"
      && !isSuitableForProminentReviewText(payoffRecord.text)
    ) {
      continue;
    }
    for (const [sourceIndex, sourceId] of payoffRecord.record.source_ids.entries()) {
      const source = sources.get(sourceId);
      if (!source?.title.trim()) continue;
      candidates.push({
        ...payoffRecord,
        source,
        packetIndex,
        sourceIndex,
        relevance: payoffRelevance(
          packet.normalized_public_interest_question,
          payoffRecord.text,
          source,
        ),
      });
    }
  }
  const first = candidates[0];
  if (!first) return null;

  const best = candidates.reduce((selected, candidate) => {
    if (candidate.relevance > selected.relevance) return candidate;
    if (candidate.relevance < selected.relevance) return selected;
    if (candidate.packetIndex < selected.packetIndex) return candidate;
    if (candidate.packetIndex > selected.packetIndex) return selected;
    return candidate.sourceIndex < selected.sourceIndex ? candidate : selected;
  }, first);

  // A weak token coincidence is not enough to reorder the packet. When no
  // candidate has meaningful question overlap, retain the first-valid behavior
  // that preceded the relevance selector.
  const selected = best.relevance >= 6 ? best : first;
  if (selected.kind === "finding") {
    return {
      kind: selected.kind,
      record: selected.record,
      source: selected.source,
      text: selected.text,
    };
  }
  if (selected.kind === "actor_claim") {
    return {
      kind: selected.kind,
      record: selected.record,
      source: selected.source,
      text: selected.text,
    };
  }
  return {
    kind: selected.kind,
    record: selected.record,
    source: selected.source,
    text: selected.text,
  };
}

function payoffRelevance(
  question: string,
  findingText: string,
  source: SiteReadyCasePacket["source_snapshot_summaries"][number],
): number {
  const questionTokens = meaningfulTokens(question);
  const findingTokens = meaningfulTokens(findingText);
  const titleTokens = meaningfulTokens(source.title);
  const sourceContextTokens = meaningfulTokens([
    source.publisher,
    source.domain,
    source.source_selection.why_included,
  ].join(" "));
  let score = weightedOverlap(questionTokens, findingTokens, 6);
  score += Math.min(weightedOverlap(questionTokens, titleTokens, 2), 8);
  score += Math.min(weightedOverlap(questionTokens, sourceContextTokens, 1), 4);

  for (const concept of QUESTION_CONCEPTS) {
    if (hasConcept(questionTokens, concept) && hasConcept(findingTokens, concept)) {
      score += 5;
    }
  }
  return score;
}

function meaningfulTokens(value: string): Set<string> {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(tokens
    .map((token) => TOKEN_ALIASES[token] ?? token)
    .filter((token) => (token.length > 1 || /^\d+$/.test(token)) && !QUESTION_STOPWORDS.has(token)));
}

function weightedOverlap(
  questionTokens: ReadonlySet<string>,
  candidateTokens: ReadonlySet<string>,
  weight: number,
): number {
  let score = 0;
  for (const token of candidateTokens) {
    if (!questionTokens.has(token)) continue;
    score += weight;
    if (/^\d+$/.test(token) || DATE_TOKENS.has(token)) score += 3;
  }
  return score;
}

function hasConcept(
  tokens: ReadonlySet<string>,
  concept: ReadonlySet<string>,
): boolean {
  return [...concept].some((token) => tokens.has(token));
}

export function FirstPayoff({
  packet,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  onFocus: FocusHandler;
}) {
  const payoff = firstPayoffForPacket(packet);
  if (!payoff) return null;

  const selection: FocusSelection = {
    kind: "source",
    id: payoff.source.source_id,
    label: payoff.source.title,
  };
  const synthetic = packet.mode === "deterministic";
  const modelGeneratedLiveSummary = packet.mode === "live"
    && payoff.source.content_kind === "model_generated_web_search_summary"
    && !payoff.source.source_text_captured;
  const typeLabel = payoff.kind === "finding"
    ? "Finding"
    : payoff.kind === "actor_claim"
      ? "Actor claim"
      : "Action record";

  return (
    <section className="first-payoff" aria-labelledby="first-payoff-title">
      <div className="first-payoff-heading">
        <p className="eyebrow">Start here</p>
        <strong id="first-payoff-title">{typeLabel}</strong>
        {synthetic ? <small>Prepared example</small> : null}
      </div>
      <p className="first-payoff-text">{payoff.text}</p>
      <p className="first-payoff-source">
        Source: {" "}
        <button
          type="button"
          data-focus-trigger={focusTriggerId("first-payoff", selection)}
          onClick={(event) => onFocus(selection, event.currentTarget)}
        >
          {payoff.source.title}
        </button>
      </p>
      {modelGeneratedLiveSummary ? (
        <p className="first-payoff-provenance">
          Based on a model-generated web-search summary · not captured page text
        </p>
      ) : null}
      <p className="first-payoff-boundary">
        Source inclusion is not endorsement or truth verification.
      </p>
    </section>
  );
}
