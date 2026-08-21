import type { Metadata } from "next";
import { CaseExplorer } from "./components/CaseExplorer";
import { isOperatorSponsoredLiveReadyOnServer } from "./lib/live-mode";
import { buildPreparedSiteReadyCasePacket } from "./lib/lineage/builder";

export const metadata: Metadata = {
  title: "Sisyphus Watch | Build an investigation map",
  description:
    "Start with a public-interest question, map bounded sources and candidate relations, and keep open questions visible.",
};

export default async function Home() {
  const preparedCase = buildPreparedSiteReadyCasePacket();

  return (
    <CaseExplorer
      preparedCase={preparedCase}
      operatorSponsoredReady={await isOperatorSponsoredLiveReadyOnServer()}
    />
  );
}
