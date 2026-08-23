import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as getLineageCapability, projectLineageResponse } from "../app/api/lineage/route";
import { GET as getOpenAPI } from "../app/openapi.json/route";
import { ExportInvestigation } from "../app/components/ExportInvestigation";
import type {
  AnalysisCandidate,
  AnalysisRunPacket,
  AnalysisSourceSummary,
} from "../app/lib/analysis/contracts";
import { AnalysisFailure } from "../app/lib/analysis/errors";
import { parseAnalysisRequest } from "../app/lib/analysis/request";
import {
  LINEAGE_CAPABILITY_DOCUMENT,
  OPENAPI_DOCUMENT,
} from "../app/lib/agent-surface";
import {
  buildPreparedSiteReadyCasePacket,
  buildSiteReadyCasePacketFromAnalysis,
} from "../app/lib/lineage/builder";
import { validateSiteReadyCasePacket } from "../app/lib/lineage/contracts";
import { handlePublicLiveLineageRequest } from "../app/lib/public-live-handler";
import {
  PUBLIC_EVIDENCE_CONTRACT_VERSION,
  PUBLIC_EVIDENCE_MEDIA_TYPE,
  PUBLIC_NO_RESULT_CONTRACT_VERSION,
  buildPublicEvidencePacket,
  buildPublicExportArtifacts,
  buildPublicLineageRepresentation,
  renderPublicEvidenceMarkdown,
  renderPublicEvidenceShareableBrief,
  validatedPublicHttpUrl,
} from "../app/lib/public-evidence";
import { buildCoverageSummary } from "../app/lib/source-profile";
import { buildSourceSupportedSitePacketV2Fixture } from "./fixtures/source-supported-site-packet";

const GENERATED_AT = "2026-08-19T08:00:00.000Z";

test("prepared export is an explicit synthetic public packet with no implementation leakage", () => {
  const internal = buildPreparedSiteReadyCasePacket();
  const packet = buildPublicEvidencePacket(internal);

  assert.equal(packet.contract_version, PUBLIC_EVIDENCE_CONTRACT_VERSION);
  assert.equal(packet.result_kind, "evidence");
  assert.equal(packet.artifact_kind, "synthetic_prepared_example");
  assert.equal(packet.result_mode, "synthetic_prepared_example");
  assert.equal(packet.is_synthetic_fixture, true);
  assert.match(packet.synthetic_fixture_warning ?? "", /not real-world public evidence/i);
  assert.equal(packet.candidate_canonical_boundary.evidence_records,
    "synthetic_fixture_internal_records_not_real_world_truth");
  assert.equal(packet.canonical_mutation, "none");
  assert.ok(packet.sources.length > 0);
  for (const source of packet.sources) {
    assert.equal(source.source_kind, "synthetic_fixture");
    assert.equal(source.url, null);
    assert.equal(source.domain, null);
    assert.equal(source.record_status_scope, "fixture_internal");
  }
  assertPublicExclusions(packet);
});

test("live projection preserves provenance kind, time meanings, relations, gaps, and review boundary", () => {
  const internal = buildSiteReadyCasePacketFromAnalysis(liveRun());
  internal.warnings = [
    "source_extraction_failed:src_live_private:provider_failure",
    "relation_pair_bound_reached:100->64; 36 plausible pairs were deferred",
    "unknown_internal_warning:private detail",
  ];
  const packet = buildPublicEvidencePacket(internal);

  assert.equal(packet.artifact_kind, "live_evidence");
  assert.equal(packet.is_synthetic_fixture, false);
  assert.equal(packet.coverage.coverage_basis, "live_discovery");
  assert.equal(packet.coverage.bounded_nonexhaustive, true);
  assert.equal(packet.sources[0].content_kind, "model_generated_web_search_summary");
  assert.equal(
    packet.sources[0].content_capture,
    "model_generated_summary_not_captured_page_text",
  );
  assert.equal(packet.sources[0].url, "https://records.example.org/update-one");
  assert.equal(packet.sources[0].domain, "records.example.org");
  assert.equal(packet.sources[0].record_status_scope, "candidate_review_only");
  assert.equal(packet.time_semantics.event_time,
    "when_the_described_event_occurred_if_explicitly_available");
  assert.equal(packet.time_semantics.assertion_time,
    "when_the_actor_statement_was_dated_if_explicitly_available");
  assert.equal(packet.time_semantics.publication_time,
    "when_the_source_was_published_if_available");
  assert.equal(packet.time_semantics.retrieval_time,
    "when_sisyphus_observed_or_retrieved_the_source");
  assert.equal(packet.time_semantics.missing_time_policy, "null_no_substitution");
  assert.equal(packet.time_semantics.time_inference, "none");
  assert.ok(packet.candidate_relations.length >= 1);
  assert.equal(packet.candidate_relations[0].review_status, "pending_review");
  assert.equal(packet.candidate_relations[0].record_status, "candidate");
  assert.ok(packet.unresolved_questions.length >= 1);
  assert.equal(packet.candidate_canonical_boundary.relation_records,
    "candidate_review_only");
  assert.equal(packet.canonical_mutation, "none");
  assert.match(packet.warnings.join(" "), /source-local extraction did not complete/i);
  assert.match(packet.warnings.join(" "), /relation analysis reached its public bound/i);
  assert.doesNotMatch(packet.warnings.join(" "), /src_live_private|100->64|private detail/);
  assertPublicExclusions(packet);
});

