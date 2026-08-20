import assert from "node:assert/strict";
import test from "node:test";
import {
  COVERAGE_LENSES,
  NON_CLAIM_SOURCE_SUBTYPE_LABELS,
  buildLineageRequest,
  chooseInitialTimeAxis,
  deriveCoverageHighlight,
  deriveInvestigationMap,
  deriveInvestigationMapBase,
  deriveQuestionInspectionOrigins,
  deriveRelationPresentation,
  deriveRelationRoutes,
  deriveThreadTrace,
  investigationTimeAxisReducer,
  projectInvestigationMap,
  spatialRelationEdges,
  type InvestigationMap,
  type NonClaimSourceSubtype,
} from "../app/lib/investigation-map";
import type { TimeAxis } from "../app/lib/experience";
import { buildPreparedSiteReadyCasePacket } from "../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type PacketUnresolvedQuestion,
  type RelationCandidate,
  type SiteReadyCasePacket,
} from "../app/lib/lineage/contracts";
import {
  buildMapDensityFixture,
  buildSameSourceRelationFixture,
} from "./fixtures/map-density";

const TIME_AXES: readonly TimeAxis[] = [
  "event_time",
  "publication_time",
  "actor_assertion_time",
  "retrieval_time",
];

test("v2 derivation is pure, deterministic, occurrence-primary, and packet-preserving", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const before = JSON.stringify(packet);
  const first = deriveInvestigationMap(packet, "event_time");
  const second = deriveInvestigationMap(packet, "event_time");

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(packet), before);
  assert.equal(first.contractVersion, "investigation_map.v2");
  assert.equal(first.packetRunId, packet.run_id);
  assert.equal(first.occurrences.length, packet.claim_occurrences.length);
  assert.equal(first.nonClaimSources.length, 1);
  assert.equal(first.relationLedger.length, packet.relation_candidates.length);
  assert.equal(first.questions.length, packet.unresolved_questions.length);
  assert.equal(packet.candidate_canonical_boundary.canonical_mutation, "none");
  assert.ok(first.occurrences.every((item) => item.kind === "claim_occurrence"));
  assert.ok(first.nonClaimSources.every((item) => item.kind === "non_claim_source"));
});

test("prepared rows distinguish Candidate thread, Standalone, and local display identity", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const candidate = map.rows.find((row) => row.rowKind === "candidate_thread");
  const standalone = map.rows.find((row) => row.rowKind === "standalone_occurrence");

  assert.ok(candidate);
  assert.equal(candidate.label, "T01 · Candidate thread · 2 occurrences · needs review");
  assert.equal(candidate.accessibleName, candidate.label);
  assert.equal(candidate.traceLabel, "Candidate thread trace");
  assert.equal(candidate.displayThreadNumber, "T01");
  assert.equal(candidate.occurrenceNodeIds.length, 2);
  assert.ok(candidate.familyId);
  assert.equal(candidate.label.includes(candidate.familyId), false);

  assert.ok(standalone);
  assert.equal(
    standalone.label,
    "Standalone claim occurrence · grouping unresolved",
  );
  assert.equal(standalone.accessibleName, standalone.label);
  assert.equal(standalone.traceLabel, "Standalone occurrence trace");
  assert.equal(standalone.displayThreadNumber, null);
  assert.equal(standalone.occurrenceNodeIds.length, 1);
  assert.equal(map.rows.some((row) => row.rowKind === "ungrouped_occurrence"), false);

  assertEveryOccurrenceExactlyOnce(packet, map);
});

test("missing, inconsistent, duplicate, and resolved-singleton family membership fails closed", () => {
  const scenarios: Array<{
    name: string;
    mutate: (packet: SiteReadyCasePacket) => void;
  }> = [
    {
      name: "occurrence references a missing family",
      mutate(packet) {
        packet.claim_occurrences[0].candidate_claim_family_id =
          "family_missing_from_packet";
      },
    },
    {
      name: "family omits an occurrence that points back",
      mutate(packet) {
        packet.candidate_claim_families[0].occurrence_ids =
          packet.candidate_claim_families[0].occurrence_ids.slice(1);
      },
    },
    {
      name: "one occurrence appears in multiple families",
      mutate(packet) {
        packet.candidate_claim_families[1].occurrence_ids.push(
          packet.claim_occurrences[0].occurrence_id,
        );
      },
    },
    {
      name: "duplicate family IDs make membership ambiguous",
      mutate(packet) {
        packet.candidate_claim_families.push(
          structuredClone(packet.candidate_claim_families[0]),
        );
      },
    },
    {
      name: "a singleton family is not unresolved",
      mutate(packet) {
        const singleton = packet.candidate_claim_families.find(
          (family) => family.occurrence_ids.length === 1,
        );
        assert.ok(singleton);
        singleton.unresolved = false;
      },
    },
  ];

  for (const scenario of scenarios) {
    const packet = buildPreparedSiteReadyCasePacket();
    scenario.mutate(packet);
    const map = deriveInvestigationMap(packet, "event_time");
    assertEveryOccurrenceExactlyOnce(packet, map);
    assert.ok(
      map.rows.some((row) => row.rowKind === "ungrouped_occurrence"),
      scenario.name,
    );
    assert.ok(
      map.diagnostics.some((item) =>
        item.startsWith("family_membership_inconsistent:")
      ),
      scenario.name,
    );
    assert.ok(
      map.rows
        .filter((row) => row.rowKind === "ungrouped_occurrence")
        .every((row) =>
          row.label === "Ungrouped claim occurrence"
          && row.displayThreadNumber === null
          && row.occurrenceNodeIds.length === 1
        ),
      scenario.name,
    );
  }
});

test("one packet-local row ordinal stays fixed across all axes and a new packet recomputes it", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const base = deriveInvestigationMapBase(packet);
  const expectedRows = rowSignature(projectInvestigationMap(base, "event_time"));

  for (const axis of TIME_AXES) {
    const projected = projectInvestigationMap(base, axis);
    assert.deepEqual(rowSignature(projected), expectedRows);
    assert.deepEqual(
      projected.rows.map((row) => row.rowOrdinal),
      [1, 2],
    );
  }

  const nextPacket = structuredClone(packet);
  nextPacket.run_id = packet.run_id + "_reordered_for_new_display";
  const candidateIds = base.rows.find(
    (row) => row.rowKind === "candidate_thread",
  )?.occurrenceNodeIds ?? [];
  const standaloneId = base.rows.find(
    (row) => row.rowKind === "standalone_occurrence",
  )?.occurrenceNodeIds[0];
  assert.ok(standaloneId);
  for (const occurrence of nextPacket.claim_occurrences) {
    occurrence.event_time_candidate = candidateIds.includes(occurrence.occurrence_id)
      ? "2026-06-20T12:00:00Z"
      : "2026-06-01T12:00:00Z";
    occurrence.event_time_candidate_precision = "instant";
  }
  const nextBase = deriveInvestigationMapBase(nextPacket);
  assert.equal(nextBase.rows[0].rowKind, "standalone_occurrence");
  assert.equal(nextBase.rows[1].rowKind, "candidate_thread");
  assert.equal(nextBase.rows[1].displayThreadNumber, "T01");
  assert.notDeepEqual(
    nextBase.rows.map((row) => row.occurrenceNodeIds),
    base.rows.map((row) => row.occurrenceNodeIds),
  );
});

