import { handleAnalysisRequest } from "../../lib/analysis/handler";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleAnalysisRequest(request, {
    apiKey: process.env.OPENAI_API_KEY,
  });
}