test("public evidence v1 is byte-semantic frozen when the browser packet is Site v2", () => {
  const v2 = buildSourceSupportedSitePacketV2Fixture();
  const ordinary: Record<string, unknown> = { ...v2 };
  delete ordinary.source_supported_relation_signals;
  const v1 = validateSiteReadyCasePacket({
    ...ordinary,
    contract_version: "site_ready_case_packet.v1",
  });
  const fromV1 = buildPublicEvidencePacket(v1);
  const fromV2 = buildPublicEvidencePacket(v2);
  assert.equal(fromV2.contract_version, PUBLIC_EVIDENCE_CONTRACT_VERSION);
  assert.deepEqual(fromV2, fromV1);
  assert.equal(JSON.stringify(fromV2), JSON.stringify(fromV1));
  assert.doesNotMatch(
    JSON.stringify(fromV2),
    /source_supported_relation_signals|direct_source_support|statement_excerpt/,
  );
});

test("Markdown keeps findings, claims, actions, and relations bound to readable sources", () => {
  const packet = buildPublicEvidencePacket(
    buildSiteReadyCasePacketFromAnalysis(liveRun()),
  );
  const [alphaSource, betaSource] = packet.sources;
  alphaSource.title = "Alpha bulletin";
  betaSource.title = "Beta field report";

  const finding = packet.findings[0];
  packet.findings = [
    { ...finding, finding_id: "finding_alpha", text: "Alpha finding", source_ids: [alphaSource.source_id] },
    { ...finding, finding_id: "finding_beta", text: "Beta finding", source_ids: [betaSource.source_id] },
  ];
  const [alphaClaim, betaClaim] = packet.actor_claims;
  packet.actor_claims = [
    { ...alphaClaim, actor: "Alpha actor", claim_text: "Alpha claim", source_ids: [alphaSource.source_id] },
    { ...betaClaim, actor: "Beta actor", claim_text: "Beta claim", source_ids: [betaSource.source_id] },
  ];
  const action = packet.actions[0];
  packet.actions = [
    { ...action, action_id: "action_alpha", actor: "Alpha actor", action_text: "Alpha action", source_ids: [alphaSource.source_id] },
    { ...action, action_id: "action_beta", actor: "Beta actor", action_text: "Beta action", source_ids: [betaSource.source_id] },
  ];

  const alphaOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.source_id === alphaSource.source_id,
  );
  const betaOccurrence = packet.claim_occurrences.find(
    (occurrence) => occurrence.source_id === betaSource.source_id,
  );
  const relation = packet.candidate_relations[0];
  assert.ok(alphaOccurrence);
  assert.ok(betaOccurrence);
  assert.ok(relation);
  alphaOccurrence.actor = "Alpha actor";
  alphaOccurrence.claim_text = "Alpha endpoint claim";
  betaOccurrence.actor = "Beta actor";
  betaOccurrence.claim_text = "Beta endpoint claim";
  packet.candidate_relations = [{
    ...relation,
    left_occurrence_id: alphaOccurrence.occurrence_id,
    right_occurrence_id: betaOccurrence.occurrence_id,
    left_source_id: alphaSource.source_id,
    right_source_id: betaSource.source_id,
    relation_type: "contradicts",
    reason: "The bounded summaries require human review",
    insufficient_evidence: true,
    left_support: {
      ...relation.left_support,
      source_id: alphaSource.source_id,
      bounded_support: "Alpha bounded support",
      url: alphaSource.url,
    },
    right_support: {
      ...relation.right_support,
      source_id: betaSource.source_id,
      bounded_support: "Beta bounded support",
      url: betaSource.url,
    },
  }];

  const markdown = renderPublicEvidenceMarkdown(packet);
  assert.match(markdown, /Alpha finding\n {2}- Sources: \[Alpha bulletin\]\(<https:\/\/records\.example\.org\/update-one>\)/);
  assert.match(markdown, /Beta finding\n {2}- Sources: \[Beta field report\]\(<https:\/\/records\.example\.org\/update-two>\)/);
  assert.match(markdown, /Alpha actor: Alpha claim\n {2}- Sources: \[Alpha bulletin\]\(<https:\/\/records\.example\.org\/update-one>\)/);
  assert.match(markdown, /Beta actor: Beta claim\n {2}- Sources: \[Beta field report\]\(<https:\/\/records\.example\.org\/update-two>\)/);
  assert.match(markdown, /Alpha actor: Alpha action\n {2}- Sources: \[Alpha bulletin\]\(<https:\/\/records\.example\.org\/update-one>\)/);
  assert.match(markdown, /Beta actor: Beta action\n {2}- Sources: \[Beta field report\]\(<https:\/\/records\.example\.org\/update-two>\)/);
  assert.match(markdown, /Relation: contradicts/);
  assert.match(markdown, /Review status: pending review \(review only\)/);
  assert.match(markdown, /Insufficient evidence: yes/);
  assert.match(markdown, /Left endpoint: \[Alpha bulletin\]\(<https:\/\/records\.example\.org\/update-one>\) — Alpha actor: Alpha endpoint claim/);
  assert.match(markdown, /Left bounded support: Alpha bounded support/);
  assert.match(markdown, /Right endpoint: \[Beta field report\]\(<https:\/\/records\.example\.org\/update-two>\) — Beta actor: Beta endpoint claim/);
  assert.match(markdown, /Right bounded support: Beta bounded support/);
  assert.doesNotMatch(markdown, /finding_alpha|finding_beta|action_alpha|action_beta|occurrence_live_/);

  const brief = renderPublicEvidenceShareableBrief(packet);
  assert.match(brief, /Alpha finding — Sources: \[Alpha bulletin\]\(<https:\/\/records\.example\.org\/update-one>\)/);
  assert.match(brief, /Beta finding — Sources: \[Beta field report\]\(<https:\/\/records\.example\.org\/update-two>\)/);
});