test("initial axis uses the complete occurrence-primary and zero-occurrence fallback chains", () => {
  const eventPacket = buildPreparedSiteReadyCasePacket();
  assert.equal(chooseInitialTimeAxis(eventPacket), "event_time");

  const publicationPacket = clearOccurrenceTimes(eventPacket, [
    "event_time",
  ]);
  assert.equal(chooseInitialTimeAxis(publicationPacket), "publication_time");

  const assertionPacket = clearOccurrenceTimes(eventPacket, [
    "event_time",
    "publication_time",
  ]);
  assert.equal(chooseInitialTimeAxis(assertionPacket), "actor_assertion_time");

  const retrievalPacket = clearOccurrenceTimes(eventPacket, [
    "event_time",
    "publication_time",
    "actor_assertion_time",
  ]);
  assert.equal(chooseInitialTimeAxis(retrievalPacket), "retrieval_time");

  const zeroOccurrencePublication = structuredClone(eventPacket);
  zeroOccurrencePublication.claim_occurrences = [];
  assert.ok(
    zeroOccurrencePublication.source_snapshot_summaries.some(
      (source) => source.published_at,
    ),
  );
  assert.equal(
    chooseInitialTimeAxis(zeroOccurrencePublication),
    "publication_time",
  );

  const zeroOccurrenceRetrieval = structuredClone(zeroOccurrencePublication);
  for (const source of zeroOccurrenceRetrieval.source_snapshot_summaries) {
    source.published_at = null;
    source.published_at_precision = null;
  }
  assert.equal(chooseInitialTimeAxis(zeroOccurrenceRetrieval), "retrieval_time");

  assert.ok(publicationPacket.actions.some((action) => action.event_time_candidate));
  assert.equal(
    chooseInitialTimeAxis(publicationPacket),
    "publication_time",
    "action times must not force initial Event time",
  );
});

test("time-axis reducer preserves manual selection until a newly displayed packet", () => {
  const currentPacket = buildPreparedSiteReadyCasePacket();
  let axis = chooseInitialTimeAxis(currentPacket);
  axis = investigationTimeAxisReducer(axis, {
    type: "select_axis",
    axis: "retrieval_time",
  });
  assert.equal(axis, "retrieval_time");

  const nextPacket = clearOccurrenceTimes(currentPacket, ["event_time"]);
  nextPacket.run_id = currentPacket.run_id + "_publication_only";
  axis = investigationTimeAxisReducer(axis, {
    type: "display_packet",
    packet: nextPacket,
  });
  assert.equal(axis, "publication_time");
});

test("day precision accepts a schema-valid timestamp without inventing its clock time", () => {
  const packet = clearOccurrenceTimes(buildPreparedSiteReadyCasePacket(), [
    "event_time",
  ]);
  const occurrence = packet.claim_occurrences[0];
  occurrence.event_time_candidate = "2026-06-10T15:45:00-04:00";
  occurrence.event_time_candidate_precision = "day";

  assert.equal(chooseInitialTimeAxis(packet), "event_time");
  const node = occurrenceNode(
    deriveInvestigationMap(packet, "event_time"),
    occurrence.occurrence_id,
  );
  assert.equal(node.selectedTime, "2026-06-10T00:00:00.000Z");
  assert.equal(node.selectedTimePrecision, "day");
  assert.equal(node.timeRegion, "dated");
});

test("manual axes use only matching occurrence fields and Unplaced is non-chronological", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const target = packet.claim_occurrences[0];
  assert.ok(target.source_publication_time);
  target.event_time_candidate = null;
  target.event_time_candidate_precision = null;

  const eventMap = deriveInvestigationMap(packet, "event_time");
  const eventNode = occurrenceNode(eventMap, target.occurrence_id);
  assert.equal(eventNode.selectedTime, null);
  assert.equal(eventNode.selectedTimePrecision, null);
  assert.equal(eventNode.timeRegion, "unplaced");
  assert.equal(eventNode.column, null);
  assert.equal(eventMap.unplacedRegionLabel, "Unplaced on Event time");
  assert.ok(eventMap.unplacedOccurrenceIds.includes(target.occurrence_id));
  assert.match(eventMap.timeSelectionRule, /not substituted/i);

  const publicationMap = deriveInvestigationMap(packet, "publication_time");
  const publicationNode = occurrenceNode(
    publicationMap,
    target.occurrence_id,
  );
  assert.equal(
    publicationNode.selectedTime,
    new Date(target.source_publication_time as string).toISOString(),
  );
  assert.equal(publicationNode.timeRegion, "dated");

  const relation = eventMap.relationLedger.find(
    (entry) => entry.leftOccurrenceId === target.occurrence_id,
  );
  assert.ok(relation);
  assert.equal(relation.directionAsserted, false);
  assert.equal(
    relation.directionExplanation,
    "Direction not asserted on the selected axis",
  );
});

test("day and mixed precision group honestly and never invent within-day relation order", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const relation = packet.relation_candidates.find(
    (item) => item.relation_type === "supersedes",
  );
  assert.ok(relation);
  const left = packet.claim_occurrences.find(
    (item) => item.occurrence_id === relation.left_occurrence_id,
  );
  const right = packet.claim_occurrences.find(
    (item) => item.occurrence_id === relation.right_occurrence_id,
  );
  const peer = packet.claim_occurrences.find(
    (item) =>
      item.occurrence_id !== relation.left_occurrence_id
      && item.occurrence_id !== relation.right_occurrence_id,
  );
  assert.ok(left);
  assert.ok(right);
  assert.ok(peer);

  left.event_time_candidate = "2026-07-15T08:00:00Z";
  left.event_time_candidate_precision = "instant";
  peer.event_time_candidate = "2026-07-15T09:00:00Z";
  peer.event_time_candidate_precision = "instant";
  right.event_time_candidate = "2026-07-15T00:00:00.000Z";
  right.event_time_candidate_precision = "day";

  const mixed = deriveInvestigationMap(packet, "event_time");
  assert.equal(mixed.timeGroups.length, 1);
  assert.equal(mixed.timeGroups[0].precision, "mixed");
  assert.deepEqual(mixed.timeGroups[0].occurrenceNodeIds, [
    left.occurrence_id,
    peer.occurrence_id,
    right.occurrence_id,
  ]);
  assert.equal(relationEntry(mixed, relation.relation_id).directionAsserted, false);

  const dayPeers = structuredClone(packet);
  const dayLeft = dayPeers.claim_occurrences.find(
    (item) => item.occurrence_id === relation.left_occurrence_id,
  );
  const dayRight = dayPeers.claim_occurrences.find(
    (item) => item.occurrence_id === relation.right_occurrence_id,
  );
  const separate = dayPeers.claim_occurrences.find(
    (item) =>
      item.occurrence_id !== relation.left_occurrence_id
      && item.occurrence_id !== relation.right_occurrence_id,
  );
  assert.ok(dayLeft);
  assert.ok(dayRight);
  assert.ok(separate);
  dayLeft.event_time_candidate = "2026-07-15T00:00:00.000Z";
  dayLeft.event_time_candidate_precision = "day";
  dayRight.event_time_candidate = "2026-07-15T00:00:00.000Z";
  dayRight.event_time_candidate_precision = "day";
  separate.event_time_candidate = "2026-07-16T09:00:00Z";
  separate.event_time_candidate_precision = "instant";
  const dayMap = deriveInvestigationMap(dayPeers, "event_time");
  assert.equal(dayMap.timeGroups[0].precision, "day");
  assert.deepEqual(
    [...dayMap.timeGroups[0].occurrenceNodeIds].sort(),
    [dayLeft.occurrence_id, dayRight.occurrence_id].sort(),
  );
  assert.equal(
    relationEntry(dayMap, relation.relation_id).directionAsserted,
    false,
  );
});

