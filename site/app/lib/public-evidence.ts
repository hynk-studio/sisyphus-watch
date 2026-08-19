import type { AnalysisSourceSummary } from "./analysis/contracts";
import type {
  BoundedSupportReference,
  ClaimOccurrence,
  SiteReadyCasePacket,
} from "./lineage/contracts";

export const PUBLIC_EVIDENCE_CONTRACT_VERSION =
  "sisyphus_public_evidence_packet.v1" as const;
export const PUBLIC_NO_RESULT_CONTRACT_VERSION =
  "sisyphus_public_no_result.v1" as const;
export const PUBLIC_EVIDENCE_MEDIA_TYPE =
  "application/vnd.sisyphus.public-evidence.v1+json" as const;

export interface PublicCoverageV1 {
  bounded_nonexhaustive: true;
  coverage_basis: "live_discovery" | "prepared_fixture";
  requested_source_limit: number;
  actual_source_count: number;
  discovery_profile: "standard" | "coverage_expansion" | null;
  lane_counts: {
    baseline_authority: number;
    primary_or_origin: number;
    local_or_firsthand: number;
    specialist_context: number;
    challenge_or_correction: number;
  };
  missing_target_lanes: string[];
  live_discovery: {
    baseline_requested: number;
    baseline_returned: number;
    expansion_requested: number;
    expansion_returned: number;
    expansion_attempted: boolean;
    expansion_completed_successfully: boolean;
  } | null;
  prepared_fixture_source_count: number | null;
}

export interface PublicSourceV1 {
  source_id: string;
  title: string;
  publisher: string;
  url: string | null;
  domain: string | null;
  source_kind: "live_web_source" | "synthetic_fixture";
  content_kind:
    | "captured_fixture_source_text"
    | "model_generated_web_search_summary";
  content_capture:
    | "captured_synthetic_fixture_text"
    | "model_generated_summary_not_captured_page_text";
  public_summary: string | null;
  publication_time: string | null;
  publication_time_precision: "day" | "instant" | null;
  retrieval_time: string;
  retrieval_time_precision: "instant";
  record_status: "candidate" | "canonical";
  record_status_scope: "fixture_internal" | "candidate_review_only";
  limitations: string[];
}

export interface PublicSupportV1 {
  source_id: string;
  content_kind:
    | "captured_synthetic_fixture_excerpt"
    | "model_generated_web_search_summary_span";
  bounded_support: string;
  url: string | null;
  proves:
    | "synthetic_fixture_support_only"
    | "model_summary_containment_only";
}

export interface PublicClaimOccurrenceV1 {
  occurrence_id: string;
  source_id: string;
  claim_id: string;
  actor: string | null;
  claim_text: string;
  support: PublicSupportV1;
  event_time: string | null;
  event_time_precision: "day" | "instant" | null;
  assertion_time: string | null;
  assertion_time_precision: "day" | "instant" | null;
  publication_time: string | null;
  publication_time_precision: "day" | "instant" | null;
  retrieval_time: string;
  retrieval_time_precision: "instant";
  record_status: "candidate" | "canonical";
  record_status_scope: "fixture_internal" | "candidate_review_only";
}

