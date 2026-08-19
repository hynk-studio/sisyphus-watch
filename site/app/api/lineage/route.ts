import { getPublicLiveRuntime } from "../../lib/live-mode";
import { consolePublicLiveDiagnosticSink } from "../../lib/public-live-diagnostics";
import { handlePublicLiveLineageRequest } from "../../lib/public-live-handler";
import { lineageCapabilityResponse } from "../../lib/agent-surface";
import {
  acceptsPublicEvidenceRepresentation,
  buildPublicLineageRepresentation,
  publicLineageResponse,
} from "../../lib/public-evidence";
import type { SiteReadyCasePacket } from "../../lib/lineage/contracts";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return lineageCapabilityResponse();
}

export async function POST(request: Request): Promise<Response> {
  const wantsPublicEvidence = acceptsPublicEvidenceRepresentation(
    request.headers.get("accept"),
  );
  const lineageResponse = await handlePublicLiveLineageRequest(request, {
    diagnostics: consolePublicLiveDiagnosticSink,
    getRuntime: getPublicLiveRuntime,
  });
  return projectLineageResponse(lineageResponse, wantsPublicEvidence);
}

export async function projectLineageResponse(
  lineageResponse: Response,
  wantsPublicEvidence: boolean,
): Promise<Response> {
  if (!wantsPublicEvidence || lineageResponse.status !== 200) {
    return lineageResponse;
  }
  try {
    const packet = (await lineageResponse.json()) as SiteReadyCasePacket;
    return publicLineageResponse(buildPublicLineageRepresentation(packet));
  } catch {
    return Response.json(
      {
        mode: "unavailable",
        status: "error",
        error: {
          code: "public_evidence_projection_failed",
          message:
            "The public evidence representation failed validation without changing any accepted record.",
        },
        canonical_mutation: "none",
      },
      { status: 500 },
    );
  }
}
