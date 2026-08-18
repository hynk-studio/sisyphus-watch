import assert from "node:assert/strict";
import test from "node:test";

import { AnalysisFailure } from "../app/lib/analysis/errors";
import {
  getPublicLiveRuntime,
  isPublicLiveReady,
  LIVE_MODE_ENVIRONMENT_FLAG,
  OPENAI_KEY_ENVIRONMENT_NAME,
  type PublicLiveRuntime,
} from "../app/lib/live-mode";
import {
  createPublicLiveDiagnosticEvent,
  PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
  PUBLIC_LIVE_DIAGNOSTIC_STAGES,
  type PublicLiveDiagnosticEvent,
  type PublicLiveDiagnosticSink,
} from "../app/lib/public-live-diagnostics";
import {
  type AdmissionDecision,
  type PublicAdmissionStore,
} from "../app/lib/public-admission";
import { handlePublicLiveLineageRequest } from "../app/lib/public-live-handler";

const NOW_MS = Date.UTC(2026, 7, 18, 12, 0, 0);
const FORBIDDEN_API_KEY = "test-only-api-key-material-must-not-log";
const FORBIDDEN_QUESTION = "How is private question text changing?";
const FORBIDDEN_SOURCE_URL = "https://private.example/source";
const FORBIDDEN_IP = "192.0.2.44";

function captureDiagnostics(): {
  events: PublicLiveDiagnosticEvent[];
  sink: PublicLiveDiagnosticSink;
} {
  const events: PublicLiveDiagnosticEvent[] = [];
  return {
    events,
    sink: (event) => events.push({ ...event }),
  };
}

function databaseBinding(options: { schemaProbeFails?: boolean } = {}) {
  return {
    prepare: () => ({
      first: async () => {
        if (options.schemaProbeFails) {
          throw new Error(
            `${FORBIDDEN_QUESTION} ${FORBIDDEN_API_KEY} ${FORBIDDEN_SOURCE_URL}`,
          );
        }
        return { ready: 1 };
      },
    }),
    batch: async () => [],
  };
}

async function resolveRuntime(
  sink: PublicLiveDiagnosticSink,
  options: {
    apiKey?: string;
    binding?: unknown;
    workerEnvironmentImportSucceeded?: boolean;
  },
): Promise<PublicLiveRuntime> {
  return getPublicLiveRuntime({
    diagnostics: sink,
    readEnvironmentValue: async (name) => {
      if (name === LIVE_MODE_ENVIRONMENT_FLAG) return "true";
      if (name === OPENAI_KEY_ENVIRONMENT_NAME) return options.apiKey;
      return undefined;
    },
    resolveEnvironmentBinding: async () => ({
      value: options.binding,
      workerEnvironmentImportSucceeded:
        options.workerEnvironmentImportSucceeded ?? true,
    }),
  });
}

function runtimeWithAdmission(
  admission: PublicAdmissionStore,
  sink: PublicLiveDiagnosticSink,
): PublicLiveRuntime {
  return {
    liveEnabled: true,
    apiKey: FORBIDDEN_API_KEY,
    admission,
    diagnostics: {
      sink,
      workerEnvironmentImportSucceeded: true,
      dbBindingPresent: true,
      prepareCallable: true,
      batchCallable: true,
    },
  };
}

function publicRequest(): Request {
  return new Request("http://site.local/api/lineage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "private-user-agent-must-not-log",
      "x-forwarded-for": FORBIDDEN_IP,
    },
    body: JSON.stringify({
      question: FORBIDDEN_QUESTION,
      sourceLimit: 3,
      discoveryProfile: "standard",
      sourceUrl: FORBIDDEN_SOURCE_URL,
    }),
  });
}

function validPublicRequest(): Request {
  return new Request("http://site.local/api/lineage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "private-user-agent-must-not-log",
      "x-forwarded-for": FORBIDDEN_IP,
    },
    body: JSON.stringify({
      question: FORBIDDEN_QUESTION,
      sourceLimit: 3,
      discoveryProfile: "standard",
    }),
  });
}

