import type { Metadata } from "next";
import { CaseExplorer } from "./components/CaseExplorer";
import { buildPreparedSiteReadyCasePacket } from "./lib/lineage/builder";

export const metadata: Metadata = {
  title: "Sisyphus Watch | Prepared case",
  description:
    "Inspect a deterministic public-communication case with optional server-side OpenAI analysis.",
};

export default function Home() {
  const preparedCase = buildPreparedSiteReadyCasePacket();

  return <CaseExplorer preparedCase={preparedCase} />;
}
