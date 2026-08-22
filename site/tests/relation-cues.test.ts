import assert from "node:assert/strict";
import test from "node:test";
import type {
  AnalysisSourceSummary,
} from "../app/lib/analysis/contracts";
import {
  OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS,
  runOpenAIAnalysis,
  runOpenAIAnalysisInternal,
  type ProviderResponse,
  type ResponsesPort,
} from "../app/lib/analysis/openai-adapter";
import {
  buildRelationCueDiagnosticRecords,
  MAX_RELATION_CUES_PER_CANDIDATE,
  type RelationCueDiagnostic,
} from "../app/lib/analysis/relation-cues";
import {
  CandidateProposalSchema,
  RelationCueProposalSchema,
  type CandidateProposal,
  type RelationCueProposal,
} from "../app/lib/analysis/schemas";
import { LINEAGE_CAPABILITY_DOCUMENT, OPENAPI_DOCUMENT } from "../app/lib/agent-surface";
import {
  buildPreparedSiteReadyCasePacket,
  buildSiteReadyCasePacketFromAnalysis,
} from "../app/lib/lineage/builder";
import type { ClaimOccurrence } from "../app/lib/lineage/contracts";
import {
  buildBoundedRelations,
  normalizeClaimText,
  type FixtureRelationRule,
} from "../app/lib/lineage/engine";
import {
  buildRelationTargetIndex,
  MAX_TARGET_KEYS_PER_OCCURRENCE,
  resolveRelationCueTarget,
} from "../app/lib/lineage/relation-targets";
import { buildLocalWatchSnapshot } from "../app/lib/local-watch";
import { buildPublicEvidencePacket } from "../app/lib/public-evidence";
import { nasaEvidenceLinkRun } from "./fixtures/nasa-evidence-links";
import { version18RelationAdmissionRun } from "./fixtures/version18-relation-admission";

const GENERATED_AT = "2026-08-22T12:00:00.000Z";

function cue(
  overrides: Partial<RelationCueProposal> = {},
): RelationCueProposal {
  return RelationCueProposalSchema.parse({
    provenance: "model_extracted_from_model_summary",
    cue_kind: "correction_candidate",
    operative_actor: null,
    operative_verb: "corrected",
    target_reference_text: null,
    target_kind: "none",
    target_identifier: null,
    negated: false,
    modal_or_intent: false,
    question_or_uncertain: false,
    quoted_or_attributed: false,
    conditional_or_hypothetical: false,
    scope: "none",
    affected_field: null,
    prior_value: null,
    corrected_value: null,
    replacement_effect: "none",
    effective_time: null,
    cue_supporting_summary_span: null,
    ...overrides,
  });
}

function actorClaimProposal(
  summary: string,
  relationCues: RelationCueProposal[],
  overrides: Partial<CandidateProposal> = {},
): CandidateProposal {
  return CandidateProposalSchema.parse({
    candidate_type: "actor_claim",
    actor: null,
    text: summary,
    supporting_summary_span: summary,
    time_candidate: null,
    confidence: "medium",
    uncertainty: "Model-summary diagnostic only.",
    semantic_review: {
      actor_role: "speaker_or_claimant",
      statement_semantics: "claim_or_guidance",
      actor_specificity: "generic_or_ambiguous",
    },
    relation_cues: relationCues,
    ...overrides,
  });
}

function diagnostics(
  summary: string,
  relationCues: RelationCueProposal[],
  overrides: Partial<CandidateProposal> = {},
) {
  return buildRelationCueDiagnosticRecords({
    proposal: actorClaimProposal(summary, relationCues, overrides),
    candidateId: "candidate_live_actor_claim_cue_fixture",
    sourceId: "src_cue_fixture",
    snapshotId: "snapshot_cue_fixture",
    sourceSummary: summary,
  });
}