test("all five Non-claim source subtypes derive only from structured metadata and links", () => {
  const expected: readonly NonClaimSourceSubtype[] = [
    "context_interpretation",
    "action_bearing",
    "finding_bearing",
    "source_only",
    "mixed_non_claim",
  ];

  for (const subtype of expected) {
    const packet = packetForNonClaimSubtype(subtype);
    const map = deriveInvestigationMap(packet, "event_time");
    const editorial = map.nonClaimSources.find(
      (source) => source.sourceId === editorialSourceId(packet),
    );
    assert.ok(editorial, subtype);
    assert.equal(editorial.subtype, subtype);
    assert.equal(
      editorial.subtypeLabel,
      NON_CLAIM_SOURCE_SUBTYPE_LABELS[subtype],
    );
    assert.equal(editorial.relationEndpointEligible, false);
    assert.equal(
      map.rows.some((row) => row.occurrenceNodeIds.includes(editorial.sourceId)),
      false,
    );
    assert.equal(
      map.relationLedger.some((relation) =>
        relation.leftSourceId === editorial.sourceId
        || relation.rightSourceId === editorial.sourceId
      ),
      false,
    );
  }
});

test("a Non-claim source moves between Dated and Unplaced subgroups without changing identity", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourceId = editorialSourceId(packet);
  const base = deriveInvestigationMapBase(packet);
  const eventMap = projectInvestigationMap(base, "event_time");
  const publicationMap = projectInvestigationMap(base, "publication_time");
  const assertionMap = projectInvestigationMap(base, "actor_assertion_time");
  const retrievalMap = projectInvestigationMap(base, "retrieval_time");

  const eventRecord = nonClaimRecord(eventMap, sourceId);
  assert.equal(eventRecord.subtype, "context_interpretation");
  assert.equal(eventRecord.timeRegion, "unplaced");
  assert.equal(eventRecord.selectedTime, null);
  assert.ok(eventMap.nonClaimUnplacedSourceNodeIds.includes(eventRecord.nodeId));
  assert.equal(eventMap.nonClaimDatedGroups.length, 0);

  const publicationRecord = nonClaimRecord(publicationMap, sourceId);
  assert.equal(publicationRecord.nodeId, eventRecord.nodeId);
  assert.equal(publicationRecord.subtype, eventRecord.subtype);
  assert.equal(publicationRecord.timeRegion, "dated");
  assert.equal(publicationRecord.selectedTime, "2026-06-15T08:00:00.000Z");
  assert.ok(
    publicationMap.nonClaimDatedSourceNodeIds.includes(publicationRecord.nodeId),
  );
  assert.equal(publicationMap.nonClaimDatedGroups[0].calendarDate, "2026-06-15");
  assert.deepEqual(publicationMap.nonClaimDatedGroups[0].sourceNodeIds, [
    publicationRecord.nodeId,
  ]);

  assert.equal(nonClaimRecord(assertionMap, sourceId).timeRegion, "unplaced");
  assert.equal(nonClaimRecord(retrievalMap, sourceId).timeRegion, "dated");
  assert.equal(
    nonClaimRecord(retrievalMap, sourceId).selectedTime,
    "2026-06-15T12:00:00.000Z",
  );
});

test("relation ledger endpoints remain exact occurrence IDs with one semantic entry per relation_id", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "publication_time");
  const occurrenceIds = new Set(
    packet.claim_occurrences.map((item) => item.occurrence_id),
  );

  assert.equal(map.relationLedger.length, packet.relation_candidates.length);
  assert.equal(
    new Set(map.relationLedger.map((item) => item.relationId)).size,
    packet.relation_candidates.length,
  );
  for (const relation of packet.relation_candidates) {
    const entry = relationEntry(map, relation.relation_id);
    assert.equal(entry.leftOccurrenceId, relation.left_occurrence_id);
    assert.equal(entry.rightOccurrenceId, relation.right_occurrence_id);
    assert.equal(entry.fromNodeId, relation.left_occurrence_id);
    assert.equal(entry.toNodeId, relation.right_occurrence_id);
    assert.ok(occurrenceIds.has(entry.fromNodeId));
    assert.ok(occurrenceIds.has(entry.toNodeId));
    assert.equal(entry.leftSourceId, relation.left_source_id);
    assert.equal(entry.rightSourceId, relation.right_source_id);
    assert.equal(entry.reviewStatus, "pending_review");
    assert.equal(entry.publicReviewLabel, "Needs review");
    assert.deepEqual(entry.leftSupportReference, relation.left_support_reference);
    assert.deepEqual(entry.rightSupportReference, relation.right_support_reference);
  }
});

test("same-source cross-row occurrence relations remain port and ledger representable", () => {
  const packet = buildSameSourceRelationFixture();
  const relation = packet.relation_candidates.find(
    (item) =>
      item.relation_id === "relation_candidate_fixture_same_source_review",
  );
  assert.ok(relation);
  assert.equal(relation.left_source_id, relation.right_source_id);
  assert.notEqual(relation.left_occurrence_id, relation.right_occurrence_id);

  const before = JSON.stringify(packet);
  const map = deriveInvestigationMap(packet, "publication_time");
  const entry = relationEntry(map, relation.relation_id);
  assert.equal(entry.geometryEligible, true);
  assert.equal(entry.sameRow, false);
  assert.equal(entry.leftSourceId, entry.rightSourceId);
  assert.notEqual(entry.leftOccurrenceId, entry.rightOccurrenceId);
  assert.equal(
    spatialRelationEdges(map, "matrix").some(
      (item) => item.relationId === relation.relation_id,
    ),
    false,
  );
  assert.equal(map.relationRoutes.portRelationIds.includes(relation.relation_id), true);
  assert.equal(JSON.stringify(packet), before);
});

test("parallel relations remain separate and share only presentation pair metadata", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const original = packet.relation_candidates[0];
  const duplicate = structuredClone(original);
  duplicate.relation_id = "relation_candidate_fixture_parallel_review";
  duplicate.relation_type = "corroborates";
  duplicate.reason = "Separate parallel candidate relation for review.";
  packet.relation_candidates.push(duplicate);

  const map = deriveInvestigationMap(packet, "event_time");
  const originalEntry = relationEntry(map, original.relation_id);
  const pairEntries = map.relationLedger.filter(
    (entry) => entry.pairKey === originalEntry.pairKey,
  );
  assert.equal(pairEntries.length, 2);
  assert.deepEqual(
    pairEntries.map((entry) => entry.parallelIndex),
    [0, 1],
  );
  assert.ok(pairEntries.every((entry) => entry.parallelCount === 2));
  assert.deepEqual(
    pairEntries.map((entry) => entry.relationId),
    [original.relation_id, duplicate.relation_id],
  );
});

