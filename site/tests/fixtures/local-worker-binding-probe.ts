import {
  getServerEnvironmentBinding,
  getServerEnvironmentValue,
  LIVE_MODE_ENVIRONMENT_FLAG,
  OPENAI_KEY_ENVIRONMENT_NAME,
} from "../../app/lib/live-mode";
import {
  D1PublicAdmissionStore,
  PUBLIC_ADMISSION_BINDING,
  PUBLIC_ADMISSION_SCHEMA_STATEMENTS,
  asD1Database,
} from "../../app/lib/public-admission";
import productionWorker from "../../worker/index";

interface ProbeEnvironment {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
  DB: D1Database;
  [key: string]: unknown;
}

// Test-only Worker entry. The production Vite config never includes this
// diagnostic surface.
export default {
  async fetch(
    request: Request,
    environment: ProbeEnvironment,
    context: ExecutionContext,
  ): Promise<Response> {
    const productionResponse = await productionWorker.fetch(
      new Request(new URL("/api/cases", request.url)),
      environment,
      context,
    );
    if (!productionResponse.ok) {
      return new Response("Production Worker request failed.", { status: 500 });
    }
    await productionResponse.arrayBuffer();

    const accessorOpenAIKey = await getServerEnvironmentValue(
      OPENAI_KEY_ENVIRONMENT_NAME,
    );
    const accessorLiveMode = await getServerEnvironmentValue(
      LIVE_MODE_ENVIRONMENT_FLAG,
    );
    const accessorDatabase = asD1Database(
      await getServerEnvironmentBinding(PUBLIC_ADMISSION_BINDING),
    );
    const admissionProof = await proveAtomicAdmission(environment.DB);

    return Response.json({
      admission_atomic_concurrent_ceiling: admissionProof.atomicConcurrentCeiling,
      admission_aggregate_only_schema: admissionProof.aggregateOnlySchema,
      admission_daily_budget: admissionProof.dailyBudget,
      admission_db_accessor_present: accessorDatabase !== null,
      admission_db_handler_present: asD1Database(environment.DB) !== null,
      admission_double_settlement_noop: admissionProof.doubleSettlementNoop,
      admission_hourly_budget: admissionProof.hourlyBudget,
      admission_ready: admissionProof.ready,
      admission_stale_lease_reconciled: admissionProof.staleLeaseReconciled,
      openai_api_key_handler_present: isPresent(
        environment[OPENAI_KEY_ENVIRONMENT_NAME],
      ),
      openai_api_key_accessor_present: isPresent(accessorOpenAIKey),
      sisyphus_live_enabled_handler_present: isPresent(
        environment[LIVE_MODE_ENVIRONMENT_FLAG],
      ),
      sisyphus_live_enabled_accessor_present: isPresent(accessorLiveMode),
    });
  },
};

function isPresent(value: unknown): boolean {
  return typeof value === "string" && Boolean(value);
}

async function proveAtomicAdmission(database: D1Database): Promise<{
  aggregateOnlySchema: boolean;
  atomicConcurrentCeiling: boolean;
  dailyBudget: boolean;
  doubleSettlementNoop: boolean;
  hourlyBudget: boolean;
  ready: boolean;
  staleLeaseReconciled: boolean;
}> {
  await database.batch(
    PUBLIC_ADMISSION_SCHEMA_STATEMENTS.map((statement) =>
      database.prepare(statement),
    ),
  );
  await database.prepare("DELETE FROM public_live_reservations").run();
  let nextId = 1;
  const store = new D1PublicAdmissionStore(
    database,
    () => `local-worker-probe-${nextId++}`,
  );
  const nowMs = Date.UTC(2026, 7, 17, 12, 0, 0);
  const decisions = await Promise.all(
    Array.from({ length: 12 }, () => store.reserve({ workUnits: 6, nowMs })),
  );
  const reservations = decisions.flatMap((decision) =>
    decision.admitted ? [decision.reservation] : [],
  );
  const first = reservations[0];
  if (!first) {
    return {
      aggregateOnlySchema: false,
      atomicConcurrentCeiling: false,
      dailyBudget: false,
      doubleSettlementNoop: false,
      hourlyBudget: false,
      ready: await store.isReady(),
      staleLeaseReconciled: false,
    };
  }
  const firstSettlement = await store.settle({
    reservationId: first.reservationId,
    outcome: "settled",
    nowMs: nowMs + 1,
  });
  const secondSettlement = await store.settle({
    reservationId: first.reservationId,
    outcome: "failed",
    nowMs: nowMs + 2,
  });

  await database.prepare("DELETE FROM public_live_reservations").run();
  const hourlyDecisions = [];
  for (let index = 0; index < 10; index += 1) {
    const decision = await store.reserve({ workUnits: 6, nowMs });
    hourlyDecisions.push(decision);
    if (decision.admitted) {
      await store.settle({
        reservationId: decision.reservation.reservationId,
        outcome: "settled",
        nowMs: nowMs + index + 1,
      });
    }
  }
  const hourlyDenial = await store.reserve({ workUnits: 6, nowMs });

  await database.prepare("DELETE FROM public_live_reservations").run();
  const dailyDecisions = [];
  for (let hour = 0; hour < 4; hour += 1) {
    const at = nowMs + (hour * 3_600_000);
    const decision = await store.reserve({ workUnits: 60, nowMs: at });
    dailyDecisions.push(decision);
    if (decision.admitted) {
      await store.settle({
        reservationId: decision.reservation.reservationId,
        outcome: "settled",
        nowMs: at + 1,
      });
    }
  }
  const dailyDenial = await store.reserve({
    workUnits: 6,
    nowMs: nowMs + (4 * 3_600_000),
  });

  await database.prepare("DELETE FROM public_live_reservations").run();
  await Promise.all([
    store.reserve({ workUnits: 6, nowMs }),
    store.reserve({ workUnits: 6, nowMs }),
  ]);
  const afterExpiry = await store.reserve({
    workUnits: 6,
    nowMs: nowMs + 150_001,
  });
  const expiredCount = await database
    .prepare("SELECT COUNT(*) AS count FROM public_live_reservations WHERE status = 'expired'")
    .first<number>("count");

  const schema = await database
    .prepare("PRAGMA table_info(public_live_reservations)")
    .all<{ name: string }>();
  const columnNames = schema.results.map((column) => column.name).sort();
  return {
    aggregateOnlySchema: JSON.stringify(columnNames) === JSON.stringify([
      "created_at",
      "day_window_start",
      "expires_at",
      "hour_window_start",
      "reservation_id",
      "settled_at",
      "status",
      "work_units",
    ]),
    atomicConcurrentCeiling: reservations.length === 2,
    dailyBudget: dailyDecisions.every((decision) => decision.admitted)
      && !dailyDenial.admitted
      && dailyDenial.reason === "daily_capacity",
    doubleSettlementNoop: firstSettlement && !secondSettlement,
    hourlyBudget: hourlyDecisions.every((decision) => decision.admitted)
      && !hourlyDenial.admitted
      && hourlyDenial.reason === "hourly_capacity",
    ready: await store.isReady(),
    staleLeaseReconciled: afterExpiry.admitted && expiredCount === 2,
  };
}