test("five positive source-local cue fixtures retain bounded diagnostics without classifying", () => {
  const fixtures = [
    {
      label: "dated correction",
      summary:
        "The 12 August notice incorrectly stated closure at 18:00; the correct time is 20:00.",
      cue: cue({
        operative_verb: "incorrectly stated",
        target_reference_text: "12 August notice",
        target_kind: "dated_document_reference",
        target_identifier: "12 August notice",
        scope: "field",
        affected_field: "closure",
        prior_value: "18:00",
        corrected_value: "20:00",
        cue_supporting_summary_span:
          "The 12 August notice incorrectly stated closure at 18:00; the correct time is 20:00.",
      }),
      expected: {
        cue_kind: "correction_candidate",
        scope: "field",
        prior_value: "18:00",
        corrected_value: "20:00",
      },
    },
    {
      label: "numeric correction",
      summary:
        "Our 12 August notice listed 8 locations in error; the correct number is 6.",
      cue: cue({
        operative_verb: "in error",
        target_reference_text: "12 August notice",
        target_kind: "dated_document_reference",
        target_identifier: "12 August notice",
        scope: "field",
        affected_field: "locations",
        prior_value: "8",
        corrected_value: "6",
        cue_supporting_summary_span:
          "Our 12 August notice listed 8 locations in error; the correct number is 6.",
      }),
      expected: {
        cue_kind: "correction_candidate",
        scope: "field",
        prior_value: "8",
        corrected_value: "6",
      },
    },
    {
      label: "full supersession",
      summary: "This September guidance supersedes Guidance G-17 dated 4 August.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_verb: "supersedes",
        target_reference_text: "Guidance G-17 dated 4 August",
        target_kind: "guidance_identifier",
        target_identifier: "G-17",
        scope: "whole_document",
        replacement_effect: "supersedes",
        cue_supporting_summary_span:
          "This September guidance supersedes Guidance G-17 dated 4 August.",
      }),
      expected: {
        cue_kind: "supersession_candidate",
        scope: "whole_document",
        replacement_effect: "supersedes",
        target_identifier: "G-17",
      },
    },
    {
      label: "version replacement",
      summary: "Version 3 replaces Version 2.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_verb: "replaces",
        target_reference_text: "Version 2",
        target_kind: "version_identifier",
        target_identifier: "Version 2",
        scope: "whole_version",
        replacement_effect: "replaces",
        cue_supporting_summary_span: "Version 3 replaces Version 2.",
      }),
      expected: {
        cue_kind: "supersession_candidate",
        scope: "whole_version",
        replacement_effect: "replaces",
        target_identifier: "Version 2",
      },
    },
    {
      label: "withdrawal",
      summary:
        "Effective immediately, Notice N-14 is withdrawn and no longer in effect.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_verb: "withdrawn",
        target_reference_text: "Notice N-14",
        target_kind: "notice_identifier",
        target_identifier: "N-14",
        scope: "withdrawal_or_rescission",
        replacement_effect: "withdraws",
        cue_supporting_summary_span:
          "Effective immediately, Notice N-14 is withdrawn and no longer in effect.",
      }),
      expected: {
        cue_kind: "supersession_candidate",
        scope: "withdrawal_or_rescission",
        replacement_effect: "withdraws",
        target_identifier: "N-14",
      },
    },
  ] as const;

  for (const fixture of fixtures) {
    const result = diagnostics(fixture.summary, [fixture.cue]);
    assert.equal(result.length, 1, fixture.label);
    assert.equal(
      result[0].diagnostic.provenance,
      "model_extracted_from_model_summary",
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(fixture.expected).map((key) => [
          key,
          result[0].diagnostic[key as keyof RelationCueDiagnostic],
        ]),
      ),
      fixture.expected,
      fixture.label,
    );
    assert.deepEqual(
      {
        negated: result[0].diagnostic.negated,
        modal_or_intent: result[0].diagnostic.modal_or_intent,
        question_or_uncertain: result[0].diagnostic.question_or_uncertain,
        quoted_or_attributed: result[0].diagnostic.quoted_or_attributed,
        conditional_or_hypothetical:
          result[0].diagnostic.conditional_or_hypothetical,
      },
      {
        negated: false,
        modal_or_intent: false,
        question_or_uncertain: false,
        quoted_or_attributed: false,
        conditional_or_hypothetical: false,
      },
      fixture.label,
    );
  }
});

test("dual correction and replacement observations stay bounded and have no precedence", () => {
  const summary =
    "Version 3 replaces Version 2 and corrects its eligibility table from 8 rows to 6 rows.";
  const result = diagnostics(summary, [
    cue({
      cue_kind: "supersession_candidate",
      operative_verb: "replaces",
      target_reference_text: "Version 2",
      target_kind: "version_identifier",
      target_identifier: "Version 2",
      scope: "whole_version",
      replacement_effect: "replaces",
      cue_supporting_summary_span: summary,
    }),
    cue({
      operative_verb: "corrects",
      target_reference_text: "eligibility table",
      target_kind: "other_explicit_identifier",
      target_identifier: "eligibility table",
      scope: "field",
      affected_field: "eligibility table",
      prior_value: "8 rows",
      corrected_value: "6 rows",
      cue_supporting_summary_span: summary,
    }),
  ]);
  assert.equal(result.length, MAX_RELATION_CUES_PER_CANDIDATE);
  assert.deepEqual(
    result.map((record) => record.diagnostic.cue_kind),
    ["correction_candidate", "supersession_candidate"],
  );
});