test("duplicate relation_id records fail closed into one non-spatial review entry", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const duplicate = structuredClone(packet.relation_candidates[0]);
  duplicate.reason = "Conflicting duplicate record retained for explicit review.";
  packet.relation_candidates.push(duplicate);

  const map = deriveInvestigationMap(packet, "event_time");
  const entries = map.relationLedger.filter(
    (entry) => entry.relationId === duplicate.relation_id,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].integrityState, "duplicate_relation_id");
  assert.equal(entries[0].recordCount, 2);
  assert.equal(entries[0].candidateRecords.length, 2);
  assert.equal(entries[0].geometryEligible, false);
  assert.equal(entries[0].directionAsserted, false);
  assert.equal(
    spatialRelationEdges(map, "matrix").some(
      (entry) => entry.relationId === duplicate.relation_id,
    ),
    false,
  );
  assert.ok(
    map.diagnostics.some((item) =>
      item.startsWith("duplicate_relation_id:" + duplicate.relation_id + ":2")
    ),
  );
});

test("composite arrow eligibility passes or fails each conservative condition", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const supersedes = prepared.relation_candidates.find(
    (relation) => relation.relation_type === "supersedes",
  );
  const challenge = prepared.relation_candidates.find(
    (relation) => relation.relation_type === "contradicts",
  );
  assert.ok(supersedes);
  assert.ok(challenge);

  assert.equal(
    relationEntry(
      deriveInvestigationMap(prepared, "event_time"),
      supersedes.relation_id,
    ).directionAsserted,
    true,
  );
  assert.equal(
    relationEntry(
      deriveInvestigationMap(prepared, "event_time"),
      challenge.relation_id,
    ).directionAsserted,
    false,
    "Challenges is never directional",
  );

  const missingLeft = structuredClone(prepared);
  setRelationEndpointTime(missingLeft, supersedes, "left", null, null);
  assertDirection(missingLeft, supersedes.relation_id, false);

  const missingRight = structuredClone(prepared);
  setRelationEndpointTime(missingRight, supersedes, "right", null, null);
  assertDirection(missingRight, supersedes.relation_id, false);

  const equal = structuredClone(prepared);
  setRelationEndpointTime(
    equal,
    supersedes,
    "left",
    "2026-06-12T12:00:00Z",
    "instant",
  );
  setRelationEndpointTime(
    equal,
    supersedes,
    "right",
    "2026-06-12T12:00:00Z",
    "instant",
  );
  assertDirection(equal, supersedes.relation_id, false);

  const reversed = structuredClone(prepared);
  setRelationEndpointTime(
    reversed,
    supersedes,
    "left",
    "2026-06-15T12:00:00Z",
    "instant",
  );
  setRelationEndpointTime(
    reversed,
    supersedes,
    "right",
    "2026-06-10T12:00:00Z",
    "instant",
  );
  assertDirection(reversed, supersedes.relation_id, false);

  const mixedSameDay = structuredClone(prepared);
  setRelationEndpointTime(
    mixedSameDay,
    supersedes,
    "left",
    "2026-06-12T00:00:00.000Z",
    "day",
  );
  setRelationEndpointTime(
    mixedSameDay,
    supersedes,
    "right",
    "2026-06-12T18:00:00Z",
    "instant",
  );
  assertDirection(mixedSameDay, supersedes.relation_id, false);

  const orderedDays = structuredClone(prepared);
  setRelationEndpointTime(
    orderedDays,
    supersedes,
    "left",
    "2026-06-10T00:00:00.000Z",
    "day",
  );
  setRelationEndpointTime(
    orderedDays,
    supersedes,
    "right",
    "2026-06-14T00:00:00.000Z",
    "day",
  );
  assertDirection(orderedDays, supersedes.relation_id, true);

  assert.equal(
    relationEntry(
      deriveInvestigationMap(prepared, "retrieval_time"),
      supersedes.relation_id,
    ).directionAsserted,
    false,
    "equal retrieval instants cannot assert direction",
  );
});

test("relation types use restrained labels, line families, and unrelated remains ledger-only", () => {
  const expected = {
    supersedes: ["Replaces", "transformative", "solid", true],
    correction: ["Corrects", "transformative", "solid", true],
    narrows: ["Narrows", "transformative", "solid", true],
    follow_up: ["Responds", "responsive", "dashed", true],
    contradicts: ["Challenges", "tension", "solid", false],
    corroborates: ["Supports", "reinforcement_context", "dotted", false],
    same_event: ["Same event", "reinforcement_context", "dotted", false],
    unresolved: ["Unclear", "indeterminate", "dash_dot", false],
    unrelated: ["No direct change", "unrelated", "none", false],
  } as const;

  for (const [type, specification] of Object.entries(expected)) {
    const packet = buildPreparedSiteReadyCasePacket();
    const relation = packet.relation_candidates[0];
    relation.relation_type = type as RelationCandidate["relation_type"];
    packet.relation_candidates = [relation];
    const map = deriveInvestigationMap(packet, "event_time");
    const entry = map.relationLedger[0];
    assert.equal(entry.shortLabel, specification[0], type);
    assert.equal(entry.visualFamily, specification[1], type);
    assert.equal(entry.lineStyle, specification[2], type);
    assert.equal(entry.directionAsserted, specification[3], type);
    assert.equal(
      spatialRelationEdges(map, "matrix").some(
        (item) => item.relationId === relation.relation_id,
      ),
      type !== "unrelated",
      type,
    );
    assert.ok(
      map.relationLedger.some(
        (item) => item.relationId === relation.relation_id,
      ),
      type,
    );
  }
});

