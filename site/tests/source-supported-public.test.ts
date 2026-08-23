import assert from "node:assert/strict";
import test from "node:test";

import type {
  InternalAnalysisRunEnvelope,
  RelationCueDiagnostic,
} from "../app/lib/analysis/relation-cues";
import type { InternalLineageRunEnvelope } from "../app/lib/lineage/internal";
import { runLineageInternal } from "../app/lib/lineage/internal";
import { buildSiteReadyCasePacketFromAnalysis } from "../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type SiteReadyCasePacketV2,
} from "../app/lib/lineage/contracts";
import {
  projectSiteReadyCasePacketV2,
  projectSourceSupportedRelationSignals,
} from "../app/lib/lineage/source-supported-public";
import { publicRelationPresentation } from "../app/lib/relation-presentation";
import { sourceSupportedSupersedesAnalysisRun } from "./fixtures/source-supported-supersedes";

const NOW_MS = 1_900_000_000_000;
const NOW_ISO = "2030-03-17T17:46:40.000Z";
const STATEMENT = "This guidance supersedes Guidance G-1.";

async function buildPositiveInternal(): Promise<InternalLineageRunEnvelope> {
  const analysisRun = sourceSupportedSupersedesAnalysisRun();
  const owner = analysisRun.candidates.find(
    (candidate) => candidate.candidate_id === "candidate_owner",
  )!;
  const cue: RelationCueDiagnostic = {
    provenance: "model_extracted_from_model_summary",
    cue_kind: "supersession_candidate",
    operative_actor: "Agency",
    operative_verb: "supersedes",
    target_reference_text: "Guidance G-1",
    target_kind: "guidance_identifier",
    target_identifier: "G-1",
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
    cue_supporting_summary_span:
      "Agency states that this guidance supersedes Guidance G-1.",
  };
  const envelope: InternalAnalysisRunEnvelope = {
    analysis_run: analysisRun,
    relation_cue_diagnostics: [{
      candidate_id: owner.candidate_id,
      source_id: owner.source_id,
      snapshot_id: owner.snapshot_id,
      diagnostic: cue,
    }],
    workflow_deadline_at_ms: NOW_MS + 20_000,
  };
  return runLineageInternal(envelope, {
    nowMs: () => NOW_MS,
    nowISO: () => NOW_ISO,
    fetcher: (async (input) => new Response(
        String(input).includes("source-owner")
          ? STATEMENT
          : "Guidance G-1\nArchived captured text.",
        { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
      )) as typeof fetch,
  });
}

test("positive projection emits one minimal deterministic v2 signal without public relation mutation", async () => {
  const internal = await buildPositiveInternal();
  const internalBefore = JSON.stringify(internal);
  const v1RelationsBefore = JSON.stringify(
    internal.site_ready_case_packet.relation_candidates,
  );
  const first = projectSiteReadyCasePacketV2(internal);
  const second = projectSiteReadyCasePacketV2(internal);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(internal), internalBefore);
  assert.equal(first.contract_version, "site_ready_case_packet.v2");
  assert.equal(first.source_supported_relation_signals.length, 1);
  assert.deepEqual(Object.keys(first.source_supported_relation_signals[0]), [
    "relation_candidate_id",
    "supported_relation_type",
    "from_occurrence_id",
    "to_occurrence_id",
    "support_status",
    "review_status",
    "statement_source_id",
    "statement_snapshot_id",
    "statement_excerpt",
    "target_source_id",
    "target_snapshot_id",
  ]);
  assert.equal(
    first.source_supported_relation_signals[0].statement_excerpt,
    internal.supports[0].bounded_excerpt,
  );
  assert.match(first.source_supported_relation_signals[0].statement_excerpt, /supersedes Guidance G-1/u);
  assert.equal(JSON.stringify(first.relation_candidates), v1RelationsBefore);
  assert.equal(first.relation_candidates[0].relation_type, "unresolved");
  assert.equal(first.candidate_canonical_boundary.canonical_mutation, "none");

  const presentation = publicRelationPresentation(
    first,
    first.relation_candidates[0],
  );
  assert.equal(presentation.candidateRelationType, "unresolved");
  assert.equal(presentation.presentationRelationType, "supersedes");
  assert.equal(presentation.sourceBacked, true);
  assert.equal(presentation.reviewLabel, "Needs review");
  assert.equal(
    first.relation_candidates[0].left_occurrence_id,
    presentation.toOccurrenceId,
    "positive control deliberately reverses raw left/right storage",
  );
  assert.equal(
    first.relation_candidates[0].right_occurrence_id,
    presentation.fromOccurrenceId,
  );
});