export interface SisyphusPublicEvidencePacketV1 {
  contract_version: typeof PUBLIC_EVIDENCE_CONTRACT_VERSION;
  result_kind: "evidence";
  artifact_kind: "live_evidence" | "synthetic_prepared_example";
  result_mode: "live" | "synthetic_prepared_example";
  is_synthetic_fixture: boolean;
  synthetic_fixture_warning: string | null;
  question: string;
  title: string;
  coverage: PublicCoverageV1;
  sources: PublicSourceV1[];
  findings: Array<{
    finding_id: string;
    text: string;
    source_ids: string[];
    confidence: string;
    record_status: "candidate" | "canonical";
    record_status_scope: "fixture_internal" | "candidate_review_only";
  }>;
  actor_claims: Array<{
    claim_id: string;
    actor: string | null;
    claim_text: string;
    source_ids: string[];
    assertion_time: string | null;
    assertion_time_precision: "day" | "instant" | null;
    confidence: string;
    uncertainty: string;
    record_status: "candidate" | "canonical";
    record_status_scope: "fixture_internal" | "candidate_review_only";
  }>;
  actions: Array<{
    action_id: string;
    actor: string | null;
    action_text: string;
    source_ids: string[];
    event_time: string | null;
    event_time_precision: "day" | "instant" | null;
    confidence: string;
    uncertainty: string;
    record_status: "candidate" | "canonical";
    record_status_scope: "fixture_internal" | "candidate_review_only";
  }>;
  time_candidates: Array<{
    candidate_id: string;
    time_kind: "event_time" | "assertion_time";
    text: string;
    source_ids: string[];
    time: string | null;
    precision: "day" | "instant" | null;
    confidence: string;
    uncertainty: string;
    review_status: "candidate_review_only";
  }>;
  claim_occurrences: PublicClaimOccurrenceV1[];
  timeline: Array<{
    timeline_id: string;
    occurrence_ids: string[];
    summary: string;
    event_time: string | null;
    event_time_precision: "day" | "instant" | null;
    assertion_time: string | null;
    assertion_time_precision: "day" | "instant" | null;
    publication_time: string | null;
    publication_time_precision: "day" | "instant" | null;
    retrieval_time: string;
    retrieval_time_precision: "instant";
    display_time_axis:
      | "event_time"
      | "assertion_time"
      | "publication_time"
      | "retrieval_time";
    display_time: string;
    display_time_precision: "day" | "instant";
    record_status: "candidate" | "canonical";
    record_status_scope: "fixture_internal" | "candidate_review_only";
  }>;
  candidate_relations: Array<{
    relation_id: string;
    left_occurrence_id: string;
    right_occurrence_id: string;
    left_source_id: string;
    right_source_id: string;
    relation_type: string;
    reason: string;
    review_status: "pending_review";
    record_status: "candidate";
    insufficient_evidence: boolean;
    left_support: PublicSupportV1;
    right_support: PublicSupportV1;
  }>;
  unresolved_questions: Array<{
    question_id: string;
    question: string;
    related_ids: string[];
    status: "unresolved";
    record_status: "candidate" | "canonical";
    record_status_scope: "fixture_internal" | "candidate_review_only";
  }>;
  source_bound_candidate_synthesis: string[];
  time_semantics: {
    event_time: "when_the_described_event_occurred_if_explicitly_available";
    assertion_time: "when_the_actor_statement_was_dated_if_explicitly_available";
    publication_time: "when_the_source_was_published_if_available";
    retrieval_time: "when_sisyphus_observed_or_retrieved_the_source";
    missing_time_policy: "null_no_substitution";
    time_inference: "none";
  };
  warnings: string[];
  limitations: string[];
  candidate_canonical_boundary: {
    canonical_mutation: "none";
    evidence_records:
      | "candidate_review_only"
      | "synthetic_fixture_internal_records_not_real_world_truth";
    relation_records: "candidate_review_only";
    source_inclusion: "not_endorsement_or_truth_verification";
    confidence_can_promote_to_canonical: false;
  };
  canonical_mutation: "none";
}

export interface SisyphusPublicNoResultV1 {
  contract_version: typeof PUBLIC_NO_RESULT_CONTRACT_VERSION;
  result_kind: "no_result";
  artifact_kind: "failed_live_attempt";
  result_mode: "fallback_no_result";
  evidence_available: false;
  question: string;
  failure: {
    code: string;
    message: string;
  };
  retry_guidance: {
    automatic_retry: "forbidden";
    provider_work_may_have_occurred: true;
    safe_blind_retry: false;
    guidance: string;
  };
  warnings: string[];
  canonical_mutation: "none";
}

export type SisyphusPublicLineageRepresentationV1 =
  | SisyphusPublicEvidencePacketV1
  | SisyphusPublicNoResultV1;

export interface PublicExportArtifacts {
  packet: SisyphusPublicEvidencePacketV1;
  json: string;
  markdown: string;
  shareableBrief: string;
  jsonFilename: "sisyphus-evidence-v1.json";
  markdownFilename: "sisyphus-evidence-v1.md";
}

const SYNTHETIC_WARNING =
  "Synthetic prepared example only. It is a demonstration fixture, not real-world public evidence or truth verification.";
const DISPLAY_WARNINGS = [
  "This investigation is bounded and nonexhaustive.",
  "Candidate relations are review-only and do not adjudicate truth.",
  "Source inclusion is not endorsement or truth verification.",
  "Model-generated web-search summaries are not captured page text.",
] as const;

