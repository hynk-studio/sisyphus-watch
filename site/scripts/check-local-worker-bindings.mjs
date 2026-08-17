import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = path.join(siteRoot, "node_modules/vite/bin/vite.js");
const port = 43_187;
const probeUrl = `http://127.0.0.1:${port}/__test__/runtime-binding-presence`;

const parentPresence = {
  openai_api_key_present: Boolean(process.env.OPENAI_API_KEY),
  sisyphus_live_enabled_present: process.env.SISYPHUS_LIVE_ENABLED === "true",
};

if (!parentPresence.openai_api_key_present || !parentPresence.sisyphus_live_enabled_present) {
  console.error(
    `FAIL parent binding presence openai_api_key_present=${parentPresence.openai_api_key_present} sisyphus_live_enabled_present=${parentPresence.sisyphus_live_enabled_present}`,
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    viteEntry,
    "--config",
    "tests/fixtures/local-worker-binding-probe.vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
    "--clearScreen",
    "false",
  ],
  {
    cwd: siteRoot,
    stdio: "ignore",
  },
);

try {
  const body = await waitForProbe();
  assert.deepEqual(Object.keys(body).sort(), [
    "admission_aggregate_only_schema",
    "admission_atomic_concurrent_ceiling",
    "admission_daily_budget",
    "admission_db_accessor_present",
    "admission_db_handler_present",
    "admission_double_settlement_noop",
    "admission_hourly_budget",
    "admission_ready",
    "admission_stale_lease_reconciled",
    "openai_api_key_accessor_present",
    "openai_api_key_handler_present",
    "sisyphus_live_enabled_accessor_present",
    "sisyphus_live_enabled_handler_present",
  ]);
  assert.equal(body.admission_db_handler_present, true);
  assert.equal(body.admission_db_accessor_present, true);
  assert.equal(body.admission_ready, true);
  assert.equal(body.admission_atomic_concurrent_ceiling, true);
  assert.equal(body.admission_double_settlement_noop, true);
  assert.equal(body.admission_hourly_budget, true);
  assert.equal(body.admission_daily_budget, true);
  assert.equal(body.admission_stale_lease_reconciled, true);
  assert.equal(body.admission_aggregate_only_schema, true);
  assert.equal(body.openai_api_key_handler_present, true);
  assert.equal(body.openai_api_key_accessor_present, true);
  assert.equal(body.sisyphus_live_enabled_handler_present, true);
  assert.equal(body.sisyphus_live_enabled_accessor_present, true);
  console.log(
    `PASS Worker binding presence admission_db_handler_present=${body.admission_db_handler_present} admission_db_accessor_present=${body.admission_db_accessor_present} admission_ready=${body.admission_ready} admission_atomic_concurrent_ceiling=${body.admission_atomic_concurrent_ceiling} admission_hourly_budget=${body.admission_hourly_budget} admission_daily_budget=${body.admission_daily_budget} admission_stale_lease_reconciled=${body.admission_stale_lease_reconciled} admission_double_settlement_noop=${body.admission_double_settlement_noop} admission_aggregate_only_schema=${body.admission_aggregate_only_schema} openai_api_key_handler_present=${body.openai_api_key_handler_present} openai_api_key_accessor_present=${body.openai_api_key_accessor_present} sisyphus_live_enabled_handler_present=${body.sisyphus_live_enabled_handler_present} sisyphus_live_enabled_accessor_present=${body.sisyphus_live_enabled_accessor_present}`,
  );
} finally {
  await stopChild();
}

async function waitForProbe() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Local Worker runtime exited before the presence check.");
    }
    try {
      const response = await fetch(probeUrl);
      if (!response.ok) {
        throw new Error(`Presence check returned HTTP ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error("Timed out waiting for the local Worker runtime.");
}

async function stopChild() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    once(child, "exit").then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}
