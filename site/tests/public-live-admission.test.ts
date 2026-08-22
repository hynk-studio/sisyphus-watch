import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { POST as postPublicAnalysis } from "../app/api/analysis/route";
import type {
  AnalysisErrorPacket,
  AnalysisRunPacket,
} from "../app/lib/analysis/contracts";
import { AnalysisFailure } from "../app/lib/analysis/errors";
import type {
  InternalAnalysisRunEnvelope,
  RelationCueDiagnostic,
} from "../app/lib/analysis/relation-cues";
import {
  runOpenAIAnalysis,
  type ProviderResponse,
  type ResponsesPort,
} from "../app/lib/analysis/openai-adapter";
import { orderTimelineRows } from "../app/lib/experience";
import {
  isPublicLiveReady,
  type PublicLiveRuntime,
} from "../app/lib/live-mode";
import {
  buildPreparedSiteReadyCasePacket,
  buildSiteReadyCasePacketFromAnalysis,
} from "../app/lib/lineage/builder";
import type { SiteReadyCasePacket } from "../app/lib/lineage/contracts";
import {
  calculatePublicWorkUnits,
  PUBLIC_ADMISSION_LIMITS,
  PUBLIC_ADMISSION_SCHEMA_STATEMENTS,
  PUBLIC_WORKFLOW_DEADLINE_MS,
  type AdmissionDecision,
  type AdmissionSettlement,
  type PublicAdmissionStore,
} from "../app/lib/public-admission";
import { handlePublicLiveLineageRequest } from "../app/lib/public-live-handler";
import {
  decidePublicRunResponse,
  PROVIDER_CALL_PLANNING_BOUNDS,
} from "../app/lib/public-live";
import {
  compareReviewTimestamps,
  groupReviewTimestampItems,
} from "../app/lib/temporal";
import { version18RelationAdmissionRun } from "./fixtures/version18-relation-admission";

const NOW_MS = Date.UTC(2026, 7, 17, 12, 0, 0);
const NOW_ISO = "2026-08-17T12:00:00.000Z";

class FakeAdmissionStore implements PublicAdmissionStore {
  readonly reserveInputs: Array<{ workUnits: number; nowMs: number }> = [];
  readonly settlements: Array<{
    reservationId: string;
    outcome: AdmissionSettlement;
    nowMs: number;
  }> = [];

  constructor(
    private readonly decision: AdmissionDecision = {
      admitted: true,
      reservation: { reservationId: "aggregate-reservation-1", workUnits: 6 },
    },
    private readonly ready = true,
  ) {}

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  async reserve(input: {
    workUnits: number;
    nowMs: number;
  }): Promise<AdmissionDecision> {
    this.reserveInputs.push(input);
    return this.decision;
  }

  async settle(input: {
    reservationId: string;
    outcome: AdmissionSettlement;
    nowMs: number;
  }): Promise<boolean> {
    this.settlements.push(input);
    return true;
  }
}

class OneSourceResponsesPort implements ResponsesPort {
  calls = 0;

  async parse(): Promise<ProviderResponse> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        output_parsed: {
          sources: [{
            title: "Public access notice",
            url: "https://example.org/public-access",
            publisher: "Example Office",
            published_at: "2025-07-15",
            web_search_grounded_candidate_summary:
              "The public office announced a bounded access update.",
            discovery_lane: "baseline_authority",
            source_context: "official",
            information_proximity: "direct_document",
            why_included: "Directly relevant public notice.",
            comparison_target_source_ids: [],
            limitations: ["Model-generated discovery summary only."],
          }],
        },
        output: [{
          type: "web_search_call",
          id: "web_search_test",
          status: "completed",
          action: {
            type: "search",
            sources: [{ type: "url", url: "https://example.org/public-access" }],
          },
        }],
      };
    }
    return {
      output_parsed: {
        candidates: [{
          candidate_type: "finding",
          actor: null,
          text: "The notice describes a bounded access update.",
          supporting_summary_span:
            "The public office announced a bounded access update.",
          time_candidate: null,
          confidence: "medium",
          uncertainty: "Candidate summary only.",
          semantic_review: {
            actor_role: "not_applicable",
            statement_semantics: "not_applicable",
            actor_specificity: "not_applicable",
          },
        }],
        limitations: ["One-source extraction only."],
      },
      output: [],
    };
  }
}

