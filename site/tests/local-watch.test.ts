import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CaseExplorer } from "../app/components/CaseExplorer";
import { InvestigationDeltaPanel } from "../app/components/InvestigationDeltaPanel";
import { SavedWatchCard } from "../app/components/SavedWatchCard";
import { compareInvestigationSnapshots } from "../app/lib/investigation-delta";
import {
  LOCAL_WATCH_CONTRACT_VERSION,
  LOCAL_WATCH_MAX_BYTES,
  LOCAL_WATCH_STORAGE_KEY,
  LocalWatchContractError,
  advanceLocalWatch,
  buildLocalWatchSnapshot,
  claimCandidateIdentity,
  createLocalWatch,
  forgetLocalWatch,
  normalizeHttpUrl,
  normalizedRelationEndpoints,
  readLocalWatch,
  relationIdentity,
  serializeLocalWatch,
  sourceIdentity,
  validateLocalWatchSnapshot,
  watchRecheckInput,
  writeLocalWatch,
  type LocalWatchCandidate,
  type LocalWatchRelation,
  type LocalWatchSource,
  type LocalWatchStorage,
} from "../app/lib/local-watch";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import { buildTemporalAcceptanceFixture } from "./fixtures/temporal-acceptance";

const SAVED_AT = "2030-09-21T10:00:00.000Z";
const CHECKED_AT = "2030-09-22T10:00:00.000Z";
const noop = () => undefined;

class MemoryStorage implements LocalWatchStorage {
  readonly values = new Map<string, string>();
  getCount = 0;
  setCount = 0;
  removeCount = 0;
  throwOn: "get" | "set" | "remove" | null = null;

  getItem(key: string): string | null {
    this.getCount += 1;
    if (this.throwOn === "get") throw new Error("storage unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCount += 1;
    if (this.throwOn === "set") throw new Error("quota unavailable");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removeCount += 1;
    if (this.throwOn === "remove") throw new Error("storage unavailable");
    this.values.delete(key);
  }
}

test("server render and initial Watch read perform no browser-local write", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const storage = new MemoryStorage();
  const html = renderToStaticMarkup(createElement(CaseExplorer, {
    preparedCase: packet,
    liveEnabled: true,
  }));
  assert.match(html, /What do you want to investigate/);
  assert.equal(storage.setCount, 0);
  assert.deepEqual(readLocalWatch(storage), { status: "empty" });
  assert.equal(storage.getCount, 1);
  assert.equal(storage.setCount, 0);
});

