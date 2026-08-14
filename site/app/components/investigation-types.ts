import type { SiteDetailKind } from "../lib/lineage/contracts";

export interface FocusSelection {
  kind: SiteDetailKind;
  id: string;
  label: string;
}
