import type {
  AnalysisCandidate,
  AnalysisRunPacket,
  AnalysisSourceSummary,
} from "../analysis/contracts";
import type { PreparedCaseReadModel, SourceSnapshotSummary } from "../contracts";
import { getPreparedCase } from "../read-model";
import {
  applyFamilyReferences,
  buildBoundedRelations,
  buildClaimFamilies,
  normalizeClaimText,
  stableLineageId,
  type FixtureRelationRule,
} from "./engine";
import type {
  ClaimLineageRow,
  ClaimOccurrence,
  FocusedDetailLookupKey,
  PacketAction,
  PacketActorClaim,
  PacketFinding,
  PacketUnresolvedQuestion,
  SiteReadyCasePacket,
  SiteTimelineRow,
} from "./contracts";
import { validateSiteReadyCasePacket } from "./contracts";

const PREPARED_CASE_ID = "city_heatwave_cooling_centers";
const PREPARED_QUESTION =
  "How did cooling-center availability claims change as practical access evidence and city updates appeared?";
const MAX_BOUNDED_EXCERPT_LENGTH = 560;
const MAX_INITIAL_PACKET_BYTES = 180_000;

const preparedFamilyGroups = [
  {
    family_id: "family_candidate_fixture_city_guidance_accuracy",
    claim_ids: [
      "claim_city_all_centers_open_2026_06_10_001",
      "claim_city_update_corrected_errors_2026_06_14_001",
    ],
    reason:
      "The same city actor issued later guidance that explicitly updates and corrects the earlier cooling-center guidance.",
    signals: ["same_actor", "same_guidance_topic", "explicit_update_language", "later_ordering"],
  },
  {
    family_id: "family_candidate_fixture_access_observation",
    claim_ids: ["claim_community_access_gap_2026_06_12_001"],
    reason:
      "The community access observation remains a distinct claim family rather than being collapsed into the city's availability claim.",
    signals: ["distinct_actor", "street_level_access_observation", "unresolved_grouping"],
  },
];

const preparedRelationRules: FixtureRelationRule[] = [
  {
    left_claim_id: "claim_city_all_centers_open_2026_06_10_001",
    right_claim_id: "claim_community_access_gap_2026_06_12_001",
    relation_type: "contradicts",
    confidence_score: 0.86,
    reason:
      "The bounded fixture observation reports closed or practically inaccessible listed sites, complicating the earlier broad availability claim without proving citywide failure.",
    evidence_basis: "deterministic_fixture",
  },
  {
    left_claim_id: "claim_city_all_centers_open_2026_06_10_001",
    right_claim_id: "claim_city_update_corrected_errors_2026_06_14_001",
    relation_type: "supersedes",
    confidence_score: 0.92,
    reason:
      "The same city actor later published an explicitly updated list that removed unavailable locations and corrected listing errors.",
    evidence_basis: "explicit_replacement_language",
  },
  {
    left_claim_id: "claim_community_access_gap_2026_06_12_001",
    right_claim_id: "claim_city_update_corrected_errors_2026_06_14_001",
    relation_type: "follow_up",
    confidence_score: 0.81,
    reason:
      "The later city update addresses hours, unavailable locations, addresses, and transport barriers raised by the earlier bounded community observation.",
    evidence_basis: "deterministic_fixture",
  },
];

