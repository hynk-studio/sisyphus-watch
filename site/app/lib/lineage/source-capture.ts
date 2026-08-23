import type {
  AnalysisRunPacket,
  AnalysisSourceSummary,
} from "../analysis/contracts";
import type {
  RelationCueDiagnostic,
  RelationCueDiagnosticRecord,
} from "../analysis/relation-cues";
import type {
  ClaimOccurrence,
  RelationCandidate,
  SiteReadyCasePacket,
} from "./contracts";
import { stableLineageId } from "./engine";
import {
  buildRelationTargetIndex,
  resolveRelationCueTarget,
} from "./relation-targets";

export const MAX_CAPTURED_SOURCE_PAGES_PER_WORKFLOW = 2;
export const CAPTURE_REQUEST_TIMEOUT_MS = 8_000;
export const MINIMUM_CAPTURE_START_BUDGET_MS = 9_000;
export const MAX_CAPTURE_BODY_BYTES = 1_048_576;
export const MAX_NORMALIZED_CAPTURE_TEXT_CHARS = 98_304;
export const MAX_CAPTURE_SUPPORT_EXCERPT_CHARS = 560;
export const MAX_CAPTURED_DOCUMENT_IDENTITY_CHARS = 240;
export const MAX_CAPTURE_REDIRECTS = 2;
export const MAX_CAPTURE_NETWORK_CONCURRENCY = 2;

const CAPTURE_ACCEPT =
  "text/html, application/xhtml+xml, text/plain;q=0.9";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_MEDIA_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const STRONG_SUPERSESSION_SCOPES = new Set([
  "whole_document",
  "whole_version",
  "withdrawal_or_rescission",
]);

export type CaptureFailureReason =
  | "ineligible_source"
  | "unsafe_url"
  | "redirect_rejected"
  | "too_many_redirects"
  | "timeout"
  | "network_failure"
  | "http_status_rejected"
  | "unsupported_content_type"
  | "unsupported_encoding"
  | "malformed_content"
  | "empty_content"
  | "insufficient_workflow_budget";

export type CaptureCompleteness =
  | "complete"
  | "byte_limited"
  | "text_limited";

export interface CapturedDocumentIdentity {
  kind: "html_title" | "plain_text_first_line";
  text: string;
}

export interface CapturedSourceDocument {
  capture_id: string;
  source_id: string;
  parent_snapshot_id: string;
  requested_url: string;
  final_url: string;
  redirect_count: number;
  retrieved_at: string;
  capture_method: "direct_worker_fetch";
  media_kind: "html" | "plain_text";
  capture_completeness: CaptureCompleteness;
  captured_body_bytes: number;
  captured_body_sha256: string;
  normalized_text_chars: number;
  normalized_text_sha256: string;
  normalized_text: string;
  document_identity: CapturedDocumentIdentity | null;
  status: "captured";
}

export interface CaptureFailure {
  source_id: string;
  parent_snapshot_id: string;
  requested_url: string | null;
  final_url: string | null;
  redirect_count: number;
  status: "failed" | "skipped";
  reason: CaptureFailureReason;
  network_attempted: boolean;
}

export interface CapturedSourceSupport {
  support_id: string;
  source_id: string;
  parent_snapshot_id: string;
  capture_id: string;
  captured_body_sha256: string;
  normalized_text_sha256: string;
  bounded_excerpt: string;
  normalized_text_start: number;
  normalized_text_end: number;
  support_kind: "captured_live_source_text_span";
  proves: "captured_source_text_containment_only";
  match_basis: string[];
  citation_url: string;
}

export interface CaptureWorkSummary {
  eligible_cue_count: number;
  relation_relevant_cue_count: number;
  planned_source_count: number;
  attempted_source_count: number;
  captured_source_count: number;
  failed_source_count: number;
  skipped_source_count: number;
  support_span_count: number;
  redirect_count: number;
  captured_body_bytes_total: number;
  normalized_text_chars_total: number;
  configured_max_capture_pages: 2;
  configured_max_body_bytes_per_page: 1048576;
  configured_max_text_chars_per_page: 98304;
  retries: 0;
  browser_rendering_calls: 0;
  pdf_parsing_calls: 0;
  semantic_classifier_calls: 0;
  configured_bound_reached: boolean;
}

export interface CapturePlanEntry {
  source: AnalysisSourceSummary;
  role: "cue_owner" | "resolved_target";
  cue_record: RelationCueDiagnosticRecord;
  cue_owner_occurrence_id: string;
  paired_occurrence_id: string;
}

export interface CapturePlan {
  eligible_cue_count: number;
  relation_relevant_cue_count: number;
  configured_bound_reached: boolean;
  entries: CapturePlanEntry[];
}