test("twenty required negative cases fail closed at the local guard or packet substrate", () => {
  const guardedCases = [
    {
      summary: "The agency did not correct Notice N-1.",
      cue: cue({
        operative_actor: "agency",
        operative_verb: "correct",
        target_reference_text: "Notice N-1",
        target_kind: "notice_identifier",
        target_identifier: "N-1",
        negated: true,
        cue_supporting_summary_span: "The agency did not correct Notice N-1.",
      }),
      field: "negated" as const,
    },
    {
      summary: "The agency may correct Notice N-1.",
      cue: cue({
        operative_actor: "agency",
        operative_verb: "correct",
        target_reference_text: "Notice N-1",
        target_kind: "notice_identifier",
        target_identifier: "N-1",
        modal_or_intent: true,
        cue_supporting_summary_span: "The agency may correct Notice N-1.",
      }),
      field: "modal_or_intent" as const,
    },
    {
      summary: "The agency should replace Notice N-1.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_actor: "agency",
        operative_verb: "replace",
        target_reference_text: "Notice N-1",
        target_kind: "notice_identifier",
        target_identifier: "N-1",
        modal_or_intent: true,
        replacement_effect: "replaces",
        cue_supporting_summary_span: "The agency should replace Notice N-1.",
      }),
      field: "modal_or_intent" as const,
    },
    {
      summary: "The reporter asked whether Notice N-1 was corrected.",
      cue: cue({
        operative_actor: "reporter",
        operative_verb: "corrected",
        target_reference_text: "Notice N-1",
        target_kind: "notice_identifier",
        target_identifier: "N-1",
        question_or_uncertain: true,
        quoted_or_attributed: true,
        cue_supporting_summary_span:
          "The reporter asked whether Notice N-1 was corrected.",
      }),
      field: "question_or_uncertain" as const,
    },
    {
      summary: "A critic said the agency should correct Notice N-1.",
      cue: cue({
        operative_actor: "critic",
        operative_verb: "correct",
        target_reference_text: "Notice N-1",
        target_kind: "notice_identifier",
        target_identifier: "N-1",
        modal_or_intent: true,
        quoted_or_attributed: true,
        cue_supporting_summary_span:
          "A critic said the agency should correct Notice N-1.",
      }),
      field: "quoted_or_attributed" as const,
    },
    {
      summary:
        "Effective 2027-01-01, Guidance G-2 would replace Guidance G-1 if adopted.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_verb: "replace",
        target_reference_text: "Guidance G-1",
        target_kind: "guidance_identifier",
        target_identifier: "G-1",
        modal_or_intent: true,
        conditional_or_hypothetical: true,
        replacement_effect: "replaces",
        effective_time: "2027-01-01",
        cue_supporting_summary_span:
          "Effective 2027-01-01, Guidance G-2 would replace Guidance G-1 if adopted.",
      }),
      field: "conditional_or_hypothetical" as const,
    },
    {
      summary:
        "Guidance G-2 will replace Guidance G-1 effective 2027-01-01.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_verb: "replace",
        target_reference_text: "Guidance G-1",
        target_kind: "guidance_identifier",
        target_identifier: "G-1",
        modal_or_intent: true,
        replacement_effect: "replaces",
        effective_time: "2027-01-01",
        cue_supporting_summary_span:
          "Guidance G-2 will replace Guidance G-1 effective 2027-01-01.",
      }),
      field: "modal_or_intent" as const,
    },
    {
      summary: "A quoted third party said Guidance G-2 supersedes Guidance G-1.",
      cue: cue({
        cue_kind: "supersession_candidate",
        operative_actor: "third party",
        operative_verb: "supersedes",
        target_reference_text: "Guidance G-1",
        target_kind: "guidance_identifier",
        target_identifier: "G-1",
        quoted_or_attributed: true,
        replacement_effect: "supersedes",
        cue_supporting_summary_span:
          "A quoted third party said Guidance G-2 supersedes Guidance G-1.",
      }),
      field: "quoted_or_attributed" as const,
    },
  ];
  guardedCases.forEach((fixture) => {
    const result = diagnostics(fixture.summary, [fixture.cue]);
    assert.equal(result.length, 1, fixture.summary);
    assert.equal(result[0].diagnostic[fixture.field], true, fixture.summary);
  });

  for (const [summary, operativeVerb] of [
    ["The agency plans to revise the guidance.", "plans to revise"],
    ["The agency updated the guidance.", "updated"],
    ["The agency revised the guidance.", "revised"],
    ["The agency amended one clause while the old guidance remains controlling.", "amended"],
  ] as const) {
    assert.deepEqual(
      diagnostics(summary, [cue({
        operative_actor: "agency",
        operative_verb: operativeVerb,
        cue_supporting_summary_span: summary,
      })]),
      [],
      summary,
    );
  }

  assert.deepEqual(
    diagnostics("The agency replaced the launch vehicle hardware.", []),
    [],
  );
  assert.deepEqual(
    diagnostics("The agency corrected a typographical comma with no proposition change.", []),
    [],
  );

  const { index, noticeOne, noticeTwo, sharedOne } = targetFixture();
  const wrongTarget = resolveRelationCueTarget({
    cue: targetCue("notice_identifier", "N-2", "Notice N-2"),
    index,
    expectedOccurrenceId: noticeOne.occurrence_id,
  });
  assert.equal(wrongTarget.status, "conflict");

  const ambiguousTarget = resolveRelationCueTarget({
    cue: targetCue("document_title", "Shared Guidance", "Shared Guidance"),
    index,
  });
  assert.equal(ambiguousTarget.status, "ambiguous");
  assert.ok(sharedOne.occurrence_id);

  const actorMismatch = buildBoundedRelations(
    [
      occurrence("actor_left", "Agency Notice N-1 lists 8 locations.", "Agency", "2026-08-12T00:00:00.000Z", "day"),
      occurrence("actor_right", "Other office corrected Notice N-1 to list 6 locations.", "Other office", "2026-08-13T00:00:00.000Z", "day"),
    ],
    [replacementRule("actor_left", "actor_right")],
  );
  assert.equal(actorMismatch.relations[0].relation_type, "unresolved");

  const missingOrder = buildBoundedRelations(
    [
      occurrence("missing_left", "Agency Notice N-1 lists 8 locations.", "Agency", null, null),
      occurrence("missing_right", "Agency corrected Notice N-1 to list 6 locations.", "Agency", null, null),
    ],
    [replacementRule("missing_left", "missing_right")],
  );
  assert.equal(missingOrder.relations[0].relation_type, "unresolved");

  const mixedOrder = buildBoundedRelations(
    [
      occurrence("mixed_left", "Agency Notice N-1 lists 8 locations.", "Agency", "2026-08-12T00:00:00.000Z", "day"),
      occurrence("mixed_right", "Agency corrected Notice N-1 to list 6 locations.", "Agency", "2026-08-12T08:00:00.000Z", "instant"),
    ],
    [replacementRule("mixed_left", "mixed_right")],
  );
  assert.equal(mixedOrder.relations[0].relation_type, "unresolved");

  const multiTarget = resolveRelationCueTarget({
    cue: targetCue("document_title", "Shared Guidance", "Shared Guidance"),
    index,
    expectedOccurrenceId: noticeTwo.occurrence_id,
  });
  assert.equal(multiTarget.status, "ambiguous");

  // Eight guarded + four unsupported verbs + two non-semantic objects +
  // wrong target + ambiguous target + actor mismatch + missing order + mixed
  // precision + future conditional + repeated multi-target = twenty fixtures.
  assert.equal(8 + 4 + 2 + 1 + 1 + 1 + 1 + 1 + 1, 20);
});