export function buildPublicLineageRepresentation(
  packet: SiteReadyCasePacket,
): SisyphusPublicLineageRepresentationV1 {
  if (packet.mode === "fallback") {
    return buildPublicNoResult(packet);
  }
  return buildPublicEvidencePacket(packet);
}

export function buildPublicEvidencePacket(
  packet: SiteReadyCasePacket,
): SisyphusPublicEvidencePacketV1 {
  if (packet.mode === "fallback") {
    throw new Error("A failed live fallback cannot be serialized as public evidence.");
  }

  const synthetic = packet.mode === "deterministic";
  if (!synthetic) assertLiveSources(packet.source_snapshot_summaries);
  const scope = synthetic ? "fixture_internal" as const : "candidate_review_only" as const;

  return {
    contract_version: PUBLIC_EVIDENCE_CONTRACT_VERSION,
    result_kind: "evidence",
    artifact_kind: synthetic ? "synthetic_prepared_example" : "live_evidence",
    result_mode: synthetic ? "synthetic_prepared_example" : "live",
    is_synthetic_fixture: synthetic,
    synthetic_fixture_warning: synthetic ? SYNTHETIC_WARNING : null,
    question: packet.normalized_public_interest_question,
    title: packet.title,
    coverage: projectCoverage(packet),
    sources: packet.source_snapshot_summaries.map((source) =>
      projectSource(source, synthetic),
    ),
    findings: packet.source_bound_findings.map((finding) => ({
      finding_id: finding.finding_id,
      text: finding.text,
      source_ids: [...finding.source_ids],
      confidence: finding.confidence,
      record_status: finding.status,
      record_status_scope: scope,
    })),
    actor_claims: packet.actor_claims.map((claim) => ({
      claim_id: claim.claim_id,
      actor: claim.actor,
      claim_text: claim.claim_text,
      source_ids: [...claim.source_ids],
      assertion_time: claim.assertion_time_candidate,
      assertion_time_precision: claim.assertion_time_candidate_precision,
      confidence: claim.confidence,
      uncertainty: claim.uncertainty,
      record_status: claim.status,
      record_status_scope: scope,
    })),
    actions: packet.actions.map((action) => ({
      action_id: action.action_id,
      actor: action.actor,
      action_text: action.action_text,
      source_ids: [...action.source_ids],
      event_time: action.event_time_candidate,
      event_time_precision: action.event_time_candidate_precision,
      confidence: action.confidence,
      uncertainty: action.uncertainty,
      record_status: action.status,
      record_status_scope: scope,
    })),
    time_candidates: packet.time_candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      time_kind: candidate.candidate_type === "event_time_candidate"
        ? "event_time" as const
        : "assertion_time" as const,
      text: candidate.text,
      source_ids: [...candidate.source_ids],
      time: candidate.time_candidate,
      precision: candidate.time_candidate_precision,
      confidence: candidate.confidence,
      uncertainty: candidate.uncertainty,
      review_status: "candidate_review_only" as const,
    })),
    claim_occurrences: packet.claim_occurrences.map((occurrence) =>
      projectOccurrence(occurrence, synthetic),
    ),
    timeline: packet.event_timeline_rows.map((row) => ({
      timeline_id: row.timeline_row_id,
      occurrence_ids: [...row.occurrence_ids],
      summary: row.summary,
      event_time: row.event_time,
      event_time_precision: row.event_time_precision,
      assertion_time: row.actor_assertion_time,
      assertion_time_precision: row.actor_assertion_time_precision,
      publication_time: row.publication_time,
      publication_time_precision: row.publication_time_precision,
      retrieval_time: row.retrieval_time,
      retrieval_time_precision: "instant",
      display_time_axis: row.display_time_axis === "actor_assertion_time"
        ? "assertion_time"
        : row.display_time_axis,
      display_time: row.display_time,
      display_time_precision: row.display_time_precision,
      record_status: row.status,
      record_status_scope: scope,
    })),
    candidate_relations: packet.relation_candidates.map((relation) => ({
      relation_id: relation.relation_id,
      left_occurrence_id: relation.left_occurrence_id,
      right_occurrence_id: relation.right_occurrence_id,
      left_source_id: relation.left_source_id,
      right_source_id: relation.right_source_id,
      relation_type: relation.relation_type,
      reason: relation.reason,
      review_status: relation.review_status,
      record_status: "candidate",
      insufficient_evidence: relation.insufficient_evidence,
      left_support: projectSupport(relation.left_support_reference, synthetic),
      right_support: projectSupport(relation.right_support_reference, synthetic),
    })),
    unresolved_questions: packet.unresolved_questions.map((question) => ({
      question_id: question.question_id,
      question: question.question,
      related_ids: [...question.related_ids],
      status: "unresolved",
      record_status: question.record_status,
      record_status_scope: scope,
    })),
    source_bound_candidate_synthesis: [
      ...packet.current_source_bound_candidate_synthesis,
    ],
    time_semantics: {
      event_time: "when_the_described_event_occurred_if_explicitly_available",
      assertion_time: "when_the_actor_statement_was_dated_if_explicitly_available",
      publication_time: "when_the_source_was_published_if_available",
      retrieval_time: "when_sisyphus_observed_or_retrieved_the_source",
      missing_time_policy: "null_no_substitution",
      time_inference: "none",
    },
    warnings: [
      ...DISPLAY_WARNINGS,
      ...(synthetic ? [SYNTHETIC_WARNING] : []),
      ...projectPublicWarnings(packet.warnings),
    ],
    limitations: [...packet.limitations],
    candidate_canonical_boundary: {
      canonical_mutation: "none",
      evidence_records: synthetic
        ? "synthetic_fixture_internal_records_not_real_world_truth"
        : "candidate_review_only",
      relation_records: "candidate_review_only",
      source_inclusion: "not_endorsement_or_truth_verification",
      confidence_can_promote_to_canonical: false,
    },
    canonical_mutation: "none",
  };
}