export interface CaptureExecutionResult {
  documents: CapturedSourceDocument[];
  failures: CaptureFailure[];
  supports: CapturedSourceSupport[];
  summary: CaptureWorkSummary;
}

export interface CaptureDependencies {
  fetcher?: typeof fetch;
  nowMs?: () => number;
  nowISO?: () => string;
}

interface RelationRelevantCue {
  record: RelationCueDiagnosticRecord;
  occurrence: ClaimOccurrence;
  relation: RelationCandidate;
  otherOccurrence: ClaimOccurrence;
}

interface CaptureAttempt {
  plan: CapturePlanEntry;
  result: CapturedSourceDocument | CaptureFailure;
}

export type SupportAnchorBoundary = "lexical" | "identifier" | "phrase";

export interface SupportAnchor {
  value: string;
  boundary: SupportAnchorBoundary;
}

export interface AnchorOccurrence {
  start: number;
  end: number;
}

interface HTMLMarkupTag {
  start: number;
  end: number;
  text: string;
}

export function validateDirectCaptureURL(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || (parsed.port !== "" && parsed.port !== "443")
  ) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || isIPLiteral(hostname)
    || !isOrdinaryPublicHostname(hostname)
  ) return null;

  parsed.hostname = hostname;
  parsed.port = "";
  parsed.hash = "";
  return parsed;
}

export function planCapturedSourcePages(input: {
  analysisRun: AnalysisRunPacket;
  lineagePacket: SiteReadyCasePacket;
  relationCueDiagnostics: RelationCueDiagnosticRecord[];
}): CapturePlan {
  const occurrenceByCandidate = new Map(
    input.lineagePacket.claim_occurrences.map((occurrence) => [
      occurrence.claim_id,
      occurrence,
    ]),
  );
  const occurrenceById = new Map(
    input.lineagePacket.claim_occurrences.map((occurrence) => [
      occurrence.occurrence_id,
      occurrence,
    ]),
  );
  const sourceById = new Map(
    input.analysisRun.source_snapshot_summaries.map((source) => [
      source.source_id,
      source,
    ]),
  );
  const relationsByOccurrence = new Map<string, RelationCandidate[]>();
  for (const relation of input.lineagePacket.relation_candidates) {
    if (
      relation.generated_by !== "deterministic_rule"
      || relation.relation_type !== "unresolved"
      || !relation.insufficient_evidence
      || relation.review_status !== "pending_review"
      || relation.status !== "candidate"
    ) continue;
    addRelation(relationsByOccurrence, relation.left_occurrence_id, relation);
    addRelation(relationsByOccurrence, relation.right_occurrence_id, relation);
  }

  const eligible = input.relationCueDiagnostics.filter((record) => {
    const occurrence = occurrenceByCandidate.get(record.candidate_id);
    return Boolean(
      occurrence
      && occurrence.claim_kind === "actor_claim"
      && occurrence.source_id === record.source_id
      && occurrence.snapshot_id === record.snapshot_id
      && record.diagnostic.operative_verb.trim()
      && record.diagnostic.cue_supporting_summary_span.trim(),
    );
  });

  const relationRelevant: RelationRelevantCue[] = [];
  for (const record of eligible) {
    const occurrence = occurrenceByCandidate.get(record.candidate_id);
    if (!occurrence) continue;
    for (const relation of relationsByOccurrence.get(occurrence.occurrence_id) ?? []) {
      const otherOccurrenceId = relation.left_occurrence_id === occurrence.occurrence_id
        ? relation.right_occurrence_id
        : relation.left_occurrence_id;
      const otherOccurrence = occurrenceById.get(otherOccurrenceId);
      if (!otherOccurrence) continue;
      relationRelevant.push({ record, occurrence, relation, otherOccurrence });
    }
  }
  relationRelevant.sort(compareRelationRelevantCues);
  const relationRelevantCueCount = new Set(
    relationRelevant.map(({ record }) =>
      `${record.candidate_id}|${record.source_id}|${cueSortKey(record.diagnostic)}`
    ),
  ).size;

  const selected = relationRelevant[0];
  if (!selected) {
    return {
      eligible_cue_count: eligible.length,
      relation_relevant_cue_count: relationRelevantCueCount,
      configured_bound_reached: false,
      entries: [],
    };
  }

  const entries: CapturePlanEntry[] = [];
  const ownerSource = sourceById.get(selected.occurrence.source_id);
  if (ownerSource) {
    entries.push({
      source: ownerSource,
      role: "cue_owner",
      cue_record: selected.record,
      cue_owner_occurrence_id: selected.occurrence.occurrence_id,
      paired_occurrence_id: selected.otherOccurrence.occurrence_id,
    });
  }

  const targetIndex = buildRelationTargetIndex({
    occurrences: input.lineagePacket.claim_occurrences,
    sources: input.analysisRun.source_snapshot_summaries,
  });
  const targetResolution = resolveRelationCueTarget({
    cue: selected.record.diagnostic,
    index: targetIndex,
    expectedOccurrenceId: selected.otherOccurrence.occurrence_id,
  });
  if (targetResolution.status === "unique") {
    const targetSource = sourceById.get(selected.otherOccurrence.source_id);
    if (
      targetSource
      && !entries.some((entry) => entry.source.source_id === targetSource.source_id)
    ) {
      entries.push({
        source: targetSource,
        role: "resolved_target",
        cue_record: selected.record,
        cue_owner_occurrence_id: selected.occurrence.occurrence_id,
        paired_occurrence_id: selected.otherOccurrence.occurrence_id,
      });
    }
  }

  const boundedEntries = entries.slice(0, MAX_CAPTURED_SOURCE_PAGES_PER_WORKFLOW);
  return {
    eligible_cue_count: eligible.length,
    relation_relevant_cue_count: relationRelevantCueCount,
    configured_bound_reached:
      entries.length > MAX_CAPTURED_SOURCE_PAGES_PER_WORKFLOW
      || relationRelevantCueCount > 1,
    entries: boundedEntries,
  };
}