test("target resolution is exact, bounded, deterministic, and fail-closed", () => {
  const {
    index,
    noticeOne,
    versionTwo,
    titled,
    guidance,
  } = targetFixture();
  assert.ok(index.keys_by_occurrence.every(
    (item) => item.keys.length <= MAX_TARGET_KEYS_PER_OCCURRENCE,
  ));

  assert.deepEqual(
    resolveRelationCueTarget({
      cue: targetCue("notice_identifier", "N-1", "Notice N-1"),
      index,
    }),
    {
      status: "unique",
      target_occurrence_id: noticeOne.occurrence_id,
      matched_keys: ["notice_identifier:n 1"],
      conflicting_keys: [],
    },
  );
  assert.equal(
    resolveRelationCueTarget({
      cue: targetCue("version_identifier", "Version 2", "Version 2"),
      index,
    }).target_occurrence_id,
    versionTwo.occurrence_id,
  );
  assert.equal(
    resolveRelationCueTarget({
      cue: targetCue(
        "document_title",
        "Emergency Closure Guidance",
        "Emergency Closure Guidance",
      ),
      index,
    }).target_occurrence_id,
    titled.occurrence_id,
  );
  assert.equal(
    resolveRelationCueTarget({
      cue: targetCue("notice_identifier", "N-99", "Notice N-99"),
      index,
    }).status,
    "no_match",
  );
  assert.equal(
    resolveRelationCueTarget({
      cue: targetCue("document_title", "Shared Guidance", "Shared Guidance"),
      index,
    }).status,
    "ambiguous",
  );

  const conflictCue = targetCue(
    "notice_identifier",
    "N-1",
    "Notice N-1 and Guidance G-17",
  );
  assert.equal(
    resolveRelationCueTarget({ cue: conflictCue, index }).status,
    "conflict",
  );
  assert.ok(guidance.occurrence_id);

  const generic = targetCue("none", null, null);
  assert.equal(resolveRelationCueTarget({ cue: generic, index }).status, "no_match");
  assert.equal(resolveRelationCueTarget({ cue: generic, index }).status, "no_match");

  const first = buildRelationTargetIndex({
    occurrences: [...targetFixture().occurrences].reverse(),
    sources: [...targetFixture().sources].reverse(),
  });
  const second = buildRelationTargetIndex({
    occurrences: targetFixture().occurrences,
    sources: targetFixture().sources,
  });
  assert.deepEqual(first, second);
});

