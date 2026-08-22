const TOPIC_STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "before", "being",
  "between", "both", "but", "can", "did", "does", "each", "for", "from",
  "had", "has", "have", "into", "its", "may", "more", "not", "only",
  "other", "our", "public", "record", "said", "says", "source", "states",
  "summary", "than", "that", "the", "their", "them", "then", "there",
  "these", "they", "this", "through", "under", "was", "were", "will",
  "with", "would",
]);

const TOPIC_TOKEN_ALIASES: Record<string, string> = {
  changed: "change",
  changes: "change",
  changing: "change",
  explained: "explain",
  explaining: "explain",
  explanation: "explain",
  explanations: "explain",
  lander: "landing",
  landers: "landing",
  missions: "mission",
  moved: "move",
  moves: "move",
  moving: "move",
  planned: "plan",
  plans: "plan",
  planning: "plan",
  reduced: "reduce",
  reduces: "reduce",
  reducing: "reduce",
  reduction: "reduce",
  scheduled: "schedule",
  schedules: "schedule",
  scheduling: "schedule",
  tested: "test",
  testing: "test",
  tests: "test",
  updated: "update",
  updates: "update",
  updating: "update",
};

// These words describe reporting structure more often than the proposition being
// compared. Keep this deliberately small and separate from BFG8W topic tokens so
// review-link selection remains byte-for-byte stable.
const DIRECT_LEXICAL_GENERIC_WORDS = new Set([
  "agency", "announce", "announced", "announces", "authority", "department",
  "describe", "described", "describes", "description", "office", "policy",
  "program", "project", "report", "reported", "reporting", "reports",
  "revised", "revision", "schedule", "update",
]);

export interface TokenOverlap {
  score: number;
  shared: string[];
}

export function normalizeLineageText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicTokenSet(value: string): Set<string> {
  return new Set(
    normalizeLineageText(value)
      .split(" ")
      .map((token) => TOPIC_TOKEN_ALIASES[token] ?? token)
      .filter((token) => token.length >= 3 && !TOPIC_STOP_WORDS.has(token)),
  );
}

export function directLexicalTokenSet(
  value: string,
  excludedTokens: ReadonlySet<string> = new Set<string>(),
): Set<string> {
  return new Set(
    [...topicTokenSet(value)].filter(
      (token) =>
        !excludedTokens.has(token)
        && !DIRECT_LEXICAL_GENERIC_WORDS.has(token),
    ),
  );
}

export function entityAnchorTokenSet(value: string): Set<string> {
  const rawTokens = value.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const anchors = new Set<string>();
  rawTokens.forEach((token, index) => {
    const normalized = normalizeLineageText(token);
    const fourDigitYear = /^\d{4}$/u.test(token);
    const romanNumeral = /^(?=[IVXLCDM]{2,}$)[IVXLCDM]+$/u.test(token);
    const uppercaseAcronym =
      index > 0
      && /\p{L}/u.test(token)
      && token === token.toUpperCase()
      && token !== token.toLowerCase();
    const titleCasedProperName =
      index > 0
      && /^\p{Lu}[\p{Ll}\p{M}\p{N}]*$/u.test(token);
    if (
      normalized.length < 3
      && !fourDigitYear
      && !romanNumeral
      && !uppercaseAcronym
    ) return;
    if (fourDigitYear || romanNumeral || uppercaseAcronym || titleCasedProperName) {
      anchors.add(normalized);
    }
  });
  return anchors;
}

export function tokenOverlap(
  leftTokens: ReadonlySet<string>,
  rightTokens: ReadonlySet<string>,
): TokenOverlap {
  const shared = [...leftTokens]
    .filter((token) => rightTokens.has(token))
    .sort(compareCodePoint);
  const union = new Set([...leftTokens, ...rightTokens]);
  return {
    score: union.size === 0 ? 0 : shared.length / union.size,
    shared,
  };
}

export function withoutTokens(
  tokens: ReadonlySet<string>,
  excludedTokens: ReadonlySet<string>,
): Set<string> {
  return new Set([...tokens].filter((token) => !excludedTokens.has(token)));
}

export function stableTokenUnion(
  tokenSets: Iterable<ReadonlySet<string>>,
  maximumTokenCount = Number.POSITIVE_INFINITY,
): Set<string> {
  const union = new Set<string>();
  for (const tokenSet of tokenSets) {
    for (const token of tokenSet) union.add(token);
  }
  return new Set([...union].sort(compareCodePoint).slice(0, maximumTokenCount));
}

export function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