function publicRequest(body: unknown): Request {
  return new Request("http://site.local/api/lineage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "must-not-be-required-or-stored",
      "x-forwarded-for": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
}

function runtime(admission: PublicAdmissionStore | null): PublicLiveRuntime {
  return {
    operatorLiveEnabled: true,
    liveEnabled: true,
    apiKey: "test-only-provider-key-material",
    admission,
  };
}

function publicLiveInternalFixture(): {
  envelope: InternalAnalysisRunEnvelope;
  expectedPacket: SiteReadyCasePacket;
  targetTitle: string;
} {
  const analysisRun = version18RelationAdmissionRun();
  const expectedPacket = buildSiteReadyCasePacketFromAnalysis(analysisRun);
  const relation = expectedPacket.relation_candidates[0];
  const owner = expectedPacket.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relation.left_occurrence_id,
  )!;
  const target = expectedPacket.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === relation.right_occurrence_id,
  )!;
  const targetTitle = analysisRun.source_snapshot_summaries.find(
    (source) => source.source_id === target.source_id,
  )!.title;
  const diagnostic: RelationCueDiagnostic = {
    provenance: "model_extracted_from_model_summary",
    cue_kind: "supersession_candidate",
    operative_actor: "NASA",
    operative_verb: "supersedes",
    target_reference_text: targetTitle,
    target_kind: "document_title",
    target_identifier: targetTitle,
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
      `NASA supersedes ${targetTitle}.`,
  };
  return {
    envelope: {
      analysis_run: analysisRun,
      relation_cue_diagnostics: [{
        candidate_id: owner.claim_id,
        source_id: owner.source_id,
        snapshot_id: owner.snapshot_id,
        diagnostic,
      }],
      workflow_deadline_at_ms: NOW_MS + 20_000,
    },
    expectedPacket,
    targetTitle,
  };
}

test("public work units are deterministic and conservatively include tool-call ceilings", () => {
  assert.deepEqual(
    PROVIDER_CALL_PLANNING_BOUNDS.map((shape) => ({
      sourceLimit: shape.sourceLimit,
      discoveryProfile: shape.discoveryProfile,
      workUnits: calculatePublicWorkUnits(shape),
      recorded: shape.reservedWorkUnits,
    })),
    [
      { sourceLimit: 3, discoveryProfile: "standard", workUnits: 6, recorded: 6 },
      { sourceLimit: 3, discoveryProfile: "coverage_expansion", workUnits: 9, recorded: 9 },
      { sourceLimit: 5, discoveryProfile: "standard", workUnits: 8, recorded: 8 },
      { sourceLimit: 5, discoveryProfile: "coverage_expansion", workUnits: 11, recorded: 11 },
    ],
  );
  assert.deepEqual(PUBLIC_ADMISSION_LIMITS, {
    maxConcurrentInvestigations: 2,
    hourlyWorkUnits: 60,
    dailyWorkUnits: 240,
    reservationTtlMs: 150_000,
  });
  assert.equal(PUBLIC_WORKFLOW_DEADLINE_MS, 110_000);
});

test("hosting targets the D1-capable replacement Site without adding configuration", () => {
  const hosting = JSON.parse(readFileSync(
    new URL("../.openai/hosting.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(hosting, {
    project_id: "appgprj_6a8355cc7e7c8191b95309dffd1be294",
    d1: "DB",
    r2: null,
  });
});

test("the packaged D1 migration matches the aggregate-only runtime schema", () => {
  const migrationDirectoryUrl = new URL("../drizzle/", import.meta.url);
  const migrationFiles = readdirSync(migrationDirectoryUrl)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  assert.deepEqual(migrationFiles, ["0001_public_live_admission.sql"]);

  const migration = readFileSync(
    new URL(migrationFiles[0], migrationDirectoryUrl),
    "utf8",
  );
  const normalizedMigration = migration.replace(/\s+/g, " ").trim();
  for (const statement of PUBLIC_ADMISSION_SCHEMA_STATEMENTS) {
    assert.match(
      normalizedMigration,
      new RegExp(escapeRegex(statement.replace(/\s+/g, " ").trim())),
    );
  }
  assert.deepEqual(
    [...normalizedMigration.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([a-z_]+)/gi)]
      .map((match) => match[1]),
    ["public_live_reservations"],
  );
  const tableDefinition = normalizedMigration.match(
    /CREATE TABLE IF NOT EXISTS public_live_reservations \((.*?)\);/i,
  );
  assert.ok(tableDefinition);
  const tableColumns = tableDefinition[1].trim();
  assert.deepEqual(
    [...tableColumns.matchAll(/(?:^|, )([a-z_]+) (?:TEXT|INTEGER)\b/gi)]
      .map((match) => match[1]),
    [
      "reservation_id",
      "work_units",
      "hour_window_start",
      "day_window_start",
      "status",
      "created_at",
      "expires_at",
      "settled_at",
    ],
  );
  assert.doesNotMatch(normalizedMigration, /\b(?:DROP|ALTER)\b/i);
  assert.doesNotMatch(normalizedMigration, /\bprobe_counter\b/i);
  assert.doesNotMatch(
    normalizedMigration,
    /visitor|question|result(?:_packet)?|source_content|discovered_url|ip(?:_address)?|user_(?:id|identity|agent)|cookie|fingerprint|account_id/i,
  );
});

