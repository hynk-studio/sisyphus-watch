import type { DiscoveryProfile } from "./source-profile";

export const PUBLIC_ADMISSION_BINDING = "DB";

export const PUBLIC_ADMISSION_LIMITS = {
  maxConcurrentInvestigations: 2,
  hourlyWorkUnits: 60,
  dailyWorkUnits: 240,
  reservationTtlMs: 150_000,
} as const;

export const PUBLIC_WORKFLOW_DEADLINE_MS = 110_000;

export const PUBLIC_ADMISSION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS public_live_reservations (
  reservation_id TEXT PRIMARY KEY,
  work_units INTEGER NOT NULL CHECK (work_units > 0),
  hour_window_start INTEGER NOT NULL,
  day_window_start INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'settled', 'failed', 'timed_out', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  settled_at INTEGER
)`,
  `CREATE INDEX IF NOT EXISTS public_live_reservations_active_idx
    ON public_live_reservations (status, expires_at)`,
  `CREATE INDEX IF NOT EXISTS public_live_reservations_hour_idx
    ON public_live_reservations (hour_window_start)`,
  `CREATE INDEX IF NOT EXISTS public_live_reservations_day_idx
    ON public_live_reservations (day_window_start)`,
] as const;

export interface PublicWorkShape {
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
}

export function calculatePublicWorkUnits(shape: PublicWorkShape): number {
  const discoveryPasses = shape.discoveryProfile === "coverage_expansion" ? 2 : 1;
  // Each discovery pass reserves one Responses request plus the configured
  // two-call built-in web-search ceiling. Each source extraction reserves one
  // request. This is a conservative work shape, not an exact cost estimate.
  return shape.sourceLimit + (discoveryPasses * 3);
}

export type AdmissionSettlement =
  | "settled"
  | "failed"
  | "timed_out";

export interface AdmissionReservation {
  reservationId: string;
  workUnits: number;
}

export type AdmissionDecision =
  | { admitted: true; reservation: AdmissionReservation }
  | {
      admitted: false;
      reason: "concurrent_capacity" | "hourly_capacity" | "daily_capacity";
      retryAfterSeconds: number;
    };

export interface PublicAdmissionStore {
  isReady(): Promise<boolean>;
  reserve(input: {
    workUnits: number;
    nowMs: number;
  }): Promise<AdmissionDecision>;
  settle(input: {
    reservationId: string;
    outcome: AdmissionSettlement;
    nowMs: number;
  }): Promise<boolean>;
}

export interface D1DatabaseBindingShape {
  bindingPresent: boolean;
  prepareCallable: boolean;
  batchCallable: boolean;
  database: D1Database | null;
}

interface AdmissionStateRow {
  active_count: number;
  hour_units: number;
  day_units: number;
  earliest_active_expiry: number | null;
}

export class D1PublicAdmissionStore implements PublicAdmissionStore {
  constructor(
    private readonly database: D1Database,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async isReady(): Promise<boolean> {
    try {
      await this.database
        .prepare("SELECT 1 FROM public_live_reservations LIMIT 1")
        .first();
      return true;
    } catch {
      return false;
    }
  }

  async reserve(input: {
    workUnits: number;
    nowMs: number;
  }): Promise<AdmissionDecision> {
    if (!Number.isInteger(input.workUnits) || input.workUnits <= 0) {
      throw new Error("Invalid public work-unit reservation.");
    }

    const reservationId = this.createId();
    const hourWindowStart = startOfUtcHour(input.nowMs);
    const dayWindowStart = startOfUtcDay(input.nowMs);
    const expiresAt = input.nowMs + PUBLIC_ADMISSION_LIMITS.reservationTtlMs;

    // D1 batch executes these statements as one database transaction. The
    // admission decision itself is inside the INSERT predicate, so concurrent
    // Worker requests never rely on an application-side read/check/write race.
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE public_live_reservations
             SET status = 'expired', settled_at = ?1
           WHERE status = 'active' AND expires_at <= ?1`,
        )
        .bind(input.nowMs),
      this.database
        .prepare(
          `DELETE FROM public_live_reservations
           WHERE day_window_start < ?1 AND expires_at <= ?2`,
        )
        .bind(dayWindowStart - 86_400_000, input.nowMs),
      this.database
        .prepare(
          `INSERT INTO public_live_reservations (
             reservation_id,
             work_units,
             hour_window_start,
             day_window_start,
             status,
             created_at,
             expires_at,
             settled_at
           )
           SELECT ?1, ?2, ?3, ?4, 'active', ?5, ?6, NULL
           WHERE (
             SELECT COUNT(*)
             FROM public_live_reservations
             WHERE status = 'active' AND expires_at > ?5
           ) < ?7
           AND COALESCE((
             SELECT SUM(work_units)
             FROM public_live_reservations
             WHERE hour_window_start = ?3
           ), 0) + ?2 <= ?8
           AND COALESCE((
             SELECT SUM(work_units)
             FROM public_live_reservations
             WHERE day_window_start = ?4
           ), 0) + ?2 <= ?9`,
        )
        .bind(
          reservationId,
          input.workUnits,
          hourWindowStart,
          dayWindowStart,
          input.nowMs,
          expiresAt,
          PUBLIC_ADMISSION_LIMITS.maxConcurrentInvestigations,
          PUBLIC_ADMISSION_LIMITS.hourlyWorkUnits,
          PUBLIC_ADMISSION_LIMITS.dailyWorkUnits,
        ),
    ]);

    const insertResult = results[2];
    if (insertResult.meta.changes === 1) {
      return {
        admitted: true,
        reservation: { reservationId, workUnits: input.workUnits },
      };
    }

    const state = await this.readState(input.nowMs, hourWindowStart, dayWindowStart);
    if (
      state.day_units + input.workUnits
      > PUBLIC_ADMISSION_LIMITS.dailyWorkUnits
    ) {
      return {
        admitted: false,
        reason: "daily_capacity",
        retryAfterSeconds: secondsUntil(startOfNextUtcDay(input.nowMs), input.nowMs),
      };
    }
    if (
      state.hour_units + input.workUnits
      > PUBLIC_ADMISSION_LIMITS.hourlyWorkUnits
    ) {
      return {
        admitted: false,
        reason: "hourly_capacity",
        retryAfterSeconds: secondsUntil(startOfNextUtcHour(input.nowMs), input.nowMs),
      };
    }
    return {
      admitted: false,
      reason: "concurrent_capacity",
      retryAfterSeconds: secondsUntil(
        state.earliest_active_expiry
          ?? input.nowMs + PUBLIC_ADMISSION_LIMITS.reservationTtlMs,
        input.nowMs,
      ),
    };
  }

  async settle(input: {
    reservationId: string;
    outcome: AdmissionSettlement;
    nowMs: number;
  }): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE public_live_reservations
           SET status = ?1, settled_at = ?2
         WHERE reservation_id = ?3 AND status = 'active'`,
      )
      .bind(input.outcome, input.nowMs, input.reservationId)
      .run();
    return result.meta.changes === 1;
  }

  private async readState(
    nowMs: number,
    hourWindowStart: number,
    dayWindowStart: number,
  ): Promise<AdmissionStateRow> {
    const row = await this.database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM public_live_reservations
             WHERE status = 'active' AND expires_at > ?1) AS active_count,
           COALESCE((SELECT SUM(work_units) FROM public_live_reservations
             WHERE hour_window_start = ?2), 0) AS hour_units,
           COALESCE((SELECT SUM(work_units) FROM public_live_reservations
             WHERE day_window_start = ?3), 0) AS day_units,
           (SELECT MIN(expires_at) FROM public_live_reservations
             WHERE status = 'active' AND expires_at > ?1) AS earliest_active_expiry`,
      )
      .bind(nowMs, hourWindowStart, dayWindowStart)
      .first<AdmissionStateRow>();

    if (!row) throw new Error("Admission state was unavailable.");
    return row;
  }
}

