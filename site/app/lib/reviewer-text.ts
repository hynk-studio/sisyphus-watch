const LEXICAL_TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
const PROMINENT_DANGLING_TAIL_PATTERN =
  /(?:^|\s)(?:and|or|but|because|including|with|without|to|of|for|from|by|as|that|which|who|when|where|while|after|before|through|between|during)\s*[,;:–—-]?$/iu;
const MALFORMED_FUNCTION_WORD_NUMBER_PATTERN =
  /(?:^|\s)(?:the|a|an|to|of|and|or)\d+[?!.,;:]*$/iu;

export function normalizeReviewerWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * Bounds reviewer-facing text by Unicode code points, including the ellipsis.
 * This avoids emitting a lone UTF-16 surrogate when an unbroken astral token
 * reaches the hard fallback while keeping the configured character maximum.
 */
export function boundedReviewerText(value: string, maximumLength: number): string {
  if (!Number.isInteger(maximumLength) || maximumLength < 1) {
    throw new RangeError("maximumLength must be a positive integer");
  }

  const normalized = normalizeReviewerWhitespace(value);
  const normalizedCodePoints = Array.from(normalized);
  if (normalizedCodePoints.length <= maximumLength) return normalized;
  if (maximumLength === 1) return "…";

  const available = maximumLength - 1;
  const prefix = normalizedCodePoints.slice(0, available).join("");
  const boundary = preferredBoundary(prefix);
  const visible = prefix
    .slice(0, boundary)
    .replace(/[\s…]+$/gu, "");
  return `${visible || prefix}…`;
}

export function containsLexicalTokenSequence(
  supportingText: string,
  proposedActor: string,
): boolean {
  const supportingTokens = lexicalTokens(supportingText);
  const actorTokens = lexicalTokens(proposedActor);
  if (actorTokens.length === 0 || actorTokens.length > supportingTokens.length) {
    return false;
  }

  return supportingTokens.some((_, start) =>
    actorTokens.every(
      (token, offset) => supportingTokens[start + offset] === token,
    ),
  );
}

export function hasClearlyIncompleteTail(value: string): boolean {
  const normalized = normalizeReviewerWhitespace(value);
  if (!normalized) return true;

  const tokens = lexicalTokens(normalized);
  const danglingConnector = /(?:^|\s)(?:and|or)\s*[,;:]?$/iu.test(normalized);
  if (danglingConnector && tokens.length >= 3) return true;

  // A terminal word-joining mark exposes a cut token without guessing which
  // word was intended. Ordinary punctuation-free short statements stay valid.
  return /[\p{L}\p{N}][-/]$/u.test(normalized)
    || /[([{]\s*$/u.test(normalized);
}

export interface RetainedBoundedModelProse {
  text: string;
  trailingFragmentDiscarded: boolean;
}

export type RetainedModelSummary = RetainedBoundedModelProse;

/**
 * Treats reviewer prose at a structured-output ceiling without closing
 * sentence punctuation as a likely hard-bound fragment. The helper never
 * repairs or completes the text: it retains the largest already-produced
 * complete sentence, or applies a visible word-boundary ellipsis when no
 * sentence boundary exists. Values below the near-bound threshold are
 * unchanged, including ordinary short punctuation-free prose.
 */
export function retainBoundedModelProse(
  value: string,
  maximumLength: number,
): RetainedBoundedModelProse {
  if (!Number.isInteger(maximumLength) || maximumLength < 2) {
    throw new RangeError("maximumLength must be an integer of at least 2");
  }

  const retainedInput = value.trim();
  // Zod's string maximum follows JavaScript UTF-16 length, so the admission
  // and presentation thresholds intentionally use the same representation.
  const nearHardBound = retainedInput.length >= maximumLength - 1;
  const closesSentence = /[.!?](?:["'’”)}\]]+)?$/u.test(retainedInput);
  if (!nearHardBound || closesSentence) {
    return { text: retainedInput, trailingFragmentDiscarded: false };
  }

  const completeBoundary = lastCompleteSentenceBoundary(retainedInput);
  if (completeBoundary > 0) {
    return {
      text: retainedInput.slice(0, completeBoundary).trim(),
      trailingFragmentDiscarded: true,
    };
  }

  return {
    text: boundedReviewerText(
      retainedInput,
      Math.max(1, Array.from(retainedInput).length - 1),
    ),
    trailingFragmentDiscarded: true,
  };
}

export function retainBoundedModelSummary(
  value: string,
  maximumLength: number,
): RetainedModelSummary {
  return retainBoundedModelProse(value, maximumLength);
}

/**
 * Prominent review surfaces should fail closed on text that visibly looks cut
 * off or malformed. This is deliberately stricter than packet admission: the
 * underlying candidate remains available for review, but it does not become a
 * headline-like first payoff.
 */
export function isSuitableForProminentReviewText(value: string): boolean {
  const normalized = normalizeReviewerWhitespace(value);
  if (!normalized || hasClearlyIncompleteTail(normalized)) return false;
  if (normalized.includes("\uFFFD")) return false;
  if (MALFORMED_FUNCTION_WORD_NUMBER_PATTERN.test(normalized)) return false;
  if (PROMINENT_DANGLING_TAIL_PATTERN.test(normalized)) return false;
  return true;
}

function lexicalTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .match(LEXICAL_TOKEN_PATTERN) ?? [];
}

function preferredBoundary(prefix: string): number {
  const minimumNaturalBoundary = Math.floor(prefix.length * 0.55);
  let punctuationBoundary = -1;
  for (const match of prefix.matchAll(/[.!?;:,](?=\s|$)/gu)) {
    punctuationBoundary = (match.index ?? 0) + match[0].length;
  }
  if (punctuationBoundary >= minimumNaturalBoundary) {
    return punctuationBoundary;
  }

  const wordBoundary = prefix.lastIndexOf(" ");
  return wordBoundary > 0 ? wordBoundary : prefix.length;
}

function lastCompleteSentenceBoundary(value: string): number {
  let boundary = -1;
  for (const match of value.matchAll(/[.!?](?:["'’”)}\]]+)?(?=\s|$)/gu)) {
    boundary = (match.index ?? 0) + match[0].length;
  }
  return boundary;
}