export async function executeCapturedSourcePlan(
  plan: CapturePlan,
  workflowDeadlineAtMs: number,
  dependencies: CaptureDependencies = {},
): Promise<CaptureExecutionResult> {
  const nowMs = dependencies.nowMs ?? Date.now;
  const nowISO = dependencies.nowISO ?? (() => new Date().toISOString());
  const fetcher = dependencies.fetcher ?? fetch;

  if (
    plan.entries.length > 0
    && workflowDeadlineAtMs - nowMs() < MINIMUM_CAPTURE_START_BUDGET_MS
  ) {
    const failures = plan.entries.map((entry) => captureFailure({
      entry,
      reason: "insufficient_workflow_budget",
      status: "skipped",
      requestedURL: entry.source.url,
    }));
    return assembleCaptureExecution(plan, [], failures, []);
  }

  const attempts = await mapWithConcurrency(
    plan.entries,
    MAX_CAPTURE_NETWORK_CONCURRENCY,
    async (entry): Promise<CaptureAttempt> => ({
      plan: entry,
      result: await captureOneSource(
        entry,
        workflowDeadlineAtMs,
        fetcher,
        nowMs,
        nowISO,
      ),
    }),
  );
  const documents = attempts
    .map((attempt) => attempt.result)
    .filter((result): result is CapturedSourceDocument => result.status === "captured");
  const failures = attempts
    .map((attempt) => attempt.result)
    .filter((result): result is CaptureFailure => result.status !== "captured");
  const supports: CapturedSourceSupport[] = [];
  for (const attempt of attempts) {
    if (
      attempt.plan.role !== "cue_owner"
      || attempt.result.status !== "captured"
    ) continue;
    const support = await selectCapturedSupportSpan(
      attempt.result,
      attempt.plan.cue_record.diagnostic,
    );
    if (support) supports.push(support);
  }
  return assembleCaptureExecution(plan, documents, failures, supports);
}

export async function selectCapturedSupportSpan(
  document: CapturedSourceDocument,
  cue: RelationCueDiagnostic,
): Promise<CapturedSourceSupport | null> {
  const operativeVerb = normalizeMatchText(cue.operative_verb);
  if (!operativeVerb) return null;
  const targetAnchors = requiredTargetAnchors(cue);
  if (targetAnchors.length === 0) return null;
  const anchors: SupportAnchor[] = [
    { value: operativeVerb, boundary: "lexical" },
    ...targetAnchors,
  ];
  const window = smallestAnchorWindow(document.normalized_text, anchors);
  if (!window || window.end - window.start > MAX_CAPTURE_SUPPORT_EXCERPT_CHARS) {
    return null;
  }
  const excerpt = document.normalized_text.slice(window.start, window.end);
  if (!excerpt || excerpt.length > MAX_CAPTURE_SUPPORT_EXCERPT_CHARS) return null;
  return {
    support_id: stableLineageId(
      "captured_source_support_",
      document.capture_id,
      String(window.start),
      String(window.end),
      ...anchors.map((anchor) => anchor.value),
    ),
    source_id: document.source_id,
    parent_snapshot_id: document.parent_snapshot_id,
    capture_id: document.capture_id,
    captured_body_sha256: document.captured_body_sha256,
    normalized_text_sha256: document.normalized_text_sha256,
    bounded_excerpt: excerpt,
    normalized_text_start: window.start,
    normalized_text_end: window.end,
    support_kind: "captured_live_source_text_span",
    proves: "captured_source_text_containment_only",
    match_basis: anchors.map((anchor) => anchor.value),
    citation_url: document.final_url,
  };
}

