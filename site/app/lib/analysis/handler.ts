import type { AnalysisErrorPacket, AnalysisRunPacket } from "./contracts";
import { AnalysisFailure } from "./errors";
import { buildFallbackPacket } from "./fallback";
import { runOpenAIAnalysisWithKey } from "./openai-adapter";
import { parseAnalysisRequest, RequestValidationError } from "./request";

const MAX_REQUEST_BYTES = 4_096;

export interface AnalysisHandlerDependencies {
  apiKey: string | undefined;
  now?: () => string;
  runLive?: typeof runOpenAIAnalysisWithKey;
}

export async function handleAnalysisRequest(
  request: Request,
  dependencies: AnalysisHandlerDependencies,
): Promise<Response> {
  let normalized: { question: string; sourceLimit: number };
  try {
    normalized = parseAnalysisRequest(await readBoundedJSON(request));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return jsonError(400, error.code, error.message);
    }
    return jsonError(400, "invalid_json", "Request body must be valid bounded JSON.");
  }

  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const apiKey = dependencies.apiKey?.trim();
  if (!apiKey) {
    return Response.json(
      await buildFallbackPacket({
        ...normalized,
        generatedAt,
        reasonCode: "missing_api_key",
        reasonMessage:
          "Live analysis is unavailable because the server API key is not configured.",
      }),
    );
  }

  try {
    const packet = await (dependencies.runLive ?? runOpenAIAnalysisWithKey)({
      apiKey,
      ...normalized,
      generatedAt,
    });
    return Response.json(packet satisfies AnalysisRunPacket);
  } catch (error) {
    if (error instanceof AnalysisFailure) {
      return Response.json(
        await buildFallbackPacket({
          ...normalized,
          generatedAt,
          reasonCode: error.code,
          reasonMessage: error.safeMessage,
        }),
      );
    }
    return jsonError(
      500,
      "server_route_failure",
      "The analysis route failed without changing canonical state.",
    );
  }
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

function jsonError(status: number, code: string, message: string): Response {
  const body: AnalysisErrorPacket = {
    mode: "fallback",
    status: "error",
    error: { code, message },
    canonical_mutation: "none",
  };
  return Response.json(body, { status });
}
