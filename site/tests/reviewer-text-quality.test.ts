import assert from "node:assert/strict";
import test from "node:test";

import { firstPayoffForPacket } from "../app/components/FirstPayoff";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import type { SiteReadyCasePacket } from "../app/lib/lineage/contracts";
import {
  hasClearlyIncompleteTail,
  isSuitableForProminentReviewText,
} from "../app/lib/reviewer-text";

test("prominent review text fails closed on malformed or visibly dangling tails", () => {
  assert.equal(isSuitableForProminentReviewText("The12?"), false);
  assert.equal(
    isSuitableForProminentReviewText("The agency changed its public guidance because"),
    false,
  );
  assert.equal(
    isSuitableForProminentReviewText("The agency changed its public guidance with"),
    false,
  );
  assert.equal(isSuitableForProminentReviewText("CDC recommended distancing, hygiene, or"), false);
  assert.equal(isSuitableForProminentReviewText("Broken replacement \uFFFD text"), false);

  assert.equal(isSuitableForProminentReviewText("Service restored citywide"), true);
  assert.equal(isSuitableForProminentReviewText("H5N1 guidance changed"), true);
  assert.equal(isSuitableForProminentReviewText("Section 12 remained in force."), true);

  assert.equal(hasClearlyIncompleteTail("CDC recommended distancing, hygiene, or"), true);
  assert.equal(hasClearlyIncompleteTail("Service restored citywide"), false);
});

test("live Start here skips a malformed record and keeps packet state unchanged", () => {
  const packet = livePacketWithFindingTexts([
    "The12?",
    "NASA updated its public mission schedule on August 20, 2026.",
  ]);
  const before = JSON.stringify(packet);

  const payoff = firstPayoffForPacket(packet);

  assert.equal(
    payoff?.text,
    "NASA updated its public mission schedule on August 20, 2026.",
  );
  assert.equal(JSON.stringify(packet), before);
});

test("live Start here is omitted when every eligible record is malformed", () => {
  const packet = livePacketWithFindingTexts([
    "The12?",
    "The agency changed its public guidance because",
  ]);

  assert.equal(firstPayoffForPacket(packet), null);
});

function livePacketWithFindingTexts(texts: string[]): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket()) as SiteReadyCasePacket;
  const source = packet.source_snapshot_summaries[0];
  const template = packet.source_bound_findings[0];

  Object.assign(packet, {
    mode: "live",
    status: "live",
    title: "Candidate lineage review",
    normalized_public_interest_question:
      "How did NASA update its public mission schedule?",
    source_bound_findings: texts.map((text, index) => ({
      ...template,
      finding_id: `candidate_live_finding_quality_${index}`,
      text,
      source_ids: [source.source_id],
      status: "candidate",
      origin: "live_api",
    })),
    actor_claims: [],
    actions: [],
  });

  return packet;
}