export function buildPublicExportArtifacts(
  packet: SiteReadyCasePacket,
): PublicExportArtifacts | null {
  const representation = buildPublicLineageRepresentation(packet);
  if (representation.result_kind === "no_result") return null;
  return {
    packet: representation,
    json: `${JSON.stringify(representation, null, 2)}\n`,
    markdown: renderPublicEvidenceMarkdown(representation),
    shareableBrief: renderPublicEvidenceShareableBrief(representation),
    jsonFilename: "sisyphus-evidence-v1.json",
    markdownFilename: "sisyphus-evidence-v1.md",
  };
}

export function acceptsPublicEvidenceRepresentation(
  acceptHeader: string | null,
): boolean {
  if (!acceptHeader) return false;
  return acceptHeader
    .split(",")
    .map((value) => value.trim().split(";", 1)[0].toLowerCase())
    .includes(PUBLIC_EVIDENCE_MEDIA_TYPE);
}

export function publicLineageResponse(
  representation: SisyphusPublicLineageRepresentationV1,
): Response {
  return new Response(JSON.stringify(representation), {
    status: 200,
    headers: {
      "content-type": PUBLIC_EVIDENCE_MEDIA_TYPE,
      vary: "Accept",
    },
  });
}

export function renderPublicEvidenceMarkdown(
  packet: SisyphusPublicEvidencePacketV1,
): string {
  const lines = [
    "# Sisyphus public evidence packet",
    "",
    `- Contract: ${escapeMarkdownDisplay(packet.contract_version)}`,
    `- Artifact: ${escapeMarkdownDisplay(packet.artifact_kind)}`,
    `- Question: ${escapeMarkdownDisplay(packet.question)}`,
    `- Canonical mutation: ${escapeMarkdownDisplay(packet.canonical_mutation)}`,
    "",
    "## Warnings",
    "",
    ...packet.warnings.map((warning) => `- ${escapeMarkdownDisplay(warning)}`),
    "",
    "## Coverage",
    "",
    `- Sources returned: ${packet.coverage.actual_source_count} of a requested limit of ${packet.coverage.requested_source_limit}`,
    `- Basis: ${escapeMarkdownDisplay(packet.coverage.coverage_basis)}`,
    `- Missing target lanes: ${packet.coverage.missing_target_lanes.length > 0
      ? packet.coverage.missing_target_lanes.map(escapeMarkdownDisplay).join(", ")
      : "none reported"}`,
    "",
    "## Sources",
    "",
  ];

  for (const source of packet.sources) {
    lines.push(
      `### ${escapeMarkdownDisplay(source.title)}`,
      "",
      `- Publisher: ${escapeMarkdownDisplay(source.publisher)}`,
      `- Source: ${safeMarkdownLink(source.url ?? "No public URL", source.url)}`,
      `- Content: ${escapeMarkdownDisplay(source.content_capture)}`,
      `- Publication time: ${renderTime(source.publication_time, source.publication_time_precision)}`,
      `- Retrieval time: ${renderTime(source.retrieval_time, source.retrieval_time_precision)}`,
      `- Summary: ${escapeMarkdownDisplay(source.public_summary ?? "Not available")}`,
      "",
    );
  }

  appendTextRecords(lines, "Findings", packet.findings.map((item) => item.text));
  appendTextRecords(
    lines,
    "Actor claims",
    packet.actor_claims.map((item) =>
      `${item.actor ?? "Actor unavailable"}: ${item.claim_text}`,
    ),
  );
  appendTextRecords(
    lines,
    "Actions",
    packet.actions.map((item) =>
      `${item.actor ?? "Actor unavailable"}: ${item.action_text}`,
    ),
  );

  lines.push("## Timeline", "");
  for (const row of packet.timeline) {
    lines.push(
      `- ${escapeMarkdownDisplay(row.summary)}`,
      `  - Event time: ${renderTime(row.event_time, row.event_time_precision)}`,
      `  - Assertion time: ${renderTime(row.assertion_time, row.assertion_time_precision)}`,
      `  - Publication time: ${renderTime(row.publication_time, row.publication_time_precision)}`,
      `  - Retrieval time: ${renderTime(row.retrieval_time, row.retrieval_time_precision)}`,
    );
  }
  lines.push("");

  lines.push("## Candidate relations", "");
  for (const relation of packet.candidate_relations) {
    lines.push(
      `- ${escapeMarkdownDisplay(relation.relation_type)} · ${escapeMarkdownDisplay(relation.review_status)}: ${escapeMarkdownDisplay(relation.reason)}`,
    );
  }
  lines.push("");

  appendTextRecords(
    lines,
    "Unresolved questions",
    packet.unresolved_questions.map((item) => item.question),
  );
  appendTextRecords(lines, "Limitations", packet.limitations);

  lines.push(
    "## Time semantics",
    "",
    "- Event, assertion, publication, and retrieval times remain separate.",
    `- Missing time policy: ${packet.time_semantics.missing_time_policy}`,
    `- Time inference: ${packet.time_semantics.time_inference}`,
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderPublicEvidenceShareableBrief(
  packet: SisyphusPublicEvidencePacketV1,
): string {
  const sourceLines = packet.sources.slice(0, 5).map((source) =>
    `- ${safeMarkdownLink(source.title, source.url)} — ${escapeMarkdownDisplay(source.publisher)}; ${escapeMarkdownDisplay(source.content_capture)}`,
  );
  const findingLines = packet.findings.slice(0, 6).map((finding) =>
    `- ${escapeMarkdownDisplay(finding.text)}`,
  );
  const unresolvedLines = packet.unresolved_questions.slice(0, 6).map((question) =>
    `- ${escapeMarkdownDisplay(question.question)}`,
  );
  return [
    "Sisyphus shareable evidence brief",
    "",
    `Question: ${escapeMarkdownDisplay(packet.question)}`,
    `Artifact: ${escapeMarkdownDisplay(packet.artifact_kind)}`,
    "",
    "Warnings:",
    ...packet.warnings.map((warning) => `- ${escapeMarkdownDisplay(warning)}`),
    "",
    "Sources:",
    ...sourceLines,
    "",
    "Findings:",
    ...(findingLines.length > 0 ? findingLines : ["- No bounded finding was available."]),
    "",
    "Unresolved questions:",
    ...(unresolvedLines.length > 0 ? unresolvedLines : ["- None reported."]),
    "",
    `Canonical mutation: ${packet.canonical_mutation}`,
  ].join("\n");
}

export function escapeMarkdownDisplay(value: string): string {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
  return normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}[\]()#+\-.!|])/g, "\\$1");
}

export function validatedPublicHttpUrl(value: string | null): {
  url: string | null;
  domain: string | null;
} {
  if (!value) return { url: null, domain: null };
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
    ) {
      return { url: null, domain: null };
    }
    return { url: parsed.toString(), domain: parsed.hostname.toLowerCase() };
  } catch {
    return { url: null, domain: null };
  }
}

