import type { AnalysisRunPacket, AnalysisRoutePayload } from "../analysis/contracts";
import {
  handleAnalysisRequest,
  type AnalysisHandlerDependencies,
} from "../analysis/handler";
import { buildSiteReadyCasePacketFromAnalysis } from "./builder";

export async function handleLineageRequest(
  request: Request,
  dependencies: AnalysisHandlerDependencies,
): Promise<Response> {
  const analysisResponse = await handleAnalysisRequest(request, dependencies);
  const payload = (await analysisResponse.json()) as AnalysisRoutePayload;
  if (payload.status === "error") {
    return Response.json(payload, { status: analysisResponse.status });
  }

  try {
    return Response.json(
      buildSiteReadyCasePacketFromAnalysis(payload satisfies AnalysisRunPacket),
    );
  } catch {
    return Response.json(
      {
        mode: "fallback",
        status: "error",
        error: {
          code: "lineage_packet_validation_failed",
          message: "The lineage packet failed validation without changing canonical state.",
        },
        canonical_mutation: "none",
      },
      { status: 500 },
    );
  }
}