test("Matrix and Relation-summary are adaptive presentation modes with zero relation loss", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const matrix = deriveInvestigationMap(packet, "event_time", {
    availableWidth: 1_440,
    drawableRelationCount: 3,
    crossRowRelationCount: 2,
    measuredCollisionCount: 0,
    compactResponsiveMode: false,
  });
  const summary = deriveInvestigationMap(packet, "event_time", {
    availableWidth: 1_440,
    drawableRelationCount: 3,
    crossRowRelationCount: 2,
    measuredCollisionCount: 0,
    compactResponsiveMode: true,
  });
  assert.equal(matrix.relationPresentation.mode, "matrix");
  assert.equal(matrix.relationPresentation.simplified, false);
  assert.equal(summary.relationPresentation.mode, "relation_summary");
  assert.equal(summary.relationPresentation.simplified, true);
  assert.equal(summary.relationPresentation.reason, "compact_transformation");
  assert.equal(summary.relationPresentation.retainedRelationCount, 3);
  assert.equal(
    summary.relationPresentation.announcement,
    "Spatial overview simplified · all 3 candidate relations remain listed below",
  );
  assert.deepEqual(summary.relationLedger, matrix.relationLedger);

  const matrixRoutes = deriveRelationRoutes(matrix.relationLedger, "matrix", null);
  const summaryRoutes = deriveRelationRoutes(
    summary.relationLedger,
    "relation_summary",
    null,
  );
  const supersedes = matrix.relationLedger.find(
    (entry) => entry.relationType === "supersedes",
  );
  const challenge = matrix.relationLedger.find(
    (entry) => entry.relationType === "contradicts",
  );
  const followUp = matrix.relationLedger.find(
    (entry) => entry.relationType === "follow_up",
  );
  assert.ok(supersedes);
  assert.ok(challenge);
  assert.ok(followUp);
  assertAllRelationsRouted(matrix, matrixRoutes);
  assertAllRelationsRouted(summary, summaryRoutes);
  assert.deepEqual(matrixRoutes.spatialRelationIds, [supersedes.relationId]);
  assert.deepEqual(
    [...matrixRoutes.portRelationIds].sort(),
    [challenge.relationId, followUp.relationId].sort(),
  );
  assert.deepEqual(summaryRoutes.spatialRelationIds, [supersedes.relationId]);
  assert.deepEqual(
    [...summaryRoutes.portRelationIds].sort(),
    [challenge.relationId, followUp.relationId].sort(),
  );
  const selectedCrossRowRoutes = deriveRelationRoutes(
    matrix.relationLedger,
    "matrix",
    challenge.relationId,
  );
  assert.equal(
    selectedCrossRowRoutes.spatialRelationIds.includes(challenge.relationId),
    false,
    "selecting a cross-row relation must not restore its curve",
  );
  assert.equal(selectedCrossRowRoutes.portRelationIds.includes(challenge.relationId), true);
  const compactRoutes = deriveRelationRoutes(
    summary.relationLedger,
    "relation_summary",
    null,
    new Set(),
  );
  assert.deepEqual(compactRoutes.spatialRelationIds, []);
  assert.deepEqual(
    [...compactRoutes.portRelationIds].sort(),
    matrix.relationLedger.map((entry) => entry.relationId).sort(),
  );

  assert.deepEqual(
    deriveRelationPresentation({
      availableWidth: 1_440,
      drawableRelationCount: 3,
      crossRowRelationCount: 2,
      measuredCollisionCount: 1,
      compactResponsiveMode: false,
    }),
    {
      mode: "relation_summary",
      simplified: true,
      reason: "measured_collisions",
      retainedRelationCount: 3,
      announcement:
        "Spatial overview simplified · all 3 candidate relations remain listed below",
    },
  );
  assert.equal(
    deriveRelationPresentation({
      availableWidth: 200,
      drawableRelationCount: 3,
      crossRowRelationCount: 2,
      measuredCollisionCount: 0,
      compactResponsiveMode: false,
    }).reason,
    "available_width_pressure",
  );
});

test("3/5/8-source density fixtures exercise readable and simplified modes without loss", () => {
  const scenarios = [
    { count: 3 as const, width: 1_440, expectedMode: "matrix" as const },
    { count: 5 as const, width: 1_024, expectedMode: "relation_summary" as const },
    { count: 8 as const, width: 1_280, expectedMode: "relation_summary" as const },
  ];
  const expectedRelationCounts = { 3: 3, 5: 10, 8: 18 } as const;

  for (const scenario of scenarios) {
    const packet = buildMapDensityFixture(scenario.count);
    validateSiteReadyCasePacket(packet);
    const before = JSON.stringify(packet);
    const baseline = deriveInvestigationMap(packet, "event_time");
    const drawable = baseline.relationLedger.filter(
      (entry) => entry.geometryEligible,
    );
    const map = deriveInvestigationMap(packet, "event_time", {
      availableWidth: scenario.width,
      drawableRelationCount: drawable.length,
      crossRowRelationCount: drawable.filter((entry) => !entry.sameRow).length,
      measuredCollisionCount: 0,
      compactResponsiveMode: false,
    });

    assert.equal(packet.actual_source_count, scenario.count);
    assert.equal(map.relationLedger.length, expectedRelationCounts[scenario.count]);
    assert.equal(map.relationPresentation.mode, scenario.expectedMode);
    assert.equal(
      new Set(map.relationLedger.map((entry) => entry.relationId)).size,
      expectedRelationCounts[scenario.count],
    );
    assertEveryOccurrenceExactlyOnce(packet, map);
    assertAllRelationsRouted(map, map.relationRoutes);
    assert.equal(JSON.stringify(packet), before);
  }
});

test("all five unresolved-question origin types resolve conservatively", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const occurrenceId = packet.claim_occurrences[0].occurrence_id;
  const claimId = packet.actor_claims[1].claim_id;
  const actionId = packet.actions[0].action_id;
  const sourceId = editorialSourceId(packet);
  packet.unresolved_questions = [
    question("question_origin_occurrence", [occurrenceId]),
    question("question_origin_actor_claim", [claimId]),
    question("question_origin_action", [actionId]),
    question("question_origin_source", [sourceId]),
    question("question_origin_unknown", ["unknown_record_id"]),
  ];

  const map = deriveInvestigationMap(packet, "event_time");
  const expected = {
    question_origin_occurrence: "occurrence",
    question_origin_actor_claim: "actor_claim",
    question_origin_action: "action",
    question_origin_source: "source",
    question_origin_unknown: "topic_unknown",
  } as const;
  for (const [questionId, originType] of Object.entries(expected)) {
    const item = map.questions.find(
      (candidate) => candidate.questionId === questionId,
    );
    assert.ok(item);
    assert.equal(item.origins.length, 1);
    assert.equal(item.origins[0].originType, originType);
    assert.equal(
      deriveQuestionInspectionOrigins(map, questionId)[0].originType,
      originType,
    );
  }

  const action = map.questions.find(
    (item) => item.questionId === "question_origin_action",
  )?.origins[0];
  assert.ok(action);
  assert.equal(action.label, "Via action record");
  assert.deepEqual(action.occurrenceNodeIds, []);
  assert.equal(action.drawsOccurrenceTether, false);
  assert.ok(action.sourceIdentities.length > 0);

  const source = map.questions.find(
    (item) => item.questionId === "question_origin_source",
  )?.origins[0];
  assert.ok(source);
  assert.deepEqual(source.occurrenceNodeIds, []);
  assert.equal(source.drawsOccurrenceTether, false);
  assert.equal(source.nonClaimSourceNodeId, nonClaimRecord(map, sourceId).nodeId);

  const unknown = map.questions.find(
    (item) => item.questionId === "question_origin_unknown",
  )?.origins[0];
  assert.ok(unknown);
  assert.equal(unknown.label, "Topic-level evidence gap");
  assert.equal(unknown.nonClaimSourceNodeId, null);
  assert.deepEqual(unknown.occurrenceNodeIds, []);
});