test("operative actors remain explicit, local, and independently inspectable", () => {
  const fixtures = [
    {
      label: "exact actor",
      summary: "Agency corrected Notice N-1.",
      operativeActor: "Agency",
      expectedActor: "Agency",
      quoted: false,
    },
    {
      label: "missing actor",
      summary: "Notice N-1 was corrected.",
      operativeActor: null,
      expectedActor: null,
      quoted: false,
    },
    {
      label: "publisher-only actor is not repaired",
      summary: "Notice N-1 was corrected.",
      operativeActor: "Publisher Incorporated",
      expectedActor: null,
      quoted: false,
    },
    {
      label: "reporter is the explicit subject",
      summary: "The reporter corrected Notice N-1.",
      operativeActor: "reporter",
      expectedActor: "reporter",
      quoted: false,
    },
    {
      label: "quoted agency actor stays attributed",
      summary: "The reporter said Agency corrected Notice N-1.",
      operativeActor: "Agency",
      expectedActor: "Agency",
      quoted: true,
    },
    {
      label: "critic is the explicit subject",
      summary: "A critic corrected Notice N-1 in a commentary.",
      operativeActor: "critic",
      expectedActor: "critic",
      quoted: true,
    },
  ] as const;

  for (const fixture of fixtures) {
    const result = diagnostics(fixture.summary, [cue({
      operative_actor: fixture.operativeActor,
      operative_verb: "corrected",
      target_reference_text: "Notice N-1",
      target_kind: "notice_identifier",
      target_identifier: "N-1",
      quoted_or_attributed: fixture.quoted,
      cue_supporting_summary_span: fixture.summary,
    })]);
    assert.equal(result.length, 1, fixture.label);
    assert.equal(
      result[0].diagnostic.operative_actor,
      fixture.expectedActor,
      fixture.label,
    );
    assert.equal(
      result[0].diagnostic.quoted_or_attributed,
      fixture.quoted,
      fixture.label,
    );
  }
});

test("cue containment, bounds, candidate kind, and dual-cue limits fail closed", () => {
  const summary = "Agency corrected Notice N-1.";
  assert.deepEqual(
    diagnostics(summary, [cue({
      operative_actor: "Agency",
      operative_verb: "corrected",
      target_reference_text: "Notice N-1",
      target_kind: "notice_identifier",
      target_identifier: "N-1",
      cue_supporting_summary_span: "Text that is not in the summary.",
    })]),
    [],
  );

  const nonActor = CandidateProposalSchema.parse({
    candidate_type: "finding",
    actor: null,
    text: summary,
    supporting_summary_span: summary,
    time_candidate: null,
    confidence: "medium",
    uncertainty: "",
    semantic_review: {
      actor_role: "not_applicable",
      statement_semantics: "not_applicable",
      actor_specificity: "not_applicable",
    },
    relation_cues: [cue({
      operative_verb: "corrected",
      cue_supporting_summary_span: summary,
    })],
  });
  assert.deepEqual(buildRelationCueDiagnosticRecords({
    proposal: nonActor,
    candidateId: "candidate_finding",
    sourceId: "src_finding",
    snapshotId: "snapshot_finding",
    sourceSummary: summary,
  }), []);

  assert.equal(RelationCueProposalSchema.safeParse({
    ...cue(),
    operative_actor: "a".repeat(201),
  }).success, false);
  assert.equal(CandidateProposalSchema.safeParse({
    ...actorClaimProposal(summary, []),
    relation_cues: [cue(), cue(), cue()],
  }).success, false);
  assert.equal(MAX_RELATION_CUES_PER_CANDIDATE, 2);
});

