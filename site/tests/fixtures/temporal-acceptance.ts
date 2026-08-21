import { buildPreparedSiteReadyCasePacket } from "../../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type SiteReadyCasePacket,
} from "../../app/lib/lineage/contracts";

export function buildTemporalAcceptanceFixture(): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const sources = packet.source_snapshot_summaries.slice(0, 3);
  const [initialSource, changedSource, finalSource] = sources;

  const sourceInputs = [
    {
      source: initialSource,
      title: "Agency announces maintenance exercise schedule",
      url: "https://public.example.org/notices/maintenance-exercise-schedule",
      publishedAt: "2030-09-01T00:00:00.000Z",
      summary: "The agency scheduled maintenance exercise 97 for September 13. Two crews would replace a communications relay during the exercise.",
      whyIncluded: "Initial official schedule for the bounded comparison.",
    },
    {
      source: changedSource,
      title: "Agency moves maintenance exercise after safety review",
      url: "https://public.example.org/updates/maintenance-exercise-new-date",
      publishedAt: "2030-09-07T00:00:00.000Z",
      summary: "The agency moved maintenance exercise 97 from September 13 to September 18 after an unexpected suit sensor reading prompted a safety review.",
      whyIncluded: "Official date-change update and operational explanation.",
    },
    {
      source: finalSource,
      title: "Agency confirms maintenance exercise coverage",
      url: "https://public.example.org/live/maintenance-exercise-97",
      publishedAt: null,
      summary: "The final listing scheduled coverage for September 18 and retained the revised exercise date.",
      whyIncluded: "Later official listing confirming the revised schedule.",
    },
  ];

  for (const input of sourceInputs) {
    Object.assign(input.source, {
      title: input.title,
      url: input.url,
      domain: "public.example.org",
      publisher: "Regional Operations Agency",
      published_at: input.publishedAt,
      published_at_precision: input.publishedAt ? "day" : null,
      retrieved_at: "2030-09-20T12:00:00.000Z",
      snapshot_status: "partial",
      retrieval_mode: "openai_web_search",
      content_kind: "model_generated_web_search_summary",
      source_text_captured: false,
      content_sha256: null,
      candidate_summary_sha256: null,
      record_status: "candidate",
      evidence_excerpt: null,
      web_search_grounded_candidate_summary: input.summary,
      limitations: [
        "Live source pages were not captured; model-generated web-search summaries remain partial review material.",
      ],
      api_provenance: null,
      source_selection: {
        discovery_pass: "baseline",
        discovery_lane: "baseline_authority",
        source_context: "official",
        information_proximity: "primary_actor_statement",
        why_included: input.whyIncluded,
        classification_basis: "model_generated_web_search_classification",
        classification_status: "candidate_review_only",
        comparison_target_source_ids: [],
      },
    });
  }

  const claimId = "candidate_live_claim_separate_follow_up";
  const occurrenceId = "occurrence_live_separate_follow_up";
  const familyId = "family_candidate_live_separate_follow_up";
  const timelineRowId = "timeline_row_separate_follow_up";
  const changeActionId = "candidate_live_action_schedule_change";

  Object.assign(packet, {
    case_id: "synthetic_temporal_acceptance",
    run_id: "synthetic_temporal_acceptance_run",
    mode: "live",
    status: "live",
    title: "Candidate lineage review",
    normalized_public_interest_question:
      "How did the Regional Operations Agency's schedule and explanation for maintenance exercise 97 change between September 1 and September 18, 2030?",
    requested_source_limit: 3,
    actual_source_count: 3,
    discovery_profile: "standard",
    coverage_summary: {
      coverage_basis: "live_discovery",
      discovery_profile: "standard",
      baseline_requested: 3,
      baseline_returned: 3,
      expansion_requested: 0,
      expansion_returned: 0,
      lane_counts: {
        baseline_authority: 3,
        primary_or_origin: 0,
        local_or_firsthand: 0,
        specialist_context: 0,
        challenge_or_correction: 0,
      },
      missing_target_lanes: [],
      unique_domain_count: 1,
      duplicate_url_count: 0,
      source_limit_reached: true,
      expansion_attempted: false,
      expansion_completed_successfully: false,
    },
    source_snapshot_summaries: sources,
    source_bound_findings: [
      {
        finding_id: "candidate_live_finding_operational_detail",
        text: "Two crews would replace a communications relay during maintenance exercise 97.",
        source_ids: [initialSource.source_id],
        confidence: "medium",
        status: "candidate",
        origin: "live_api",
      },
      {
        finding_id: "candidate_live_finding_schedule_change",
        text: "The agency moved maintenance exercise 97 from September 13 to September 18 after an unexpected suit sensor reading prompted a safety review.",
        source_ids: [changedSource.source_id],
        confidence: "medium",
        status: "candidate",
        origin: "live_api",
      },
      {
        finding_id: "candidate_live_finding_final_schedule",
        text: "The later listing retained the revised September 18 exercise date.",
        source_ids: [finalSource.source_id],
        confidence: "medium",
        status: "candidate",
        origin: "live_api",
      },
    ],
    actor_claims: [
      {
        claim_id: claimId,
        actor: "Regional Operations Agency",
        claim_text: "The agency said a separate September 25 inspection remained scheduled.",
        source_ids: [changedSource.source_id],
        assertion_time_candidate: null,
        assertion_time_candidate_precision: null,
        confidence: "medium",
        uncertainty: "Candidate statement from a model-generated source summary.",
        status: "candidate",
        origin: "live_api",
      },
    ],
    actions: [
      {
        action_id: "candidate_live_action_initial_schedule",
        actor: "Regional Operations Agency",
        action_text: "The agency scheduled maintenance exercise 97 for September 13.",
        source_ids: [initialSource.source_id],
        event_time_candidate: "2030-09-13T00:00:00.000Z",
        event_time_candidate_precision: "day",
        confidence: "medium",
        uncertainty: "Candidate action from a model-generated source summary.",
        status: "candidate",
        origin: "live_api",
      },
      {
        action_id: changeActionId,
        actor: "Regional Operations Agency",
        action_text: "The agency moved maintenance exercise 97 from September 13 to September 18.",
        source_ids: [changedSource.source_id],
        event_time_candidate: "2030-09-18T00:00:00.000Z",
        event_time_candidate_precision: "day",
        confidence: "medium",
        uncertainty: "Candidate action from a model-generated source summary.",
        status: "candidate",
        origin: "live_api",
      },
    ],
    time_candidates: [],
    claim_occurrences: [
      {
        occurrence_id: occurrenceId,
        source_id: changedSource.source_id,
        snapshot_id: changedSource.snapshot_id,
        source_record_status: "candidate",
        claim_id: claimId,
        claim_kind: "actor_claim",
        candidate_claim_family_id: familyId,
        actor: "Regional Operations Agency",
        original_claim_text: "The agency said a separate September 25 inspection remained scheduled.",
        normalized_claim_representation: "separate september 25 inspection remained scheduled",
        support_kind: "model_generated_web_search_summary_span",
        support_reference: {
          support_kind: "model_generated_web_search_summary_span",
          source_id: changedSource.source_id,
          snapshot_id: changedSource.snapshot_id,
          bounded_excerpt: "The agency said a separate September 25 inspection remained scheduled.",
          evidence_reference: "synthetic candidate summary span",
          citation_url: changedSource.url,
          proves: "model_summary_containment_only",
        },
        assertion_time_candidate: null,
        assertion_time_candidate_precision: null,
        event_time_candidate: null,
        event_time_candidate_precision: null,
        source_publication_time: "2030-09-07T00:00:00.000Z",
        source_publication_time_precision: "day",
        source_retrieval_time: "2030-09-20T12:00:00.000Z",
        source_retrieval_time_precision: "instant",
        confidence: "medium",
        uncertainty: "Candidate claim from a model-generated source summary.",
        validation_status: "validated",
        status: "candidate",
        origin: "live_api",
      },
    ],
    candidate_claim_families: [
      {
        family_id: familyId,
        occurrence_ids: [occurrenceId],
        grouping_reason: "One source-linked claim remains standalone.",
        grouping_signals: ["single_occurrence"],
        unresolved: true,
        review_status: "pending_review",
        status: "candidate",
        origin: "live_api",
      },
    ],
    relation_candidates: [],
    event_timeline_rows: [
      {
        timeline_row_id: timelineRowId,
        occurrence_ids: [occurrenceId],
        summary: "The agency said a separate September 25 inspection remained scheduled.",
        event_time: null,
        event_time_precision: null,
        actor_assertion_time: null,
        actor_assertion_time_precision: null,
        publication_time: "2030-09-07T00:00:00.000Z",
        publication_time_precision: "day",
        retrieval_time: "2030-09-20T12:00:00.000Z",
        retrieval_time_precision: "instant",
        display_time_axis: "publication_time",
        display_time: "2030-09-07T00:00:00.000Z",
        display_time_precision: "day",
        time_inference: "none",
        status: "candidate",
      },
    ],
    claim_lineage_rows: [],
    current_source_bound_candidate_synthesis: [
      "action: The agency moved maintenance exercise 97 from September 13 to September 18.",
      "finding: An unexpected suit sensor reading prompted a safety review.",
    ],
    unresolved_questions: [
      {
        question_id: "candidate_live_question_safety_review",
        question: "What source text would independently verify the safety-review explanation?",
        related_ids: [changeActionId, changedSource.source_id],
        status: "unresolved",
        record_status: "candidate",
        origin: "live_api",
      },
    ],
    warnings: [],
    limitations: [
      "Live source pages were not captured; model-generated web-search summaries remain partial review material.",
      "All records are extracted only from the bounded model-generated candidate summary; no page text or independent verification was used.",
      "All candidates are extracted from a model-generated web-search summary rather than captured page text or an independently verified source excerpt.",
      "Each extraction used exactly one source. Cross-source temporal relation analysis is not performed.",
      "No cross-source temporal relations or truth judgments were made.",
      "Source inclusion is not endorsement.",
    ],
    bounded_work_summary: {
      occurrence_count: 1,
      theoretical_pair_count: 0,
      configured_maximum_pair_count: 28,
      prefilter_candidate_count: 0,
      filtered_out_count: 0,
      deferred_pair_count: 0,
      model_classified_count: 0,
      unrelated_count: 0,
      unresolved_or_insufficient_evidence_count: 0,
      configured_bound_reached: false,
    },
    focused_detail_lookup_keys: [
      ...sources.map((source) => ({
        kind: "source" as const,
        id: source.source_id,
        key: `source:${source.source_id}`,
      })),
      { kind: "claim_occurrence" as const, id: occurrenceId, key: `claim_occurrence:${occurrenceId}` },
      { kind: "claim_family" as const, id: familyId, key: `claim_family:${familyId}` },
      { kind: "timeline_row" as const, id: timelineRowId, key: `timeline_row:${timelineRowId}` },
      {
        kind: "unresolved_question" as const,
        id: "candidate_live_question_safety_review",
        key: "unresolved_question:candidate_live_question_safety_review",
      },
    ],
  } satisfies Partial<SiteReadyCasePacket>);

  return validateSiteReadyCasePacket(packet);
}
