import { handleLineageRequest } from "../../lib/lineage/handler";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleLineageRequest(request, {
    apiKey: process.env.OPENAI_API_KEY,
  });
}
