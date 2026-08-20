"use client";

import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import {
  focusTriggerId,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

export interface FirstPayoffRecord {
  finding: SiteReadyCasePacket["source_bound_findings"][number];
  source: SiteReadyCasePacket["source_snapshot_summaries"][number];
}

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

interface PayoffCandidate extends FirstPayoffRecord {
  findingIndex: number;
  sourceIndex: number;
  relevance: number;
}

export function firstPayoffForPacket(
  packet: SiteReadyCasePacket,
): FirstPayoffRecord | null {
  if (packet.mode === "fallback") return null;

  const sources = new Map(
    packet.source_snapshot_summaries.map((source) => [source.source_id, source]),
  );
  const candidates: PayoffCandidate[] = [];
  for (const [findingIndex, finding] of packet.source_bound_findings.entries()) {
    if (!finding.text.trim()) continue;
    for (const [sourceIndex, sourceId] of finding.source_ids.entries()) {
      const source = sources.get(sourceId);
      if (!source?.title.trim()) continue;
      candidates.push({
        finding,
        source,
        findingIndex,
        sourceIndex,
        relevance: payoffRelevance(
          packet.normalized_public_interest_question,
          finding.text,
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
    if (candidate.findingIndex < selected.findingIndex) return candidate;
    if (candidate.findingIndex > selected.findingIndex) return selected;
    return candidate.sourceIndex < selected.sourceIndex ? candidate : selected;
  }, first);

  // A weak token coincidence is not enough to reorder the packet. When no
  // candidate has meaningful question overlap, retain the first-valid behavior
  // that preceded the relevance selector.
  return best.relevance >= 6
    ? { finding: best.finding, source: best.source }
    : { finding: first.finding, source: first.source };
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

  return (
    <section className="first-payoff" aria-labelledby="first-payoff-title">
      <div className="first-payoff-heading">
        <p className="eyebrow">Start here</p>
        <strong id="first-payoff-title">
          {synthetic
            ? "Synthetic fixture · prepared example"
            : "Candidate finding · review only"}
        </strong>
      </div>
      <p className="first-payoff-finding">{payoff.finding.text}</p>
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
        Source inclusion is not endorsement or truth verification. Browsing does
        not change the record.
      </p>
    </section>
  );
}
