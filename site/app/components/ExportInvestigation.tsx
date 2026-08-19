"use client";

import { useMemo, useState } from "react";
import type { SiteReadyCasePacket } from "../lib/lineage/contracts";
import { buildPublicExportArtifacts } from "../lib/public-evidence";

export function ExportInvestigation({
  packet,
}: {
  packet: SiteReadyCasePacket;
}) {
  const artifacts = useMemo(() => buildPublicExportArtifacts(packet), [packet]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  if (!artifacts) return null;

  async function copyBrief() {
    try {
      await copyText(artifacts!.shareableBrief);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="export-investigation" aria-labelledby="export-investigation-title">
      <div>
        <strong id="export-investigation-title">Export investigation</strong>
        <span>
          Local export only · no new investigation, provider work, persistence, or detail fetch
        </span>
      </div>
      <div className="export-actions">
        <button type="button" onClick={() => void copyBrief()}>
          Copy shareable brief
        </button>
        <button
          type="button"
          onClick={() => downloadText(
            artifacts.markdownFilename,
            artifacts.markdown,
            "text/markdown;charset=utf-8",
          )}
        >
          Download Markdown
        </button>
        <button
          type="button"
          onClick={() => downloadText(
            artifacts.jsonFilename,
            artifacts.json,
            "application/json;charset=utf-8",
          )}
        >
          Download JSON
        </button>
      </div>
      <p className="export-status" aria-live="polite">
        {copyState === "copied" ? "Shareable brief copied." : null}
        {copyState === "error" ? "Copy was unavailable in this browser." : null}
      </p>
    </section>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy unavailable");
}

function downloadText(filename: string, value: string, type: string): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
