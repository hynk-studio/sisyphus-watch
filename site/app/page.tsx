import type { Metadata } from "next";
import { CaseExplorer } from "./components/CaseExplorer";
import { getPreparedCase } from "./lib/read-model";

export const metadata: Metadata = {
  title: "Sisyphus Watch | Prepared case",
  description:
    "Inspect a deterministic public-communication case with optional server-side OpenAI analysis.",
};

export default function Home() {
  const preparedCase = getPreparedCase("city_heatwave_cooling_centers");

  return <CaseExplorer preparedCase={preparedCase} />;
}