export function buildPreparedSiteReadyCasePacket(
  preparedCase: PreparedCaseReadModel = getPreparedCase(PREPARED_CASE_ID),
): SiteReadyCasePacket {
  const sourceSummaries = preparedCase.sources.map(preparedSourceToAnalysisSummary);
  const occurrences = preparedOccurrences(preparedCase, sourceSummaries);
  const families = buildClaimFamilies(occurrences, preparedFamilyGroups);
  const occurrencesWithFamilies = applyFamilyReferences(occurrences, families);
  const relationResult = buildBoundedRelations(
    occurrencesWithFamilies,
    preparedRelationRules,
  );

  return assembleAndValidate({
    contract_version: "site_ready_case_packet.v1",
    case_id: preparedCase.case_id,
    run_id: `run_deterministic_${preparedCase.case_id}`,
    mode: "deterministic",
    status: "ready",
    title: preparedCase.title,
    normalized_public_interest_question: PREPARED_QUESTION,
    requested_source_limit: 5,
    actual_source_count: sourceSummaries.length,
    source_snapshot_summaries: sourceSummaries,
    source_bound_findings: preparedCase.findings.map((finding) => ({
      ...finding,
      status: "canonical" as const,
      origin: "deterministic_fixture" as const,
    })),
    actor_claims: preparedCase.actor_claims.map((claim) => ({
      claim_id: claim.claim_id,
      actor: claim.actor,
      claim_text: claim.claim_text,
      source_ids: claim.source_ids,
      assertion_time_candidate: claim.asserted_at,
      confidence: claim.record_status === "canonical" ? "high" : "medium",
      uncertainty: claim.status.replaceAll("_", " "),
      status: claim.record_status,
      origin: "deterministic_fixture" as const,
    })),
    actions: preparedCase.actions.map((action) => ({
      action_id: action.action_id,
      actor: action.actor,
      action_text: action.action_text,
      source_ids: action.source_ids,
      event_time_candidate: action.occurred_at,
      confidence: "high",
      uncertainty: "Accepted only within the deterministic fixture record.",
      status: "canonical" as const,
      origin: "deterministic_fixture" as const,
    })),
    claim_occurrences: occurrencesWithFamilies,
    candidate_claim_families: families,
    relation_candidates: relationResult.relations,
    event_timeline_rows: buildTimelineRows(occurrencesWithFamilies),
    claim_lineage_rows: buildLineageRows(occurrencesWithFamilies, relationResult.relations),
    current_source_bound_candidate_synthesis: preparedCase.source_bound_summary,
    unresolved_questions: preparedCase.unresolved_questions.map((question) => ({
      question_id: question.question_id,
      question: question.question,
      related_ids: question.related_ids,
      status: "unresolved" as const,
      record_status: "canonical" as const,
      origin: "deterministic_fixture" as const,
    })),
    warnings: relationResult.warnings,
    limitations: [
      ...preparedCase.limitations,
      "Relation candidates are a review aid and do not adjudicate truth.",
      "The deterministic relation stage used no model-assisted classification.",
    ],
    candidate_canonical_boundary: canonicalBoundary(),
    bounded_work_summary: relationResult.summary,
    focused_detail_lookup_keys: [],
  });
}

export function buildSiteReadyCasePacketFromAnalysis(
  run: AnalysisRunPacket,
): SiteReadyCasePacket {
  if (run.mode === "fallback") {
    const prepared = buildPreparedSiteReadyCasePacket();
    return assembleAndValidate({
      ...prepared,
      run_id: run.run_id,
      mode: "fallback",
      status: "fallback",
      normalized_public_interest_question: run.normalized_question,
      requested_source_limit: run.requested_source_limit,
      warnings: [...run.warnings, ...prepared.warnings],
      limitations: [...run.limitations, ...prepared.limitations],
      focused_detail_lookup_keys: [],
    });
  }

  const sourceById = new Map(
    run.source_snapshot_summaries.map((source) => [source.source_id, source]),
  );
  const occurrences = run.candidates
    .filter(isOccurrenceCandidate)
    .map((candidate) => liveOccurrence(candidate, sourceById));
  const families = buildClaimFamilies(occurrences);
  const occurrencesWithFamilies = applyFamilyReferences(occurrences, families);
  const relationResult = buildBoundedRelations(occurrencesWithFamilies);
  const findings = run.candidates.filter((item) => item.candidate_type === "finding");
  const claims = run.candidates.filter((item) => item.candidate_type === "actor_claim");
  const actions = run.candidates.filter((item) => item.candidate_type === "action");
  const questions = run.candidates.filter(
    (item) => item.candidate_type === "unresolved_question",
  );

  return assembleAndValidate({
    contract_version: "site_ready_case_packet.v1",
    case_id: run.case_id,
    run_id: run.run_id,
    mode: "live",
    status: "live",
    title: `Candidate lineage: ${run.normalized_question}`,
    normalized_public_interest_question: run.normalized_question,
    requested_source_limit: run.requested_source_limit,
    actual_source_count: run.actual_source_count,
    source_snapshot_summaries: run.source_snapshot_summaries,
    source_bound_findings: findings.map((candidate) => candidateToFinding(candidate)),
    actor_claims: claims.map((candidate) => candidateToClaim(candidate, sourceById)),
    actions: actions.map((candidate) => candidateToAction(candidate, sourceById)),
    claim_occurrences: occurrencesWithFamilies,
    candidate_claim_families: families,
    relation_candidates: relationResult.relations,
    event_timeline_rows: buildTimelineRows(occurrencesWithFamilies),
    claim_lineage_rows: buildLineageRows(occurrencesWithFamilies, relationResult.relations),
    current_source_bound_candidate_synthesis: buildLiveSynthesis(run),
    unresolved_questions: questions.map(candidateToQuestion),
    warnings: [...run.warnings, ...relationResult.warnings],
    limitations: [
      ...run.limitations,
      "Live source text was not captured; web-search candidate summaries remain model-generated partial records.",
      "Relations and groupings based on live partial records are candidate/review-only.",
      "The deterministic relation stage used no model-assisted classification.",
    ],
    candidate_canonical_boundary: canonicalBoundary(),
    bounded_work_summary: relationResult.summary,
    focused_detail_lookup_keys: [],
  });
}

