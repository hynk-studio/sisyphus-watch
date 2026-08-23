import type { AnalysisRunPacket, AnalysisRoutePayload } from "../analysis/contracts";
import {
  handleAnalysisRequestInternal,
  type AnalysisHandlerDependencies,
} from "../analysis/handler";
import { buildSiteReadyCasePacketFromAnalysis } from "./builder";
import { runLineageInternal } from "./internal";
import type { CaptureDependencies } from "./source-capture";
import { projectSiteReadyCasePacketV2 } from "./source-supported-public";

export interface LineageHandlerDependencies extends AnalysisHandlerDependencies {
  capture?: CaptureDependencies;
}

export async function handleLineageRequest(
  request: Request,
  dependencies: LineageHandlerDependencies,
): Promise<Response> {
  const execution = await handleAnalysisRequestInternal(request, dependencies);
  if (execution.internal_envelope) {
    try {
      const internal = await runLineageInternal(
        execution.internal_envelope,
        dependencies.capture,
      );
      return Response.json(projectSiteReadyCasePacketV2(internal));
    } catch {
      return buildLineageResponseFromAnalysis(execution.response);
    }
  }
  return buildLineageResponseFromAnalysis(execution.response);
}

export async function buildLineageResponseFromAnalysis(
  analysisResponse: Response,
): Promise<Response> {
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
        mode: "unavailable",
        status: "error",
        error: {
          code: "lineage_packet_validation_failed",
          message: "The lineage packet failed validation without changing the accepted record.",
        },
        canonical_mutation: "none",
      },
      { status: 500 },
    );
  }
}