test("public-live diagnostics expose a fixed infrastructure-only stage schema", () => {
  assert.deepEqual(PUBLIC_LIVE_DIAGNOSTIC_STAGES, [
    "live_flag_disabled",
    "api_key_missing",
    "db_binding_missing",
    "db_binding_invalid_shape",
    "schema_probe_failed",
    "runtime_ready",
    "runtime_resolution_failed",
    "reserve_entered",
    "reserve_failed",
    "reserve_succeeded",
    "settlement_failed",
  ]);

  class PrivateRuntimeFailure extends Error {}
  const error = Object.assign(
    new PrivateRuntimeFailure(
      `${FORBIDDEN_QUESTION} ${FORBIDDEN_API_KEY} ${FORBIDDEN_SOURCE_URL}`,
    ),
    {
      code: "D1_BATCH_FAILED",
      cookie: "private-cookie",
      ip: FORBIDDEN_IP,
      userAgent: "private-user-agent-must-not-log",
    },
  );
  const event = createPublicLiveDiagnosticEvent("reserve_failed", {
    apiKeyPresent: true,
    dbBindingPresent: true,
    error,
  });
  assert.deepEqual(event, {
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "reserve_failed",
    api_key_present: true,
    db_binding_present: true,
    error_name: "PrivateRuntimeFailure",
    error_code: "D1_BATCH_FAILED",
  });
  assertInfrastructureOnly(JSON.stringify(event));
});

