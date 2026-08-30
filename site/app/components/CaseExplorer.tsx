import type { ComponentProps } from "react";
import {
  AnalysisResult,
  CaseExplorer as InvestigationExplorerCaseExplorer,
  LineageResult,
  SisyphusWordmark,
  StartNewInvestigationButton,
  getRunNotice,
  loadingStatusText,
} from "./InvestigationExplorer";
import { WebMcpChallengeBridge } from "./WebMcpChallengeBridge";
import { WebMcpFocusIndexBridge } from "./WebMcpFocusIndexBridge";
import { WebMcpInspectionBridge } from "./WebMcpInspectionBridge";

export function CaseExplorer(
  props: ComponentProps<typeof InvestigationExplorerCaseExplorer>,
) {
  return (
    <>
      <InvestigationExplorerCaseExplorer {...props} />
      <WebMcpFocusIndexBridge />
      <WebMcpChallengeBridge preparedCase={props.preparedCase} />
      <WebMcpInspectionBridge preparedCase={props.preparedCase} />
    </>
  );
}

export {
  AnalysisResult,
  LineageResult,
  SisyphusWordmark,
  StartNewInvestigationButton,
  getRunNotice,
  loadingStatusText,
};
export { SisyphusLoadingStatus, SisyphusMark } from "./SisyphusMark";
export { FocusedDetailPanel } from "./FocusedDetailPanel";
export {
  FirstPayoff,
  firstPayoffForPacket,
} from "./FirstPayoff";
export { InvestigationMapView } from "./InvestigationMapView";
export {
  MethodView,
  SourcesView,
  TimelineView,
} from "./InvestigationResultViews";
export { SearchComposer } from "./SearchComposer";
export type { FocusSelection } from "./investigation-types";