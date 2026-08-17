const LEXICAL_TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;

export function normalizeReviewerWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function boundedReviewerText(value: string, maximumLength: number): string {
  if (!Number.isInteger(maximumLength) || maximumLength < 1) {
    throw new RangeError("maximumLength must be a positive integer");
  }

  const normalized = normalizeReviewerWhitespace(value);
  if (normalized.length <= maximumLength) return normalized;
  if (maximumLength === 1) return "…";

  const available = maximumLength - 1;
  const prefix = normalized.slice(0, available);
  const boundary = preferredBoundary(prefix);
  const visible = prefix
    .slice(0, boundary)
    .replace(/[\s…]+$/gu, "");
  return `${visible || prefix.slice(0, available)}…`;
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
