import assert from "node:assert/strict";
import test from "node:test";

import { firstPayoffForPacket } from "../app/components/FirstPayoff";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import type { SiteReadyCasePacket } from "../app/lib/lineage/contracts";
import {
  hasClearlyIncompleteTail,
  isSuitableForProminentReviewText,
  retainBoundedModelSummary,
} from "../app/lib/reviewer-text";

const RECOVERED_HARD_BOUND_SUMMARIES = [
  {
    value: "On August 11, Saskatoon Transit announced that smart-card sales and reloads had resumed at participating vendors and the Customer Service Centre. The exceptional permission to board because reloading was unavailable was no longer presented; instead, the notice returned to the requirement for valid fare payment, while reiterating that active cards, mobile tickets, and cash remained available. It also reminded riders to exchange old cards before September 1, with the $5 activation fee waived for a",
    retainedEnding: "cash remained available.",
    rejectedTail: "waived for a",
    length: 500,
  },
  {
    value: "By the August 14 update, the assessment had deteriorated substantially: 71% of England by land area was in drought, no areas remained at normal status, and North East and Yorkshire had moved into prolonged dry weather. Reservoir storage had fallen to 65.9% and over 27 million people faced water-use restrictions. The response had escalated from preparedness to formal spray-abstraction restrictions in parts of East Anglia, consideration of restrictions elsewhere, strengthened monitoring, and wider",
    retainedEnding: "water-use restrictions.",
    rejectedTail: "and wider",
    length: 500,
  },
  {
    value: "The Commission’s current overview reflects the post–AI Omnibus timetable: the Act entered into force on 1 August 2024; prohibitions and AI-literacy obligations applied from 2 February 2025; GPAI obligations from 2 August 2025; enforcement powers and other rules began on 2 August 2026; Annex III high-risk rules were deferred to 2 December 2027; and Annex I product-related high-risk rules to 2 August 2028. It also explains that the Omnibus entered into force on 27 July 2026 and links the revised,",
    retainedEnding: "2 August 2028.",
    rejectedTail: "links the revised,",
    length: 499,
  },
] as const;

test("recovered hard-bound live summaries retain only complete produced sentences", () => {
  for (const recovered of RECOVERED_HARD_BOUND_SUMMARIES) {
    assert.equal(Array.from(recovered.value).length, recovered.length);
    const result = retainBoundedModelSummary(recovered.value, 500);
    assert.equal(result.trailingFragmentDiscarded, true);
    assert.equal(recovered.value.startsWith(result.text), true);
    assert.match(result.text, new RegExp(`${recovered.retainedEnding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "u"));
    assert.doesNotMatch(result.text, new RegExp(recovered.rejectedTail, "u"));
  }
});

test("summary retention leaves complete and short punctuation-free text unchanged", () => {
  for (const value of [
    "A normal complete model-generated summary remains unchanged.",
    "Service restored citywide",
    `${"A".repeat(498)}.`,
  ]) {
    assert.deepEqual(retainBoundedModelSummary(value, 500), {
      text: value,
      trailingFragmentDiscarded: false,
    });
  }

  const noSentenceBoundary = `${"bounded material ".repeat(40)}`.slice(0, 500);
  const bounded = retainBoundedModelSummary(noSentenceBoundary, 500);
  assert.equal(bounded.trailingFragmentDiscarded, true);
  assert.match(bounded.text, /…$/u);
  assert.equal(noSentenceBoundary.startsWith(bounded.text.slice(0, -1)), true);
});

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

test("prepared Start here remains unchanged and selection does not mutate the packet", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);

  assert.equal(
    firstPayoffForPacket(packet)?.text,
    "The city later updated the cooling-center list, clarified hours, and added transport support.",
  );
  assert.equal(JSON.stringify(packet), before);
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