function preparedOccurrences(
  preparedCase: PreparedCaseReadModel,
  sourceSummaries: AnalysisSourceSummary[],
): ClaimOccurrence[] {
  const sourceById = new Map(sourceSummaries.map((source) => [source.source_id, source]));
  return preparedCase.actor_claims.flatMap((claim) =>
    claim.source_ids.map((sourceId) => {
      const source = requiredSource(sourceById, sourceId);
      const originalSource = preparedCase.sources.find((item) => item.source_id === sourceId);
      return {
        occurrence_id: stableLineageId(
          "occurrence_fixture_",
          claim.claim_id,
          source.source_id,
          source.snapshot_id,
        ),
        source_id: source.source_id,
        snapshot_id: source.snapshot_id,
        source_record_status: source.record_status,
        claim_id: claim.claim_id,
        claim_kind: "prepared_actor_claim" as const,
        candidate_claim_family_id: null,
        actor: claim.actor,
        original_claim_text: claim.claim_text,
        normalized_claim_representation: normalizeClaimText(claim.claim_text),
        support_kind: "captured_fixture_source_evidence_excerpt" as const,
        support_reference: {
          support_kind: "captured_fixture_source_evidence_excerpt" as const,
          source_id: source.source_id,
          snapshot_id: source.snapshot_id,
          bounded_excerpt: bounded(source.evidence_excerpt ?? "Fixture support unavailable."),
          evidence_reference: `fixture://${preparedCase.case_id}/${source.source_id}#evidence_excerpt`,
          citation_url: null,
          proves: "captured_fixture_support" as const,
        },
        assertion_time_candidate: claim.asserted_at,
        event_time_candidate: originalSource?.event_time ?? null,
        source_publication_time: source.published_at,
        source_retrieval_time: source.retrieved_at,
        confidence: claim.record_status === "canonical" ? "high" as const : "medium" as const,
        uncertainty: claim.status.replaceAll("_", " "),
        validation_status: "validated" as const,
        status: claim.record_status,
        origin: "deterministic_fixture" as const,
      };
    }),
  );
}

function liveOccurrence(
  candidate: AnalysisCandidate,
  sourceById: Map<string, AnalysisSourceSummary>,
): ClaimOccurrence {
  const source = requiredSource(sourceById, candidate.source_id);
  const eventTime = candidate.candidate_type === "event_time_candidate" ||
    candidate.candidate_type === "action" ? candidate.time_candidate : null;
  const assertionTime = candidate.candidate_type === "assertion_time_candidate" ||
    candidate.candidate_type === "actor_claim" ? candidate.time_candidate : null;
  return {
    occurrence_id: stableLineageId(
      "occurrence_live_",
      candidate.candidate_id,
      candidate.source_id,
      candidate.snapshot_id,
    ),
    source_id: candidate.source_id,
    snapshot_id: candidate.snapshot_id,
    source_record_status: "candidate",
    claim_id: candidate.candidate_id,
    claim_kind: candidate.candidate_type,
    candidate_claim_family_id: null,
    actor: source.publisher,
    original_claim_text: candidate.text,
    normalized_claim_representation: normalizeClaimText(candidate.text),
    support_kind: "model_generated_web_search_summary_span",
    support_reference: {
      support_kind: "model_generated_web_search_summary_span",
      source_id: candidate.source_id,
      snapshot_id: candidate.snapshot_id,
      bounded_excerpt: bounded(candidate.supporting_summary_span),
      evidence_reference: candidate.evidence_reference,
      citation_url: candidate.source_reference.url,
      proves: "model_summary_containment_only",
    },
    assertion_time_candidate: assertionTime,
    event_time_candidate: eventTime,
    source_publication_time: source.published_at,
    source_retrieval_time: source.retrieved_at,
    confidence: candidate.confidence,
    uncertainty: candidate.uncertainty,
    validation_status: "validated",
    status: "candidate",
    origin: "live_api",
  };
}

