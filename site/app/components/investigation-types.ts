import type { SiteDetailKind } from "../lib/lineage/contracts";

export interface FocusSelection {
  kind: SiteDetailKind;
  id: string;
  label: string;
}

export type FocusHandler = (
  selection: FocusSelection,
  trigger: HTMLElement,
) => void;

export const FOCUS_TRIGGER_ATTRIBUTE = "data-focus-trigger";

export function focusTriggerId(
  surface: string,
  selection: Pick<FocusSelection, "kind" | "id">,
): string {
  return `${surface}:${selection.kind}:${selection.id}`;
}