export function normalizeCapturedDocumentText(
  input: string,
  mediaKind: "html" | "plain_text",
): { text: string; textLimited: boolean } {
  let value = input;
  if (mediaKind === "html") value = htmlToVisibleText(value);
  value = value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  const textLimited = value.length > MAX_NORMALIZED_CAPTURE_TEXT_CHARS;
  if (textLimited) value = value.slice(0, MAX_NORMALIZED_CAPTURE_TEXT_CHARS);
  return { text: value, textLimited };
}

export function extractCapturedDocumentIdentity(
  input: string,
  mediaKind: "html" | "plain_text",
): CapturedDocumentIdentity | null {
  if (mediaKind === "plain_text") {
    const lines = input.normalize("NFKC").replace(/\r\n?/gu, "\n").split("\n");
    for (const line of lines) {
      const text = normalizeCapturedDocumentIdentityText(line);
      if (!text) continue;
      return text.length <= MAX_CAPTURED_DOCUMENT_IDENTITY_CHARS
        ? { kind: "plain_text_first_line", text }
        : null;
    }
    return null;
  }

  const html = stripIgnoredHTMLRegions(input);
  const markupTags = scanHTMLMarkupTags(html);
  if (!markupTags) return null;
  const titleTags = markupTags.filter((tag) => /^<\/?title\b/iu.test(tag.text));
  if (titleTags.length !== 2) return null;

  const opening = titleTags[0];
  const closing = titleTags[1];
  if (
    !/^<title(?:\s[^<>]*?)?\s*>$/iu.test(opening.text)
    || /\/\s*>$/u.test(opening.text)
    || !/^<\/title\s*>$/iu.test(closing.text)
  ) return null;

  if (closing.start < opening.end) return null;
  const rawTitle = html.slice(opening.end, closing.start);
  if (/[<>]/u.test(rawTitle)) return null;
  const text = normalizeCapturedDocumentIdentityText(
    decodeBasicHTMLEntities(rawTitle),
  );
  return text && text.length <= MAX_CAPTURED_DOCUMENT_IDENTITY_CHARS
    ? { kind: "html_title", text }
    : null;
}