export function asD1Database(value: unknown): D1Database | null {
  return inspectD1DatabaseBinding(value).database;
}

export function inspectD1DatabaseBinding(
  value: unknown,
): D1DatabaseBindingShape {
  const bindingPresent = value !== undefined && value !== null;
  if (!bindingPresent || typeof value !== "object") {
    return {
      bindingPresent,
      prepareCallable: false,
      batchCallable: false,
      database: null,
    };
  }

  let prepareCallable = false;
  let batchCallable = false;
  try {
    prepareCallable = typeof (value as Partial<D1Database>).prepare === "function";
  } catch {
    // Binding-shape diagnostics fail closed without inspecting other fields.
  }
  try {
    batchCallable = typeof (value as Partial<D1Database>).batch === "function";
  } catch {
    // Binding-shape diagnostics fail closed without inspecting other fields.
  }

  return {
    bindingPresent,
    prepareCallable,
    batchCallable,
    database: prepareCallable && batchCallable ? (value as D1Database) : null,
  };
}

function startOfUtcHour(nowMs: number): number {
  const value = new Date(nowMs);
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    value.getUTCHours(),
  );
}

function startOfNextUtcHour(nowMs: number): number {
  return startOfUtcHour(nowMs) + 3_600_000;
}

function startOfUtcDay(nowMs: number): number {
  const value = new Date(nowMs);
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function startOfNextUtcDay(nowMs: number): number {
  return startOfUtcDay(nowMs) + 86_400_000;
}

function secondsUntil(targetMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((targetMs - nowMs) / 1_000));
}
