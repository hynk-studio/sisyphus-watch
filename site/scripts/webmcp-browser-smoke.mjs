import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const SITE_URL = process.env.SISYPHUS_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3000/";
const CDP_PORT = Number(process.env.SISYPHUS_BROWSER_SMOKE_CDP_PORT ?? "9222");
const EXPECTED_TOOLS = [
  "sisyphus_get_overview",
  "sisyphus_list_review_items",
  "sisyphus_inspect_review_item",
  "sisyphus_stage_evidence_walk",
  "sisyphus_focus_review_item",
  "sisyphus_open_relation_comparison",
  "sisyphus_set_review_view",
];

const chromeExecutable = findChrome();
const chrome = spawn(chromeExecutable, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=/tmp/sisyphus-webmcp-chrome-${process.pid}`,
  "about:blank",
], {
  stdio: ["ignore", "pipe", "pipe"],
});

let chromeStderr = "";
chrome.stderr.on("data", (chunk) => {
  chromeStderr += String(chunk);
  if (chromeStderr.length > 16_000) chromeStderr = chromeStderr.slice(-16_000);
});

try {
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`, 10_000);
  const target = await createTarget();
  const client = await connectCdp(target.webSocketDebuggerUrl);
  const networkUrls = [];
  client.on("Network.requestWillBeSent", (params) => {
    if (params?.request?.url) networkUrls.push(params.request.url);
  });

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        const tools = new Map();
        Object.defineProperty(globalThis, "__sisyphusWebMcpTools", {
          configurable: false,
          enumerable: false,
          value: tools,
        });
        Object.defineProperty(document, "modelContext", {
          configurable: true,
          enumerable: false,
          value: {
            registerTool: async (tool, options = {}) => {
              tools.set(tool.name, tool);
              const signal = options?.signal;
              if (signal && typeof signal.addEventListener === "function") {
                signal.addEventListener("abort", () => tools.delete(tool.name), { once: true });
              }
            },
          },
        });
      })();
    `,
  });

  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: SITE_URL });
  await loaded;

  await pollEvaluate(
    client,
    `Array.from(globalThis.__sisyphusWebMcpTools?.keys?.() ?? []).sort()`,
    (value) => Array.isArray(value) && EXPECTED_TOOLS.every((name) => value.includes(name)),
    10_000,
  );

  const registered = await evaluate(client,
    `Array.from(globalThis.__sisyphusWebMcpTools.keys()).sort()`);
  assert.deepEqual(registered, [...EXPECTED_TOOLS].sort());

  const overview = await callTool(client, "sisyphus_get_overview", {});
  assert.equal(overview.scope, "prepared_demo");
  assert.equal(overview.canonical_mutation, "none");
  assert.ok(overview.available_review_item_count > 0);

  const listed = await callTool(client, "sisyphus_list_review_items", {});
  assert.equal(listed.scope, "prepared_demo");
  assert.equal(listed.canonical_mutation, "none");
  assert.ok(Array.isArray(listed.items) && listed.items.length > 0);

  const relation = listed.items.find((item) => item.kind === "relation");
  const source = listed.items.find((item) => item.kind === "source");
  const question = listed.items.find((item) => item.kind === "unresolved_question");
  assert.ok(relation && source && question);

  const inspection = await callTool(client, "sisyphus_inspect_review_item", {
    kind: "relation",
    id: relation.id,
  });
  assert.equal(inspection.kind, "relation");
  assert.equal(inspection.returned_content_trust, "untrusted_evidence_data");
  assert.equal(inspection.canonical_mutation, "none");
  assert.equal(inspection.detail.review_status, "pending_review");

  const staged = await callTool(client, "sisyphus_stage_evidence_walk", {
    items: [source, relation, question].map((item, index) => ({
      kind: item.kind,
      id: item.id,
      rationale: `Browser smoke review item ${index + 1}`,
    })),
  });
  assert.equal(staged.ok, true);
  assert.equal(staged.staged_item_count, 3);
  assert.equal(staged.persistence, "session_ui_only");
  assert.equal(staged.canonical_mutation, "none");

  await pollEvaluate(
    client,
    `document.body.innerText.includes("Agent-proposed evidence walk")`,
    Boolean,
    5_000,
  );

  const focusResult = await callTool(client, "sisyphus_focus_review_item", {
    kind: "source",
    id: source.id,
  });
  assert.equal(focusResult.ok, true);
  assert.equal(focusResult.view, "sources");
  assert.equal(focusResult.canonical_mutation, "none");

  await pollEvaluate(
    client,
    `Boolean(document.querySelector('.detail-panel'))`,
    Boolean,
    5_000,
  );

  const comparison = await callTool(client, "sisyphus_open_relation_comparison", {
    relation_id: relation.id,
  });
  assert.equal(comparison.ok, true);
  assert.equal(comparison.review_status, "pending_review");
  assert.equal(comparison.persistence, "session_ui_only");
  assert.equal(comparison.canonical_mutation, "none");

  await pollEvaluate(
    client,
    `document.body.innerText.includes("relation comparison")`,
    Boolean,
    5_000,
  );

  const viewResult = await callTool(client, "sisyphus_set_review_view", {
    view: "timeline",
  });
  assert.equal(viewResult.ok, true);
  assert.equal(viewResult.view, "timeline");
  await pollEvaluate(
    client,
    `document.getElementById('view-tab-timeline')?.getAttribute('aria-selected') === 'true'`,
    Boolean,
    5_000,
  );

  const unexpectedNetwork = networkUrls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost"
        : false;
    } catch {
      return false;
    }
  });
  assert.deepEqual(unexpectedNetwork, []);

  const summary = {
    registered_tools: registered.length,
    staged_items: staged.staged_item_count,
    focused_source: source.id,
    compared_relation: relation.id,
    external_http_requests: unexpectedNetwork.length,
    canonical_mutation: "none",
  };
  console.log(JSON.stringify(summary, null, 2));

  client.close();
} catch (error) {
  console.error(error);
  if (chromeStderr) console.error(chromeStderr);
  process.exitCode = 1;
} finally {
  chrome.kill("SIGTERM");
}

function findChrome() {
  for (const candidate of [
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean)) {
    const result = spawnSync("which", [candidate], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error("A Chrome/Chromium executable is required for the WebMCP browser smoke.");
}

async function createTarget() {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Could not create Chrome target: ${response.status}`);
  return response.json();
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError ?? "unavailable"}`);
}

async function connectCdp(url) {
  if (typeof WebSocket !== "function") {
    throw new Error("Node WebSocket support is required for the CDP smoke harness.");
  }
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
      return;
    }
    const methodListeners = listeners.get(message.method) ?? [];
    for (const listener of [...methodListeners]) listener(message.params);
  });

  return {
    send(method, params = {}) {
      const id = ++sequence;
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return promise;
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
      return () => {
        listeners.set(method, (listeners.get(method) ?? []).filter((item) => item !== listener));
      };
    },
    once(method) {
      return new Promise((resolve) => {
        const stop = this.on(method, (params) => {
          stop();
          resolve(params);
        });
      });
    },
    close() {
      socket.close();
    },
  };
}

async function callTool(client, name, input) {
  return evaluate(
    client,
    `(async () => {
      const tool = globalThis.__sisyphusWebMcpTools.get(${JSON.stringify(name)});
      if (!tool) throw new Error('tool not registered');
      return await tool.execute(${JSON.stringify(input)});
    })()`,
  );
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "Browser evaluation failed");
  }
  return result.result?.value;
}

async function pollEvaluate(client, expression, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await evaluate(client, expression);
    if (predicate(latest)) return latest;
    await delay(100);
  }
  throw new Error(`Browser condition timed out. Latest value: ${JSON.stringify(latest)}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
