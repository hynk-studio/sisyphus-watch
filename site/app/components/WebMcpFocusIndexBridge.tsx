"use client";

import { useEffect } from "react";
import { WEBMCP_REVIEW_KINDS } from "../lib/webmcp/co-review";
import { FOCUS_TRIGGER_ATTRIBUTE } from "./investigation-types";

/**
 * The human UI already gives every inspector trigger a stable
 * `data-focus-trigger="surface:kind:id"` identity. WebMCP reuses that existing
 * contract and mirrors only the bounded kind/id suffix into explicit dataset
 * fields so browser-side agent navigation does not depend on button copy or DOM
 * position.
 */
export function WebMcpFocusIndexBridge() {
  useEffect(() => {
    const sync = () => {
      for (const element of document.querySelectorAll<HTMLElement>(
        `[${FOCUS_TRIGGER_ATTRIBUTE}]`,
      )) {
        if (element.dataset.focusKind && element.dataset.focusId) continue;
        const identity = element.getAttribute(FOCUS_TRIGGER_ATTRIBUTE);
        if (!identity) continue;
        for (const kind of WEBMCP_REVIEW_KINDS) {
          const marker = `:${kind}:`;
          const markerIndex = identity.indexOf(marker);
          if (markerIndex < 0) continue;
          const id = identity.slice(markerIndex + marker.length);
          if (!id) continue;
          element.dataset.focusKind = kind;
          element.dataset.focusId = id;
          break;
        }
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