function isOccurrenceCandidate(candidate: AnalysisCandidate): boolean {
  return candidate.candidate_type !== "unresolved_question" &&
    candidate.candidate_type !== "source_hygiene";
}

function preparedSourceToAnalysisSummary(source: SourceSnapshotSummary): AnalysisSourceSummary {
  return {
    source_id: source.source_id,
    snapshot_id: source.snapshot_id,
    title: source.title,
    url: source.canonical_url ?? source.original_url,
    domain: source.canonical_url
      ? new URL(source.canonical_url).hostname
      : "deterministic.fixture",
    publisher: source.publisher,
    published_at: source.published_at,
    retrieved_at: source.retrieved_at,
    snapshot_status: source.snapshot_status,
    retrieval_mode: source.retrieval_mode,
    content_kind: source.content_kind,
    source_text_captured: source.content_kind === "captured_fixture_source_text",
    content_sha256: source.content_sha256,
    candidate_summary_sha256: source.candidate_summary_sha256,
    record_status: source.status,
    evidence_excerpt: source.evidence_excerpt,
    web_search_grounded_candidate_summary:
      source.web_search_grounded_candidate_summary,
    limitations: source.limitations,
    api_provenance: source.api_provenance,
  };
}

function candidateToFinding(candidate: AnalysisCandidate): PacketFinding {
  return {
    finding_id: candidate.candidate_id,
    text: candidate.text,
    source_ids: [candidate.source_id],
    confidence: candidate.confidence,
    status: "candidate",
    origin: "live_api",
  };
}

function candidateToClaim(
  candidate: AnalysisCandidate,
  sourceById: Map<string, AnalysisSourceSummary>,
): PacketActorClaim {
  return {
    claim_id: candidate.candidate_id,
    actor: requiredSource(sourceById, candidate.source_id).publisher,
    claim_text: candidate.text,
    source_ids: [candidate.source_id],
    assertion_time_candidate: candidate.time_candidate,
    confidence: candidate.confidence,
    uncertainty: candidate.uncertainty,
    status: "candidate",
    origin: "live_api",
  };
}

function candidateToAction(
  candidate: AnalysisCandidate,
  sourceById: Map<string, AnalysisSourceSummary>,
): PacketAction {
  return {
    action_id: candidate.candidate_id,
    actor: requiredSource(sourceById, candidate.source_id).publisher,
    action_text: candidate.text,
    source_ids: [candidate.source_id],
    event_time_candidate: candidate.time_candidate,
    confidence: candidate.confidence,
    uncertainty: candidate.uncertainty,
    status: "candidate",
    origin: "live_api",
  };
}

function candidateToQuestion(candidate: AnalysisCandidate): PacketUnresolvedQuestion {
  return {
    question_id: candidate.candidate_id,
    question: candidate.text,
    related_ids: [candidate.source_id],
    status: "unresolved",
    record_status: "candidate",
    origin: "live_api",
  };
}

function buildTimelineRows(occurrences: ClaimOccurrence[]): SiteTimelineRow[] {
  return occurrences
    .map((occurrence) => {
      const display = selectDisplayTime(occurrence);
      return {
        timeline_row_id: stableLineageId("timeline_row_", occurrence.occurrence_id),
        occurrence_ids: [occurrence.occurrence_id],
        summary: occurrence.original_claim_text,
        event_time: occurrence.event_time_candidate,
        actor_assertion_time: occurrence.assertion_time_candidate,
        publication_time: occurrence.source_publication_time,
        retrieval_time: occurrence.source_retrieval_time,
        display_time_axis: display.axis,
        display_time: display.time,
        time_inference: "none" as const,
        status: occurrence.status,
      };
    })
    .sort((left, right) =>
      left.display_time.localeCompare(right.display_time) ||
      left.timeline_row_id.localeCompare(right.timeline_row_id),
    );
}

