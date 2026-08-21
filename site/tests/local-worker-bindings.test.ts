import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { handleAnalysisRequest } from "../app/lib/analysis/handler";
import {
  liveAnalysisDisabledResponse,
  LIVE_MODE_ENVIRONMENT_FLAG,
  OPERATOR_LIVE_ENVIRONMENT_FLAG,
  OPENAI_KEY_ENVIRONMENT_NAME,
} from "../app/lib/live-mode";
import { buildLocalWorkerRuntimeBindings } from "../build/local-worker-bindings";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("live-disabled local bindings do not require an OpenAI secret", () => {
  for (const value of [undefined, "", "false", "1", " disabled "]) {
    const bindings = buildLocalWorkerRuntimeBindings(value);
    assert.equal(bindings.secrets, undefined);
    assert.deepEqual(
      bindings.vars,
      value ? { [LIVE_MODE_ENVIRONMENT_FLAG]: value } : {},
    );
  }
});

test("live-enabled local bindings require only OPENAI_API_KEY", () => {
  for (const value of ["true", " TRUE "]) {
    const bindings = buildLocalWorkerRuntimeBindings(value);
    assert.deepEqual(bindings.secrets, {
      required: [OPENAI_KEY_ENVIRONMENT_NAME],
    });
    assert.deepEqual(bindings.vars, {
      [LIVE_MODE_ENVIRONMENT_FLAG]: value,
    });
    assert.deepEqual(Object.keys(bindings.vars), [LIVE_MODE_ENVIRONMENT_FLAG]);
    assert.equal(OPENAI_KEY_ENVIRONMENT_NAME in bindings.vars, false);
  }
});

test("operator sponsorship is forwarded only as an explicit non-secret boolean flag", () => {
  const bindings = buildLocalWorkerRuntimeBindings("true", "true");
  assert.deepEqual(bindings.vars, {
    [LIVE_MODE_ENVIRONMENT_FLAG]: "true",
    [OPERATOR_LIVE_ENVIRONMENT_FLAG]: "true",
  });
  assert.deepEqual(bindings.secrets, {
    required: [OPENAI_KEY_ENVIRONMENT_NAME],
  });
});

test("secret values stay out of generated bindings, config source, and client assets", async () => {
  const sentinelSecret = "test-only-secret-value-never-forwarded";
  const originalSecret = process.env[OPENAI_KEY_ENVIRONMENT_NAME];
  process.env[OPENAI_KEY_ENVIRONMENT_NAME] = sentinelSecret;

  try {
    const generatedBindings = JSON.stringify(
      buildLocalWorkerRuntimeBindings("true"),
    );
    assert.doesNotMatch(generatedBindings, new RegExp(sentinelSecret));

    const configSources = await Promise.all(
      ["vite.config.ts", "build/local-worker-bindings.ts"].map((relativePath) =>
        readFile(path.join(siteRoot, relativePath), "utf8"),
      ),
    );
    for (const source of configSources) {
      assert.equal(source.includes(sentinelSecret), false);
      if (originalSecret) assert.equal(source.includes(originalSecret), false);
    }

    const clientAssets = await readTextFiles(path.join(siteRoot, "dist/client"));
    assert.ok(clientAssets.length > 0, "expected built client assets");
    for (const contents of clientAssets) {
      assert.equal(contents.includes(OPENAI_KEY_ENVIRONMENT_NAME), false);
      assert.equal(contents.includes(sentinelSecret), false);
      if (originalSecret) assert.equal(contents.includes(originalSecret), false);
    }
  } finally {
    if (originalSecret === undefined) {
      delete process.env[OPENAI_KEY_ENVIRONMENT_NAME];
    } else {
      process.env[OPENAI_KEY_ENVIRONMENT_NAME] = originalSecret;
    }
  }
});

test("prepared and missing-key paths remain deterministic without provider work", async () => {
  const disabledResponse = liveAnalysisDisabledResponse();
  assert.equal(disabledResponse.status, 503);
  assert.equal(
    ((await disabledResponse.json()) as { error: { code: string } }).error.code,
    "live_analysis_disabled",
  );

  let providerCalls = 0;
  const missingKeyResponse = await handleAnalysisRequest(
    new Request("http://site.local/api/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "How is public service access changing?",
        sourceLimit: 3,
        discoveryProfile: "standard",
      }),
    }),
    {
      apiKey: undefined,
      now: () => "2026-08-17T00:00:00.000Z",
      runLive: async () => {
        providerCalls += 1;
        throw new Error("provider work must not run");
      },
    },
  );
  const body = (await missingKeyResponse.json()) as {
    mode: string;
    status: string;
    canonical_mutation: string;
    warnings: string[];
  };
  assert.equal(missingKeyResponse.status, 200);
  assert.equal(body.mode, "fallback");
  assert.equal(body.status, "fallback");
  assert.equal(body.canonical_mutation, "none");
  assert.match(body.warnings[0], /^missing_api_key:/);
  assert.equal(providerCalls, 0);
});

async function readTextFiles(directory: string): Promise<string[]> {
  const contents: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      contents.push(...(await readTextFiles(absolutePath)));
      continue;
    }
    if (!entry.isFile() || (await stat(absolutePath)).size > 10_000_000) {
      continue;
    }
    contents.push(await readFile(absolutePath, "utf8"));
  }
  return contents;
}