async function captureOneSource(
  entry: CapturePlanEntry,
  workflowDeadlineAtMs: number,
  fetcher: typeof fetch,
  nowMs: () => number,
  nowISO: () => string,
): Promise<CapturedSourceDocument | CaptureFailure> {
  if (
    entry.source.retrieval_mode !== "openai_web_search"
    || entry.source.record_status !== "candidate"
    || !entry.source.url
  ) {
    return captureFailure({ entry, reason: "ineligible_source" });
  }
  const requestedURL = validateDirectCaptureURL(entry.source.url);
  if (!requestedURL) {
    return captureFailure({
      entry,
      reason: "unsafe_url",
      requestedURL: entry.source.url,
    });
  }
  if (workflowDeadlineAtMs - nowMs() < MINIMUM_CAPTURE_START_BUDGET_MS) {
    return captureFailure({
      entry,
      reason: "insufficient_workflow_budget",
      status: "skipped",
      requestedURL: requestedURL.href,
    });
  }

  const timeoutMs = Math.min(
    CAPTURE_REQUEST_TIMEOUT_MS,
    Math.max(1, workflowDeadlineAtMs - nowMs()),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let currentURL = requestedURL;
  let redirectCount = 0;
  let response: Response;
  try {
    while (true) {
      try {
        response = await fetcher(currentURL.href, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          headers: { Accept: CAPTURE_ACCEPT },
          signal: controller.signal,
        });
      } catch (error) {
        return captureFailure({
          entry,
          reason: controller.signal.aborted || isAbortError(error)
            ? "timeout"
            : "network_failure",
          requestedURL: requestedURL.href,
          finalURL: currentURL.href,
          redirectCount,
          networkAttempted: true,
        });
      }

      if (!REDIRECT_STATUSES.has(response.status)) break;
      if (redirectCount >= MAX_CAPTURE_REDIRECTS) {
        return captureFailure({
          entry,
          reason: "too_many_redirects",
          requestedURL: requestedURL.href,
          finalURL: currentURL.href,
          redirectCount,
          networkAttempted: true,
        });
      }
      const location = response.headers.get("location");
      let redirectURL: URL | null = null;
      try {
        redirectURL = location
          ? validateDirectCaptureURL(new URL(location, currentURL).href)
          : null;
      } catch {
        redirectURL = null;
      }
      if (!redirectURL) {
        return captureFailure({
          entry,
          reason: "redirect_rejected",
          requestedURL: requestedURL.href,
          finalURL: currentURL.href,
          redirectCount,
          networkAttempted: true,
        });
      }
      redirectCount += 1;
      currentURL = redirectURL;
    }

    if (response.status < 200 || response.status > 299) {
      return captureFailure({
        entry,
        reason: "http_status_rejected",
        requestedURL: requestedURL.href,
        finalURL: currentURL.href,
        redirectCount,
        networkAttempted: true,
      });
    }
    const content = parseSupportedContentType(response.headers.get("content-type"));
    if (content === "unsupported_content_type" || content === "unsupported_encoding") {
      return captureFailure({
        entry,
        reason: content,
        requestedURL: requestedURL.href,
        finalURL: currentURL.href,
        redirectCount,
        networkAttempted: true,
      });
    }
    const retained = await readBoundedBody(response);
    if (!retained) {
      return captureFailure({
        entry,
        reason: "network_failure",
        requestedURL: requestedURL.href,
        finalURL: currentURL.href,
        redirectCount,
        networkAttempted: true,
      });
    }
    let decoded: string;
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      decoded = decoder.decode(retained.bytes, { stream: retained.byteLimited });
      if (!retained.byteLimited) decoded += decoder.decode();
    } catch {
      return captureFailure({
        entry,
        reason: "unsupported_encoding",
        requestedURL: requestedURL.href,
        finalURL: currentURL.href,
        redirectCount,
        networkAttempted: true,
      });
    }
    const documentIdentity = extractCapturedDocumentIdentity(decoded, content);
    const normalized = normalizeCapturedDocumentText(decoded, content);
    if (!normalized.text) {
      return captureFailure({
        entry,
        reason: "empty_content",
        requestedURL: requestedURL.href,
        finalURL: currentURL.href,
        redirectCount,
        networkAttempted: true,
      });
    }
    if (looksLikeUnsupportedChallenge(normalized.text)) {
      return captureFailure({
        entry,
        reason: "malformed_content",
        requestedURL: requestedURL.href,
        finalURL: currentURL.href,
        redirectCount,
        networkAttempted: true,
      });
    }
    const bodyHash = await sha256Hex(retained.bytes);
    const textHash = await sha256Hex(new TextEncoder().encode(normalized.text));
    const completeness: CaptureCompleteness = retained.byteLimited
      ? "byte_limited"
      : normalized.textLimited
      ? "text_limited"
      : "complete";
    return {
      capture_id: stableLineageId(
        "captured_source_document_",
        entry.source.source_id,
        entry.source.snapshot_id,
        currentURL.href,
        bodyHash,
        textHash,
      ),
      source_id: entry.source.source_id,
      parent_snapshot_id: entry.source.snapshot_id,
      requested_url: requestedURL.href,
      final_url: currentURL.href,
      redirect_count: redirectCount,
      retrieved_at: nowISO(),
      capture_method: "direct_worker_fetch",
      media_kind: content,
      capture_completeness: completeness,
      captured_body_bytes: retained.bytes.byteLength,
      captured_body_sha256: bodyHash,
      normalized_text_chars: normalized.text.length,
      normalized_text_sha256: textHash,
      normalized_text: normalized.text,
      document_identity: documentIdentity,
      status: "captured",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBody(
  response: Response,
): Promise<{ bytes: Uint8Array; byteLimited: boolean } | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let retainedLength = 0;
  let byteLimited = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const remaining = MAX_CAPTURE_BODY_BYTES - retainedLength;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        retainedLength += Math.max(0, remaining);
        byteLimited = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      retainedLength += value.byteLength;
      if (retainedLength === MAX_CAPTURE_BODY_BYTES) {
        const probe = await reader.read();
        if (!probe.done) {
          byteLimited = true;
          await reader.cancel();
        }
        break;
      }
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(retainedLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, byteLimited };
}

function parseSupportedContentType(
  value: string | null,
): "html" | "plain_text" | "unsupported_content_type" | "unsupported_encoding" {
  const [rawMediaType, ...parameters] = (value ?? "")
    .split(";")
    .map((part) => part.trim().toLowerCase());
  if (!HTML_MEDIA_TYPES.has(rawMediaType) && rawMediaType !== "text/plain") {
    return "unsupported_content_type";
  }
  const charsetParameter = parameters.find((part) => part.startsWith("charset="));
  if (charsetParameter) {
    const charset = charsetParameter
      .slice("charset=".length)
      .replace(/^['"]|['"]$/gu, "");
    if (charset !== "utf-8" && charset !== "utf8") {
      return "unsupported_encoding";
    }
  }
  return HTML_MEDIA_TYPES.has(rawMediaType) ? "html" : "plain_text";
}

function htmlToVisibleText(html: string): string {
  const withoutIgnored = stripIgnoredHTMLRegions(html);
  const withBlocks = withoutIgnored.replace(
    /<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/giu,
    "\n",
  );
  return decodeBasicHTMLEntities(withBlocks.replace(/<[^>]*>/gu, " "));
}

function stripIgnoredHTMLRegions(html: string): string {
  return html
    .replace(/<!--([\s\S]*?)-->/gu, " ")
    .replace(/<!--[\s\S]*$/gu, " ")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "\n")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*\/\s*>/giu, "\n")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*$/giu, "\n");
}