test("missing API key reports only presence state", async () => {
  const capture = captureDiagnostics();
  const runtime = await resolveRuntime(capture.sink, {
    apiKey: undefined,
    binding: databaseBinding(),
  });
  assert.equal(await isPublicLiveReady(runtime), false);
  assert.deepEqual(capture.events, [{
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "api_key_missing",
    live_flag_enabled: true,
    api_key_present: false,
  }]);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("disabled live flag reports the normalized boolean without reading bindings", async () => {
  const capture = captureDiagnostics();
  let bindingReads = 0;
  const runtime = await getPublicLiveRuntime({
    diagnostics: capture.sink,
    readEnvironmentValue: async (name) =>
      name === LIVE_MODE_ENVIRONMENT_FLAG ? " disabled " : FORBIDDEN_API_KEY,
    resolveEnvironmentBinding: async () => {
      bindingReads += 1;
      return {
        value: databaseBinding(),
        workerEnvironmentImportSucceeded: true,
      };
    },
  });
  assert.equal(await isPublicLiveReady(runtime), false);
  assert.equal(bindingReads, 0);
  assert.deepEqual(capture.events, [{
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "live_flag_disabled",
    live_flag_enabled: false,
  }]);
});

test("missing DB binding reports import and binding presence booleans", async () => {
  const capture = captureDiagnostics();
  const runtime = await resolveRuntime(capture.sink, {
    apiKey: FORBIDDEN_API_KEY,
    binding: undefined,
    workerEnvironmentImportSucceeded: false,
  });
  assert.equal(await isPublicLiveReady(runtime), false);
  assert.deepEqual(capture.events, [{
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "db_binding_missing",
    live_flag_enabled: true,
    api_key_present: true,
    worker_environment_import_succeeded: false,
    db_binding_present: false,
    prepare_callable: false,
    batch_callable: false,
  }]);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("partial DB method shapes are classified as invalid", async () => {
  for (const binding of [
    { prepare: () => ({}) },
    { batch: async () => [] },
  ]) {
    const capture = captureDiagnostics();
    const runtime = await resolveRuntime(capture.sink, {
      apiKey: FORBIDDEN_API_KEY,
      binding,
    });
    assert.equal(await isPublicLiveReady(runtime), false);
    assert.equal(capture.events.length, 1);
    assert.equal(capture.events[0].stage, "db_binding_invalid_shape");
    assert.equal(capture.events[0].db_binding_present, true);
    assert.equal(
      capture.events[0].prepare_callable,
      "prepare" in binding,
    );
    assert.equal(capture.events[0].batch_callable, "batch" in binding);
    assertInfrastructureOnly(JSON.stringify(capture.events));
  }
});

test("schema probe failure emits only its bounded stage", async () => {
  const capture = captureDiagnostics();
  const runtime = await resolveRuntime(capture.sink, {
    apiKey: FORBIDDEN_API_KEY,
    binding: databaseBinding({ schemaProbeFails: true }),
  });
  assert.equal(await isPublicLiveReady(runtime), false);
  assert.deepEqual(capture.events, [{
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "schema_probe_failed",
  }]);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("successful readiness remains true and reports bounded component state", async () => {
  const capture = captureDiagnostics();
  const runtime = await resolveRuntime(capture.sink, {
    apiKey: FORBIDDEN_API_KEY,
    binding: databaseBinding(),
  });
  assert.equal(await isPublicLiveReady(runtime), true);
  assert.deepEqual(capture.events, [{
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "runtime_ready",
    live_flag_enabled: true,
    api_key_present: true,
    worker_environment_import_succeeded: true,
    db_binding_present: true,
    prepare_callable: true,
    batch_callable: true,
  }]);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("reserve failure keeps the generic 503 and logs no request data", async () => {
  const capture = captureDiagnostics();
  const reserveInputs: Array<{ workUnits: number; nowMs: number }> = [];
  let providerCalls = 0;
  const error = Object.assign(
    new Error(
      `${FORBIDDEN_QUESTION} ${FORBIDDEN_API_KEY} ${FORBIDDEN_SOURCE_URL}`,
    ),
    { code: "D1_BATCH_FAILED" },
  );
  const admission: PublicAdmissionStore = {
    isReady: async () => true,
    reserve: async (input) => {
      reserveInputs.push(input);
      throw error;
    },
    settle: async () => false,
  };
  const response = await handlePublicLiveLineageRequest(validPublicRequest(), {
    diagnostics: capture.sink,
    getRuntime: async () => runtimeWithAdmission(admission, capture.sink),
    nowMs: () => NOW_MS,
    runLive: async () => {
      providerCalls += 1;
      throw new Error("provider must not run");
    },
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    mode: "unavailable",
    status: "error",
    error: {
      code: "service_admission_unavailable",
      message:
        "Public live admission is unavailable. The prepared example remains available as a separate choice.",
    },
    canonical_mutation: "none",
  });
  assert.deepEqual(reserveInputs, [{ workUnits: 6, nowMs: NOW_MS }]);
  assert.equal(providerCalls, 0);
  assert.deepEqual(capture.events.map((event) => event.stage), [
    "reserve_entered",
    "reserve_failed",
  ]);
  assert.equal(capture.events[1].error_name, "Error");
  assert.equal(capture.events[1].error_code, "D1_BATCH_FAILED");
  assert.doesNotMatch(JSON.stringify(body), /sisyphus_public_live_runtime|reserve_/);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("runtime resolution failure stays generic and sanitizes the exception", async () => {
  const capture = captureDiagnostics();
  const failure = Object.assign(
    new Error(`${FORBIDDEN_API_KEY} ${FORBIDDEN_QUESTION}`),
    { code: "WORKER_ENV_UNAVAILABLE" },
  );
  const response = await handlePublicLiveLineageRequest(validPublicRequest(), {
    diagnostics: capture.sink,
    getRuntime: async () => {
      throw failure;
    },
  });
  const serializedBody = JSON.stringify(await response.json());
  assert.equal(response.status, 503);
  assert.match(serializedBody, /service_admission_unavailable/);
  assert.doesNotMatch(serializedBody, /WORKER_ENV_UNAVAILABLE|runtime_resolution/);
  assert.deepEqual(capture.events, [{
    event: PUBLIC_LIVE_DIAGNOSTIC_NAMESPACE,
    stage: "runtime_resolution_failed",
    error_name: "Error",
    error_code: "WORKER_ENV_UNAVAILABLE",
  }]);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("settlement failure is distinct and preserves the generic response", async () => {
  const capture = captureDiagnostics();
  const admission: PublicAdmissionStore = {
    isReady: async () => true,
    reserve: async (): Promise<AdmissionDecision> => ({
      admitted: true,
      reservation: { reservationId: "not-logged", workUnits: 6 },
    }),
    settle: async () => false,
  };
  const response = await handlePublicLiveLineageRequest(validPublicRequest(), {
    diagnostics: capture.sink,
    getRuntime: async () => runtimeWithAdmission(admission, capture.sink),
    nowMs: () => NOW_MS,
    runLive: async () => {
      throw new AnalysisFailure("provider_failure");
    },
  });
  const serializedBody = JSON.stringify(await response.json());
  assert.equal(response.status, 503);
  assert.match(serializedBody, /service_admission_unavailable/);
  assert.doesNotMatch(serializedBody, /settlement_failed|not-logged/);
  assert.deepEqual(capture.events.map((event) => event.stage), [
    "reserve_entered",
    "reserve_succeeded",
    "settlement_failed",
  ]);
  assert.equal(capture.events[1].reservation_admitted, true);
  assertInfrastructureOnly(JSON.stringify(capture.events));
});

test("invalid input never emits runtime diagnostics", async () => {
  const capture = captureDiagnostics();
  let runtimeReads = 0;
  const response = await handlePublicLiveLineageRequest(publicRequest(), {
    diagnostics: capture.sink,
    getRuntime: async () => {
      runtimeReads += 1;
      throw new Error("not reached");
    },
  });
  assert.equal(response.status, 400);
  assert.equal(runtimeReads, 0);
  assert.deepEqual(capture.events, []);
});

function assertInfrastructureOnly(serialized: string): void {
  for (const forbidden of [
    FORBIDDEN_API_KEY,
    FORBIDDEN_QUESTION,
    FORBIDDEN_SOURCE_URL,
    FORBIDDEN_IP,
    "private-user-agent-must-not-log",
    "private-cookie",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}
