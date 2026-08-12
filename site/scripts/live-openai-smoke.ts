import assert from "node:assert/strict";
import { AnalysisFailure } from "../app/lib/analysis/errors";
import { runOpenAIAnalysisWithKey } from "../app/lib/analysis/openai-adapter";

if (process.env.RUN_OPENAI_LIVE_SMOKE !== "1") {
  console.log(
    "SKIP live OpenAI smoke is opt-in; set RUN_OPENAI_LIVE_SMOKE=1 to authorize a potentially billable call",
  );
  process.exit(0);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("FAIL RUN_OPENAI_LIVE_SMOKE=1 but OPENAI_API_KEY is unavailable");
  process.exit(1);
}

try {
  const packet = await runOpenAIAnalysisWithKey({
    apiKey,
    question: "What public guidance is currently available for heatwave cooling centers?",
    sourceLimit: 1,
    generatedAt: new Date().toISOString(),
  });

  assert.equal(packet.status, "live");
  assert.equal(packet.canonical_mutation, "none");
  assert.ok(packet.actual_source_count >= 1 && packet.actual_source_count <= 1);
  assert.ok(packet.candidate_ids.every((id) => id.startsWith("candidate_live_")));
  console.log(
    `PASS live OpenAI smoke completed with ${packet.actual_source_count} source and ${packet.candidate_ids.length} review-only candidates`,
  );
} catch (error) {
  const code = error instanceof AnalysisFailure ? error.code : "unexpected_failure";
  console.error(`FAIL live OpenAI smoke did not complete (${code})`);
  process.exitCode = 1;
}
