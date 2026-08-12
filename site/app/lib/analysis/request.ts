import {
  AnalysisRequestSchema,
  NormalizedAnalysisRequestSchema,
} from "./schemas";

export class RequestValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RequestValidationError";
    this.code = code;
  }
}

export function parseAnalysisRequest(value: unknown): {
  question: string;
  sourceLimit: number;
} {
  const request = AnalysisRequestSchema.safeParse(value);
  if (!request.success) {
    const sourceLimitIssue = request.error.issues.some(
      (issue) => issue.path[0] === "sourceLimit",
    );
    throw new RequestValidationError(
      sourceLimitIssue ? "source_limit_violation" : "invalid_request",
      sourceLimitIssue
        ? "Source limit must be an integer between 1 and 8."
        : "Request must contain only a question and optional sourceLimit.",
    );
  }

  const normalized = NormalizedAnalysisRequestSchema.safeParse({
    question: request.data.question.trim().replace(/\s+/g, " "),
    sourceLimit: request.data.sourceLimit,
  });
  if (!normalized.success) {
    const questionIssue = normalized.error.issues.some(
      (issue) => issue.path[0] === "question",
    );
    throw new RequestValidationError(
      questionIssue ? "invalid_question" : "source_limit_violation",
      questionIssue
        ? "Question must contain between 12 and 500 characters after normalization."
        : "Source limit must be an integer between 1 and 8.",
    );
  }

  return normalized.data;
}