test("public limitation projection removes implementation vocabulary and keeps epistemic meaning", () => {
  const internal = buildSiteReadyCasePacketFromAnalysis(liveRun());
  internal.limitations = [
    "src_live_private: Source text was not captured; model-generated web-search-grounded candidate summaries remain partial.",
    "src_live_private: No exact YYYY-MM-DD or timezone-qualified ISO date-time was explicit, so time_candidate is null.",
    "Zod schema structured_output validation details are internal.",
    "Hard pair prefilter model-classified theoretical pair workload was bounded.",
    "Coverage remains bounded to the reviewed public sources.",
    "Coverage remains bounded to the reviewed public sources.",
  ];
  internal.source_snapshot_summaries[0].limitations = [
    "src_live_private: Not captured page text; the model-generated web-search-grounded candidate summary is partial.",
    "Zod schema internals are not portable.",
  ];

  const packet = buildPublicEvidencePacket(internal);
  const publicLimitations = JSON.stringify({
    limitations: packet.limitations,
    source_limitations: packet.sources.map((source) => source.limitations),
  });
  const markdown = renderPublicEvidenceMarkdown(packet);

  for (const rendered of [publicLimitations, markdown]) {
    assert.doesNotMatch(
      rendered,
      /src_live_private|time_candidate|zod|schema|structured_output|hard pair|prefilter|model-classified|theoretical pair|workload/i,
    );
  }
  assert.match(publicLimitations, /Live source pages were not captured/);
  assert.match(publicLimitations, /precise date.*times remain unavailable/i);
  assert.match(publicLimitations, /Coverage remains bounded to the reviewed public sources/);
  assert.equal(
    packet.limitations.filter((limitation) =>
      limitation === "Coverage remains bounded to the reviewed public sources."
    ).length,
    1,
  );
  assert.match(markdown, /Live source pages were not captured/);
  assert.match(markdown, /Coverage remains bounded to the reviewed public sources/);
});