test("internal envelope strips cues from every current external/public contract", async () => {
  const internalPort = new FakeResponsesPort(integrationResponses());
  const internal = await runOpenAIAnalysisInternal({
    question: "How did the agency guidance change across official updates?",
    sourceLimit: 1,
    generatedAt: GENERATED_AT,
    responses: internalPort,
  });
  assert.equal(internalPort.calls.length, 2);
  assert.equal(internal.relation_cue_diagnostics.length, 1);
  assert.equal(
    internal.relation_cue_diagnostics[0].diagnostic.cue_kind,
    "supersession_candidate",
  );

  const publicPort = new FakeResponsesPort(integrationResponses());
  const publicRun = await runOpenAIAnalysis({
    question: "How did the agency guidance change across official updates?",
    sourceLimit: 1,
    generatedAt: GENERATED_AT,
    responses: publicPort,
  });
  assert.equal(publicPort.calls.length, 2);
  assert.deepEqual(publicRun, internal.analysis_run);
  assert.equal(JSON.stringify(publicRun), JSON.stringify(internal.analysis_run));
  assertNoCueLeak(publicRun);

  const packet = buildSiteReadyCasePacketFromAnalysis(publicRun);
  assert.equal(packet.contract_version, "site_ready_case_packet.v1");
  assert.equal(packet.relation_candidates.length, 0);
  assert.equal(packet.bounded_work_summary.model_classified_count, 0);
  assertNoCueLeak(packet);

  const publicEvidence = buildPublicEvidencePacket(packet);
  assert.equal(publicEvidence.contract_version, "sisyphus_public_evidence_packet.v1");
  assertNoCueLeak(publicEvidence);
  assertNoCueLeak(buildLocalWatchSnapshot(packet));
  assertNoCueLeak(LINEAGE_CAPABILITY_DOCUMENT);
  assertNoCueLeak(OPENAPI_DOCUMENT);
  assert.equal(OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS, 4_000);
});

test("cue presence neither admits nor promotes live pairs and preserves existing regressions", () => {
  const rejected = buildBoundedRelations([
    occurrence(
      "rejected_left",
      "City pools open on weekends.",
      "Agency",
      "2026-08-01T00:00:00.000Z",
      "day",
    ),
    occurrence(
      "rejected_right",
      "Agency says this guidance supersedes Guidance G-17.",
      "Agency",
      "2026-08-02T00:00:00.000Z",
      "day",
    ),
  ]);
  assert.equal(rejected.relations.length, 0);

  const admitted = buildBoundedRelations([
    occurrence(
      "admitted_left",
      "Agency Notice N-1 lists 8 cooling locations downtown.",
      "Agency",
      "2026-08-12T00:00:00.000Z",
      "day",
    ),
    occurrence(
      "admitted_right",
      "Agency correction to Notice N-1 lists 6 cooling locations downtown.",
      "Agency",
      "2026-08-13T00:00:00.000Z",
      "day",
    ),
  ]);
  assert.equal(admitted.relations.length, 1);
  assert.equal(admitted.relations[0].relation_type, "unresolved");
  assert.equal(admitted.relations[0].insufficient_evidence, true);
  assert.equal(admitted.relations[0].generated_by, "deterministic_rule");
  assert.equal(admitted.summary.model_classified_count, 0);

  const prepared = buildPreparedSiteReadyCasePacket();
  assert.deepEqual(
    prepared.relation_candidates.map((relation) => ({
      id: relation.relation_id,
      type: relation.relation_type,
      reason: relation.reason,
    })),
    [
      {
        id: "relation_candidate_1083c33d061763b0",
        type: "supersedes",
        reason:
          "The same city actor later published an explicitly updated list that removed unavailable locations and corrected listing errors.",
      },
      {
        id: "relation_candidate_c2d8c446c6cef3cb",
        type: "contradicts",
        reason:
          "The bounded fixture observation reports closed or practically inaccessible listed sites, complicating the earlier broad availability claim without proving citywide failure.",
      },
      {
        id: "relation_candidate_d22400704e2e8a80",
        type: "follow_up",
        reason:
          "The later city update addresses hours, unavailable locations, addresses, and transport barriers raised by the earlier bounded community observation.",
      },
    ],
  );

  const bfg8w = buildSiteReadyCasePacketFromAnalysis(nasaEvidenceLinkRun());
  assert.deepEqual(
    bfg8w.evidence_claim_review_links.map((link) => ({
      id: link.link_id,
      semantics: link.link_semantics,
    })),
    [
      "evidence_claim_review_link_e80e2fbf7bd7c4f5",
      "evidence_claim_review_link_116492533d155b69",
      "evidence_claim_review_link_d703a75d740e5e8f",
      "evidence_claim_review_link_da11314073216056",
      "evidence_claim_review_link_abf3b8b892679e0a",
      "evidence_claim_review_link_a4335b5ada2f128c",
      "evidence_claim_review_link_e019789392a3de21",
      "evidence_claim_review_link_b3b263ee2912d4cc",
    ].map((id) => ({ id, semantics: "review_together_only" })),
  );

  const version18 = buildSiteReadyCasePacketFromAnalysis(
    version18RelationAdmissionRun(),
  );
  assert.equal(version18.relation_candidates.length, 1);
  assert.deepEqual(
    {
      id: version18.relation_candidates[0].relation_id,
      type: version18.relation_candidates[0].relation_type,
      confidence: version18.relation_candidates[0].confidence_score,
      insufficient: version18.relation_candidates[0].insufficient_evidence,
    },
    {
      id: "relation_candidate_520bba99bc43849b",
      type: "unresolved",
      confidence: 0.3071428571428571,
      insufficient: true,
    },
  );
  assert.equal(version18.bounded_work_summary.model_classified_count, 0);
});

