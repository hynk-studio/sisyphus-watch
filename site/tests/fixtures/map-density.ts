import { buildPreparedSiteReadyCasePacket } from "../../app/lib/lineage/builder";
import type { SiteReadyCasePacket } from "../../app/lib/lineage/contracts";
import type { DiscoveryLane } from "../../app/lib/source-profile";

export type MapDensitySourceCount = 3 | 5 | 8;

const EXTRA_LANES: readonly DiscoveryLane[] = [
  "primary_or_origin",
  "local_or_firsthand",
  "specialist_context",
  "challenge_or_correction",
];

export function buildMapDensityFixture(
  sourceCount: MapDensitySourceCount,
): SiteReadyCasePacket {
  const packet = structuredClone(buildPreparedSiteReadyCasePacket());
  const baseSources = packet.source_snapshot_summaries.slice(0, sourceCount);
  const cloneSource = packet.source_snapshot_summaries.at(-1);
  if (!cloneSource) throw new Error("prepared density source unavailable");

  while (baseSources.length < sourceCount) {
    const index = baseSources.length + 1;
    const sourceId = `src_internal_density_stress_${index}`;
    const snapshotId = `snapshot_internal_density_stress_${index}`;
    const lane = EXTRA_LANES[(index - 5) % EXTRA_LANES.length];
    baseSources.push({
      ...structuredClone(cloneSource),
      source_id: sourceId,
      snapshot_id: snapshotId,
      title: `Internal density stress source ${index}`,
      url: `https://density-${index}.example.org/public-record`,
      domain: `density-${index}.example.org`,
      publisher: `Density fixture publisher ${index}`,
      published_at: `2026-08-${String(index).padStart(2, "0")}T12:00:00Z`,
      retrieved_at: `2026-08-${String(index).padStart(2, "0")}T13:00:00Z`,
      source_selection: {
        ...structuredClone(cloneSource.source_selection),
        discovery_lane: lane,
        why_included: "Internal test-only source used to stress bounded map density.",
      },
    });
    packet.focused_detail_lookup_keys.push({
      kind: "source",
      id: sourceId,
      key: `source:${sourceId}`,
    });
  }

  packet.source_snapshot_summaries = baseSources;
  packet.focused_detail_lookup_keys = packet.focused_detail_lookup_keys.filter(
    (item) => item.kind !== "source" || baseSources.some((source) => source.source_id === item.id),
  );
  packet.actual_source_count = sourceCount;
  packet.requested_source_limit = sourceCount;
  packet.run_id = `run_internal_density_fixture_${sourceCount}`;
  packet.title = `${sourceCount}-source internal map density fixture`;
  if (packet.coverage_summary.coverage_basis === "prepared_fixture") {
    packet.coverage_summary.fixture_source_count = sourceCount;
  }
  packet.limitations = [
    ...packet.limitations,
    sourceCount === 8
      ? "The eight-source density packet is test-only and is not a public selectable input."
      : "Deterministic mocked packet for public map-density regression testing.",
  ];
  return packet;
}
