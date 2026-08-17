import type { AnalysisRoutePayload } from "./analysis/contracts";
import { AnalysisFailure } from "./analysis/errors";
import {
  executeAnalysisRequest,
  invalidAnalysisRequestResponse,
  jsonError,
  parseBoundedAnalysisRequest,
  type AnalysisHandlerDependencies,
} from "./analysis/handler";
import type { NormalizedAnalysisRequest } from "./analysis/request";
import { buildLineageResponseFromAnalysis } from "./lineage/handler";
import { liveAnalysisDisabledResponse, type PublicLiveRuntime } from "./live-mode";
import {
  calculatePublicWorkUnits,
  type AdmissionSettlement,
} from "./public-admission";

export interface PublicLiveHandlerDependencies {
  getRuntime: () => Promise<PublicLiveRuntime>;
  nowMs?: () => number;
  nowISO?: () => string;
  runLive?: AnalysisHandlerDependencies["runLive"];
}

export async function handlePublicLiveLineageRequest(
  request: Request,
  dependencies: PublicLiveHandlerDependencies,
): Promise<Response> {
  let normalized: NormalizedAnalysisRequest;
  try {
    normalized = await parseBoundedAnalysisRequest(request);
  } catch (error) {
    return invalidAnalysisRequestResponse(error);
  }

  let runtime: PublicLiveRuntime;
  try {
    runtime = await dependencies.getRuntime();
  } catch {
    return admissionUnavailableResponse();
  }
  if (!runtime.liveEnabled) return liveAnalysisDisabledResponse();
  const apiKey = runtime.apiKey?.trim();
  if (!apiKey || !runtime.admission) {
    return admissionUnavailableResponse();
  }

  const nowMs = dependencies.nowMs ?? Date.now;
  let decision;
  try {
    decision = await runtime.admission.reserve({
      workUnits: calculatePublicWorkUnits(normalized),
      nowMs: nowMs(),
    });
  } catch {
    return admissionUnavailableResponse();
  }

  if (!decision.admitted) {
    return jsonError(
      429,
      "capacity_exhausted",
      "Public live investigation capacity is currently exhausted. No investigation was replaced; the prepared example remains a separate choice.",
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let response: Response;
  let outcome: AdmissionSettlement = "failed";
  try {
    const analysisResponse = await executeAnalysisRequest(normalized, {
      apiKey,
      now: dependencies.nowISO,
      runLive: dependencies.runLive,
    });
    response = await buildLineageResponseFromAnalysis(analysisResponse);
    outcome = await settlementForResponse(response);
  } catch (error) {
    outcome = error instanceof AnalysisFailure
      && error.code === "workflow_deadline_exceeded"
      ? "timed_out"
      : "failed";
    response = jsonError(
      500,
      "server_route_failure",
      "The public investigation route failed without changing the accepted record.",
    );
  }

  try {
    const settled = await runtime.admission.settle({
      reservationId: decision.reservation.reservationId,
      outcome,
      nowMs: nowMs(),
    });
    if (!settled) return admissionUnavailableResponse();
  } catch {
    return admissionUnavailableResponse();
  }

  return response;
}

async function settlementForResponse(response: Response): Promise<AdmissionSettlement> {
  const payload = (await response.clone().json()) as AnalysisRoutePayload;
  if (payload.status === "error") {
    return payload.error.code === "workflow_deadline_exceeded"
      ? "timed_out"
      : "failed";
  }
  return payload.mode === "live" ? "settled" : "failed";
}

function admissionUnavailableResponse(): Response {
  return jsonError(
    503,
    "service_admission_unavailable",
    "Public live admission is unavailable. The prepared example remains available as a separate choice.",
  );
}
