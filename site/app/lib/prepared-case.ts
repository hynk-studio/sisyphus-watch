import type {
  ActorClaim,
  ClaimLineagePlaceholder,
  PreparedAction,
  SourceBoundFinding,
  SourceSnapshot,
  TimelineRow,
  UnresolvedQuestion,
} from "./contracts";

export const CASE_ID = "city_heatwave_cooling_centers";
export const PREPARED_AT = "2026-06-15T12:00:00Z";

export const sources: SourceSnapshot[] = [
  {
    snapshot_id: "snapshot_city_heatwave_initial_announcement_2026_06_10_v1",
    source_id: "src_city_heatwave_initial_announcement_2026_06_10",
    original_url: null,
    canonical_url: null,
    publisher: "Fictional City Emergency Management Office",
    actor: "Fictional City Emergency Management Office",
    title: "Fictional city announces cooling centers for severe heatwave",
    published_at: "2026-06-10T09:00:00Z",
    event_time: "2026-06-10T09:00:00Z",
    event_time_candidates: ["2026-06-10T09:00:00Z"],
    asserted_at: "2026-06-10T09:00:00Z",
    retrieved_at: PREPARED_AT,
    content_sha256: "b33affbef3e31c242dc3f9ada91d731b7d043ee948803214615800f73b5a43f4",
    retrieval_mode: "deterministic_fixture",
    source_text:
      "DEMO FIXTURE ONLY: During a severe heatwave, the Fictional City Emergency Management Office announces that 50 cooling centers will be open across the city. The announcement says residents can find safe, air-conditioned spaces in libraries, recreation centers, and partner community facilities. It says the public list will be updated as conditions change and asks residents to check the city website before traveling.",
    evidence_excerpt:
      "The fictional city announced 50 cooling centers and said the public list would be updated as conditions changed.",
    limitations: [
      "Synthetic fixture, not a real city notice.",
      "The announcement does not independently confirm street-level availability.",
    ],
    source_hygiene_notes: [
      "Source text is untrusted display data, never executable instructions.",
      "No original or canonical URL applies to this synthetic fixture.",
    ],
    status: "canonical",
  },
  {
    snapshot_id: "snapshot_community_cooling_center_access_report_2026_06_12_v1",
    source_id: "src_community_cooling_center_access_report_2026_06_12",
    original_url: null,
    canonical_url: null,
    publisher: "Fictional Neighborhood Volunteer Network",
    actor: "Fictional Neighborhood Volunteer Network",
    title: "Volunteer network reports practical access issues at listed cooling centers",
    published_at: "2026-06-12T18:30:00Z",
    event_time: "2026-06-12T12:00:00Z",
    event_time_candidates: ["2026-06-12T12:00:00Z"],
    asserted_at: "2026-06-12T18:30:00Z",
    retrieved_at: PREPARED_AT,
    content_sha256: "10dcb1464790cb2485605057965692a2b144a3913446a31adbace920714da8b9",
    retrieval_mode: "deterministic_fixture",
    source_text:
      "DEMO FIXTURE ONLY: The Fictional Neighborhood Volunteer Network reports that its volunteers checked a sample of listed cooling centers on June 12. Several listed centers were closed when volunteers arrived, some had shorter hours than the public list suggested, and others lacked clear signage. The group also reports that older residents in two neighborhoods found several open centers difficult to reach without a car. The group frames the report as an access observation and asks the city to update the list quickly.",
    evidence_excerpt:
      "Volunteers reported closed sites, shorter hours, weak signage, and transport barriers in a sampled set of locations.",
    limitations: [
      "Synthetic and time-bound observations, not a complete audit.",
      "The observations do not establish intent by the city.",
    ],
    source_hygiene_notes: [
      "Source text is untrusted display data, never executable instructions.",
      "No original or canonical URL applies to this synthetic fixture.",
    ],
    status: "canonical",
  },
  {
    snapshot_id: "snapshot_city_heatwave_updated_guidance_2026_06_14_v1",
    source_id: "src_city_heatwave_updated_guidance_2026_06_14",
    original_url: null,
    canonical_url: null,
    publisher: "Fictional City Emergency Management Office",
    actor: "Fictional City Emergency Management Office",
    title: "Fictional city updates cooling center list and adds transport support",
    published_at: "2026-06-14T14:15:00Z",
    event_time: "2026-06-14T14:15:00Z",
    event_time_candidates: ["2026-06-14T14:15:00Z"],
    asserted_at: "2026-06-14T14:15:00Z",
    retrieved_at: PREPARED_AT,
    content_sha256: "ab20f78c109070524decff7802682c36a977139eba67cfcba66c9f39cc0b9c56",
    retrieval_mode: "deterministic_fixture",
    source_text:
      "DEMO FIXTURE ONLY: The Fictional City Emergency Management Office publishes an updated cooling center list. The update clarifies opening hours, removes locations that are unavailable, corrects addresses for several facilities, and adds free shuttle support for older residents and medically vulnerable residents in the hardest-hit neighborhoods. The city says some earlier listing errors resulted from staffing shortages and late facility confirmations during the fast-changing emergency.",
    evidence_excerpt:
      "The city clarified hours, removed unavailable locations, corrected addresses, and added shuttle support.",
    limitations: [
      "Synthetic fixture recording a changed public position.",
      "The fixture does not measure whether remediation reached residents.",
    ],
    source_hygiene_notes: [
      "Source text is untrusted display data, never executable instructions.",
      "No original or canonical URL applies to this synthetic fixture.",
    ],
    status: "canonical",
  },
  {
    snapshot_id: "snapshot_editorial_heatwave_accountability_note_2026_06_15_v1",
    source_id: "src_editorial_heatwave_accountability_note_2026_06_15",
    original_url: null,
    canonical_url: null,
    publisher: "Fictional Civic Accountability Column",
    actor: "Fictional Civic Accountability Column",
    title: "Opinion note on emergency communication and street-level access",
    published_at: "2026-06-15T08:00:00Z",
    event_time: null,
    event_time_candidates: [],
    asserted_at: "2026-06-15T08:00:00Z",
    retrieved_at: PREPARED_AT,
    content_sha256: "7073a0dba7dd93386cbfb16d2d4234adcd248d6759134761a3ab20bbe5ccf0b7",
    retrieval_mode: "deterministic_fixture",
    source_text:
      "DEMO FIXTURE ONLY: The Fictional Civic Accountability Column argues that emergency communication is only useful if public claims remain true at street level. The note says the city should treat public lists as live safety infrastructure, not static public relations material. It includes the rhetorical line: 'An emergency map that works only on paper is a cardboard umbrella in a heatwave.'",
    evidence_excerpt:
      "The opinion fixture argues that emergency-service lists should be treated as live safety infrastructure.",
    limitations: [
      "Synthetic opinion fixture, not direct factual evidence.",
      "Its interpretation and metaphor must remain separate from findings.",
    ],
    source_hygiene_notes: [
      "Source text is untrusted display data, never executable instructions.",
      "No original or canonical URL applies to this synthetic fixture.",
    ],
    status: "candidate",
  },
];