function buildPublicNoResult(
  packet: SiteReadyCasePacket,
): SisyphusPublicNoResultV1 {
  const failure = publicFailure(packet.warnings[0]);
  return {
    contract_version: PUBLIC_NO_RESULT_CONTRACT_VERSION,
    result_kind: "no_result",
    artifact_kind: "failed_live_attempt",
    result_mode: "fallback_no_result",
    evidence_available: false,
    question: packet.normalized_public_interest_question,
    failure,
    retry_guidance: {
      automatic_retry: "forbidden",
      provider_work_may_have_occurred: true,
      safe_blind_retry: false,
      guidance:
        "Do not retry automatically. Provider work may already have occurred; retry only after a person reviews the failure and still needs the investigation.",
    },
    warnings: [
      "No public evidence result exists for the requested question.",
      "The unrelated synthetic prepared example was not serialized or substituted.",
      "A fallback/no-result is not an investigation result for the submitted question.",
    ],
    canonical_mutation: "none",
  };
}

function publicFailure(warning: string | undefined): {
  code: string;
  message: string;
} {
  if (!warning) {
    return {
      code: "live_attempt_failed",
      message: "The live investigation did not produce a public evidence result.",
    };
  }
  const separator = warning.indexOf(":");
  const rawCode = separator >= 0 ? warning.slice(0, separator) : warning;
  const code = /^[a-z0-9_]{1,80}$/.test(rawCode)
    ? rawCode
    : "live_attempt_failed";
  const message = separator >= 0 ? warning.slice(separator + 1).trim() : "";
  return {
    code,
    message: message || "The live investigation did not produce a public evidence result.",
  };
}

