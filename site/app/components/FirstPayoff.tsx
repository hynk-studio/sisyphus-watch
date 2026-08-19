"use client";

import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import {
  focusTriggerId,
  type FocusHandler,
  type FocusSelection,
} from "./investigation-types";

export interface FirstPayoffRecord {
  finding: SiteReadyCasePacket["source_bound_findings"][number];
  source: SiteReadyCasePacket["source_snapshot_summaries"][number];
}

export function firstPayoffForPacket(
  packet: SiteReadyCasePacket,
): FirstPayoffRecord | null {
  if (packet.mode === "fallback") return null;

  const sources = new Map(
    packet.source_snapshot_summaries.map((source) => [source.source_id, source]),
  );
  for (const finding of packet.source_bound_findings) {
    if (!finding.text.trim()) continue;
    for (const sourceId of finding.source_ids) {
      const source = sources.get(sourceId);
      if (source?.title.trim()) return { finding, source };
    }
  }
  return null;
}

export function FirstPayoff({
  packet,
  onFocus,
}: {
  packet: SiteReadyCasePacket;
  onFocus: FocusHandler;
}) {
  const payoff = firstPayoffForPacket(packet);
  if (!payoff) return null;

  const selection: FocusSelection = {
    kind: "source",
    id: payoff.source.source_id,
    label: payoff.source.title,
  };
  const synthetic = packet.mode === "deterministic";

  return (
    <section className="first-payoff" aria-labelledby="first-payoff-title">
      <div className="first-payoff-heading">
        <p className="eyebrow">Start here</p>
        <strong id="first-payoff-title">
          {synthetic
            ? "Synthetic fixture · prepared example"
            : "Candidate evidence · review only"}
        </strong>
      </div>
      <blockquote>{payoff.finding.text}</blockquote>
      <p className="first-payoff-source">
        Source: {" "}
        <button
          type="button"
          data-focus-trigger={focusTriggerId("first-payoff", selection)}
          onClick={(event) => onFocus(selection, event.currentTarget)}
        >
          {payoff.source.title}
        </button>
      </p>
      <p className="first-payoff-boundary">
        Source inclusion is not endorsement or truth verification. Browsing does
        not change the record.
      </p>
    </section>
  );
}
