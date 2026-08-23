import type { AnalysisRunPacket, AnalysisRoutePayload } from "../analysis/contracts";
import {
  handleAnalysisRequestInternal,
  type AnalysisHandlerDependencies,
} from "../analysis/handler";
import { buildSiteReadyCasePacketFromAnalysis } from "./builder";
import { runLineageInternal } from "./internal";
import type { CaptureDependencies } from "./source-capture";
import {
  projectSiteReadyCasePacketV2,
  projectSiteReadyCasePacketV2WithoutSignals,
} from "./source-supported-public";

export interface LineageHandlerDependencies extends AnalysisHandlerDependencies {
  capture?: CaptureDependencies;
  runLineageInternal?: typeof runLineageInternal;
}

export async function handleLineageRequest(
  request: Request,
  dependencies: LineageHandlerDependencies,
): Promise<Response> {
  const execution = await handleAnalysisRequestInternal(request, dependencies);
  if (execution.internal_envelope) {
    try {
      const internal = await (dependencies.runLineageInternal ?? runLineageInternal)(
        execution.internal_envelope,
        dependencies.capture,
      );
      return Response.json(projectSiteReadyCasePacketV2(internal));
    } catch {
      return buildLineageResponseFromAnalysis(
        execution.response,
        "site_ready_case_packet.v2",
      );
    }
  }
  return buildLineageResponseFromAnalysis(
    execution.response,
    "site_ready_case_packet.v2",
  );
}

export async function buildLineageResponseFromAnalysis(
  analysisResponse: Response,
  successfulLiveContract: "site_ready_case_packet.v1" | "site_ready_case_packet.v2" =
    "site_ready_case_packet.v1",
): Promise<Response> {
  const payload = (await analysisResponse.json()) as AnalysisRoutePayload;
  if (payload.status === "error") {
    return Response.json(payload, { status: analysisResponse.status });
  }

  try {
    const packet = buildSiteReadyCasePacketFromAnalysis(
      payload satisfies AnalysisRunPacket,
    );
    return Response.json(
      successfulLiveContract === "site_ready_case_packet.v2"
        && packet.mode === "live"
        && packet.status === "live"
        ? projectSiteReadyCasePacketV2WithoutSignals(packet)
        : packet,
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
