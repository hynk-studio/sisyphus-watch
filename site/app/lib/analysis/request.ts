import { normalizePublicQuestion } from "./contracts";
import {
  NormalizedPublicAnalysisRequestSchema,
  PublicAnalysisRequestSchema,
} from "./schemas";

export class RequestValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RequestValidationError";
    this.code = code;
  }
}

export interface NormalizedAnalysisRequest {
  question: string;
  sourceLimit: number;
  discoveryProfile: "standard" | "coverage_expansion";
}

export function parseAnalysisRequest(value: unknown): NormalizedAnalysisRequest {
  const request = PublicAnalysisRequestSchema.safeParse(value);
  if (!request.success) {
    const sourceLimitIssue = request.error.issues.some(
      (issue) => issue.path[0] === "sourceLimit",
    );
    throw new RequestValidationError(
      sourceLimitIssue ? "source_limit_violation" : "invalid_request",
      sourceLimitIssue
        ? "The public demo accepts at most 5 sources. Source limit must be an integer between 1 and 5."
        : "Request must contain only a question, optional sourceLimit, and optional discoveryProfile.",
    );
  }

  const normalized = NormalizedPublicAnalysisRequestSchema.safeParse({
    question: normalizePublicQuestion(request.data.question),
    sourceLimit: request.data.sourceLimit,
    discoveryProfile: request.data.discoveryProfile,
  });
  if (!normalized.success) {
    const questionIssue = normalized.error.issues.some(
      (issue) => issue.path[0] === "question",
    );
    throw new RequestValidationError(
      questionIssue ? "invalid_question" : "source_limit_violation",
      questionIssue
        ? "Question must contain between 12 and 500 characters after normalization."
        : "The public demo accepts at most 5 sources. Source limit must be an integer between 1 and 5.",
    );
  }

  return normalized.data;
}
