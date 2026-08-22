import type { AnalysisErrorPacket, AnalysisRunPacket } from "./contracts";
import { AnalysisFailure } from "./errors";
import { buildFallbackPacket } from "./fallback";
import {
  runOpenAIAnalysisWithKey,
  runOpenAIAnalysisWithKeyInternal,
} from "./openai-adapter";
import type { InternalAnalysisRunEnvelope } from "./relation-cues";
import {
  parseAnalysisRequest,
  RequestValidationError,
  type NormalizedAnalysisRequest,
} from "./request";

const MAX_REQUEST_BYTES = 4_096;

export interface AnalysisHandlerDependencies {
  apiKey: string | undefined;
  now?: () => string;
  runLive?: typeof runOpenAIAnalysisWithKey;
  runLiveInternal?: typeof runOpenAIAnalysisWithKeyInternal;
}

export interface InternalAnalysisExecution {
  response: Response;
  internal_envelope: InternalAnalysisRunEnvelope | null;
}

export async function handleAnalysisRequest(
  request: Request,
  dependencies: AnalysisHandlerDependencies,
): Promise<Response> {
  return (await handleAnalysisRequestInternal(request, dependencies)).response;
}

export async function handleAnalysisRequestInternal(
  request: Request,
  dependencies: AnalysisHandlerDependencies,
): Promise<InternalAnalysisExecution> {
  let normalized: NormalizedAnalysisRequest;
  try {
    normalized = await parseBoundedAnalysisRequest(request);
  } catch (error) {
    return {
      response: invalidAnalysisRequestResponse(error),
      internal_envelope: null,
    };
  }

  return executeAnalysisRequestInternal(normalized, dependencies);
}

export async function executeAnalysisRequest(
  normalized: NormalizedAnalysisRequest,
  dependencies: AnalysisHandlerDependencies,
): Promise<Response> {
  return (await executeAnalysisRequestInternal(normalized, dependencies)).response;
}

export async function executeAnalysisRequestInternal(
  normalized: NormalizedAnalysisRequest,
  dependencies: AnalysisHandlerDependencies,
): Promise<InternalAnalysisExecution> {
  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const apiKey = dependencies.apiKey?.trim();
  if (!apiKey) {
    return {
      response: Response.json(
        await buildFallbackPacket({
          ...normalized,
          generatedAt,
          reasonCode: "missing_api_key",
          reasonMessage:
            "Live analysis is unavailable because the server API key is not configured.",
        }),
      ),
      internal_envelope: null,
    };
  }

  try {
    let internalEnvelope: InternalAnalysisRunEnvelope | null = null;
    const input = { apiKey, ...normalized, generatedAt };
    let packet: AnalysisRunPacket;
    if (dependencies.runLiveInternal) {
      internalEnvelope = await dependencies.runLiveInternal(input);
      packet = internalEnvelope.analysis_run;
    } else if (dependencies.runLive) {
      packet = await dependencies.runLive(input);
    } else {
      internalEnvelope = await runOpenAIAnalysisWithKeyInternal(input);
      packet = internalEnvelope.analysis_run;
    }
    return {
      response: Response.json(packet satisfies AnalysisRunPacket),
      internal_envelope: internalEnvelope,
    };
  } catch (error) {
    if (error instanceof AnalysisFailure) {
      if (error.code === "workflow_deadline_exceeded") {
        return {
          response: jsonError(504, error.code, error.safeMessage),
          internal_envelope: null,
        };
      }
      if (error.code === "service_spend_limit_reached") {
        return {
          response: jsonError(429, error.code, error.safeMessage),
          internal_envelope: null,
        };
      }
      return {
        response: Response.json(
          await buildFallbackPacket({
            ...normalized,
            generatedAt,
            reasonCode: error.code,
            reasonMessage: error.safeMessage,
          }),
        ),
        internal_envelope: null,
      };
    }
    return {
      response: jsonError(
        500,
        "server_route_failure",
        "The analysis route failed without changing the accepted record.",
      ),
      internal_envelope: null,
    };
  }
}

export async function parseBoundedAnalysisRequest(
  request: Request,
): Promise<NormalizedAnalysisRequest> {
  return parseAnalysisRequest(await readBoundedJSON(request));
}

export function invalidAnalysisRequestResponse(error: unknown): Response {
  if (error instanceof RequestValidationError) {
    return jsonError(400, error.code, error.message);
  }
  return jsonError(400, "invalid_json", "Request body must be valid bounded JSON.");
}

async function readBoundedJSON(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("unsupported content type");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new Error("request too large");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("request too large");
  }
  return JSON.parse(text);
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  const body: AnalysisErrorPacket = {
    mode: "unavailable",
    status: "error",
    error: { code, message },
    canonical_mutation: "none",
  };
  return Response.json(body, { status, headers });
}