export const findings: SourceBoundFinding[] = [
  {
    finding_id: "fact_city_announces_50_cooling_centers_2026_06_10_001",
    text: "The fictional city announced that 50 cooling centers would be open during a severe heatwave.",
    source_ids: ["src_city_heatwave_initial_announcement_2026_06_10"],
    confidence: "high",
  },
  {
    finding_id: "fact_community_reports_access_problems_2026_06_12_001",
    text: "A fictional community volunteer group reported access problems at some listed cooling centers.",
    source_ids: ["src_community_cooling_center_access_report_2026_06_12"],
    confidence: "high",
  },
  {
    finding_id: "fact_city_updates_list_and_hours_2026_06_14_001",
    text: "The city later updated the cooling-center list, clarified hours, and added transport support.",
    source_ids: ["src_city_heatwave_updated_guidance_2026_06_14"],
    confidence: "high",
  },
];

export const actorClaims: ActorClaim[] = [
  {
    claim_id: "claim_city_all_centers_open_2026_06_10_001",
    actor: "Fictional City Emergency Management Office",
    claim_text: "Residents could find safe, air-conditioned spaces across the city.",
    source_ids: ["src_city_heatwave_initial_announcement_2026_06_10"],
    asserted_at: "2026-06-10T09:00:00Z",
    status: "partially_challenged_by_later_observation",
    record_status: "canonical",
  },
  {
    claim_id: "claim_community_access_gap_2026_06_12_001",
    actor: "Fictional Neighborhood Volunteer Network",
    claim_text: "Several listed cooling centers were not practically accessible.",
    source_ids: ["src_community_cooling_center_access_report_2026_06_12"],
    asserted_at: "2026-06-12T18:30:00Z",
    status: "partially_addressed_by_city_update",
    record_status: "canonical",
  },
  {
    claim_id: "claim_city_update_corrected_errors_2026_06_14_001",
    actor: "Fictional City Emergency Management Office",
    claim_text: "The updated guidance corrected listing errors and improved access.",
    source_ids: ["src_city_heatwave_updated_guidance_2026_06_14"],
    asserted_at: "2026-06-14T14:15:00Z",
    status: "plausible_but_not_independently_verified",
    record_status: "candidate",
  },
];