function buildLineageRows(
  occurrences: ClaimOccurrence[],
  relations: SiteReadyCasePacket["relation_candidates"],
): ClaimLineageRow[] {
  const occurrenceById = new Map(occurrences.map((item) => [item.occurrence_id, item]));
  return relations.map((relation) => {
    const left = occurrenceById.get(relation.left_occurrence_id);
    const right = occurrenceById.get(relation.right_occurrence_id);
    return {
      lineage_row_id: stableLineageId("lineage_row_", relation.relation_id),
      family_id:
        left?.candidate_claim_family_id === right?.candidate_claim_family_id
          ? left?.candidate_claim_family_id ?? null
          : null,
      relation_id: relation.relation_id,
      from_occurrence_id: relation.left_occurrence_id,
      to_occurrence_id: relation.right_occurrence_id,
      relation_type: relation.relation_type,
      summary: relation.reason,
      status: "candidate",
      review_status: "pending_review",
    };
  });
}

function selectDisplayTime(occurrence: ClaimOccurrence): {
  axis: SiteTimelineRow["display_time_axis"];
  time: string;
} {
  if (occurrence.event_time_candidate) {
    return { axis: "event_time", time: occurrence.event_time_candidate };
  }
  if (occurrence.assertion_time_candidate) {
    return { axis: "actor_assertion_time", time: occurrence.assertion_time_candidate };
  }
  if (occurrence.source_publication_time) {
    return { axis: "publication_time", time: occurrence.source_publication_time };
  }
  return { axis: "retrieval_time", time: occurrence.source_retrieval_time };
}

function buildLiveSynthesis(run: AnalysisRunPacket): string[] {
  const items = run.candidates
    .filter((candidate) =>
      candidate.candidate_type === "finding" ||
      candidate.candidate_type === "actor_claim" ||
      candidate.candidate_type === "action",
    )
    .slice(0, 6)
    .map((candidate) => `${candidate.candidate_type}: ${candidate.text}`);
  return items.length > 0
    ? items
    : ["No validated source-local finding, actor-claim, or action candidate was available for synthesis."];
}

function canonicalBoundary(): SiteReadyCasePacket["candidate_canonical_boundary"] {
  return {
    canonical_mutation: "none",
    deterministic_fixture_records_may_be_canonical: true,
    live_and_inferred_records: "candidate_review_only",
    browser_selection_can_mutate_canonical: false,
    confidence_can_promote_to_canonical: false,
  };
}

function assembleAndValidate(
  packet: SiteReadyCasePacket,
): SiteReadyCasePacket {
  const withDetails: SiteReadyCasePacket = {
    ...packet,
    focused_detail_lookup_keys: buildDetailKeys(packet),
  };
  const validated = validateSiteReadyCasePacket(withDetails);
  const serialized = JSON.stringify(validated);
  if (serialized.includes('"source_text"') || serialized.includes('"output_parsed"')) {
    throw new Error("Site-ready packet crossed the compact source/provider boundary");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_INITIAL_PACKET_BYTES) {
    throw new Error("Site-ready packet exceeded the bounded initial payload limit");
  }
  return validated;
}

function buildDetailKeys(packet: SiteReadyCasePacket): FocusedDetailLookupKey[] {
  const entries: Array<readonly [FocusedDetailLookupKey["kind"], string]> = [
    ...packet.source_snapshot_summaries.map((item) => ["source" as const, item.source_id] as const),
    ...packet.claim_occurrences.map((item) => ["claim_occurrence" as const, item.occurrence_id] as const),
    ...packet.candidate_claim_families.map((item) => ["claim_family" as const, item.family_id] as const),
    ...packet.relation_candidates.map((item) => ["relation" as const, item.relation_id] as const),
    ...packet.event_timeline_rows.map((item) => ["timeline_row" as const, item.timeline_row_id] as const),
    ...packet.claim_lineage_rows.map((item) => ["lineage_row" as const, item.lineage_row_id] as const),
    ...packet.unresolved_questions.map((item) => ["unresolved_question" as const, item.question_id] as const),
  ];
  return entries.map(([kind, id]) => ({ kind, id, key: `${kind}:${id}` }));
}

function requiredSource(
  sourceById: Map<string, AnalysisSourceSummary>,
  sourceId: string,
): AnalysisSourceSummary {
  const source = sourceById.get(sourceId);
  if (!source) throw new Error(`Validated candidate references missing source ${sourceId}`);
  return source;
}

function bounded(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_BOUNDED_EXCERPT_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_BOUNDED_EXCERPT_LENGTH - 1)}…`;
}