test("explicit Track creates exactly one validated compact v1 Watch and excludes internals", () => {
  const packet = buildTemporalAcceptanceFixture();
  const storage = new MemoryStorage();
  const watch = createLocalWatch(packet, SAVED_AT);
  assert.deepEqual(writeLocalWatch(storage, watch), { ok: true });
  assert.equal(storage.setCount, 1);
  assert.equal(storage.values.size, 1);
  assert.ok(storage.values.has(LOCAL_WATCH_STORAGE_KEY));

  const restored = readLocalWatch(storage);
  assert.equal(restored.status, "valid");
  if (restored.status !== "valid") throw new Error("Watch restoration failed");
  assert.equal(restored.watch.contract_version, LOCAL_WATCH_CONTRACT_VERSION);
  assert.equal(restored.watch.normalized_public_interest_question, packet.normalized_public_interest_question);
  assert.equal(restored.watch.saved_source_limit, packet.requested_source_limit);
  assert.equal(restored.watch.saved_discovery_profile, packet.discovery_profile);

  const serialized = serializeLocalWatch(restored.watch);
  for (const forbiddenKey of [
    "run_id",
    "provider_request_id",
    "search_call_id",
    "reservation_id",
    "work_unit",
    "source_id",
    "snapshot_id",
    "occurrence_id",
    "candidate_id",
    "relation_id",
    "api_provenance",
    "bounded_excerpt",
    "evidence_excerpt",
    "supporting_summary_span",
    "warnings",
    "limitations",
    "source_text_captured",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${forbiddenKey}"`));
  }
  assert.ok(serialized.length < JSON.stringify(packet).length);
});

test("a live packet alone performs no storage mutation until the explicit storage function is called", () => {
  const packet = buildTemporalAcceptanceFixture();
  const storage = new MemoryStorage();
  buildLocalWatchSnapshot(packet);
  createLocalWatch(packet, SAVED_AT);
  assert.equal(storage.setCount, 0);
  assert.equal(storage.values.size, 0);
  writeLocalWatch(storage, createLocalWatch(packet, SAVED_AT));
  assert.equal(storage.setCount, 1);
});

test("malformed, unsupported, oversized, tampered, and unavailable storage fail closed", () => {
  const storage = new MemoryStorage();
  storage.values.set(LOCAL_WATCH_STORAGE_KEY, "{not-json");
  assert.deepEqual(readLocalWatch(storage), { status: "invalid", reason: "malformed" });

  storage.values.set(LOCAL_WATCH_STORAGE_KEY, JSON.stringify({ contract_version: "future.v2" }));
  assert.deepEqual(readLocalWatch(storage), { status: "invalid", reason: "unsupported" });

  storage.values.set(LOCAL_WATCH_STORAGE_KEY, "x".repeat(LOCAL_WATCH_MAX_BYTES + 1));
  assert.deepEqual(readLocalWatch(storage), { status: "invalid", reason: "oversized" });

  const tampered = createLocalWatch(buildTemporalAcceptanceFixture(), SAVED_AT);
  tampered.snapshot.sources[0].url = `${tampered.snapshot.sources[0].url}#tampered`;
  storage.values.set(LOCAL_WATCH_STORAGE_KEY, JSON.stringify(tampered));
  assert.deepEqual(readLocalWatch(storage), { status: "invalid", reason: "malformed" });

  storage.throwOn = "get";
  assert.deepEqual(readLocalWatch(storage), { status: "unavailable" });
});

test("storage write and remove exceptions preserve prior bytes and Forget owns one exact key", () => {
  const storage = new MemoryStorage();
  const watch = createLocalWatch(buildTemporalAcceptanceFixture(), SAVED_AT);
  const prior = "prior-valid-browser-bytes";
  storage.values.set(LOCAL_WATCH_STORAGE_KEY, prior);
  storage.values.set("unrelated.site.key", "keep");
  storage.throwOn = "set";
  assert.deepEqual(writeLocalWatch(storage, watch), { ok: false, reason: "unavailable" });
  assert.equal(storage.values.get(LOCAL_WATCH_STORAGE_KEY), prior);

  storage.throwOn = "remove";
  assert.deepEqual(forgetLocalWatch(storage), { ok: false, reason: "unavailable" });
  assert.equal(storage.values.get(LOCAL_WATCH_STORAGE_KEY), prior);

  storage.throwOn = null;
  assert.deepEqual(forgetLocalWatch(storage), { ok: true });
  assert.equal(storage.values.has(LOCAL_WATCH_STORAGE_KEY), false);
  assert.equal(storage.values.get("unrelated.site.key"), "keep");
  assert.equal(storage.removeCount, 2);
});

test("a fully valid but oversized compact Watch is refused without truncation or storage mutation", () => {
  const storage = new MemoryStorage();
  const watch = createLocalWatch(buildTemporalAcceptanceFixture(), SAVED_AT);
  const sources = Array.from({ length: 8 }, (_, index) =>
    sourceRecord(
      `https://source-${index}.example.org/${"bounded-path-".repeat(110)}?edition=${index}`,
      `Bounded source ${index}`,
    )
  );
  watch.snapshot = {
    sources: sources.sort(byIdentity),
    candidates: Array.from({ length: 64 }, (_, index) => ({
      ...candidateRecord(
        `Public agency ${index}`,
        `exact candidate representation ${index}`,
        `Exact candidate display text ${index}.`,
        sources[0].identity,
      ),
      supporting_source_identities: sources.map((source) => source.identity).sort(),
    })).sort(byIdentity),
    relations: [],
  };
  assert.throws(
    () => serializeLocalWatch(watch),
    (error) => error instanceof LocalWatchContractError && error.reason === "oversized",
  );
  assert.deepEqual(writeLocalWatch(storage, watch), { ok: false, reason: "oversized" });
  assert.equal(storage.setCount, 0);
  assert.equal(storage.values.size, 0);
});

test("source canonicalization removes fragments, preserves queries, and has a deterministic URL-less fallback", () => {
  assert.equal(
    normalizeHttpUrl("HTTPS://Public.Example.org/path?q=One#section"),
    "https://public.example.org/path?q=One",
  );
  assert.equal(
    sourceIdentity({
      url: "https://public.example.org/path?q=One#section",
      domain: "ignored.example",
      publisher: "Ignored",
      title: "Ignored",
    }),
    sourceIdentity({
      url: "HTTPS://PUBLIC.EXAMPLE.ORG/path?q=One#other",
      domain: "different.example",
      publisher: "Different",
      title: "Different",
    }),
  );
  assert.notEqual(
    sourceIdentity({ url: "https://public.example.org/path?q=One", domain: "x", publisher: "x", title: "x" }),
    sourceIdentity({ url: "https://public.example.org/path?q=Two", domain: "x", publisher: "x", title: "x" }),
  );
  assert.equal(
    sourceIdentity({ url: null, domain: " EXAMPLE.org ", publisher: "Agence É", title: "Public   Notice" }),
    sourceIdentity({ url: "ftp://example.org/file", domain: "example.ORG", publisher: "AGENCE E\u0301", title: "public notice" }),
  );
  assert.equal(normalizeHttpUrl("https://user:secret@example.org/path"), null);
});

test("snapshot identity ignores run-local IDs, source snapshot IDs, and packet array order", () => {
  const packetA = buildTemporalAcceptanceFixture();
  const packetB = structuredClone(packetA);
  packetB.run_id = "different_run_id";
  packetB.case_id = "different_case_id";
  packetB.claim_occurrences[0].occurrence_id = "occurrence_live_different_local_id";
  packetB.claim_occurrences[0].claim_id = "different_candidate_local_id";
  packetB.claim_occurrences[0].snapshot_id = "different_snapshot_id";
  packetB.claim_occurrences[0].support_reference.snapshot_id = "different_snapshot_id";
  packetB.source_snapshot_summaries.forEach((source, index) => {
    source.snapshot_id = `different_source_snapshot_${index}`;
  });
  packetB.source_snapshot_summaries.reverse();
  packetB.source_bound_findings.reverse();
  packetB.actions.reverse();
  const delta = compareInvestigationSnapshots(
    buildLocalWatchSnapshot(packetA),
    buildLocalWatchSnapshot(packetB),
  );
  assert.equal(delta.has_deterministic_differences, false);
});

test("claim identity uses exact normalized actor plus representation without fuzzy matching", () => {
  assert.equal(
    claimCandidateIdentity(" Regional  Agency ", "A schedule CHANGED"),
    claimCandidateIdentity("regional agency", "a schedule changed"),
  );
  assert.notEqual(
    claimCandidateIdentity("Regional Agency", "The color changed"),
    claimCandidateIdentity("Regional Agency", "The colour changed"),
  );
  assert.notEqual(
    claimCandidateIdentity(null, "Schedule changed"),
    claimCandidateIdentity("unknown_actor", "Schedule changed"),
  );
});

test("relation identity sorts explicit symmetric types and preserves directional order", () => {
  const left = claimCandidateIdentity("Agency", "left claim");
  const right = claimCandidateIdentity("Agency", "right claim");
  assert.equal(
    relationIdentity("contradicts", left, right),
    relationIdentity("contradicts", right, left),
  );
  assert.notEqual(
    relationIdentity("correction", left, right),
    relationIdentity("correction", right, left),
  );
  assert.deepEqual(
    normalizedRelationEndpoints("same_event", right, left),
    { left: [left, right].sort()[0], right: [left, right].sort()[1] },
  );
  assert.deepEqual(
    normalizedRelationEndpoints("supersedes", right, left),
    { left: right, right: left },
  );
});

test("delta counts sources, exact candidates, supported state changes, and review-only relation signals separately", () => {
  const previous = buildLocalWatchSnapshot(buildTemporalAcceptanceFixture());
  const current = structuredClone(previous);
  const addedSource = sourceRecord("https://new.example.org/update", "New public update");
  current.sources.push(addedSource);
  current.sources.sort(byIdentity);

  const stable = current.candidates[0];
  stable.supporting_source_identities = [
    ...stable.supporting_source_identities,
    addedSource.identity,
  ].sort();
  stable.confidences = ["high"];
  stable.publication_times = [{ value: "2030-09-09T00:00:00.000Z", precision: "day" }];

  const addedCandidate = candidateRecord(
    "Regional Operations Agency",
    "maintenance exercise 97 remained scheduled for september 18",
    "The agency said maintenance exercise 97 remained scheduled for September 18.",
    addedSource.identity,
  );
  current.candidates.push(addedCandidate);
  current.candidates.sort(byIdentity);
  current.relations.push(
    relationRecord("contradicts", stable.identity, addedCandidate.identity),
    relationRecord("correction", stable.identity, addedCandidate.identity),
    relationRecord("supersedes", stable.identity, addedCandidate.identity),
  );
  current.relations.sort(byIdentity);

  const delta = compareInvestigationSnapshots(previous, validateLocalWatchSnapshot(current));
  assert.equal(delta.new_sources.length, 1);
  assert.equal(delta.new_candidates.length, 1);
  assert.equal(delta.changed_candidates.length, 1);
  assert.deepEqual(
    delta.changed_candidates[0].changed_dimensions,
    ["supporting sources", "confidence", "publication time"],
  );
  assert.equal(delta.new_contradiction_signals.length, 1);
  assert.equal(delta.new_correction_signals.length, 1);
  assert.equal(delta.new_supersession_signals.length, 1);
  assert.equal(delta.has_deterministic_differences, true);
});

test("explicit time value and precision changes are deterministic candidate changes", () => {
  const previous = buildLocalWatchSnapshot(buildTemporalAcceptanceFixture());
  const current = structuredClone(previous);
  previous.candidates[0].assertion_times = [{
    value: "2030-09-10T00:00:00.000Z",
    precision: "day",
  }];
  current.candidates[0].assertion_times = [{
    value: "2030-09-10T00:00:00.000Z",
    precision: "instant",
  }];
  current.candidates[0].event_times = [{
    value: "2030-09-18T12:00:00.000Z",
    precision: "instant",
  }];
  const delta = compareInvestigationSnapshots(
    validateLocalWatchSnapshot(previous),
    validateLocalWatchSnapshot(current),
  );
  assert.equal(delta.changed_candidates.length, 1);
  assert.deepEqual(
    delta.changed_candidates[0].changed_dimensions,
    ["assertion time", "event time"],
  );
});

test("not-returned remains neutral, uncertainty wording is excluded, and equivalent snapshots produce no difference", () => {
  const packet = buildTemporalAcceptanceFixture();
  const previous = buildLocalWatchSnapshot(packet);
  const wordingOnly = structuredClone(packet);
  wordingOnly.claim_occurrences[0].uncertainty = "Different uncertainty wording only.";
  assert.equal(
    compareInvestigationSnapshots(previous, buildLocalWatchSnapshot(wordingOnly))
      .has_deterministic_differences,
    false,
  );

  const current = structuredClone(previous);
  const absent = current.candidates.pop();
  assert.ok(absent);
  current.relations = [];
  const neutral = compareInvestigationSnapshots(previous, validateLocalWatchSnapshot(current));
  assert.equal(neutral.candidates_not_returned.length, 1);
  assert.equal(neutral.new_candidates.length, 0);

  const equivalent = compareInvestigationSnapshots(previous, structuredClone(previous));
  assert.equal(equivalent.has_deterministic_differences, false);
});

test("Watch recheck input is saved configuration and only a matching successful live packet advances baseline", () => {
  const packet = buildTemporalAcceptanceFixture();
  const watch = createLocalWatch(packet, SAVED_AT);
  assert.deepEqual(watchRecheckInput(watch), {
    question: packet.normalized_public_interest_question,
    sourceLimit: 3,
    discoveryProfile: "standard",
  });

  const nextPacket = structuredClone(packet);
  nextPacket.run_id = "later_live_run";
  nextPacket.claim_occurrences[0].confidence = "high";
  const advanced = advanceLocalWatch(watch, nextPacket, CHECKED_AT);
  assert.equal(advanced.saved_at, SAVED_AT);
  assert.equal(advanced.last_checked_at, CHECKED_AT);
  assert.equal(
    compareInvestigationSnapshots(watch.snapshot, advanced.snapshot).changed_candidates.length,
    1,
  );

  const fallback = structuredClone(buildPreparedSiteReadyCasePacket());
  fallback.mode = "fallback";
  fallback.status = "fallback";
  fallback.discovery_profile = "standard";
  fallback.requested_source_limit = 3;
  assert.throws(
    () => advanceLocalWatch(watch, fallback, CHECKED_AT),
    LocalWatchContractError,
  );
  assert.equal(serializeLocalWatch(watch), serializeLocalWatch(createLocalWatch(packet, SAVED_AT)));
});

test("Saved Watch and Since-last-check UI expose manual, bounded, review-only semantics", () => {
  const watch = createLocalWatch(buildTemporalAcceptanceFixture(), SAVED_AT);
  const card = renderToStaticMarkup(createElement(SavedWatchCard, {
    watch,
    liveEnabled: false,
    isLoading: false,
    isWatchRechecking: false,
    cooldownRemainingSeconds: 0,
    onCheck: noop,
    onForget: noop,
  }));
  assert.match(card, /Saved watch/);
  assert.match(card, /This device/);
  assert.match(card, /Check for changes/);
  assert.match(card, /Check for changes<\/button>/);
  assert.match(card, /disabled=""/);
  assert.match(card, />Forget<\/button>/);
  assert.match(card, /checking is disabled/);

  const delta = compareInvestigationSnapshots(watch.snapshot, watch.snapshot);
  const panel = renderToStaticMarkup(createElement(InvestigationDeltaPanel, {
    delta,
    previousSnapshot: watch.snapshot,
    currentSnapshot: watch.snapshot,
    previousCheckedAt: watch.last_checked_at,
    baselineUpdateState: "updated",
  }));
  assert.match(panel, /Since last check/);
  assert.match(panel, /No deterministic differences were found between these two bounded checks/);
  assert.match(panel, /does not prove that nothing changed/);
  assert.match(panel, /review candidates/);
  assert.match(panel, /not evidence of deletion, retraction, or resolution/);
});

test("production integration distinguishes Watch recheck and preserves baseline across normal, expansion, prepared, failure, and Forget paths", () => {
  const source = readFileSync(
    new URL("../app/components/InvestigationExplorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /runKind === "watch_recheck"[\s\S]*?advanceLocalWatch/);
  assert.match(source, /hadDisplayedInvestigation \|\| runKind === "watch_recheck"/);
  assert.match(source, /if \(runKind !== "watch_recheck"\) setWatchDelta\(null\)/);
  assert.match(source, /onExpandCoverage=\{\(\) => void runAnalysis\([\s\S]*?"coverage_expansion"\)/);
  assert.equal((source.match(/setWatchDelta\(null\)/g) ?? []).length >= 4, true);

  const forgetStart = source.indexOf("function forgetSavedWatchFromDevice()");
  const forgetEnd = source.indexOf("const runNotice", forgetStart);
  assert.ok(forgetStart > 0 && forgetEnd > forgetStart);
  const forgetSource = source.slice(forgetStart, forgetEnd);
  assert.match(forgetSource, /forgetLocalWatch\(storage\)/);
  assert.match(forgetSource, /setSavedWatch\(null\)/);
  assert.match(forgetSource, /setWatchDelta\(null\)/);
  assert.doesNotMatch(forgetSource, /fetch\(|\/api\/lineage/);

  assert.match(source, /packet.mode === "live"[\s\S]*?Track this topic on this device/);
  assert.match(source, /A different Saved Watch already exists/);
  assert.match(source, /Cancel/);
  assert.match(source, /Replace saved Watch/);
});

function sourceRecord(url: string, title: string): LocalWatchSource {
  const source = {
    identity: "",
    title,
    url: normalizeHttpUrl(url),
    domain: new URL(url).hostname,
    publisher: "Public Update Desk",
    published_at: "2030-09-09T00:00:00.000Z",
    published_at_precision: "day" as const,
  };
  source.identity = sourceIdentity(source);
  return source;
}

function candidateRecord(
  actor: string | null,
  normalizedRepresentation: string,
  text: string,
  source: string,
): LocalWatchCandidate {
  return {
    identity: claimCandidateIdentity(actor, normalizedRepresentation),
    actor,
    text,
    normalized_claim_representation: normalizedRepresentation,
    supporting_source_identities: [source],
    confidences: ["medium"],
    assertion_times: [],
    event_times: [],
    publication_times: [],
  };
}

function relationRecord(
  relationType: "contradicts" | "correction" | "supersedes",
  left: string,
  right: string,
): LocalWatchRelation {
  const endpoints = normalizedRelationEndpoints(relationType, left, right);
  return {
    identity: relationIdentity(relationType, endpoints.left, endpoints.right),
    relation_type: relationType,
    left_claim_identity: endpoints.left,
    right_claim_identity: endpoints.right,
  };
}

function byIdentity<T extends { identity: string }>(left: T, right: T): number {
  return left.identity.localeCompare(right.identity);
}