class FakeResponsesPort implements ResponsesPort {
  readonly calls: Record<string, unknown>[] = [];

  constructor(private readonly queue: ProviderResponse[]) {}

  async parse(body: Record<string, unknown>): Promise<ProviderResponse> {
    this.calls.push(body);
    const response = this.queue.shift();
    if (!response) throw new Error("unexpected fake provider call");
    return structuredClone(response);
  }
}

function integrationResponses(): ProviderResponse[] {
  const summary =
    "Agency said this September guidance supersedes Guidance G-17 dated 2026-08-04.";
  const url = "https://agency.example.test/guidance-september";
  return [
    {
      output_parsed: {
        sources: [{
          title: "September Guidance",
          url,
          publisher: "Agency",
          published_at: "2026-09-01",
          web_search_grounded_candidate_summary: summary,
          discovery_lane: "baseline_authority",
          source_context: "official",
          information_proximity: "direct_document",
          why_included: "Provides the official September guidance.",
          comparison_target_source_ids: [],
          limitations: ["Model-generated summary only."],
        }],
      },
      output: [{
        type: "web_search_call",
        id: "web_search_fixture",
        action: {
          type: "search",
          sources: [{ type: "url", url }],
        },
      }],
    },
    {
      output_parsed: {
        candidates: [{
          candidate_type: "actor_claim",
          actor: "Agency",
          text: summary,
          supporting_summary_span: summary,
          time_candidate: "2026-09-01",
          confidence: "medium",
          uncertainty: "Model-summary diagnostic only.",
          semantic_review: {
            actor_role: "speaker_or_claimant",
            statement_semantics: "claim_or_guidance",
            actor_specificity: "specifically_identifiable",
          },
          relation_cues: [cue({
            cue_kind: "supersession_candidate",
            operative_actor: "Agency",
            operative_verb: "supersedes",
            target_reference_text: "Guidance G-17 dated 2026-08-04",
            target_kind: "guidance_identifier",
            target_identifier: "G-17",
            scope: "whole_document",
            replacement_effect: "supersedes",
            cue_supporting_summary_span: summary,
          })],
        }],
        limitations: ["One-source extraction only."],
      },
      output: [],
    },
  ];
}

function source(
  id: string,
  title: string,
  publishedAt: string,
): AnalysisSourceSummary {
  return {
    source_id: id,
    snapshot_id: `snapshot_${id}`,
    title,
    url: `https://example.test/${id}`,
    domain: "example.test",
    publisher: "Agency",
    published_at: publishedAt,
    published_at_precision: "day",
    retrieved_at: GENERATED_AT,
    snapshot_status: "partial",
    retrieval_mode: "openai_web_search",
    content_kind: "model_generated_web_search_summary",
    source_text_captured: false,
    content_sha256: null,
    candidate_summary_sha256: "a".repeat(64),
    record_status: "candidate",
    evidence_excerpt: null,
    web_search_grounded_candidate_summary: title,
    limitations: ["Model-generated summary only."],
    api_provenance: null,
    source_selection: {
      discovery_pass: "baseline",
      discovery_lane: "baseline_authority",
      source_context: "official",
      information_proximity: "direct_document",
      why_included: "Deterministic target fixture.",
      classification_basis: "model_generated_web_search_classification",
      classification_status: "candidate_review_only",
      comparison_target_source_ids: [],
    },
  };
}