test("invalid public input is rejected before runtime, admission, or provider work", async () => {
  let runtimeReads = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({ question: "too short", sourceLimit: 3 }),
    {
      getRuntime: async () => {
        runtimeReads += 1;
        return runtime(new FakeAdmissionStore());
      },
      runLive: async () => {
        throw new Error("provider must not run");
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(runtimeReads, 0);
  assert.match(JSON.stringify(await response.json()), /invalid_question/);
});

test("same-origin lineage never accepts a relay URL to proxy", async () => {
  let runtimeReads = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({
      question: "How is public access changing for residents?",
      sourceLimit: 3,
      discoveryProfile: "standard",
      relayUrl: "https://relay.example",
    }),
    {
      getRuntime: async () => {
        runtimeReads += 1;
        return runtime(new FakeAdmissionStore());
      },
      runLive: async () => {
        throw new Error("provider must not run");
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(runtimeReads, 0);
  assert.match(JSON.stringify(await response.json()), /invalid_request/);
});

test("operator sponsorship defaults closed before D1 reservation or provider work", async () => {
  const admission = new FakeAdmissionStore();
  let providerCalls = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({
      question: "How is public access changing for residents?",
      sourceLimit: 3,
      discoveryProfile: "standard",
    }),
    {
      getRuntime: async () => ({
        operatorLiveEnabled: false,
        liveEnabled: true,
        apiKey: "present-but-not-authorizing",
        admission,
      }),
      runLive: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    },
  );
  assert.equal(response.status, 503);
  const body = await response.json() as AnalysisErrorPacket;
  assert.equal(body.error.code, "operator_sponsored_live_disabled");
  assert.equal(body.canonical_mutation, "none");
  assert.equal(admission.reserveInputs.length, 0);
  assert.equal(admission.settlements.length, 0);
  assert.equal(providerCalls, 0);
});

test("capacity denial is a safe 429 before provider work and stores no visitor data", async () => {
  const admission = new FakeAdmissionStore({
    admitted: false,
    reason: "concurrent_capacity",
    retryAfterSeconds: 150,
  });
  let providerCalls = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({
      question: "How is public access changing for residents?",
      sourceLimit: 3,
      discoveryProfile: "standard",
    }),
    {
      getRuntime: async () => runtime(admission),
      nowMs: () => NOW_MS,
      runLive: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    },
  );
  const body = (await response.json()) as AnalysisErrorPacket;
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "150");
  assert.equal(body.mode, "unavailable");
  assert.equal(body.error.code, "capacity_exhausted");
  assert.equal(body.canonical_mutation, "none");
  assert.equal(providerCalls, 0);
  assert.deepEqual(admission.reserveInputs, [{ workUnits: 6, nowMs: NOW_MS }]);
  assert.deepEqual(Object.keys(admission.reserveInputs[0]).sort(), ["nowMs", "workUnits"]);
  assert.deepEqual(admission.settlements, []);
  assert.doesNotMatch(JSON.stringify(admission.reserveInputs), /question|result|url|ip|agent|cookie/i);
});

test("successful provider work settles one reservation exactly once", async () => {
  const admission = new FakeAdmissionStore();
  const responses = new OneSourceResponsesPort();
  const response = await handlePublicLiveLineageRequest(
    publicRequest({
      question: "How is public access changing for residents?",
      sourceLimit: 3,
    }),
    {
      getRuntime: async () => runtime(admission),
      nowMs: () => NOW_MS,
      nowISO: () => NOW_ISO,
      runLive: async ({
        question,
        sourceLimit,
        discoveryProfile,
        generatedAt,
      }): Promise<AnalysisRunPacket> => runOpenAIAnalysis({
        question,
        sourceLimit,
        discoveryProfile,
        generatedAt,
        responses,
      }),
    },
  );
  const body = await response.json() as {
    mode: string;
    candidate_canonical_boundary: { canonical_mutation: string };
  };
  assert.equal(response.status, 200);
  assert.equal(body.mode, "live");
  assert.equal(body.candidate_canonical_boundary.canonical_mutation, "none");
  assert.equal(responses.calls, 2);
  assert.deepEqual(admission.settlements, [{
    reservationId: "aggregate-reservation-1",
    outcome: "settled",
    nowMs: NOW_MS,
  }]);
});

test("public live internal-envelope success captures bounded pages without changing public semantics", async () => {
  const admission = new FakeAdmissionStore();
  const fixture = publicLiveInternalFixture();
  let internalRuns = 0;
  let legacyRunCalls = 0;
  let captureCalls = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({
      question: "How is NASA's public mission plan changing across official updates?",
      sourceLimit: 3,
      discoveryProfile: "standard",
    }),
    {
      getRuntime: async () => runtime(admission),
      nowMs: () => NOW_MS,
      nowISO: () => NOW_ISO,
      runLive: async () => {
        legacyRunCalls += 1;
        throw new Error("legacy provider path must not run");
      },
      runLiveInternal: async () => {
        internalRuns += 1;
        return fixture.envelope;
      },
      capture: {
        nowMs: () => NOW_MS,
        nowISO: () => NOW_ISO,
        fetcher: (async (_input, init) => {
          captureCalls += 1;
          const headers = new Headers(init?.headers);
          assert.equal(init?.credentials, "omit");
          assert.equal(headers.has("authorization"), false);
          assert.equal(headers.has("cookie"), false);
          return new Response(`NASA supersedes ${fixture.targetTitle}.`, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }) as typeof fetch,
      },
    },
  );
  const body = await response.json() as SiteReadyCasePacket;
  assert.equal(response.status, 200);
  assert.deepEqual(body, fixture.expectedPacket);
  assert.equal(internalRuns, 1);
  assert.equal(legacyRunCalls, 0);
  assert.equal(captureCalls, 1);
  assert.deepEqual(admission.reserveInputs, [{ workUnits: 6, nowMs: NOW_MS }]);
  assert.deepEqual(admission.settlements, [{
    reservationId: "aggregate-reservation-1",
    outcome: "settled",
    nowMs: NOW_MS,
  }]);
  assert.equal(body.contract_version, "site_ready_case_packet.v1");
  assert.equal(body.bounded_work_summary.model_classified_count, 0);
  assert.equal(
    body.relation_candidates.filter((item) => item.relation_type === "supersedes").length,
    0,
  );
  assert.equal(
    body.relation_candidates.filter((item) => item.relation_type === "correction").length,
    0,
  );
  assert.equal(body.candidate_canonical_boundary.canonical_mutation, "none");
  assert.doesNotMatch(
    JSON.stringify(body),
    /captured_live_source_text_span|captured_source_text_containment_only|captured_body_sha256|normalized_text_sha256|normalized_text/,
  );
});

test("public live internal-envelope capture failure preserves the live investigation and settlement", async () => {
  const admission = new FakeAdmissionStore();
  const fixture = publicLiveInternalFixture();
  let internalRuns = 0;
  let captureCalls = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({
      question: "How is NASA's public mission plan changing across official updates?",
      sourceLimit: 3,
      discoveryProfile: "standard",
    }),
    {
      getRuntime: async () => runtime(admission),
      nowMs: () => NOW_MS,
      nowISO: () => NOW_ISO,
      runLiveInternal: async () => {
        internalRuns += 1;
        return fixture.envelope;
      },
      capture: {
        nowMs: () => NOW_MS,
        nowISO: () => NOW_ISO,
        fetcher: (async () => {
          captureCalls += 1;
          return new Response("private capture failure body", {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }) as typeof fetch,
      },
    },
  );
  const body = await response.json() as SiteReadyCasePacket;
  assert.equal(response.status, 200);
  assert.deepEqual(body, fixture.expectedPacket);
  assert.equal(body.mode, "live");
  assert.equal(body.status, "live");
  assert.equal(internalRuns, 1);
  assert.equal(captureCalls, 1);
  assert.deepEqual(admission.reserveInputs, [{ workUnits: 6, nowMs: NOW_MS }]);
  assert.deepEqual(admission.settlements, [{
    reservationId: "aggregate-reservation-1",
    outcome: "settled",
    nowMs: NOW_MS,
  }]);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /private capture failure body/);
  assert.doesNotMatch(serialized, /captured_|normalized_text/);
  assert.equal(body.bounded_work_summary.model_classified_count, 0);
  assert.equal(body.candidate_canonical_boundary.canonical_mutation, "none");
});

test("provider failure, deadline, spend boundary, and unexpected exception all release admission", async () => {
  const cases = [
    {
      label: "provider failure",
      error: new AnalysisFailure("provider_failure"),
      expectedStatus: 200,
      expectedOutcome: "failed" as const,
      expectedCode: null,
    },
    {
      label: "deadline",
      error: new AnalysisFailure("workflow_deadline_exceeded"),
      expectedStatus: 504,
      expectedOutcome: "timed_out" as const,
      expectedCode: "workflow_deadline_exceeded",
    },
    {
      label: "hard spend",
      error: new AnalysisFailure("service_spend_limit_reached"),
      expectedStatus: 429,
      expectedOutcome: "failed" as const,
      expectedCode: "service_spend_limit_reached",
    },
    {
      label: "unexpected",
      error: new Error("private database and provider internals"),
      expectedStatus: 500,
      expectedOutcome: "failed" as const,
      expectedCode: "server_route_failure",
    },
  ];

  for (const item of cases) {
    const admission = new FakeAdmissionStore();
    const response = await handlePublicLiveLineageRequest(
      publicRequest({ question: "How is public access changing for residents?" }),
      {
        getRuntime: async () => runtime(admission),
        nowMs: () => NOW_MS,
        nowISO: () => NOW_ISO,
        runLive: async () => {
          throw item.error;
        },
      },
    );
    const serialized = JSON.stringify(await response.json());
    assert.equal(response.status, item.expectedStatus, item.label);
    if (item.expectedCode) assert.match(serialized, new RegExp(item.expectedCode));
    assert.doesNotMatch(serialized, /private database|provider internals/);
    assert.deepEqual(admission.settlements, [{
      reservationId: "aggregate-reservation-1",
      outcome: item.expectedOutcome,
      nowMs: NOW_MS,
    }], item.label);
  }
});

test("admission failures are typed and never expose backend internals", async () => {
  let providerCalls = 0;
  const response = await handlePublicLiveLineageRequest(
    publicRequest({ question: "How is public access changing for residents?" }),
    {
      getRuntime: async () => {
        throw new Error("D1 private connection detail");
      },
      runLive: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    },
  );
  const serialized = JSON.stringify(await response.json());
  assert.equal(response.status, 503);
  assert.match(serialized, /service_admission_unavailable/);
  assert.doesNotMatch(serialized, /D1|connection detail/);
  assert.equal(providerCalls, 0);
});

test("composite readiness requires the flag, key, and a healthy admission backend", async () => {
  let readinessCalls = 0;
  const readyAdmission: PublicAdmissionStore = {
    isReady: async () => {
      readinessCalls += 1;
      return true;
    },
    reserve: async () => {
      throw new Error("not used");
    },
    settle: async () => {
      throw new Error("not used");
    },
  };
  assert.equal(await isPublicLiveReady({
    operatorLiveEnabled: false,
    liveEnabled: true,
    apiKey: "test-key",
    admission: readyAdmission,
  }), false);
  assert.equal(await isPublicLiveReady({
    operatorLiveEnabled: true,
    liveEnabled: false,
    apiKey: "test-key",
    admission: readyAdmission,
  }), false);
  assert.equal(await isPublicLiveReady({
    operatorLiveEnabled: true,
    liveEnabled: true,
    apiKey: undefined,
    admission: readyAdmission,
  }), false);
  assert.equal(await isPublicLiveReady({
    operatorLiveEnabled: true,
    liveEnabled: true,
    apiKey: "test-key",
    admission: null,
  }), false);
  assert.equal(readinessCalls, 0);
  assert.equal(await isPublicLiveReady({
    operatorLiveEnabled: true,
    liveEnabled: true,
    apiKey: "test-key",
    admission: readyAdmission,
  }), true);
  assert.equal(readinessCalls, 1);
  assert.equal(await isPublicLiveReady({
    operatorLiveEnabled: true,
    liveEnabled: true,
    apiKey: "test-key",
    admission: new FakeAdmissionStore(undefined, false),
  }), false);
});

test("the legacy public analysis POST is non-billable and disabled", async () => {
  const response = await postPublicAnalysis();
  const body = await response.json() as AnalysisErrorPacket;
  assert.equal(response.status, 404);
  assert.equal(body.mode, "unavailable");
  assert.equal(body.error.code, "public_analysis_route_disabled");
  assert.equal(body.canonical_mutation, "none");
});

test("capacity never substitutes the prepared example and prior packets stay intact", () => {
  const capacity: AnalysisErrorPacket = {
    mode: "unavailable",
    status: "error",
    error: {
      code: "capacity_exhausted",
      message: "safe capacity response",
    },
    canonical_mutation: "none",
  };
  for (const hadDisplayedInvestigation of [false, true]) {
    const decision = decidePublicRunResponse(capacity, {
      responseOk: false,
      hadDisplayedInvestigation,
      retryAfterSeconds: 42,
    });
    assert.equal(decision.kind, "preserve");
    assert.match(decision.message, /42 seconds/);
    assert.doesNotMatch(JSON.stringify(decision), /cooling-center|preparedCase|packet/);
  }

  const prepared = buildPreparedSiteReadyCasePacket();
  const fallback = structuredClone(prepared);
  fallback.mode = "fallback";
  fallback.status = "fallback";
  assert.equal(decidePublicRunResponse(fallback, {
    responseOk: true,
    hadDisplayedInvestigation: false,
    retryAfterSeconds: 0,
  }).kind, "replace");
  assert.equal(decidePublicRunResponse(fallback, {
    responseOk: true,
    hadDisplayedInvestigation: true,
    retryAfterSeconds: 0,
  }).kind, "preserve");
});

test("mixed day and instant precision is grouped without fabricated intra-day ordering", () => {
  const day = { value: "2025-07-15T00:00:00.000Z", precision: "day" as const };
  const morning = { value: "2025-07-15T08:00:00.000Z", precision: "instant" as const };
  const laterInstant = { value: "2025-07-15T09:00:00.000Z", precision: "instant" as const };
  const nextDay = { value: "2025-07-16T00:00:00.000Z", precision: "instant" as const };
  assert.equal(compareReviewTimestamps(day, morning), 0);
  assert.equal(compareReviewTimestamps(morning, day), 0);
  assert.ok(compareReviewTimestamps(morning, laterInstant) < 0);
  assert.ok(compareReviewTimestamps(day, nextDay) < 0);

  const grouped = groupReviewTimestampItems(
    [
      { id: "day", timestamp: day },
      { id: "later", timestamp: laterInstant },
      { id: "morning", timestamp: morning },
    ],
    (item) => item.timestamp,
    (left, right) => left.id.localeCompare(right.id),
  );
  assert.equal(grouped[0].precision, "mixed");
  assert.deepEqual(grouped[0].items.map((item) => item.id), [
    "morning",
    "later",
    "day",
  ]);

  const packet = buildPreparedSiteReadyCasePacket();
  const rows = structuredClone(packet.event_timeline_rows.slice(0, 3));
  rows[0].timeline_row_id = "timeline_z_day";
  rows[0].publication_time = day.value;
  rows[0].publication_time_precision = day.precision;
  rows[1].timeline_row_id = "timeline_z_later_instant";
  rows[1].publication_time = laterInstant.value;
  rows[1].publication_time_precision = laterInstant.precision;
  rows[2].timeline_row_id = "timeline_a_morning_instant";
  rows[2].publication_time = morning.value;
  rows[2].publication_time_precision = morning.precision;
  assert.deepEqual(
    orderTimelineRows(rows, "publication_time").map((row) => row.timeline_row_id),
    [
      "timeline_a_morning_instant",
      "timeline_z_later_instant",
      "timeline_z_day",
    ],
  );
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
