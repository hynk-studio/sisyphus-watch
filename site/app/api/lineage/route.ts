import { getPublicLiveRuntime } from "../../lib/live-mode";
import { handlePublicLiveLineageRequest } from "../../lib/public-live-handler";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handlePublicLiveLineageRequest(request, {
    getRuntime: getPublicLiveRuntime,
  });
}