test("actor-claim origins anchor every matching source-local occurrence or use a typed chip", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const actorClaim = packet.actor_claims[1];
  const original = packet.claim_occurrences.find(
    (occurrence) => occurrence.claim_id === actorClaim.claim_id,
  );
  assert.ok(original);
  const second = structuredClone(original);
  second.occurrence_id = "occurrence_fixture_question_origin_second_source";
  second.source_id = packet.source_snapshot_summaries[2].source_id;
  second.snapshot_id = packet.source_snapshot_summaries[2].snapshot_id;
  second.source_record_status = packet.source_snapshot_summaries[2].record_status;
  second.candidate_claim_family_id = null;
  second.support_reference.source_id = second.source_id;
  second.support_reference.snapshot_id = second.snapshot_id;
  packet.claim_occurrences.push(second);
  actorClaim.source_ids.push(second.source_id);
  packet.unresolved_questions = [
    question("question_actor_claim_all_occurrences", [actorClaim.claim_id]),
  ];

  const mapped = deriveInvestigationMap(packet, "event_time");
  const mappedOrigin = mapped.questions[0].origins[0];
  assert.equal(mappedOrigin.originType, "actor_claim");
  assert.deepEqual(
    [...mappedOrigin.occurrenceNodeIds].sort(),
    [original.occurrence_id, second.occurrence_id].sort(),
  );
  assert.equal(mappedOrigin.drawsOccurrenceTether, true);
  assert.equal(mapped.questionTethers.length, 2);

  const chipPacket = buildPreparedSiteReadyCasePacket();
  const chipClaim = chipPacket.actor_claims[1];
  chipPacket.claim_occurrences = chipPacket.claim_occurrences.filter(
    (occurrence) => occurrence.claim_id !== chipClaim.claim_id,
  );
  chipPacket.unresolved_questions = [
    question("question_actor_claim_chip", [chipClaim.claim_id]),
  ];
  const chipMap = deriveInvestigationMap(chipPacket, "event_time");
  const chipOrigin = chipMap.questions[0].origins[0];
  assert.equal(chipOrigin.originType, "actor_claim");
  assert.equal(chipOrigin.label, "Via actor claim record");
  assert.deepEqual(chipOrigin.occurrenceNodeIds, []);
  assert.equal(chipOrigin.drawsOccurrenceTether, false);
  assert.equal(chipMap.questionTethers.length, 0);
});

test("source and action origins never borrow an arbitrary claim-occurrence anchor", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const claimBearingSourceId = packet.claim_occurrences[0].source_id;
  const actionId = packet.actions[0].action_id;
  packet.unresolved_questions = [
    question("question_claim_bearing_source", [claimBearingSourceId]),
    question("question_action_without_borrowed_claim", [actionId]),
  ];
  const map = deriveInvestigationMap(packet, "event_time");

  for (const item of map.questions) {
    const origin = item.origins[0];
    assert.ok(origin.originType === "source" || origin.originType === "action");
    assert.deepEqual(origin.occurrenceNodeIds, []);
    assert.equal(origin.drawsOccurrenceTether, false);
    assert.equal(item.occurrenceAnchorIds.length, 0);
  }
  const sourceOrigin = map.questions[0].origins[0];
  assert.equal(sourceOrigin.nonClaimSourceNodeId, null);
  assert.equal(map.questionTethers.length, 0);
});

test("a multi-origin unresolved question remains one card with typed origins", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const occurrenceId = packet.claim_occurrences[0].occurrence_id;
  const claimId = packet.claim_occurrences[0].claim_id;
  const actionId = packet.actions[0].action_id;
  const sourceId = editorialSourceId(packet);
  packet.unresolved_questions = [
    question("question_multi_origin", [
      occurrenceId,
      claimId,
      actionId,
      sourceId,
      "unknown_record_id",
    ]),
  ];

  const map = deriveInvestigationMap(packet, "event_time");
  assert.equal(map.questions.length, 1);
  assert.equal(map.questions[0].questionId, "question_multi_origin");
  assert.deepEqual(
    map.questions[0].origins.map((origin) => origin.originType),
    ["occurrence", "actor_claim", "action", "source", "topic_unknown"],
  );
  assert.deepEqual(map.questions[0].occurrenceAnchorIds, [occurrenceId]);
  assert.equal(map.questionTethers.length, 2);
  assert.ok(
    map.questionTethers.every(
      (tether) =>
        tether.fromOccurrenceId === occurrenceId
        && tether.toQuestionId === "question_multi_origin"
        && tether.hasArrow === false,
    ),
  );
});

test("coverage strip preserves all roles and zero counts while lenses only highlight", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const map = deriveInvestigationMap(packet, "event_time");
  const packetBefore = JSON.stringify(packet);
  const mapBefore = JSON.stringify(map);

  assert.equal(map.coverage.totalSources, 4);
  assert.equal(map.coverage.representedRoleCount, 4);
  assert.equal(map.coverage.targetRoleCount, 5);
  assert.deepEqual(
    map.coverage.roles.map((role) => [
      role.lane,
      role.count,
      role.missing,
    ]),
    [
      ["baseline_authority", 1, false],
      ["primary_or_origin", 0, true],
      ["local_or_firsthand", 1, false],
      ["specialist_context", 1, false],
      ["challenge_or_correction", 1, false],
    ],
  );
  assert.equal(
    map.coverage.roles.find((role) => role.lane === "primary_or_origin")?.label,
    "Original records",
  );
  const originalRole = map.coverage.roles.find(
    (role) => role.lane === "primary_or_origin",
  );
  assert.ok(originalRole);
  assert.equal(originalRole.zero, true);
  assert.equal(originalRole.missingTarget, true);

  const zeroButNotTargetPacket = structuredClone(packet);
  zeroButNotTargetPacket.coverage_summary.missing_target_lanes = [];
  const zeroButNotTarget = deriveInvestigationMap(
    zeroButNotTargetPacket,
    "event_time",
  ).coverage.roles.find((role) => role.lane === "primary_or_origin");
  assert.ok(zeroButNotTarget);
  assert.equal(zeroButNotTarget.zero, true);
  assert.equal(zeroButNotTarget.missingTarget, false);

  for (const lens of COVERAGE_LENSES) {
    const highlight = deriveCoverageHighlight(map, lens);
    assert.ok(Array.isArray(highlight.nodeIds));
    assert.ok(Array.isArray(highlight.relationIds));
  }
  const all = deriveCoverageHighlight(map, "all");
  assert.equal(
    all.nodeIds.length,
    map.occurrences.length + map.nonClaimSources.length + map.questions.length,
  );
  assert.equal(all.relationIds.length, map.relationLedger.length);
  assert.equal(JSON.stringify(packet), packetBefore);
  assert.equal(JSON.stringify(map), mapBefore);
});

test("trace labels and states preserve Candidate, Standalone, Ungrouped, question, and non-claim identity", () => {
  const prepared = deriveInvestigationMap(
    buildPreparedSiteReadyCasePacket(),
    "event_time",
  );
  const candidateOccurrence = prepared.occurrences.find(
    (item) => item.rowKind === "candidate_thread",
  );
  const standaloneOccurrence = prepared.occurrences.find(
    (item) => item.rowKind === "standalone_occurrence",
  );
  assert.ok(candidateOccurrence);
  assert.ok(standaloneOccurrence);
  const candidateTrace = deriveThreadTrace(
    prepared,
    candidateOccurrence.nodeId,
  );
  assert.equal(candidateTrace.traceKind, "candidate_thread");
  assert.equal(candidateTrace.traceLabel, "Candidate thread trace");
  const standaloneTrace = deriveThreadTrace(
    prepared,
    standaloneOccurrence.nodeId,
  );
  assert.equal(standaloneTrace.traceKind, "standalone_occurrence");
  assert.equal(
    standaloneTrace.traceLabel,
    "Standalone occurrence trace",
  );

  const inconsistent = buildPreparedSiteReadyCasePacket();
  inconsistent.claim_occurrences[0].candidate_claim_family_id = null;
  const ungroupedMap = deriveInvestigationMap(inconsistent, "event_time");
  const ungrouped = ungroupedMap.occurrences.find(
    (item) => item.rowKind === "ungrouped_occurrence",
  );
  assert.ok(ungrouped);
  const ungroupedTrace = deriveThreadTrace(ungroupedMap, ungrouped.nodeId);
  assert.equal(ungroupedTrace.traceKind, "ungrouped_occurrence");
  assert.equal(
    ungroupedTrace.traceLabel,
    "Ungrouped occurrence trace",
  );

  const questionTrace = deriveThreadTrace(
    prepared,
    prepared.questions[0].nodeId,
  );
  assert.equal(questionTrace.traceKind, "question_context");
  const sourceTrace = deriveThreadTrace(
    prepared,
    prepared.nonClaimSources[0].nodeId,
  );
  assert.equal(sourceTrace.traceKind, "non_claim_source");
});