test("failed live fallback becomes typed no-result without prepared evidence", () => {
  const fallback = structuredClone(buildPreparedSiteReadyCasePacket());
  fallback.mode = "fallback";
  fallback.status = "fallback";
  fallback.normalized_public_interest_question =
    "How did hospital evacuation guidance change after the storm?";
  fallback.warnings = ["provider_failure: Live analysis did not complete successfully."];

  const result = buildPublicLineageRepresentation(fallback);
  assert.equal(result.contract_version, PUBLIC_NO_RESULT_CONTRACT_VERSION);
  assert.equal(result.result_kind, "no_result");
  assert.equal(result.result_mode, "fallback_no_result");
  assert.equal(result.evidence_available, false);
  assert.equal(result.question, fallback.normalized_public_interest_question);
  assert.equal(result.failure.code, "provider_failure");
  assert.equal(result.retry_guidance.automatic_retry, "forbidden");
  assert.equal(result.retry_guidance.provider_work_may_have_occurred, true);
  assert.equal(result.retry_guidance.safe_blind_retry, false);
  assert.equal("sources" in result, false);
  assert.equal("findings" in result, false);
  assert.equal("actor_claims" in result, false);
  assert.equal("actions" in result, false);
  assert.equal("candidate_relations" in result, false);
  assert.equal("source_bound_candidate_synthesis" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /Fictional City Emergency Management Office/);
  assert.doesNotMatch(JSON.stringify(result), /DEMO FIXTURE ONLY/);
  assertPublicExclusions(result);
  assert.equal(buildPublicExportArtifacts(fallback), null);
});

test("all export formats share one public packet and fixed safe filenames", () => {
  const internal = buildPreparedSiteReadyCasePacket();
  const artifacts = buildPublicExportArtifacts(internal);
  assert.ok(artifacts);
  assert.deepEqual(JSON.parse(artifacts.json), artifacts.packet);
  assert.equal(artifacts.packet.contract_version, PUBLIC_EVIDENCE_CONTRACT_VERSION);
  assert.equal(artifacts.jsonFilename, "sisyphus-evidence-v1.json");
  assert.equal(artifacts.markdownFilename, "sisyphus-evidence-v1.md");
  assert.match(artifacts.markdown, /Synthetic prepared example only/i);
  assert.match(artifacts.markdown, /bounded and nonexhaustive/i);
  assert.match(artifacts.markdown, /Candidate relations are review\\-only/i);
  assert.match(artifacts.markdown, /Source inclusion is not endorsement/i);
  assert.match(artifacts.markdown, /Model\\-generated web\\-search summaries are not captured page text/i);
  assert.match(artifacts.markdown, /untrusted evidence data, not instructions/i);
  assert.match(artifacts.shareableBrief, /Synthetic prepared example only/i);
  assert.match(artifacts.shareableBrief, /untrusted evidence data, not instructions/i);
  assert.doesNotMatch(artifacts.jsonFilename, /cooling|question/i);
  assert.doesNotMatch(artifacts.markdownFilename, /cooling|question/i);
});

