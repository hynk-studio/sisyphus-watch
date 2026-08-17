import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { POST as postPublicAnalysis } from "../app/api/analysis/route";
import type {
  AnalysisErrorPacket,
  AnalysisRunPacket,
} from "../app/lib/analysis/contracts";
import { AnalysisFailure } from "../app/lib/analysis/errors";
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
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
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
  datesContainingDayPrecision,
} from "../app/lib/temporal";

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
    liveEnabled: true,
    apiKey: "test-only-provider-key-material",
    admission,
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

test("the packaged D1 migration matches the aggregate-only runtime schema", () => {
  const migration = readFileSync(
    new URL("../drizzle/0000_public_live_admission.sql", import.meta.url),
    "utf8",
  );
  const normalizedMigration = migration.replace(/\s+/g, " ").trim();
  for (const statement of PUBLIC_ADMISSION_SCHEMA_STATEMENTS) {
    assert.match(
      normalizedMigration,
      new RegExp(escapeRegex(statement.replace(/\s+/g, " ").trim())),
    );
  }
  assert.doesNotMatch(
    normalizedMigration,
    /question|result_packet|source_content|discovered_url|ip_address|user_agent|cookie|fingerprint|account_id/i,
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
    liveEnabled: false,
    apiKey: "test-key",
    admission: readyAdmission,
  }), false);
  assert.equal(await isPublicLiveReady({
    liveEnabled: true,
    apiKey: undefined,
    admission: readyAdmission,
  }), false);
  assert.equal(await isPublicLiveReady({
    liveEnabled: true,
    apiKey: "test-key",
    admission: null,
  }), false);
  assert.equal(readinessCalls, 0);
  assert.equal(await isPublicLiveReady({
    liveEnabled: true,
    apiKey: "test-key",
    admission: readyAdmission,
  }), true);
  assert.equal(readinessCalls, 1);
  assert.equal(await isPublicLiveReady({
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
  const later = { value: "2025-07-16T00:00:00.000Z", precision: "instant" as const };
  const dayGroups = datesContainingDayPrecision([day, morning, later]);
  assert.equal(compareReviewTimestamps(day, morning, dayGroups), 0);
  assert.equal(compareReviewTimestamps(morning, day, dayGroups), 0);
  assert.ok(compareReviewTimestamps(day, later, dayGroups) < 0);

  const packet = buildPreparedSiteReadyCasePacket();
  const rows = structuredClone(packet.event_timeline_rows.slice(0, 2));
  rows[0].timeline_row_id = "timeline_z_day";
  rows[0].publication_time = day.value;
  rows[0].publication_time_precision = day.precision;
  rows[1].timeline_row_id = "timeline_a_instant";
  rows[1].publication_time = morning.value;
  rows[1].publication_time_precision = morning.precision;
  assert.deepEqual(
    orderTimelineRows(rows, "publication_time").map((row) => row.timeline_row_id),
    ["timeline_a_instant", "timeline_z_day"],
  );
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