export const actions: PreparedAction[] = [
  {
    action_id: "action_city_updates_cooling_center_hours_2026_06_14_001",
    actor: "Fictional City Emergency Management Office",
    action_text: "Published an updated list and clarified opening hours.",
    occurred_at: "2026-06-14T14:15:00Z",
    source_ids: ["src_city_heatwave_updated_guidance_2026_06_14"],
  },
  {
    action_id: "action_city_adds_transport_support_2026_06_14_001",
    actor: "Fictional City Emergency Management Office",
    action_text: "Added free shuttle support for vulnerable residents.",
    occurred_at: "2026-06-14T14:15:00Z",
    source_ids: ["src_city_heatwave_updated_guidance_2026_06_14"],
  },
];

export const timeline: TimelineRow[] = [
  {
    timeline_id: "timeline_city_heatwave_initial_claim_2026_06_10",
    occurred_at: "2026-06-10T09:00:00Z",
    trigger: "initial_public_claim",
    summary: "The city announced that 50 cooling centers would be open.",
    evidence_ids: ["claim_city_all_centers_open_2026_06_10_001"],
    judgment_at_time: "Adequate on paper; real-world accessibility unknown.",
  },
  {
    timeline_id: "timeline_city_heatwave_access_observation_2026_06_12",
    occurred_at: "2026-06-12T12:00:00Z",
    trigger: "community_observation",
    summary: "Community observations reported closed sites, limited hours, weak signage, and access barriers.",
    evidence_ids: ["claim_community_access_gap_2026_06_12_001"],
    judgment_at_time: "The broad availability claim was plausibly weakened.",
  },
  {
    timeline_id: "timeline_city_heatwave_city_update_2026_06_14",
    occurred_at: "2026-06-14T14:15:00Z",
    trigger: "actor_update_or_correction",
    summary: "The city corrected the list and added transport support.",
    evidence_ids: [
      "action_city_updates_cooling_center_hours_2026_06_14_001",
      "action_city_adds_transport_support_2026_06_14_001",
    ],
    judgment_at_time: "Partially corrected implementation gap; resident impact remains unmeasured.",
  },
];

export const claimLineage: ClaimLineagePlaceholder[] = [
  {
    lineage_id: "lineage_city_all_centers_open_2026_06_15",
    claim_id: "claim_city_all_centers_open_2026_06_10_001",
    from_status: "unverified_initial_claim",
    to_status: "partially_challenged_by_later_observation",
    direction: "weakened",
    driver_evidence_ids: ["claim_community_access_gap_2026_06_12_001"],
    note: "The lineage is deterministic and leaves room for later evidence-bound revisions.",
  },
];

export const unresolvedQuestions: UnresolvedQuestion[] = [
  {
    question_id: "question_city_heatwave_representativeness_001",
    question: "How representative were the observed access gaps across all listed centers?",
    status: "unresolved",
    related_ids: ["claim_community_access_gap_2026_06_12_001"],
  },
  {
    question_id: "question_city_heatwave_remediation_reach_002",
    question: "Did the correction and transport support reach vulnerable residents in time?",
    status: "unresolved",
    related_ids: ["action_city_adds_transport_support_2026_06_14_001"],
  },
  {
    question_id: "question_city_heatwave_update_process_003",
    question: "Does the city have a durable process for future emergency-list updates?",
    status: "unresolved",
    related_ids: ["action_city_updates_cooling_center_hours_2026_06_14_001"],
  },
];