function scanHTMLMarkupTags(html: string): HTMLMarkupTag[] | null {
  const tags: HTMLMarkupTag[] = [];
  let searchFrom = 0;
  while (searchFrom < html.length) {
    const start = html.indexOf("<", searchFrom);
    if (start < 0) break;
    let quote: "\"" | "'" | null = null;
    let end = -1;
    for (let index = start + 1; index < html.length; index += 1) {
      const value = html[index];
      if (quote) {
        if (value === quote) quote = null;
        continue;
      }
      if (value === "\"" || value === "'") {
        quote = value;
      } else if (value === ">") {
        end = index + 1;
        break;
      }
    }
    if (end < 0) return null;
    tags.push({ start, end, text: html.slice(start, end) });
    searchFrom = end;
  }
  return tags;
}

function normalizeCapturedDocumentIdentityText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function decodeBasicHTMLEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z]{2,8}));/giu,
    (entity, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (decimal || hex) {
        const codePoint = Number.parseInt(decimal ?? hex ?? "", hex ? 16 : 10);
        return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return named[(name ?? "").toLowerCase()] ?? entity;
    },
  );
}

export function requiredTargetAnchors(
  cue: RelationCueDiagnostic,
): SupportAnchor[] {
  if (cue.target_kind === "none" || !cue.target_identifier) return [];
  const identifier = normalizeMatchText(cue.target_identifier);
  const reference = normalizeMatchText(cue.target_reference_text ?? "");
  if (
    cue.target_kind === "notice_identifier"
    || cue.target_kind === "guidance_identifier"
    || cue.target_kind === "version_identifier"
  ) {
    if (!identifier) return [];
    const kind = cue.target_kind.replace("_identifier", "");
    return [
      { value: kind, boundary: "lexical" },
      { value: identifier, boundary: "identifier" },
    ];
  }
  if (cue.target_kind === "dated_document_reference") {
    const combined = `${reference} ${identifier}`;
    const date = /\b\d{4}-\d{2}-\d{2}\b/u.exec(combined)?.[0];
    const kind = /\b(?:guidance|notice|schedule|policy|statement)\b/u.exec(combined)?.[0];
    return date && kind
      ? [
          { value: date, boundary: "identifier" },
          { value: kind, boundary: "lexical" },
        ]
      : [];
  }
  const exact = identifier || reference;
  if (exact.length < 12) return [];
  return [{
    value: exact,
    boundary: cue.target_kind === "other_explicit_identifier"
      ? "identifier"
      : "phrase",
  }];
}

function smallestAnchorWindow(
  originalText: string,
  anchors: SupportAnchor[],
): { start: number; end: number } | null {
  const normalizedText = originalText.toLowerCase();
  const occurrences = anchors.map((anchor) =>
    boundaryValidOccurrences(normalizedText, anchor)
  );
  if (occurrences.some((items) => items.length === 0)) return null;

  const cursors = new Array<number>(anchors.length).fill(0);
  const latest = new Array<AnchorOccurrence | null>(anchors.length).fill(null);
  let best: { start: number; end: number } | null = null;

  while (true) {
    let nextAnchor = -1;
    let nextOccurrence: AnchorOccurrence | null = null;
    for (let anchorIndex = 0; anchorIndex < occurrences.length; anchorIndex += 1) {
      const candidate = occurrences[anchorIndex][cursors[anchorIndex]];
      if (!candidate) continue;
      if (
        !nextOccurrence
        || candidate.start < nextOccurrence.start
        || (
          candidate.start === nextOccurrence.start
          && (
            candidate.end < nextOccurrence.end
            || (
              candidate.end === nextOccurrence.end
              && anchorIndex < nextAnchor
            )
          )
        )
      ) {
        nextAnchor = anchorIndex;
        nextOccurrence = candidate;
      }
    }
    if (nextAnchor < 0 || !nextOccurrence) break;

    latest[nextAnchor] = nextOccurrence;
    cursors[nextAnchor] += 1;
    if (latest.some((item) => item === null)) continue;

    let windowStart = Number.POSITIVE_INFINITY;
    let windowEnd = 0;
    for (const item of latest) {
      if (!item) continue;
      windowStart = Math.min(windowStart, item.start);
      windowEnd = Math.max(windowEnd, item.end);
    }
    if (
      !best
      || windowEnd - windowStart < best.end - best.start
      || (
        windowEnd - windowStart === best.end - best.start
        && windowStart < best.start
      )
    ) best = { start: windowStart, end: windowEnd };
  }
  return best;
}