test("v1 validation and serialized field order remain unchanged", () => {
  const original = buildSiteReadyCasePacketFromAnalysis(
    sourceSupportedSupersedesAnalysisRun(),
  );
  const v1 = validateSiteReadyCasePacket(structuredClone(original));
  assert.equal(v1.contract_version, "site_ready_case_packet.v1");
  assert.equal(
    Object.keys(v1)[0],
    "contract_version",
    "v1 keeps its serialized leading discriminator",
  );
  assert.equal(JSON.stringify(v1), JSON.stringify(original));
  assert.equal("source_supported_relation_signals" in v1, false);
});

test("projector fails closed across ambiguous and mismatched internal sidecars", async () => {
  const positive = await buildPositiveInternal();
  const cases: Array<{
    name: string;
    mutate: (input: InternalLineageRunEnvelope) => void;
  }> = [
    { name: "no assessment", mutate: (input) => { input.source_supported_relation_assessments = []; } },
    { name: "two assessments", mutate: (input) => { input.source_supported_relation_assessments.push(structuredClone(input.source_supported_relation_assessments[0])); } },
    { name: "missing target identity proof", mutate: (input) => { input.source_supported_target_identity_proofs = []; } },
    { name: "two target proofs", mutate: (input) => { input.source_supported_target_identity_proofs.push(structuredClone(input.source_supported_target_identity_proofs[0])); } },
    { name: "wrong target identity proof id", mutate: (input) => { input.source_supported_relation_assessments[0].target_identity_proof_id = "wrong"; } },
    { name: "relation id mismatch", mutate: (input) => { input.source_supported_relation_assessments[0].relation_candidate_id = "relation_candidate_missing"; } },
    { name: "relation no longer unresolved", mutate: (input) => { input.site_ready_case_packet.relation_candidates[0].relation_type = "supersedes"; } },
    { name: "relation not pending review", mutate: (input) => { (input.site_ready_case_packet.relation_candidates[0] as unknown as { review_status: string }).review_status = "accepted"; } },
    { name: "relation status not candidate", mutate: (input) => { (input.site_ready_case_packet.relation_candidates[0] as unknown as { status: string }).status = "canonical"; } },
    { name: "relation not deterministic", mutate: (input) => { input.site_ready_case_packet.relation_candidates[0].generated_by = "model_assisted"; } },
    { name: "assessment relation type mismatch", mutate: (input) => { (input.source_supported_relation_assessments[0] as unknown as { relation_type: string }).relation_type = "correction"; } },
    { name: "assessment canonical mutation", mutate: (input) => { (input.source_supported_relation_assessments[0] as unknown as { canonical_mutation: string }).canonical_mutation = "promote"; } },
    { name: "proof canonical mutation", mutate: (input) => { (input.source_supported_target_identity_proofs[0] as unknown as { canonical_mutation: string }).canonical_mutation = "promote"; } },
    { name: "proof status mismatch", mutate: (input) => { (input.source_supported_target_identity_proofs[0] as unknown as { proof_status: string }).proof_status = "unsupported"; } },
    { name: "from occurrence absent", mutate: (input) => { input.site_ready_case_packet.claim_occurrences = input.site_ready_case_packet.claim_occurrences.filter((item) => item.occurrence_id !== input.source_supported_relation_assessments[0].from_occurrence_id); } },
    { name: "to occurrence absent", mutate: (input) => { input.site_ready_case_packet.claim_occurrences = input.site_ready_case_packet.claim_occurrences.filter((item) => item.occurrence_id !== input.source_supported_relation_assessments[0].to_occurrence_id); } },
    { name: "signal endpoints differ from relation", mutate: (input) => { input.source_supported_relation_assessments[0].to_occurrence_id = input.source_supported_relation_assessments[0].from_occurrence_id; } },
    { name: "owner source mismatch", mutate: (input) => { input.source_supported_relation_assessments[0].from_source_id = "source_wrong"; } },
    { name: "owner snapshot mismatch", mutate: (input) => { input.source_supported_relation_assessments[0].from_snapshot_id = "snapshot_wrong"; } },
    { name: "target source mismatch", mutate: (input) => { input.source_supported_relation_assessments[0].to_source_id = "source_wrong"; } },
    { name: "target snapshot mismatch", mutate: (input) => { input.source_supported_relation_assessments[0].to_snapshot_id = "snapshot_wrong"; } },
    { name: "owner support absent", mutate: (input) => { input.supports = []; } },
    { name: "duplicate owner support", mutate: (input) => { input.supports.push(structuredClone(input.supports[0])); } },
    { name: "support id mismatch", mutate: (input) => { input.source_supported_relation_assessments[0].support_id = "support_wrong"; } },
    { name: "support capture mismatch", mutate: (input) => { input.supports[0].capture_id = "capture_wrong"; } },
    { name: "support body hash mismatch", mutate: (input) => { input.supports[0].captured_body_sha256 = "0".repeat(64); } },
    { name: "support text hash mismatch", mutate: (input) => { input.supports[0].normalized_text_sha256 = "0".repeat(64); } },
    { name: "owner XHTML capture-only path", mutate: (input) => { input.source_supported_relation_assessments = []; } },
    { name: "qualifier rejection", mutate: (input) => { input.source_supported_relation_assessments = []; } },
    { name: "temporal rejection", mutate: (input) => { input.source_supported_relation_assessments = []; } },
    { name: "actor mismatch", mutate: (input) => { input.source_supported_relation_assessments = []; } },
    { name: "competing semantics", mutate: (input) => { input.source_supported_relation_assessments = []; } },
    { name: "assessment status mismatch", mutate: (input) => { (input.source_supported_relation_assessments[0] as unknown as { assessment_status: string }).assessment_status = "unsupported"; } },
    { name: "assessment generator mismatch", mutate: (input) => { (input.source_supported_relation_assessments[0] as unknown as { generated_by: string }).generated_by = "model"; } },
    { name: "proof relation mismatch", mutate: (input) => { input.source_supported_target_identity_proofs[0].relation_candidate_id = "relation_candidate_missing"; } },
    { name: "proof target occurrence mismatch", mutate: (input) => { input.source_supported_target_identity_proofs[0].target_occurrence_id = input.source_supported_relation_assessments[0].from_occurrence_id; } },
    { name: "owner document absent", mutate: (input) => { input.documents = input.documents.filter((document) => document.capture_id !== input.source_supported_relation_assessments[0].owner_capture_id); } },
    { name: "duplicate owner document", mutate: (input) => { input.documents.push(structuredClone(input.documents.find((document) => document.capture_id === input.source_supported_relation_assessments[0].owner_capture_id)!)); } },
    { name: "target document absent", mutate: (input) => { input.documents = input.documents.filter((document) => document.capture_id !== input.source_supported_relation_assessments[0].target_capture_id); } },
    { name: "proof target hash mismatch", mutate: (input) => { input.source_supported_target_identity_proofs[0].captured_body_sha256 = "0".repeat(64); } },
  ];
  assert.equal(cases.length, 40);
  for (const item of cases) {
    const input = structuredClone(positive);
    item.mutate(input);
    assert.deepEqual(projectSourceSupportedRelationSignals(input), [], item.name);
    assert.equal(input.site_ready_case_packet.relation_candidates[0].relation_type === "unresolved" || item.name === "relation no longer unresolved", true, item.name);
  }
});