test("occurrence model preserves the full claim and disciplined provenance boundaries", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const fullClaim =
    "Residents could find safe, air-conditioned spaces across the city, including every qualification that must remain available after a visual clamp.";
  packet.claim_occurrences[0].original_claim_text = fullClaim;
  const map = deriveInvestigationMap(packet, "event_time");
  const occurrence = occurrenceNode(
    map,
    packet.claim_occurrences[0].occurrence_id,
  );

  assert.equal(occurrence.originalClaimText, fullClaim);
  assert.equal(occurrence.occurrenceBoundaryLabel, "Prepared case record");
  assert.equal(occurrence.source.sourceBoundaryLabel, "Prepared source record");
  assert.notEqual(occurrence.nodeId, occurrence.source.sourceId);
  assert.ok(occurrence.actor);
  assert.ok(occurrence.source.title);
  assert.ok(occurrence.source.publisher);
  assert.ok(occurrence.source.sourceRole);
  assert.ok(map.relationLedger.every(
    (relation) => relation.publicReviewLabel === "Needs review",
  ));
});

test("prepared, live, and fallback boundaries share one v2 grammar without collapsing modes", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const live = asLivePacket(prepared);
  const fallback = structuredClone(prepared);
  fallback.run_id = prepared.run_id + "_fallback";
  fallback.mode = "fallback";
  fallback.status = "fallback";
  const packets = [prepared, live, fallback];
  const maps = packets.map((packet) =>
    deriveInvestigationMap(packet, chooseInitialTimeAxis(packet))
  );
  const grammar = grammarSignature(maps[0]);

  for (const map of maps) {
    assert.equal(map.contractVersion, "investigation_map.v2");
    assert.deepEqual(grammarSignature(map), grammar);
  }
  assert.deepEqual(
    maps.map((map) => [map.topic.mode, map.topic.status]),
    [
      ["deterministic", "ready"],
      ["live", "live"],
      ["fallback", "fallback"],
    ],
  );
  assert.equal(
    maps[0].occurrences[0].occurrenceBoundaryLabel,
    "Prepared case record",
  );
  assert.equal(maps[1].occurrences[0].occurrenceBoundaryLabel, "Needs review");
});

test("Publication-only, Assertion-only, Retrieval-only, and zero-occurrence packets keep the same grammar", () => {
  const prepared = buildPreparedSiteReadyCasePacket();
  const variants = [
    clearOccurrenceTimes(prepared, ["event_time"]),
    clearOccurrenceTimes(prepared, ["event_time", "publication_time"]),
    clearOccurrenceTimes(prepared, [
      "event_time",
      "publication_time",
      "actor_assertion_time",
    ]),
  ];
  const expectedRows = rowMembershipSignature(
    deriveInvestigationMap(prepared, chooseInitialTimeAxis(prepared)),
  );
  for (const packet of variants) {
    const map = deriveInvestigationMap(packet, chooseInitialTimeAxis(packet));
    assert.deepEqual(rowMembershipSignature(map), expectedRows);
    assertEveryOccurrenceExactlyOnce(packet, map);
  }

  const zeroOccurrence = structuredClone(prepared);
  zeroOccurrence.claim_occurrences = [];
  zeroOccurrence.candidate_claim_families = [];
  zeroOccurrence.relation_candidates = [];
  zeroOccurrence.claim_lineage_rows = [];
  const zeroMap = deriveInvestigationMap(
    zeroOccurrence,
    chooseInitialTimeAxis(zeroOccurrence),
  );
  assert.equal(zeroMap.rows.length, 0);
  assert.equal(zeroMap.occurrences.length, 0);
  assert.equal(
    zeroMap.nonClaimSources.length,
    zeroOccurrence.source_snapshot_summaries.length,
  );
  assert.equal(zeroMap.selectedTimeAxis, "publication_time");
});

test("compact responsive projection preserves the same entities and semantic ledger", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  const base = deriveInvestigationMapBase(packet);
  const matrix = projectInvestigationMap(base, "event_time", {
    availableWidth: 1_440,
    drawableRelationCount: 3,
    crossRowRelationCount: 2,
    measuredCollisionCount: 0,
    compactResponsiveMode: false,
  });
  const compact = projectInvestigationMap(base, "event_time", {
    availableWidth: 390,
    drawableRelationCount: 3,
    crossRowRelationCount: 2,
    measuredCollisionCount: 0,
    compactResponsiveMode: true,
  });

  assert.equal(matrix.relationPresentation.mode, "matrix");
  assert.equal(compact.relationPresentation.mode, "relation_summary");
  assert.deepEqual(rowSignature(compact), rowSignature(matrix));
  assert.deepEqual(
    compact.occurrences.map((item) => item.occurrenceId),
    matrix.occurrences.map((item) => item.occurrenceId),
  );
  assert.deepEqual(
    compact.nonClaimSources.map((item) => item.sourceId),
    matrix.nonClaimSources.map((item) => item.sourceId),
  );
  assert.deepEqual(
    compact.questions.map((item) => item.questionId),
    matrix.questions.map((item) => item.questionId),
  );
  assert.deepEqual(compact.relationLedger, matrix.relationLedger);
  assertAllRelationsRouted(compact, compact.relationRoutes);
  assert.equal(compact.relationRoutes.spatialRelationIds.length, 0);
  assert.equal(compact.relationRoutes.portRelationIds.length, 3);
});

test("public packet and lineage request contracts remain unchanged", () => {
  const packet = buildPreparedSiteReadyCasePacket();
  assert.doesNotThrow(() => validateSiteReadyCasePacket(packet));
  assert.equal(packet.contract_version, "site_ready_case_packet.v1");

  const request = buildLineageRequest({
    question: "How is public access changing for residents?",
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion",
  });
  assert.deepEqual(request, {
    question: "How is public access changing for residents?",
    sourceLimit: 5,
    discoveryProfile: "coverage_expansion",
  });
  assert.deepEqual(Object.keys(request), [
    "question",
    "sourceLimit",
    "discoveryProfile",
  ]);
});

function assertEveryOccurrenceExactlyOnce(
  packet: SiteReadyCasePacket,
  map: InvestigationMap,
): void {
  const mapped = map.rows.flatMap((row) => row.occurrenceNodeIds);
  assert.equal(mapped.length, packet.claim_occurrences.length);
  assert.equal(new Set(mapped).size, packet.claim_occurrences.length);
  assert.deepEqual(
    [...mapped].sort(),
    packet.claim_occurrences.map((item) => item.occurrence_id).sort(),
  );
  assert.deepEqual(
    map.occurrences.map((item) => item.occurrenceId).sort(),
    packet.claim_occurrences.map((item) => item.occurrence_id).sort(),
  );
}

