import type { Metadata } from "next";
import { CaseExplorer } from "./components/CaseExplorer";
import { isLiveAnalysisEnabledOnServer } from "./lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "./lib/lineage/builder";

export const metadata: Metadata = {
  title: "Sisyphus Watch | Follow changing public information",
  description:
    "Version history for public information. See what changed, where it came from, and what is still unclear.",
};

export default async function Home() {
  const preparedCase = buildPreparedSiteReadyCasePacket();

  return (
    <CaseExplorer
      preparedCase={preparedCase}
      liveEnabled={await isLiveAnalysisEnabledOnServer()}
    />
  );
}