test("public projector re-binds complete captures, exact support spans, assertion context, and raw endpoint provenance", async () => {
  const positive = await buildPositiveInternal();
  const cases: Array<{
    name: string;
    mutate: (input: InternalLineageRunEnvelope) => void;
  }> = [
    {
      name: "owner capture is byte limited",
      mutate: (input) => {
        input.documents.find((document) =>
          document.capture_id === input.source_supported_relation_assessments[0].owner_capture_id
        )!.capture_completeness = "byte_limited";
      },
    },
    {
      name: "owner capture is text limited",
      mutate: (input) => {
        input.documents.find((document) =>
          document.capture_id === input.source_supported_relation_assessments[0].owner_capture_id
        )!.capture_completeness = "text_limited";
      },
    },
    {
      name: "target capture is byte limited",
      mutate: (input) => {
        input.documents.find((document) =>
          document.capture_id === input.source_supported_relation_assessments[0].target_capture_id
        )!.capture_completeness = "byte_limited";
      },
    },
    {
      name: "target capture is text limited",
      mutate: (input) => {
        input.documents.find((document) =>
          document.capture_id === input.source_supported_relation_assessments[0].target_capture_id
        )!.capture_completeness = "text_limited";
      },
    },
    {
      name: "bounded excerpt no longer matches the captured document",
      mutate: (input) => {
        const excerpt = input.supports[0].bounded_excerpt;
        input.supports[0].bounded_excerpt = `${excerpt[0] === "X" ? "Y" : "X"}${excerpt.slice(1)}`;
      },
    },
    { name: "support start is negative", mutate: (input) => { input.supports[0].normalized_text_start = -1; } },
    {
      name: "support end exceeds normalized text",
      mutate: (input) => {
        const assessment = input.source_supported_relation_assessments[0];
        const owner = input.documents.find((document) =>
          document.capture_id === assessment.owner_capture_id
        )!;
        input.supports[0].normalized_text_end = owner.normalized_text.length + 1;
      },
    },
    {
      name: "support start equals support end",
      mutate: (input) => {
        input.supports[0].normalized_text_start = input.supports[0].normalized_text_end;
      },
    },
    {
      name: "support offsets point to different valid text",
      mutate: (input) => {
        input.supports[0].normalized_text_end -= 1;
      },
    },
    {
      name: "assertion context starts after support",
      mutate: (input) => {
        input.source_supported_relation_assessments[0].assertion_context_start =
          input.supports[0].normalized_text_start + 1;
      },
    },
    {
      name: "assertion context ends before support",
      mutate: (input) => {
        input.source_supported_relation_assessments[0].assertion_context_end =
          input.supports[0].normalized_text_end - 1;
      },
    },
    {
      name: "assertion context extends outside normalized text",
      mutate: (input) => {
        const assessment = input.source_supported_relation_assessments[0];
        const owner = input.documents.find((document) =>
          document.capture_id === assessment.owner_capture_id
        )!;
        assessment.assertion_context_end = owner.normalized_text.length + 1;
      },
    },
    { name: "raw left source provenance mismatch", mutate: (input) => { input.site_ready_case_packet.relation_candidates[0].left_source_id = "source_wrong"; } },
    { name: "raw right source provenance mismatch", mutate: (input) => { input.site_ready_case_packet.relation_candidates[0].right_source_id = "source_wrong"; } },
    { name: "raw left snapshot provenance mismatch", mutate: (input) => { input.site_ready_case_packet.relation_candidates[0].left_snapshot_id = "snapshot_wrong"; } },
    { name: "raw right snapshot provenance mismatch", mutate: (input) => { input.site_ready_case_packet.relation_candidates[0].right_snapshot_id = "snapshot_wrong"; } },
  ];

  assert.equal(cases.length, 16);
  for (const item of cases) {
    const input = structuredClone(positive);
    item.mutate(input);
    const before = JSON.stringify(input);
    assert.deepEqual(projectSourceSupportedRelationSignals(input), [], item.name);
    const projected = projectSiteReadyCasePacketV2(input);
    assert.equal(projected.contract_version, "site_ready_case_packet.v2", item.name);
    assert.deepEqual(projected.source_supported_relation_signals, [], item.name);
    assert.deepEqual(
      projected.relation_candidates,
      input.site_ready_case_packet.relation_candidates,
      item.name,
    );
    assert.equal(projected.relation_candidates[0].relation_type, "unresolved", item.name);
    assert.equal(projected.candidate_canonical_boundary.canonical_mutation, "none", item.name);
    assert.doesNotThrow(() => validateSiteReadyCasePacket(projected), item.name);
    assert.equal(JSON.stringify(input), before, `${item.name} must not mutate the internal envelope`);
  }
});