function rowSignature(map: InvestigationMap): Array<{
  ordinal: number;
  kind: string;
  label: string;
  thread: string | null;
  occurrenceIds: string[];
}> {
  return map.rows.map((row) => ({
    ordinal: row.rowOrdinal,
    kind: row.rowKind,
    label: row.label,
    thread: row.displayThreadNumber,
    occurrenceIds: [...row.occurrenceNodeIds],
  }));
}

function rowMembershipSignature(map: InvestigationMap): Array<{
  kind: string;
  occurrenceIds: string[];
}> {
  return map.rows
    .map((row) => ({
      kind: row.rowKind,
      occurrenceIds: [...row.occurrenceNodeIds].sort(),
    }))
    .sort((left, right) =>
      left.kind.localeCompare(right.kind)
      || left.occurrenceIds.join("|").localeCompare(right.occurrenceIds.join("|"))
    );
}

function clearOccurrenceTimes(
  input: SiteReadyCasePacket,
  axes: readonly Exclude<TimeAxis, "retrieval_time">[],
): SiteReadyCasePacket {
  const packet = structuredClone(input);
  for (const occurrence of packet.claim_occurrences) {
    for (const axis of axes) {
      if (axis === "event_time") {
        occurrence.event_time_candidate = null;
        occurrence.event_time_candidate_precision = null;
      } else if (axis === "publication_time") {
        occurrence.source_publication_time = null;
        occurrence.source_publication_time_precision = null;
      } else {
        occurrence.assertion_time_candidate = null;
        occurrence.assertion_time_candidate_precision = null;
      }
    }
  }
  return packet;
}

function occurrenceNode(map: InvestigationMap, occurrenceId: string) {
  const node = map.occurrences.find(
    (candidate) => candidate.occurrenceId === occurrenceId,
  );
  assert.ok(node);
  return node;
}

function relationEntry(map: InvestigationMap, relationId: string) {
  const entry = map.relationLedger.find(
    (candidate) => candidate.relationId === relationId,
  );
  assert.ok(entry);
  return entry;
}

function editorialSourceId(packet: SiteReadyCasePacket): string {
  const occurrenceSourceIds = new Set(
    packet.claim_occurrences.map((occurrence) => occurrence.source_id),
  );
  const source = packet.source_snapshot_summaries.find(
    (candidate) => !occurrenceSourceIds.has(candidate.source_id),
  );
  assert.ok(source);
  return source.source_id;
}

function packetForNonClaimSubtype(
  subtype: NonClaimSourceSubtype,
): SiteReadyCasePacket {
  const packet = buildPreparedSiteReadyCasePacket();
  const sourceId = editorialSourceId(packet);
  const source = packet.source_snapshot_summaries.find(
    (candidate) => candidate.source_id === sourceId,
  );
  assert.ok(source);
  source.source_selection.information_proximity =
    subtype === "context_interpretation"
      ? "analysis_or_commentary"
      : "unknown";
  packet.actions = packet.actions.filter(
    (action) => !action.source_ids.includes(sourceId),
  );
  packet.source_bound_findings = packet.source_bound_findings.filter(
    (finding) => !finding.source_ids.includes(sourceId),
  );
  if (
    subtype === "action_bearing"
    || subtype === "mixed_non_claim"
  ) {
    const action = structuredClone(packet.actions[0]);
    action.action_id = "action_fixture_non_claim_" + subtype;
    action.source_ids = [sourceId];
    packet.actions.push(action);
  }
  if (
    subtype === "finding_bearing"
    || subtype === "mixed_non_claim"
  ) {
    const finding = structuredClone(packet.source_bound_findings[0]);
    finding.finding_id = "finding_fixture_non_claim_" + subtype;
    finding.source_ids = [sourceId];
    packet.source_bound_findings.push(finding);
  }
  return packet;
}

function nonClaimRecord(
  map: InvestigationMap,
  sourceId: string,
) {
  const record = map.nonClaimSources.find(
    (candidate) => candidate.sourceId === sourceId,
  );
  assert.ok(record);
  return record;
}

function setRelationEndpointTime(
  packet: SiteReadyCasePacket,
  relation: RelationCandidate,
  endpoint: "left" | "right",
  value: string | null,
  precision: "day" | "instant" | null,
): void {
  const occurrenceId = endpoint === "left"
    ? relation.left_occurrence_id
    : relation.right_occurrence_id;
  const occurrence = packet.claim_occurrences.find(
    (item) => item.occurrence_id === occurrenceId,
  );
  assert.ok(occurrence);
  occurrence.event_time_candidate = value;
  occurrence.event_time_candidate_precision = precision;
}

function assertDirection(
  packet: SiteReadyCasePacket,
  relationId: string,
  expected: boolean,
): void {
  const entry = relationEntry(
    deriveInvestigationMap(packet, "event_time"),
    relationId,
  );
  assert.equal(entry.directionAsserted, expected);
  assert.equal(
    entry.directionExplanation,
    expected
      ? "Direction asserted from earlier to later on Event time under the conservative composite rule."
      : "Direction not asserted on the selected axis",
  );
}

function assertAllRelationsRouted(
  map: InvestigationMap,
  routes: {
    spatialRelationIds: string[];
    portRelationIds: string[];
    ledgerOnlyRelationIds: string[];
  },
): void {
  const routed = [
    ...routes.spatialRelationIds,
    ...routes.portRelationIds,
    ...routes.ledgerOnlyRelationIds,
  ];
  assert.equal(routed.length, map.relationLedger.length);
  assert.equal(new Set(routed).size, map.relationLedger.length);
  assert.deepEqual(
    [...routed].sort(),
    map.relationLedger.map((entry) => entry.relationId).sort(),
  );
}

function question(
  questionId: string,
  relatedIds: string[],
): PacketUnresolvedQuestion {
  return {
    question_id: questionId,
    question: "What remains unknown for " + relatedIds.join(", ") + "?",
    related_ids: relatedIds,
    status: "unresolved",
    record_status: "candidate",
    origin: "live_api",
  };
}

function asLivePacket(input: SiteReadyCasePacket): SiteReadyCasePacket {
  const packet = structuredClone(input);
  packet.run_id = input.run_id + "_live";
  packet.mode = "live";
  packet.status = "live";
  packet.discovery_profile = "standard";
  for (const source of packet.source_snapshot_summaries) {
    source.record_status = "candidate";
  }
  for (const occurrence of packet.claim_occurrences) {
    occurrence.status = "candidate";
    occurrence.source_record_status = "candidate";
  }
  for (const claim of packet.actor_claims) claim.status = "candidate";
  for (const action of packet.actions) action.status = "candidate";
  for (const finding of packet.source_bound_findings) finding.status = "candidate";
  for (const unresolved of packet.unresolved_questions) {
    unresolved.record_status = "candidate";
  }
  return packet;
}

function grammarSignature(map: InvestigationMap) {
  return {
    rows: rowSignature(map),
    occurrenceIds: map.occurrences.map((item) => item.occurrenceId),
    nonClaimSourceIds: map.nonClaimSources.map((item) => item.sourceId),
    relationIds: map.relationLedger.map((item) => item.relationId),
    questionIds: map.questions.map((item) => item.questionId),
    coverage: map.coverage,
  };
}