function projectCoverage(packet: SiteReadyCasePacket): PublicCoverageV1 {
  const coverage = packet.coverage_summary;
  const common = {
    bounded_nonexhaustive: true as const,
    coverage_basis: coverage.coverage_basis,
    requested_source_limit: packet.requested_source_limit,
    actual_source_count: packet.actual_source_count,
    discovery_profile: packet.discovery_profile,
    lane_counts: {
      baseline_authority: coverage.lane_counts.baseline_authority,
      primary_or_origin: coverage.lane_counts.primary_or_origin,
      local_or_firsthand: coverage.lane_counts.local_or_firsthand,
      specialist_context: coverage.lane_counts.specialist_context,
      challenge_or_correction: coverage.lane_counts.challenge_or_correction,
    },
    missing_target_lanes: [...coverage.missing_target_lanes],
  };
  if (coverage.coverage_basis === "live_discovery") {
    return {
      ...common,
      live_discovery: {
        baseline_requested: coverage.baseline_requested,
        baseline_returned: coverage.baseline_returned,
        expansion_requested: coverage.expansion_requested,
        expansion_returned: coverage.expansion_returned,
        expansion_attempted: coverage.expansion_attempted,
        expansion_completed_successfully:
          coverage.expansion_completed_successfully,
      },
      prepared_fixture_source_count: null,
    };
  }
  return {
    ...common,
    live_discovery: null,
    prepared_fixture_source_count: coverage.fixture_source_count,
  };
}

function projectSource(
  source: AnalysisSourceSummary,
  synthetic: boolean,
): PublicSourceV1 {
  const publicLocation = synthetic
    ? { url: null, domain: null }
    : validatedPublicHttpUrl(source.url);
  return {
    source_id: source.source_id,
    title: source.title,
    publisher: source.publisher,
    url: publicLocation.url,
    domain: publicLocation.domain,
    source_kind: synthetic ? "synthetic_fixture" : "live_web_source",
    content_kind: source.content_kind,
    content_capture: synthetic
      ? "captured_synthetic_fixture_text"
      : "model_generated_summary_not_captured_page_text",
    public_summary: synthetic
      ? source.evidence_excerpt
      : source.web_search_grounded_candidate_summary,
    publication_time: source.published_at,
    publication_time_precision: source.published_at_precision,
    retrieval_time: source.retrieved_at,
    retrieval_time_precision: "instant",
    record_status: source.record_status,
    record_status_scope: synthetic ? "fixture_internal" : "candidate_review_only",
    limitations: [...source.limitations],
  };
}

