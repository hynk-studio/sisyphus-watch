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
  LOCAL_WATCH_LEGACY_CONTRACT_VERSION,
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
  type LocalWatchSnapshot,
  type LocalWatchSource,
  type LocalWatchStorage,
} from "../app/lib/local-watch";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type SiteReadyCasePacketV1,
  type SiteReadyCasePacketV2,
} from "../app/lib/lineage/contracts";
import {
  buildSavedWatchPacketA,
  buildSavedWatchPacketB,
} from "./fixtures/saved-watch";
import { buildTemporalAcceptanceFixture } from "./fixtures/temporal-acceptance";
import { buildSourceSupportedSitePacketV2Fixture } from "./fixtures/source-supported-site-packet";

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
  }));
  assert.match(html, /What do you want to investigate\?/);
  assert.match(html, /Try the prepared cooling-center example/);
  assert.equal(storage.setCount, 0);
  assert.deepEqual(readLocalWatch(storage), { status: "empty" });
  assert.equal(storage.getCount, 1);
  assert.equal(storage.setCount, 0);
});

test("explicit Track creates exactly one validated compact v2 Watch and excludes internals", () => {
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

test("real-live long claim display text compacts to a strict NFKC Watch without network work", () => {
  const displayText =
    "The agency explained that the revised schedule would standardize the inspection sequence, increase review cadence, test public notification interfaces and other systems before the exercise, and support repeated safety checks throughout the year across participating regions.";
  const packet = packetWithClaimDisplay(displayText);
  const originalPacketBytes = JSON.stringify(packet);
  const occurrence = packet.claim_occurrences[0];
  const expectedIdentity = claimCandidateIdentity(
    occurrence.actor,
    occurrence.normalized_claim_representation,
  );
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = (async () => {
    networkRequests += 1;
    throw new Error("Saved Watch construction must not use the network");
  }) as typeof fetch;

  try {
    assert.doesNotThrow(() => validateSiteReadyCasePacket(packet));
    const snapshot = buildLocalWatchSnapshot(packet);
    const candidate = snapshot.candidates.find(
      (item) => item.identity === expectedIdentity,
    );
    assert.ok(candidate);
    assert.equal(candidate.text.endsWith("..."), true);
    assert.equal(candidate.text.normalize("NFKC"), candidate.text);
    assert.ok(candidate.text.length <= 240);

    const watch = createLocalWatch(packet, SAVED_AT);
    const serialized = serializeLocalWatch(watch);
    const storage = new MemoryStorage();
    assert.deepEqual(writeLocalWatch(storage, watch), { ok: true });
    const restored = readLocalWatch(storage);
    assert.equal(restored.status, "valid");
    if (restored.status !== "valid") throw new Error("Watch restoration failed");
    assert.deepEqual(restored.watch, watch);
    assert.equal(storage.values.get(LOCAL_WATCH_STORAGE_KEY), serialized);

    const noncanonical = structuredClone(snapshot);
    const noncanonicalCandidate = noncanonical.candidates.find(
      (item) => item.identity === expectedIdentity,
    );
    assert.ok(noncanonicalCandidate);
    noncanonicalCandidate.text = noncanonicalCandidate.text.replace(/\.\.\.$/u, "…");
    assert.throws(
      () => validateLocalWatchSnapshot(noncanonical),
      LocalWatchContractError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(networkRequests, 0);
  assert.equal(JSON.stringify(packet), originalPacketBytes);
});

test("claim display compaction remains valid immediately below and above 240 code points", () => {
  for (const length of [240, 241]) {
    const displayText = "x".repeat(length);
    const packet = packetWithClaimDisplay(displayText);
    assert.doesNotThrow(() => validateSiteReadyCasePacket(packet));
    const snapshot = buildLocalWatchSnapshot(packet);
    const occurrence = packet.claim_occurrences[0];
    const candidate = snapshot.candidates.find(
      (item) => item.identity === claimCandidateIdentity(
        occurrence.actor,
        occurrence.normalized_claim_representation,
      ),
    );
    assert.ok(candidate);
    assert.equal(candidate.text.normalize("NFKC"), candidate.text);
    assert.ok(candidate.text.length <= 240);
    assert.equal(
      candidate.text,
      length === 240 ? displayText : `${"x".repeat(237)}...`,
    );
  }
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
    relation_evidence_observation: "unavailable",
    source_backed_relations: [],
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

test("Saved Watch v2 keeps the raw unresolved relation and projects one compact directed source-backed sidecar", () => {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  assert.equal(packet.source_supported_relation_signals.length, 1);
  assert.equal(packet.relation_candidates[0].relation_type, "unresolved");
  const snapshot = buildLocalWatchSnapshot(packet);
  assert.equal(snapshot.relations.length, 1);
  assert.equal(snapshot.relations[0].relation_type, "unresolved");
  assert.equal(snapshot.relation_evidence_observation, "available");
  assert.equal(snapshot.source_backed_relations.length, 1);
  const signal = packet.source_supported_relation_signals[0];
  const from = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === signal.from_occurrence_id,
  );
  const to = packet.claim_occurrences.find(
    (occurrence) => occurrence.occurrence_id === signal.to_occurrence_id,
  );
  assert.ok(from);
  assert.ok(to);
  assert.deepEqual(snapshot.source_backed_relations[0], {
    relation_identity: snapshot.relations[0].identity,
    supported_relation_type: "supersedes",
    from_claim_identity: claimCandidateIdentity(
      from.actor,
      from.normalized_claim_representation,
    ),
    to_claim_identity: claimCandidateIdentity(
      to.actor,
      to.normalized_claim_representation,
    ),
  });
  assert.equal(
    snapshot.relations.some((relation) => relation.relation_type === "supersedes"),
    false,
  );
  const serialized = serializeLocalWatch(createLocalWatch(packet, SAVED_AT));
  for (const forbiddenKey of [
    "statement_excerpt",
    "statement_source_id",
    "statement_snapshot_id",
    "target_source_id",
    "target_snapshot_id",
    "relation_candidate_id",
    "occurrence_id",
    "capture_id",
    "assessment_id",
    "proof_id",
    "hash",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${forbiddenKey}"`));
  }
});

test("Site packet v1 exposes unavailable relation evidence while v2 empty signal exposes available absence", () => {
  const v2 = buildSourceSupportedSitePacketV2Fixture();
  const v1 = sitePacketV1(v2);
  const emptyV2 = validateSiteReadyCasePacket({
    ...structuredClone(v2),
    source_supported_relation_signals: [],
  });
  assert.equal(emptyV2.contract_version, "site_ready_case_packet.v2");

  const v1Snapshot = buildLocalWatchSnapshot(v1);
  assert.equal(v1Snapshot.relation_evidence_observation, "unavailable");
  assert.deepEqual(v1Snapshot.source_backed_relations, []);

  const emptyV2Snapshot = buildLocalWatchSnapshot(emptyV2);
  assert.equal(emptyV2Snapshot.relation_evidence_observation, "available");
  assert.deepEqual(emptyV2Snapshot.source_backed_relations, []);
  assert.equal(emptyV2Snapshot.relations[0].relation_type, "unresolved");
});

test("literal Local Watch v1 reads as v2 in memory without writing and first explicit recheck persists v2 once", () => {
  const currentPacket = buildSourceSupportedSitePacketV2Fixture();
  const legacyPacket = sitePacketV1(currentPacket);
  const legacySource = createLocalWatch(legacyPacket, SAVED_AT);
  const legacyBytes = JSON.stringify({
    contract_version: LOCAL_WATCH_LEGACY_CONTRACT_VERSION,
    normalized_public_interest_question: legacySource.normalized_public_interest_question,
    saved_source_limit: legacySource.saved_source_limit,
    saved_discovery_profile: legacySource.saved_discovery_profile,
    saved_at: legacySource.saved_at,
    last_checked_at: legacySource.last_checked_at,
    snapshot: {
      sources: legacySource.snapshot.sources,
      candidates: legacySource.snapshot.candidates,
      relations: legacySource.snapshot.relations,
    },
  });
  const storage = new MemoryStorage();
  storage.values.set(LOCAL_WATCH_STORAGE_KEY, legacyBytes);

  const restored = readLocalWatch(storage);
  assert.equal(restored.status, "valid");
  if (restored.status !== "valid") throw new Error("legacy Watch restoration failed");
  assert.equal(restored.watch.contract_version, LOCAL_WATCH_CONTRACT_VERSION);
  assert.equal(restored.watch.snapshot.relation_evidence_observation, "unavailable");
  assert.deepEqual(restored.watch.snapshot.source_backed_relations, []);
  assert.deepEqual(restored.watch.snapshot.sources, legacySource.snapshot.sources);
  assert.deepEqual(restored.watch.snapshot.candidates, legacySource.snapshot.candidates);
  assert.deepEqual(restored.watch.snapshot.relations, legacySource.snapshot.relations);
  assert.equal(storage.getCount, 1);
  assert.equal(storage.setCount, 0);
  assert.equal(storage.values.get(LOCAL_WATCH_STORAGE_KEY), legacyBytes);

  const advanced = advanceLocalWatch(restored.watch, currentPacket, CHECKED_AT);
  assert.equal(advanced.contract_version, LOCAL_WATCH_CONTRACT_VERSION);
  assert.equal(advanced.snapshot.relation_evidence_observation, "available");
  assert.deepEqual(writeLocalWatch(storage, advanced), { ok: true });
  assert.equal(storage.setCount, 1);
  assert.equal(
    JSON.parse(storage.values.get(LOCAL_WATCH_STORAGE_KEY) ?? "null").contract_version,
    LOCAL_WATCH_CONTRACT_VERSION,
  );
});

test("Local Watch v2 evidence sidecar validation fails closed on every malformed form", () => {
  const valid = buildLocalWatchSnapshot(buildSourceSupportedSitePacketV2Fixture());
  const rawRelation = valid.relations[0];
  const sourceBacked = valid.source_backed_relations[0];

  assertInvalidSnapshot(valid, (snapshot) => {
    snapshot.source_backed_relations[0].relation_identity = "relation:missing";
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    const promoted = relationRecord(
      "supersedes",
      rawRelation.left_claim_identity,
      rawRelation.right_claim_identity,
    );
    snapshot.relations.push(promoted);
    snapshot.relations.sort(byIdentity);
    snapshot.source_backed_relations[0].relation_identity = promoted.identity;
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    snapshot.source_backed_relations[0].from_claim_identity = "claim:missing";
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    snapshot.source_backed_relations[0].to_claim_identity = "claim:missing";
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    snapshot.source_backed_relations[0].to_claim_identity =
      snapshot.source_backed_relations[0].from_claim_identity;
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    const extra = candidateRecord(
      "Different agency",
      "a third unrelated candidate",
      "A third unrelated candidate.",
      snapshot.sources[0].identity,
    );
    snapshot.candidates.push(extra);
    snapshot.candidates.sort(byIdentity);
    snapshot.source_backed_relations[0].to_claim_identity = extra.identity;
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    snapshot.source_backed_relations.push(structuredClone(sourceBacked));
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    const extra = candidateRecord(
      "Additional agency",
      "an additional relation endpoint",
      "An additional relation endpoint.",
      snapshot.sources[0].identity,
    );
    snapshot.candidates.push(extra);
    snapshot.candidates.sort(byIdentity);
    const secondRaw = relationRecord(
      "unresolved",
      sourceBacked.from_claim_identity,
      extra.identity,
    );
    snapshot.relations.push(secondRaw);
    snapshot.relations.sort(byIdentity);
    snapshot.source_backed_relations.push({
      relation_identity: secondRaw.identity,
      supported_relation_type: "supersedes",
      from_claim_identity: sourceBacked.from_claim_identity,
      to_claim_identity: extra.identity,
    });
    snapshot.source_backed_relations.sort((left, right) =>
      left.relation_identity < right.relation_identity ? -1 : 1
    );
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    const mutable = snapshot.source_backed_relations[0] as unknown as {
      supported_relation_type: string;
    };
    mutable.supported_relation_type = "correction";
  });
  assertInvalidSnapshot(valid, (snapshot) => {
    snapshot.relation_evidence_observation = "unavailable";
  });
  for (const forbiddenKey of [
    "statement_excerpt",
    "source_id",
    "snapshot_id",
    "proof_id",
    "capture_id",
    "hash",
  ]) {
    assertInvalidSnapshot(valid, (snapshot) => {
      Object.assign(snapshot.source_backed_relations[0], {
        [forbiddenKey]: "injected",
      });
    });
  }
});

test("Unicode source and claim identities use one locale-independent canonical order", () => {
  const packet = buildUnicodeOrderingPacket();
  const snapshot = buildLocalWatchSnapshot(packet);
  assert.deepEqual(validateLocalWatchSnapshot(snapshot), snapshot);

  const unicodeSources = snapshot.sources.filter((source) =>
    source.domain === "z" || source.domain === "å"
  );
  assert.deepEqual(unicodeSources.map((source) => source.domain), ["z", "å"]);
  assert.equal(unicodeSources[0].identity < unicodeSources[1].identity, true);

  const zClaim = snapshot.candidates.find((candidate) => candidate.actor === "z");
  const aaClaim = snapshot.candidates.find((candidate) => candidate.actor === "å");
  assert.ok(zClaim);
  assert.ok(aaClaim);
  assert.equal(zClaim.identity < aaClaim.identity, true);
  assert.deepEqual(
    snapshot.candidates.map((candidate) => candidate.identity),
    [zClaim.identity, aaClaim.identity],
  );

  const contradiction = snapshot.relations.find(
    (relation) => relation.relation_type === "contradicts",
  );
  assert.ok(contradiction);
  assert.deepEqual(
    {
      left: contradiction.left_claim_identity,
      right: contradiction.right_claim_identity,
    },
    { left: zClaim.identity, right: aaClaim.identity },
  );
  assert.equal(
    relationIdentity("contradicts", zClaim.identity, aaClaim.identity),
    relationIdentity("contradicts", aaClaim.identity, zClaim.identity),
  );

  const correction = snapshot.relations.find(
    (relation) => relation.relation_type === "correction",
  );
  assert.ok(correction);
  assert.deepEqual(
    {
      left: correction.left_claim_identity,
      right: correction.right_claim_identity,
    },
    { left: zClaim.identity, right: aaClaim.identity },
  );
  assert.deepEqual(
    normalizedRelationEndpoints("supersedes", aaClaim.identity, zClaim.identity),
    { left: aaClaim.identity, right: zClaim.identity },
  );

  const reorderedPacket = structuredClone(packet);
  reorderedPacket.source_snapshot_summaries.reverse();
  reorderedPacket.actor_claims.reverse();
  reorderedPacket.claim_occurrences.reverse();
  reorderedPacket.relation_candidates.reverse();
  const reorderedSnapshot = buildLocalWatchSnapshot(reorderedPacket);
  assert.deepEqual(reorderedSnapshot, snapshot);
  assert.equal(JSON.stringify(reorderedSnapshot), JSON.stringify(snapshot));

  const implementation = readFileSync(
    new URL("../app/lib/local-watch.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(implementation, /\.localeCompare\(/);
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

test("Saved Watch packet A to B delta counts remain unchanged", () => {
  const delta = compareInvestigationSnapshots(
    buildLocalWatchSnapshot(buildSavedWatchPacketA()),
    buildLocalWatchSnapshot(buildSavedWatchPacketB()),
  );
  assert.equal(delta.new_sources.length, 1);
  assert.equal(delta.sources_not_returned.length, 1);
  assert.equal(delta.new_candidates.length, 1);
  assert.equal(delta.candidates_not_returned.length, 0);
  assert.equal(delta.changed_candidates.length, 1);
  assert.equal(delta.new_contradiction_signals.length, 1);
  assert.equal(delta.new_correction_signals.length, 1);
  assert.equal(delta.new_supersession_signals.length, 1);
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

test("relation evidence deltas distinguish clarified, unchanged, not-reobserved, legacy, new, unavailable, and direction change", () => {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  const sourceBacked = buildLocalWatchSnapshot(packet);
  const availableWithoutSignal = buildLocalWatchSnapshot(validateSiteReadyCasePacket({
    ...structuredClone(packet),
    source_supported_relation_signals: [],
  }));

  const clarified = compareInvestigationSnapshots(availableWithoutSignal, sourceBacked);
  assert.equal(clarified.relation_evidence_comparison, "comparable");
  assert.equal(clarified.clarified_source_backed_relations.length, 1);
  assert.equal(clarified.new_source_backed_relations.length, 0);
  assert.equal(clarified.new_supersession_signals.length, 0);
  assert.equal(clarified.has_deterministic_differences, true);
  assert.equal(sourceBacked.relations[0].relation_type, "unresolved");

  const unchanged = compareInvestigationSnapshots(sourceBacked, structuredClone(sourceBacked));
  assert.equal(unchanged.has_deterministic_differences, false);
  assert.equal(unchanged.clarified_source_backed_relations.length, 0);
  assert.equal(unchanged.source_backed_direction_changes.length, 0);

  const notReobserved = compareInvestigationSnapshots(sourceBacked, availableWithoutSignal);
  assert.equal(notReobserved.relation_evidence_comparison, "comparable");
  assert.equal(notReobserved.source_backed_relations_not_reobserved.length, 1);
  assert.equal(notReobserved.has_deterministic_differences, true);

  const legacyBaseline = validateLocalWatchSnapshot({
    ...structuredClone(availableWithoutSignal),
    relation_evidence_observation: "unavailable",
  });
  const legacy = compareInvestigationSnapshots(legacyBaseline, sourceBacked);
  assert.equal(legacy.relation_evidence_comparison, "previous_unavailable");
  assert.equal(legacy.clarified_source_backed_relations.length, 0);
  assert.equal(legacy.source_backed_relations_without_comparable_baseline.length, 1);
  assert.equal(legacy.has_deterministic_differences, false);

  const previousWithoutRawRelation = validateLocalWatchSnapshot({
    ...structuredClone(availableWithoutSignal),
    relations: [],
  });
  const newlySourceBacked = compareInvestigationSnapshots(
    previousWithoutRawRelation,
    sourceBacked,
  );
  assert.equal(newlySourceBacked.new_source_backed_relations.length, 1);
  assert.equal(newlySourceBacked.clarified_source_backed_relations.length, 0);
  assert.equal(newlySourceBacked.has_deterministic_differences, true);

  const unavailableCurrent = buildLocalWatchSnapshot(sitePacketV1(packet));
  const unavailable = compareInvestigationSnapshots(sourceBacked, unavailableCurrent);
  assert.equal(unavailable.relation_evidence_comparison, "current_unavailable");
  assert.equal(unavailable.source_backed_relations_not_reobserved.length, 0);
  assert.equal(unavailable.has_deterministic_differences, false);

  const bothUnavailable = compareInvestigationSnapshots(
    unavailableCurrent,
    structuredClone(unavailableCurrent),
  );
  assert.equal(bothUnavailable.relation_evidence_comparison, "unavailable");
  assert.equal(bothUnavailable.has_deterministic_differences, false);

  const reversed = structuredClone(sourceBacked);
  const direction = reversed.source_backed_relations[0];
  [direction.from_claim_identity, direction.to_claim_identity] = [
    direction.to_claim_identity,
    direction.from_claim_identity,
  ];
  const directionChanged = compareInvestigationSnapshots(
    sourceBacked,
    validateLocalWatchSnapshot(reversed),
  );
  assert.equal(directionChanged.source_backed_direction_changes.length, 1);
  assert.equal(directionChanged.clarified_source_backed_relations.length, 0);
  assert.equal(directionChanged.source_backed_relations_not_reobserved.length, 0);
  assert.equal(directionChanged.has_deterministic_differences, true);
});

test("source-backed Watch identity ignores run-local IDs and statement excerpt wording", () => {
  const original = buildSourceSupportedSitePacketV2Fixture();
  const rewritten = rewriteRunLocalIds(original);
  const wordingOnly = validateSiteReadyCasePacket({
    ...structuredClone(original),
    source_supported_relation_signals: [{
      ...structuredClone(original.source_supported_relation_signals[0]),
      statement_excerpt: "Different bounded captured wording for the same semantic relation.",
    }],
  });

  const originalSnapshot = buildLocalWatchSnapshot(original);
  const rewrittenSnapshot = buildLocalWatchSnapshot(rewritten);
  const wordingSnapshot = buildLocalWatchSnapshot(wordingOnly);
  assert.deepEqual(rewrittenSnapshot, originalSnapshot);
  assert.deepEqual(wordingSnapshot, originalSnapshot);
  assert.equal(
    compareInvestigationSnapshots(originalSnapshot, rewrittenSnapshot)
      .has_deterministic_differences,
    false,
  );
  assert.equal(
    compareInvestigationSnapshots(originalSnapshot, wordingSnapshot)
      .has_deterministic_differences,
    false,
  );
});

test("failed explicit v2 baseline write preserves prior bytes while leaving the true comparison available", () => {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  const baselinePacket = validateSiteReadyCasePacket({
    ...structuredClone(packet),
    source_supported_relation_signals: [],
  });
  const baseline = createLocalWatch(baselinePacket, SAVED_AT);
  const updated = advanceLocalWatch(baseline, packet, CHECKED_AT);
  const comparison = compareInvestigationSnapshots(baseline.snapshot, updated.snapshot);
  const storage = new MemoryStorage();
  assert.deepEqual(writeLocalWatch(storage, baseline), { ok: true });
  const priorBytes = storage.values.get(LOCAL_WATCH_STORAGE_KEY);
  storage.throwOn = "set";
  assert.deepEqual(writeLocalWatch(storage, updated), { ok: false, reason: "unavailable" });
  assert.equal(storage.values.get(LOCAL_WATCH_STORAGE_KEY), priorBytes);
  assert.equal(comparison.clarified_source_backed_relations.length, 1);
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
  assert.match(card, /Connect your relay or explicitly select sponsored live/);

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

test("Since-last-check UI renders every bounded relation evidence state without accepted-truth terminology", () => {
  const packet = buildSourceSupportedSitePacketV2Fixture();
  const sourceBacked = buildLocalWatchSnapshot(packet);
  const withoutSignal = buildLocalWatchSnapshot(validateSiteReadyCasePacket({
    ...structuredClone(packet),
    source_supported_relation_signals: [],
  }));

  const clarified = renderDeltaPanel(withoutSignal, sourceBacked);
  assert.match(clarified, /Since last check/);
  assert.match(clarified, /1 relation became Source-backed\./);
  assert.match(
    clarified,
    /Captured source text now directly supports the supersession\. It still needs review\./,
  );
  assert.match(clarified, /Relations clarified/);
  assert.match(clarified, /Source-backed supersession:/);
  assert.match(clarified, /→/);
  assertForbiddenAcceptedTruthTerms(clarified);

  const legacy = renderDeltaPanel(validateLocalWatchSnapshot({
    ...structuredClone(withoutSignal),
    relation_evidence_observation: "unavailable",
  }), sourceBacked);
  assert.match(
    legacy,
    /Source-backed relation observed on this check\. The previous Watch did not preserve this evidence state, so no before\/after claim is made\./,
  );
  assert.doesNotMatch(legacy, /became Source-backed/);
  assert.doesNotMatch(legacy, /newly clarified|strengthened since last check/i);

  const notReobserved = renderDeltaPanel(sourceBacked, withoutSignal);
  assert.match(
    notReobserved,
    /1 previously Source-backed relation was not re-observed in this bounded check\./,
  );
  assert.match(notReobserved, /This does not show reversal or retraction\./);
  assert.doesNotMatch(notReobserved, /no longer supersedes|disproven|downgraded/i);

  const unavailable = renderDeltaPanel(
    sourceBacked,
    buildLocalWatchSnapshot(sitePacketV1(packet)),
  );
  assert.match(
    unavailable,
    /Relation evidence-state comparison was unavailable for this check\./,
  );
  assert.match(unavailable, /No Source-backed change was inferred\./);

  const previousWithoutRelation = validateLocalWatchSnapshot({
    ...structuredClone(withoutSignal),
    relations: [],
  });
  const newlySourceBacked = renderDeltaPanel(previousWithoutRelation, sourceBacked);
  assert.match(newlySourceBacked, /New Source-backed relations/);
  assert.match(newlySourceBacked, /New Source-backed supersession:/);

  const reversed = structuredClone(sourceBacked);
  const direction = reversed.source_backed_relations[0];
  [direction.from_claim_identity, direction.to_claim_identity] = [
    direction.to_claim_identity,
    direction.from_claim_identity,
  ];
  const directionChanged = renderDeltaPanel(
    sourceBacked,
    validateLocalWatchSnapshot(reversed),
  );
  assert.match(
    directionChanged,
    /Source-backed direction differed from the previous check and needs review\./,
  );
  assert.match(directionChanged, /Previous:/);
  assert.match(directionChanged, /Current:/);
  assertForbiddenAcceptedTruthTerms(directionChanged);
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

function assertInvalidSnapshot(
  valid: LocalWatchSnapshot,
  mutate: (snapshot: LocalWatchSnapshot) => void,
): void {
  const malformed = structuredClone(valid);
  mutate(malformed);
  assert.throws(
    () => validateLocalWatchSnapshot(malformed),
    LocalWatchContractError,
  );
}

function sitePacketV1(packet: SiteReadyCasePacketV2): SiteReadyCasePacketV1 {
  const base: Partial<SiteReadyCasePacketV2> = structuredClone(packet);
  delete base.source_supported_relation_signals;
  const validated = validateSiteReadyCasePacket({
    ...base,
    contract_version: "site_ready_case_packet.v1",
  });
  if (validated.contract_version !== "site_ready_case_packet.v1") {
    throw new Error("expected a Site packet v1 fixture");
  }
  return validated;
}

function rewriteRunLocalIds(packet: SiteReadyCasePacketV2): SiteReadyCasePacketV2 {
  const replacements = new Map<string, string>([
    [packet.run_id, "rewritten_run_id"],
    [packet.case_id, "rewritten_case_id"],
  ]);
  packet.source_snapshot_summaries.forEach((source, index) => {
    replacements.set(source.source_id, `rewritten_source_${index}`);
    replacements.set(source.snapshot_id, `rewritten_snapshot_${index}`);
  });
  packet.claim_occurrences.forEach((occurrence, index) => {
    replacements.set(occurrence.occurrence_id, `occurrence_live_rewritten_${index}`);
  });
  packet.relation_candidates.forEach((relation, index) => {
    replacements.set(relation.relation_id, `relation_candidate_rewritten_${index}`);
  });
  const rewritten = rewriteExactStrings(structuredClone(packet), replacements);
  const validated = validateSiteReadyCasePacket(rewritten);
  if (validated.contract_version !== "site_ready_case_packet.v2") {
    throw new Error("expected a Site packet v2 fixture");
  }
  return validated;
}

function rewriteExactStrings(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((item) => rewriteExactStrings(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteExactStrings(item, replacements),
      ]),
    );
  }
  return value;
}

function renderDeltaPanel(
  previousSnapshot: LocalWatchSnapshot,
  currentSnapshot: LocalWatchSnapshot,
): string {
  return renderToStaticMarkup(createElement(InvestigationDeltaPanel, {
    delta: compareInvestigationSnapshots(previousSnapshot, currentSnapshot),
    previousSnapshot,
    currentSnapshot,
    previousCheckedAt: SAVED_AT,
    baselineUpdateState: "updated",
  }));
}

function assertForbiddenAcceptedTruthTerms(html: string): void {
  assert.doesNotMatch(html, /\b(?:Verified|Confirmed|Proven|Accepted|Canonical)\b/);
}

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
  relationType: "contradicts" | "correction" | "supersedes" | "unresolved",
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

function packetWithClaimDisplay(displayText: string) {
  const packet = structuredClone(buildSavedWatchPacketA());
  const occurrence = packet.claim_occurrences[0];
  const claim = packet.actor_claims.find(
    (item) => item.claim_id === occurrence.claim_id,
  );
  assert.ok(claim);
  occurrence.original_claim_text = displayText;
  occurrence.support_reference.bounded_excerpt = displayText;
  claim.claim_text = displayText;
  return packet;
}

function buildUnicodeOrderingPacket() {
  const packet = structuredClone(buildSavedWatchPacketB());
  const [zSource, aaSource] = packet.source_snapshot_summaries;
  Object.assign(zSource, {
    url: null,
    domain: "z",
    publisher: "z",
    title: "z",
  });
  Object.assign(aaSource, {
    url: null,
    domain: "å",
    publisher: "å",
    title: "å",
  });

  const firstClaimId = packet.claim_occurrences[0].claim_id;
  const secondClaimId = packet.claim_occurrences.find(
    (occurrence) => occurrence.claim_id !== firstClaimId,
  )?.claim_id;
  assert.ok(secondClaimId);
  for (const claim of packet.actor_claims) {
    if (claim.claim_id === firstClaimId) claim.actor = "z";
    if (claim.claim_id === secondClaimId) claim.actor = "å";
  }
  for (const occurrence of packet.claim_occurrences) {
    if (occurrence.claim_id === firstClaimId) occurrence.actor = "z";
    if (occurrence.claim_id === secondClaimId) occurrence.actor = "å";
    occurrence.support_reference.citation_url = packet.source_snapshot_summaries.find(
      (source) => source.source_id === occurrence.source_id,
    )?.url ?? null;
  }
  for (const relation of packet.relation_candidates) {
    relation.left_support_reference.citation_url = packet.source_snapshot_summaries.find(
      (source) => source.source_id === relation.left_source_id,
    )?.url ?? null;
    relation.right_support_reference.citation_url = packet.source_snapshot_summaries.find(
      (source) => source.source_id === relation.right_source_id,
    )?.url ?? null;
  }
  return packet;
}

function byIdentity<T extends { identity: string }>(left: T, right: T): number {
  if (left.identity < right.identity) return -1;
  if (left.identity > right.identity) return 1;
  return 0;
}
