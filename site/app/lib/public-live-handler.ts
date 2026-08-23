import type { AnalysisRoutePayload } from "./analysis/contracts";
import { AnalysisFailure } from "./analysis/errors";
import {
  executeAnalysisRequestInternal,
  invalidAnalysisRequestResponse,
  jsonError,
  parseBoundedAnalysisRequest,
  type AnalysisHandlerDependencies,
} from "./analysis/handler";
import type { NormalizedAnalysisRequest } from "./analysis/request";
import { buildLineageResponseFromAnalysis } from "./lineage/handler";
import { runLineageInternal } from "./lineage/internal";
import type { CaptureDependencies } from "./lineage/source-capture";
import { projectSiteReadyCasePacketV2 } from "./lineage/source-supported-public";
import {
  liveAnalysisDisabledResponse,
  operatorSponsoredLiveDisabledResponse,
  reportPublicLiveRuntimePrerequisiteFailure,
  type PublicLiveRuntime,
} from "./live-mode";
import {
  calculatePublicWorkUnits,
  type AdmissionSettlement,
} from "./public-admission";
import {
  noopPublicLiveDiagnosticSink,
  reportPublicLiveDiagnostic,
  type PublicLiveDiagnosticSink,
} from "./public-live-diagnostics";

export interface PublicLiveHandlerDependencies {
  getRuntime: () => Promise<PublicLiveRuntime>;
  nowMs?: () => number;
  nowISO?: () => string;
  runLive?: AnalysisHandlerDependencies["runLive"];
  runLiveInternal?: AnalysisHandlerDependencies["runLiveInternal"];
  runLineageInternal?: typeof runLineageInternal;
  capture?: CaptureDependencies;
  diagnostics?: PublicLiveDiagnosticSink;
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
  let diagnostics =
    dependencies.diagnostics ?? noopPublicLiveDiagnosticSink;
  try {
    runtime = await dependencies.getRuntime();
  } catch (error) {
    reportPublicLiveDiagnostic(
      diagnostics,
      "runtime_resolution_failed",
      { error },
    );
    return admissionUnavailableResponse();
  }
  diagnostics = dependencies.diagnostics
    ?? runtime.diagnostics?.sink
    ?? noopPublicLiveDiagnosticSink;
  if (!runtime.operatorLiveEnabled) {
    reportPublicLiveRuntimePrerequisiteFailure(runtime, diagnostics);
    return operatorSponsoredLiveDisabledResponse();
  }
  if (!runtime.liveEnabled) {
    reportPublicLiveRuntimePrerequisiteFailure(runtime, diagnostics);
    return liveAnalysisDisabledResponse();
  }
  const apiKey = runtime.apiKey?.trim();
  if (!apiKey || !runtime.admission) {
    reportPublicLiveRuntimePrerequisiteFailure(runtime, diagnostics);
    return admissionUnavailableResponse();
  }

  const nowMs = dependencies.nowMs ?? Date.now;
  let decision;
  reportPublicLiveDiagnostic(diagnostics, "reserve_entered");
  try {
    decision = await runtime.admission.reserve({
      workUnits: calculatePublicWorkUnits(normalized),
      nowMs: nowMs(),
    });
  } catch (error) {
    reportPublicLiveDiagnostic(diagnostics, "reserve_failed", { error });
    return admissionUnavailableResponse();
  }
  reportPublicLiveDiagnostic(diagnostics, "reserve_succeeded", {
    reservationAdmitted: decision.admitted,
  });

  if (!decision.admitted) {
    return jsonError(
      429,
      "capacity_exhausted",
      "Operator-sponsored investigation capacity is currently exhausted. No investigation was replaced; the prepared example and relay path remain separate choices.",
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let response: Response;
  let outcome: AdmissionSettlement = "failed";
  try {
    const analysisExecution = await executeAnalysisRequestInternal(normalized, {
      apiKey,
      now: dependencies.nowISO,
      runLive: dependencies.runLive,
      runLiveInternal: dependencies.runLiveInternal,
    });
    if (analysisExecution.internal_envelope) {
      try {
        const internal = await (
          dependencies.runLineageInternal ?? runLineageInternal
        )(
          analysisExecution.internal_envelope,
          dependencies.capture,
        );
        response = Response.json(projectSiteReadyCasePacketV2(internal));
      } catch {
        response = await buildLineageResponseFromAnalysis(
          analysisExecution.response,
          "site_ready_case_packet.v2",
        );
      }
    } else {
      response = await buildLineageResponseFromAnalysis(
        analysisExecution.response,
        "site_ready_case_packet.v2",
      );
    }
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
    if (!settled) {
      reportPublicLiveDiagnostic(diagnostics, "settlement_failed");
      return admissionUnavailableResponse();
    }
  } catch (error) {
    reportPublicLiveDiagnostic(diagnostics, "settlement_failed", { error });
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
    "Operator-sponsored admission is unavailable. The prepared example and relay path remain available as separate choices.",
  );
}