function projectOccurrence(
  occurrence: ClaimOccurrence,
  synthetic: boolean,
): PublicClaimOccurrenceV1 {
  return {
    occurrence_id: occurrence.occurrence_id,
    source_id: occurrence.source_id,
    claim_id: occurrence.claim_id,
    actor: occurrence.actor,
    claim_text: occurrence.original_claim_text,
    support: projectSupport(occurrence.support_reference, synthetic),
    event_time: occurrence.event_time_candidate,
    event_time_precision: occurrence.event_time_candidate_precision,
    assertion_time: occurrence.assertion_time_candidate,
    assertion_time_precision: occurrence.assertion_time_candidate_precision,
    publication_time: occurrence.source_publication_time,
    publication_time_precision: occurrence.source_publication_time_precision,
    retrieval_time: occurrence.source_retrieval_time,
    retrieval_time_precision: "instant",
    record_status: occurrence.status,
    record_status_scope: synthetic ? "fixture_internal" : "candidate_review_only",
  };
}

function projectSupport(
  support: BoundedSupportReference,
  synthetic: boolean,
): PublicSupportV1 {
  const publicLocation = synthetic
    ? { url: null, domain: null }
    : validatedPublicHttpUrl(support.citation_url);
  return {
    source_id: support.source_id,
    content_kind: synthetic
      ? "captured_synthetic_fixture_excerpt"
      : "model_generated_web_search_summary_span",
    bounded_support: support.bounded_excerpt,
    url: publicLocation.url,
    proves: synthetic
      ? "synthetic_fixture_support_only"
      : "model_summary_containment_only",
  };
}

function assertLiveSources(sources: AnalysisSourceSummary[]): void {
  for (const source of sources) {
    if (
      source.retrieval_mode !== "openai_web_search"
      || source.content_kind !== "model_generated_web_search_summary"
      || source.source_text_captured
    ) {
      throw new Error(
        "A live public evidence packet cannot contain prepared fixture source content.",
      );
    }
  }
}

function projectPublicWarnings(warnings: string[]): string[] {
  const projected = new Set<string>();
  for (const warning of warnings) {
    if (warning.startsWith("relation_pair_bound_reached:")) {
      projected.add(
        "Candidate-relation analysis reached its public bound; some plausible pairs were deferred and completeness is not claimed.",
      );
      continue;
    }
    if (warning.startsWith("source_extraction_failed:")) {
      projected.add(
        "At least one bounded source-local extraction did not complete; the remaining result may be partial.",
      );
      continue;
    }
    if (
      warning.startsWith("coverage_expansion_failed:")
      || warning.startsWith("coverage_expansion_empty:")
    ) {
      projected.add(
        "Coverage expansion did not add a complete source set; any usable baseline remains bounded and partial.",
      );
      continue;
    }
    if (warning.startsWith("missing_coverage_lanes:")) {
      projected.add(
        "One or more target source roles are missing; inspect the explicit bounded coverage record.",
      );
      continue;
    }
    if (
      warning.startsWith("rejected_source_candidates:")
      || warning.startsWith("duplicate_url_candidates:")
      || warning.startsWith("source_limit_truncated:")
    ) {
      projected.add(
        "Source discovery candidates were filtered or bounded before public projection.",
      );
      continue;
    }
    projected.add(
      "The investigation completed with a bounded internal warning that is not reproduced in the public artifact.",
    );
  }
  return [...projected];
}

function appendTextRecords(
  lines: string[],
  heading: string,
  values: string[],
): void {
  lines.push(`## ${heading}`, "");
  if (values.length === 0) {
    lines.push("- None reported.", "");
    return;
  }
  lines.push(...values.map((value) => `- ${escapeMarkdownDisplay(value)}`), "");
}

function renderTime(
  value: string | null,
  precision: "day" | "instant" | null,
): string {
  if (!value || !precision) return "not provided (no substitution)";
  return `${escapeMarkdownDisplay(value)} (${precision})`;
}

function safeMarkdownLink(label: string, value: string | null): string {
  const safeLabel = escapeMarkdownDisplay(label);
  const publicLocation = validatedPublicHttpUrl(value);
  if (!publicLocation.url) return safeLabel;
  const destination = publicLocation.url
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return `[${safeLabel}](<${destination}>)`;
}
