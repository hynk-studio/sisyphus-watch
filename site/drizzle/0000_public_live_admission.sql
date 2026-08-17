CREATE TABLE IF NOT EXISTS public_live_reservations (
  reservation_id TEXT PRIMARY KEY,
  work_units INTEGER NOT NULL CHECK (work_units > 0),
  hour_window_start INTEGER NOT NULL,
  day_window_start INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'settled', 'failed', 'timed_out', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  settled_at INTEGER
);

CREATE INDEX IF NOT EXISTS public_live_reservations_active_idx
  ON public_live_reservations (status, expires_at);

CREATE INDEX IF NOT EXISTS public_live_reservations_hour_idx
  ON public_live_reservations (hour_window_start);

CREATE INDEX IF NOT EXISTS public_live_reservations_day_idx
  ON public_live_reservations (day_window_start);
