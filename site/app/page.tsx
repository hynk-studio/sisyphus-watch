import type { Metadata } from "next";
import { CaseExplorer } from "./components/CaseExplorer";
import { isLiveAnalysisEnabledOnServer } from "./lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "./lib/lineage/builder";

export const metadata: Metadata = {
  title: "Sisyphus Watch | Follow changing public information",
  description:
    "See what changed, which source changed it, and what remains unresolved.",
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