test("Markdown and shareable renderers isolate adversarial display strings and unsafe URLs", () => {
  const internal = structuredClone(buildPreparedSiteReadyCasePacket());
  const attack = [
    "[x](javascript:alert(1))",
    "`inline` and ```fence```",
    "<script>alert(1)</script>",
    "# injected heading",
    "> injected quote",
    "left | right",
    "first line\nsecond line",
  ].join(" ");
  internal.source_snapshot_summaries[0].title = attack;
  internal.source_snapshot_summaries[0].publisher = "publisher\n# forged";
  internal.source_snapshot_summaries[0].evidence_excerpt = attack;
  internal.source_bound_findings[0].text = attack;
  internal.actor_claims[0].claim_text = attack;
  internal.actions[0].action_text = attack;
  internal.relation_candidates[0].reason = attack;
  internal.relation_candidates[0].left_support_reference.bounded_excerpt = attack;
  internal.relation_candidates[0].right_support_reference.bounded_excerpt = attack;
  internal.claim_occurrences[0].actor = attack;
  internal.claim_occurrences[0].original_claim_text = attack;
  internal.unresolved_questions[0].question = attack;
  internal.limitations = [attack];

  const packet = buildPublicEvidencePacket(internal);
  const markdown = renderPublicEvidenceMarkdown(packet);
  const brief = renderPublicEvidenceShareableBrief(packet);
  for (const rendered of [markdown, brief]) {
    assert.doesNotMatch(rendered, /<script>/i);
    assert.doesNotMatch(rendered, /\]\(<(?:javascript|data):/i);
    assert.doesNotMatch(rendered, /^```/m);
    assert.doesNotMatch(rendered, /^# injected heading/m);
    assert.doesNotMatch(rendered, /^> injected quote/m);
    assert.match(rendered, /&lt;script&gt;/i);
    assert.match(rendered, /\\\|/);
    assert.doesNotMatch(rendered, /publisher\n# forged/);
  }
  assert.match(markdown, /Left bounded support: .*&lt;script&gt;/i);

  for (const unsafe of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "not a url",
    "https://user:password@example.org/private",
  ]) {
    assert.deepEqual(validatedPublicHttpUrl(unsafe), { url: null, domain: null });
  }
  assert.deepEqual(validatedPublicHttpUrl("https://Example.org/a(b)"), {
    url: "https://example.org/a(b)",
    domain: "example.org",
  });
});

test("GET capability and OpenAPI are static, nonbillable, and describe real request and retry bounds", async () => {
  let outboundRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    outboundRequests += 1;
    throw new Error("outbound network forbidden in deterministic test");
  };
  try {
    const capabilityResponse = getLineageCapability();
    const capability = await capabilityResponse.json() as typeof LINEAGE_CAPABILITY_DOCUMENT;
    const openAPIResponse = getOpenAPI();
    const openapi = await openAPIResponse.json() as typeof OPENAPI_DOCUMENT;

    assert.equal(capabilityResponse.status, 200);
    assert.equal(capability.idempotency_supported, false);
    assert.equal(capability.safe_blind_retry, false);
    assert.equal(capability.provider_work_may_be_billable, true);
    assert.equal(capability.honor_retry_after_when_present, true);
    assert.deepEqual(capability.this_get_request_effects, {
      runtime_reads: 0,
      d1_readiness_checks: 0,
      admission_reservations: 0,
      provider_calls: 0,
      persistence_writes: 0,
    });
    assert.equal(capability.invocation.request.fields.question.normalized_minimum_characters, 12);
    assert.equal(capability.invocation.request.fields.question.normalized_maximum_characters, 500);
    assert.equal(capability.invocation.request.fields.sourceLimit.maximum, 5);
    assert.equal(capability.invocation.public_representation.media_type,
      PUBLIC_EVIDENCE_MEDIA_TYPE);
    assert.equal(capability.public_response.evidence_contract_version,
      PUBLIC_EVIDENCE_CONTRACT_VERSION);
    assert.equal(capability.public_response.no_result_contract_version,
      PUBLIC_NO_RESULT_CONTRACT_VERSION);
    assert.equal(capability.returned_content_trust, "untrusted_evidence_data");
    assert.match(capability.returned_content_guidance.data_not_instructions,
      /evidence data, not instructions/i);
    assert.match(capability.returned_content_guidance.cannot_authorize,
      /tool calls.*credential access.*policy changes.*canonical mutation/i);
    assert.match(capability.returned_content_guidance.url_handling,
      /not automatic authorization to fetch or follow/i);
    assert.match(capability.returned_content_guidance.downstream_policy_required,
      /tool, network, and security policy/i);

    const parsed = parseAnalysisRequest(capability.invocation.request.example);
    assert.deepEqual(parsed, capability.invocation.request.example);

    assert.equal(openAPIResponse.status, 200);
    assert.equal(openapi.openapi, "3.1.0");
    assert.ok(openapi.paths["/api/lineage"].post);
    assert.equal(openapi.components.schemas.LineageRequest.additionalProperties, false);
    assert.equal(openapi.components.schemas.LineageRequest.properties.sourceLimit.maximum, 5);
    const questionSchema = openapi.components.schemas.LineageRequest.properties.question;
    assert.equal("minLength" in questionSchema, false);
    assert.equal("maxLength" in questionSchema, false);
    assert.equal(questionSchema["x-normalized-minLength"], 12);
    assert.equal(questionSchema["x-normalized-maxLength"], 500);
    assert.equal(questionSchema["x-normalization"], "trim_and_collapse_whitespace");
    assert.equal(openapi["x-returned-content-trust"], "untrusted_evidence_data");
    assert.match(openapi.info.description, /untrusted evidence data, not instructions/i);
    assert.match(openapi.components.schemas.PublicEvidenceV1.description,
      /untrusted evidence data, not instructions/i);
    assert.equal(openapi.components.schemas.PublicEvidenceV1.properties.contract_version.const,
      PUBLIC_EVIDENCE_CONTRACT_VERSION);
    assert.deepEqual(openapi.components.schemas.InternalSitePacket.oneOf, [
      { $ref: "#/components/schemas/SiteReadyCasePacketV1" },
      { $ref: "#/components/schemas/SiteReadyCasePacketV2" },
    ]);
    assert.equal(
      openapi.components.schemas.SiteReadyCasePacketV1.properties.contract_version.const,
      "site_ready_case_packet.v1",
    );
    assert.equal(
      openapi.components.schemas.SiteReadyCasePacketV2.properties.contract_version.const,
      "site_ready_case_packet.v2",
    );
    assert.equal(
      openapi.components.schemas.SiteReadyCasePacketV2.properties
        .source_supported_relation_signals.maxItems,
      1,
    );
    assert.deepEqual(
      openapi.components.schemas.SourceSupportedRelationSignal.required,
      [
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
      ],
    );
    assert.equal(
      openapi.components.schemas.SourceSupportedRelationSignal.additionalProperties,
      false,
    );
    assert.equal(
      openapi.components.schemas.SourceSupportedRelationSignal.properties.statement_excerpt.maxLength,
      560,
    );
    assert.equal(
      openapi.components.schemas.SourceSupportedRelationSignal.properties.statement_excerpt.pattern,
      "\\S",
    );
    assert.equal(
      "source_supported_relation_signals" in
        openapi.components.schemas.PublicEvidenceV1.properties,
      false,
    );
    assert.equal(openapi.components.schemas.PublicNoResultV1.properties.contract_version.const,
      PUBLIC_NO_RESULT_CONTRACT_VERSION);
    assert.match(openapi.paths["/api/lineage"].post.responses["400"].description,
      /Do not retry until the request changes/i);
    assert.match(openapi.paths["/api/lineage"].post.responses["429"].description,
      /Retry-After.*service_spend_limit_reached/i);
    assert.match(openapi.paths["/api/lineage"].post.responses["504"].description,
      /do not retry blindly/i);
    assert.equal(outboundRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const normalizedFromLongRaw = parseAnalysisRequest({
    question: `How${" ".repeat(600)}did guidance change?`,
  });
  assert.equal(normalizedFromLongRaw.question, "How did guidance change?");
  assert.throws(
    () => parseAnalysisRequest({ question: `a${" ".repeat(20)}b` }),
    /between 12 and 500 characters after normalization/i,
  );
  assert.throws(
    () => parseAnalysisRequest({ question: "x".repeat(501) }),
    /between 12 and 500 characters after normalization/i,
  );

  const routeSource = readFileSync(
    new URL("../app/api/lineage/route.ts", import.meta.url),
    "utf8",
  );
  const getBody = routeSource.match(/export function GET\(\): Response \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(getBody, /lineageCapabilityResponse/);
  assert.doesNotMatch(getBody, /getPublicLiveRuntime|admission|OPENAI|DB|fetch\(/);
});

test("vendor representation runs one accepted investigation once, then projects the result", async () => {
  const counts = {
    reserve: 0,
    mockRunLive: 0,
    settle: 0,
  };
  const request = publicRequest();
  const internalResponse = await handlePublicLiveLineageRequest(request, {
    getRuntime: async () => ({
      operatorLiveEnabled: true,
      liveEnabled: true,
      apiKey: "test-only-not-a-real-key",
      admission: {
        isReady: async () => true,
        reserve: async ({ workUnits }) => {
          counts.reserve += 1;
          return {
            admitted: true as const,
            reservation: { reservationId: "reservation_test", workUnits },
          };
        },
        settle: async () => {
          counts.settle += 1;
          return true;
        },
      },
    }),
    nowISO: () => GENERATED_AT,
    nowMs: () => Date.parse(GENERATED_AT),
    runLive: async () => {
      counts.mockRunLive += 1;
      return liveRun();
    },
  });
  const response = await projectLineageResponse(internalResponse, true);
  const payload = await response.json() as ReturnType<typeof buildPublicLineageRepresentation>;

  assert.deepEqual(counts, { reserve: 1, mockRunLive: 1, settle: 1 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), PUBLIC_EVIDENCE_MEDIA_TYPE);
  assert.equal(payload.result_kind, "evidence");
  assert.equal(payload.contract_version, PUBLIC_EVIDENCE_CONTRACT_VERSION);
  assertPublicExclusions(payload);
});

test("known provider failure still runs once and public response is no-result", async () => {
  let mockRunLiveCalls = 0;
  let settlements = 0;
  const internalResponse = await handlePublicLiveLineageRequest(publicRequest(), {
    getRuntime: async () => ({
      operatorLiveEnabled: true,
      liveEnabled: true,
      apiKey: "test-only-not-a-real-key",
      admission: {
        isReady: async () => true,
        reserve: async ({ workUnits }) => ({
          admitted: true as const,
          reservation: { reservationId: "reservation_failure", workUnits },
        }),
        settle: async () => {
          settlements += 1;
          return true;
        },
      },
    }),
    nowISO: () => GENERATED_AT,
    nowMs: () => Date.parse(GENERATED_AT),
    runLive: async () => {
      mockRunLiveCalls += 1;
      throw new AnalysisFailure("provider_failure");
    },
  });
  const response = await projectLineageResponse(internalResponse, true);
  const payload = await response.json() as ReturnType<typeof buildPublicLineageRepresentation>;
  assert.equal(mockRunLiveCalls, 1);
  assert.equal(settlements, 1);
  assert.equal(response.status, 200);
  assert.equal(payload.result_kind, "no_result");
  if (payload.result_kind !== "no_result") assert.fail("Expected no-result");
  assert.equal(payload.failure.code, "provider_failure");
  assert.equal(payload.retry_guidance.automatic_retry, "forbidden");
  assert.equal("sources" in payload, false);
  assertPublicExclusions(payload);
});

test("export UI is available for selected prepared/live evidence and absent for fallback", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const html = renderToStaticMarkup(createElement(ExportInvestigation, { packet: prepared }));
  assert.match(html, /^<div class="export-investigation">/);
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*aria-controls="export-investigation-panel"/);
  assert.match(html, /Export investigation/);
  assert.doesNotMatch(html, /Copy shareable brief/);
  assert.doesNotMatch(html, /id="export-investigation-panel"/);

  const fallback = structuredClone(prepared);
  fallback.mode = "fallback";
  fallback.status = "fallback";
  assert.equal(
    renderToStaticMarkup(createElement(ExportInvestigation, { packet: fallback })),
    "",
  );
  const source = readFileSync(
    new URL("../app/components/ExportInvestigation.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|\/api\//);
  assert.match(source, /Copy shareable brief/);
  assert.match(source, /Download Markdown/);
  assert.match(source, /Download JSON/);
  assert.match(source, /no new investigation, provider work,[\s\S]*persistence, or detail fetch/i);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /navigator\.clipboard/);
});

function publicRequest(): Request {
  return new Request("http://site.local/api/lineage", {
    method: "POST",
    headers: {
      accept: PUBLIC_EVIDENCE_MEDIA_TYPE,
      "content-type": "application/json",
    },
    body: JSON.stringify(LINEAGE_CAPABILITY_DOCUMENT.invocation.request.example),
  });
}

function liveRun(): AnalysisRunPacket {
  const sources = [liveSource(1), liveSource(2)];
  const candidates = [
    candidate(1, sources[0], "actor_claim", {
      actor: "Agency Alpha",
      text: "Cooling-center hours expanded after the public update.",
      time_candidate: "2026-08-17T09:00:00Z",
      time_candidate_precision: "instant",
    }),
    candidate(2, sources[1], "actor_claim", {
      actor: "Resident Network",
      text: "Cooling-center hours remained limited in one neighborhood.",
      time_candidate: "2026-08-18",
      time_candidate_precision: "day",
    }),
    candidate(3, sources[0], "finding", {
      text: "The public guidance listed expanded cooling-center hours.",
    }),
    candidate(4, sources[0], "action", {
      actor: "Agency Alpha",
      text: "Agency Alpha published updated cooling-center hours.",
      time_candidate: "2026-08-17T09:00:00Z",
      time_candidate_precision: "instant",
    }),
    candidate(5, sources[1], "event_time_candidate", {
      text: "Neighborhood access observations occurred on August 18.",
      time_candidate: "2026-08-18",
      time_candidate_precision: "day",
    }),
    candidate(6, sources[0], "assertion_time_candidate", {
      text: "The agency assertion was dated August 17.",
      time_candidate: "2026-08-17T09:00:00Z",
      time_candidate_precision: "instant",
    }),
    candidate(7, sources[1], "unresolved_question", {
      text: "Were the changed hours accessible in every neighborhood?",
    }),
  ];
  return {
    run_id: "run_live_internal_only",
    case_id: "case_live_internal_only",
    mode: "live",
    status: "live",
    normalized_question:
      "How did cooling-center guidance change after access reports appeared?",
    requested_source_limit: 3,
    actual_source_count: sources.length,
    discovery_profile: "standard",
    coverage_summary: buildCoverageSummary({
      discoveryProfile: "standard",
      requestedSourceLimit: 3,
      baselineRequested: 3,
      expansionRequested: 0,
      sources,
      duplicateURLCount: 0,
      expansionAttempted: false,
      expansionCompletedSuccessfully: false,
    }),
    source_snapshot_summaries: sources,
    candidate_counts: {
      finding: 1,
      actor_claim: 2,
      action: 1,
      event_time_candidate: 1,
      assertion_time_candidate: 1,
      unresolved_question: 1,
      source_hygiene: 0,
    },
    candidate_ids: candidates.map((item) => item.candidate_id),
    candidates,
    warnings: [],
    limitations: ["Bounded deterministic mock for public contract verification."],
    canonical_mutation: "none",
    focused_detail_lookup_keys: sources.map((source) => source.source_id),
  };
}

function liveSource(index: number): AnalysisSourceSummary {
  const url = `https://records.example.org/update-${index === 1 ? "one" : "two"}`;
  return {
    source_id: `src_live_${index}`,
    snapshot_id: `snapshot_live_${index}`,
    title: `Public update ${index}`,
    url,
    domain: "records.example.org",
    publisher: index === 1 ? "Agency records" : "Resident network",
    published_at: index === 1 ? "2026-08-17T10:00:00Z" : "2026-08-18",
    published_at_precision: index === 1 ? "instant" : "day",
    retrieved_at: GENERATED_AT,
    snapshot_status: "partial",
    retrieval_mode: "openai_web_search",
    content_kind: "model_generated_web_search_summary",
    source_text_captured: false,
    content_sha256: null,
    candidate_summary_sha256: "a".repeat(64),
    record_status: "candidate",
    evidence_excerpt: null,
    web_search_grounded_candidate_summary:
      "Cooling-center hours and neighborhood access changed after an update.",
    limitations: ["No captured page text is available."],
    api_provenance: {
      provider: "openai",
      search_call_id: `search_internal_${index}`,
      provider_source_included: true,
      citation_title: `Public update ${index}`,
      citation_start: 0,
      citation_end: 24,
    },
    source_selection: {
      discovery_pass: "baseline",
      discovery_lane: "baseline_authority",
      source_context: index === 1 ? "official" : "community_organization",
      information_proximity: index === 1
        ? "primary_actor_statement"
        : "firsthand_observation",
      why_included: "Provides a bounded public update for comparison.",
      classification_basis: "model_generated_web_search_classification",
      classification_status: "candidate_review_only",
      comparison_target_source_ids: [],
    },
  };
}

function candidate(
  index: number,
  source: AnalysisSourceSummary,
  candidateType: AnalysisCandidate["candidate_type"],
  overrides: Partial<AnalysisCandidate> = {},
): AnalysisCandidate {
  const time = overrides.time_candidate ?? null;
  return {
    candidate_id: `candidate_live_${candidateType}_${index}`,
    source_id: source.source_id,
    snapshot_id: source.snapshot_id,
    candidate_type: candidateType,
    actor: null,
    text: "Cooling-center public information changed.",
    evidence_reference: source.url ?? "",
    support_kind: "model_generated_web_search_summary_span",
    supporting_summary_span: "Cooling-center hours and neighborhood access changed",
    source_reference: {
      source_id: source.source_id,
      snapshot_id: source.snapshot_id,
      url: source.url ?? "",
      title: source.title,
      kind: "url_citation",
    },
    time_candidate: time,
    time_candidate_precision:
      overrides.time_candidate_precision ?? (time ? "instant" : null),
    confidence: "medium",
    uncertainty: "Only a model-generated web-search summary is available.",
    model: "deterministic-mock",
    api_path: "responses.parse",
    generated_at: GENERATED_AT,
    validation_status: "validated",
    mode: "live_api",
    status: "candidate",
    ...overrides,
  };
}

function assertPublicExclusions(value: unknown): void {
  const forbiddenKeys = new Set([
    "run_id",
    "search_call_id",
    "api_provenance",
    "bounded_work_summary",
    "focused_detail_lookup_keys",
    "reservation_id",
    "reservationId",
    "work_units",
    "workUnits",
    "environment",
    "credentials",
    "provider_call_id",
    "provider_request_id",
    "authentication",
    "session",
    "user_identity",
    "content_sha256",
    "candidate_summary_sha256",
  ]);
  const forbiddenKeyPatterns = [
    /(?:^|_)admission(?:_|$)/i,
    /(?:^|_)reservation(?:_|$)/i,
    /(?:^|_)work_units?(?:_|$)/i,
    /(?:^|_)environment(?:_|$)/i,
    /(?:^|_)credentials?(?:_|$)/i,
    /(?:^|_)authentication(?:_|$)/i,
    /(?:^|_)session(?:_|$)/i,
    /(?:^|_)user_identity(?:_|$)/i,
    /provider_(?:call|request).*id/i,
    /(?:hash|sha256)/i,
  ];
  walk(value, (key, child) => {
    assert.equal(forbiddenKeys.has(key), false, `forbidden public key: ${key}`);
    for (const pattern of forbiddenKeyPatterns) {
      assert.doesNotMatch(key, pattern, `forbidden public key family: ${key}`);
    }
    if (typeof child === "string") {
      assert.doesNotMatch(child, /^fixture:\/\//i);
      assert.notEqual(child, "deterministic.fixture");
      assert.doesNotMatch(child, /^[a-f0-9]{64}$/i);
    }
  });
}

function walk(
  value: unknown,
  visit: (key: string, child: unknown) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      visit(String(index), child);
      walk(child, visit);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}