test("a valid internal run with unavailable admission still returns v2 with an empty overlay", async () => {
  const internal = await buildPositiveInternal();
  internal.source_supported_relation_assessments = [];
  const packet = projectSiteReadyCasePacketV2(internal);
  assert.equal(packet.contract_version, "site_ready_case_packet.v2");
  assert.deepEqual(packet.source_supported_relation_signals, []);
  assert.equal(packet.relation_candidates[0].relation_type, "unresolved");
});

test("v2 validator rejects malformed or ambiguous public cross-references", async () => {
  const packet = projectSiteReadyCasePacketV2(await buildPositiveInternal());
  const cases: Array<{
    name: string;
    mutate: (input: SiteReadyCasePacketV2) => void;
  }> = [
    { name: "missing relation", mutate: (input) => { input.source_supported_relation_signals[0].relation_candidate_id = "relation_candidate_missing"; } },
    { name: "same endpoint", mutate: (input) => { input.source_supported_relation_signals[0].to_occurrence_id = input.source_supported_relation_signals[0].from_occurrence_id; } },
    { name: "wrong statement source", mutate: (input) => { input.source_supported_relation_signals[0].statement_source_id = "source_wrong"; } },
    { name: "wrong statement snapshot", mutate: (input) => { input.source_supported_relation_signals[0].statement_snapshot_id = "snapshot_wrong"; } },
    { name: "wrong target source", mutate: (input) => { input.source_supported_relation_signals[0].target_source_id = "source_wrong"; } },
    { name: "wrong target snapshot", mutate: (input) => { input.source_supported_relation_signals[0].target_snapshot_id = "snapshot_wrong"; } },
    { name: "raw relation promoted", mutate: (input) => { input.relation_candidates[0].relation_type = "supersedes"; } },
    { name: "raw relation not deterministic", mutate: (input) => { input.relation_candidates[0].generated_by = "model_assisted"; } },
    { name: "duplicate source identity", mutate: (input) => { input.source_snapshot_summaries.push(structuredClone(input.source_snapshot_summaries[0])); } },
    { name: "second public signal", mutate: (input) => { input.source_supported_relation_signals.push(structuredClone(input.source_supported_relation_signals[0])); } },
    { name: "whitespace-only statement excerpt", mutate: (input) => { input.source_supported_relation_signals[0].statement_excerpt = "   "; } },
  ];
  for (const item of cases) {
    const input = structuredClone(packet);
    item.mutate(input);
    assert.throws(() => validateSiteReadyCasePacket(input), item.name);
  }
});

test("Site packet v2 contains no internal proof or assessment fields", async () => {
  const json = JSON.stringify(projectSiteReadyCasePacketV2(await buildPositiveInternal()));
  for (const forbidden of [
    "source_supported_target_identity_proofs",
    "source_supported_relation_assessments",
    "target_identity_proof_id",
    "assessment_id",
    "proof_id",
    "capture_id",
    "captured_body_sha256",
    "normalized_text_sha256",
    "document_identity",
    "identity_anchor",
    "internal_target_identity_supported",
    "captured_document_self_identity_matches_resolved_target_metadata",
  ]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
});