export function findCapturedTextAnchorOccurrences(
  text: string,
  anchor: SupportAnchor,
): AnchorOccurrence[] {
  return boundaryValidOccurrences(text.toLowerCase(), anchor);
}

function boundaryValidOccurrences(
  text: string,
  anchor: SupportAnchor,
): AnchorOccurrence[] {
  const occurrences: AnchorOccurrence[] = [];
  let offset = 0;
  while (offset <= text.length - anchor.value.length) {
    const start = text.indexOf(anchor.value, offset);
    if (start < 0) break;
    const end = start + anchor.value.length;
    if (hasRequiredAnchorBoundaries(text, start, end, anchor.boundary)) {
      occurrences.push({ start, end });
    }
    offset = start + 1;
  }
  return occurrences;
}

function hasRequiredAnchorBoundaries(
  text: string,
  start: number,
  end: number,
  boundary: SupportAnchorBoundary,
): boolean {
  const first = codePointAt(text, start);
  const last = codePointBefore(text, end);
  const before = codePointBefore(text, start);
  const after = codePointAt(text, end);
  if (boundary === "identifier") {
    const beforeBefore = before
      ? codePointBefore(text, start - before.length)
      : null;
    const afterAfter = after
      ? codePointAt(text, end + after.length)
      : null;
    return (
      !isIdentifierBoundaryConstituent(before, beforeBefore)
      && !isIdentifierBoundaryConstituent(after, afterAfter)
    );
  }
  return (
    (!first || !isLexicalConstituent(first) || !before || !isLexicalConstituent(before))
    && (!last || !isLexicalConstituent(last) || !after || !isLexicalConstituent(after))
  );
}

function codePointAt(value: string, index: number): string | null {
  if (index < 0 || index >= value.length) return null;
  const codePoint = value.codePointAt(index);
  return codePoint === undefined ? null : String.fromCodePoint(codePoint);
}

function codePointBefore(value: string, index: number): string | null {
  if (index <= 0 || index > value.length) return null;
  let start = index - 1;
  const lastUnit = value.charCodeAt(start);
  if (
    lastUnit >= 0xdc00
    && lastUnit <= 0xdfff
    && start > 0
  ) {
    const priorUnit = value.charCodeAt(start - 1);
    if (priorUnit >= 0xd800 && priorUnit <= 0xdbff) start -= 1;
  }
  return codePointAt(value, start);
}

function isLexicalConstituent(value: string): boolean {
  return /^[\p{L}\p{M}\p{N}_]$/u.test(value);
}

function isIdentifierBoundaryConstituent(
  adjacent: string | null,
  beyond: string | null,
): boolean {
  if (!adjacent) return false;
  if (isLexicalConstituent(adjacent) || adjacent === "-" || adjacent === "/") {
    return true;
  }
  return adjacent === "." && !!beyond && isLexicalConstituent(beyond);
}

function compareRelationRelevantCues(
  left: RelationRelevantCue,
  right: RelationRelevantCue,
): number {
  return cueKindRank(left.record.diagnostic) - cueKindRank(right.record.diagnostic)
    || scopeRank(left.record.diagnostic) - scopeRank(right.record.diagnostic)
    || targetRank(left.record.diagnostic) - targetRank(right.record.diagnostic)
    || compareCodePoint(left.occurrence.occurrence_id, right.occurrence.occurrence_id)
    || compareCodePoint(left.record.candidate_id, right.record.candidate_id)
    || compareCodePoint(left.record.source_id, right.record.source_id)
    || compareCodePoint(cueSortKey(left.record.diagnostic), cueSortKey(right.record.diagnostic))
    || compareCodePoint(left.otherOccurrence.occurrence_id, right.otherOccurrence.occurrence_id);
}

function cueKindRank(cue: RelationCueDiagnostic): number {
  if (
    cue.cue_kind === "supersession_candidate"
    && !cue.negated
    && !cue.modal_or_intent
    && !cue.question_or_uncertain
    && !cue.quoted_or_attributed
    && !cue.conditional_or_hypothetical
    && STRONG_SUPERSESSION_SCOPES.has(cue.scope)
    && cue.target_kind !== "none"
    && cue.target_identifier
  ) return 0;
  return cue.cue_kind === "supersession_candidate" ? 1 : 2;
}