function occurrence(
  id: string,
  text: string,
  actor: string | null,
  assertionTime: string | null,
  precision: "day" | "instant" | null,
  sourceId = `src_${id}`,
): ClaimOccurrence {
  return {
    occurrence_id: `occurrence_live_${id}`,
    source_id: sourceId,
    snapshot_id: `snapshot_${sourceId}`,
    source_record_status: "candidate",
    claim_id: `claim_${id}`,
    claim_kind: "actor_claim",
    candidate_claim_family_id: null,
    actor,
    original_claim_text: text,
    normalized_claim_representation: normalizeClaimText(text),
    support_kind: "model_generated_web_search_summary_span",
    support_reference: {
      support_kind: "model_generated_web_search_summary_span",
      source_id: sourceId,
      snapshot_id: `snapshot_${sourceId}`,
      bounded_excerpt: text,
      evidence_reference: `https://example.test/${sourceId}`,
      citation_url: `https://example.test/${sourceId}`,
      proves: "model_summary_containment_only",
    },
    assertion_time_candidate: assertionTime,
    assertion_time_candidate_precision: precision,
    event_time_candidate: null,
    event_time_candidate_precision: null,
    source_publication_time: assertionTime,
    source_publication_time_precision: precision,
    source_retrieval_time: GENERATED_AT,
    source_retrieval_time_precision: "instant",
    confidence: "medium",
    uncertainty: "Model-summary diagnostic only.",
    validation_status: "validated",
    status: "candidate",
    origin: "live_api",
  };
}

function targetFixture() {
  const sources = [
    source("notice_one", "Notice N-1", "2026-08-01T00:00:00.000Z"),
    source("notice_two", "Notice N-2", "2026-08-02T00:00:00.000Z"),
    source("version_two", "Version 2 operating guidance", "2026-08-03T00:00:00.000Z"),
    source("titled", "Emergency Closure Guidance", "2026-08-04T00:00:00.000Z"),
    source("guidance", "Guidance G-17", "2026-08-04T00:00:00.000Z"),
    source("shared_one", "Shared Guidance", "2026-08-05T00:00:00.000Z"),
    source("shared_two", "Shared Guidance", "2026-08-06T00:00:00.000Z"),
  ];
  const occurrences = sources.map((item) =>
    occurrence(
      item.source_id,
      `Agency published ${item.title}.`,
      "Agency",
      item.published_at,
      "day",
      item.source_id,
    )
  );
  const [noticeOne, noticeTwo, versionTwo, titled, guidance, sharedOne] = occurrences;
  return {
    sources,
    occurrences,
    noticeOne,
    noticeTwo,
    versionTwo,
    titled,
    guidance,
    sharedOne,
    index: buildRelationTargetIndex({ occurrences, sources }),
  };
}

function targetCue(
  targetKind: RelationCueDiagnostic["target_kind"],
  targetIdentifier: string | null,
  targetReference: string | null,
): RelationCueDiagnostic {
  return {
    provenance: "model_extracted_from_model_summary",
    cue_kind: "supersession_candidate",
    operative_actor: "Agency",
    operative_verb: "supersedes",
    target_reference_text: targetReference,
    target_kind: targetKind,
    target_identifier: targetIdentifier,
    negated: false,
    modal_or_intent: false,
    question_or_uncertain: false,
    quoted_or_attributed: false,
    conditional_or_hypothetical: false,
    scope: "whole_document",
    affected_field: null,
    prior_value: null,
    corrected_value: null,
    replacement_effect: "supersedes",
    effective_time: null,
    effective_time_precision: null,
    cue_supporting_summary_span: targetReference ?? "No exact target.",
  };
}

function replacementRule(
  left: string,
  right: string,
): FixtureRelationRule {
  return {
    left_claim_id: `claim_${left}`,
    right_claim_id: `claim_${right}`,
    relation_type: "correction",
    confidence_score: 0.8,
    reason: "Synthetic BFG8Y0 negative gate fixture.",
    evidence_basis: "explicit_replacement_language",
  };
}

function assertNoCueLeak(value: unknown): void {
  assert.doesNotMatch(
    JSON.stringify(value),
    /relation_cue|operative_verb|target_identifier|replacement_effect|model_extracted_from_model_summary/i,
  );
}