function scopeRank(cue: RelationCueDiagnostic): number {
  return STRONG_SUPERSESSION_SCOPES.has(cue.scope) ? 0 : 1;
}

function targetRank(cue: RelationCueDiagnostic): number {
  if (["notice_identifier", "guidance_identifier", "version_identifier"].includes(cue.target_kind)) {
    return 0;
  }
  if (cue.target_kind === "dated_document_reference") return 1;
  if (["document_title", "quoted_proposition"].includes(cue.target_kind)) return 2;
  return cue.target_kind === "none" ? 4 : 3;
}

function cueSortKey(cue: RelationCueDiagnostic): string {
  return JSON.stringify([
    cue.cue_kind,
    cue.target_kind,
    cue.target_identifier,
    cue.operative_verb,
    cue.cue_supporting_summary_span,
  ]);
}

function normalizeMatchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function isIPLiteral(hostname: string): boolean {
  if (hostname.startsWith("[") || hostname.endsWith("]") || hostname.includes(":")) {
    return true;
  }
  if (/^\d+$/u.test(hostname)) return true;
  if (/^0x[\da-f]+$/iu.test(hostname)) return true;
  const parts = hostname.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/u.test(part))) {
    return false;
  }
  return parts.every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function isOrdinaryPublicHostname(hostname: string): boolean {
  if (hostname.length > 253 || !hostname.includes(".")) return false;
  const labels = hostname.split(".");
  return labels.every((label) =>
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
  ) && /[a-z]/u.test(labels.at(-1) ?? "");
}

function looksLikeUnsupportedChallenge(value: string): boolean {
  const normalized = normalizeMatchText(value);
  return (
    normalized.length < 1_000
    && (
      normalized.includes("enable javascript and cookies to continue")
      || normalized.includes("checking your browser before accessing")
      || normalized.includes("captcha challenge")
    )
  );
}

function addRelation(
  relationsByOccurrence: Map<string, RelationCandidate[]>,
  occurrenceId: string,
  relation: RelationCandidate,
): void {
  const relations = relationsByOccurrence.get(occurrenceId) ?? [];
  relations.push(relation);
  relationsByOccurrence.set(occurrenceId, relations);
}

function captureFailure(input: {
  entry: CapturePlanEntry;
  reason: CaptureFailureReason;
  status?: "failed" | "skipped";
  requestedURL?: string | null;
  finalURL?: string | null;
  redirectCount?: number;
  networkAttempted?: boolean;
}): CaptureFailure {
  return {
    source_id: input.entry.source.source_id,
    parent_snapshot_id: input.entry.source.snapshot_id,
    requested_url: input.requestedURL ?? null,
    final_url: input.finalURL ?? null,
    redirect_count: input.redirectCount ?? 0,
    status: input.status ?? "failed",
    reason: input.reason,
    network_attempted: input.networkAttempted ?? false,
  };
}

function assembleCaptureExecution(
  plan: CapturePlan,
  documents: CapturedSourceDocument[],
  failures: CaptureFailure[],
  supports: CapturedSourceSupport[],
): CaptureExecutionResult {
  const summary: CaptureWorkSummary = {
    eligible_cue_count: plan.eligible_cue_count,
    relation_relevant_cue_count: plan.relation_relevant_cue_count,
    planned_source_count: plan.entries.length,
    attempted_source_count:
      documents.length + failures.filter((failure) => failure.network_attempted).length,
    captured_source_count: documents.length,
    failed_source_count: failures.filter((failure) => failure.status === "failed").length,
    skipped_source_count: failures.filter((failure) => failure.status === "skipped").length,
    support_span_count: supports.length,
    redirect_count:
      documents.reduce((total, document) => total + document.redirect_count, 0)
      + failures.reduce((total, failure) => total + failure.redirect_count, 0),
    captured_body_bytes_total:
      documents.reduce((total, document) => total + document.captured_body_bytes, 0),
    normalized_text_chars_total:
      documents.reduce((total, document) => total + document.normalized_text_chars, 0),
    configured_max_capture_pages: MAX_CAPTURED_SOURCE_PAGES_PER_WORKFLOW,
    configured_max_body_bytes_per_page: MAX_CAPTURE_BODY_BYTES,
    configured_max_text_chars_per_page: MAX_NORMALIZED_CAPTURE_TEXT_CHARS,
    retries: 0,
    browser_rendering_calls: 0,
    pdf_parsing_calls: 0,
    semantic_classifier_calls: 0,
    configured_bound_reached: plan.configured_bound_reached,
  };
  return { documents, failures, supports, summary };
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function mapWithConcurrency<Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
