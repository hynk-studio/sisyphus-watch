import { handleAnalysisRequest } from "../../lib/analysis/handler";
import {
  getServerEnvironmentValue,
  isLiveAnalysisEnabledOnServer,
  liveAnalysisDisabledResponse,
  OPENAI_KEY_ENVIRONMENT_NAME,
} from "../../lib/live-mode";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isLiveAnalysisEnabledOnServer())) {
    return liveAnalysisDisabledResponse();
  }
  return handleAnalysisRequest(request, {
    apiKey: await getServerEnvironmentValue(OPENAI_KEY_ENVIRONMENT_NAME),
  });
}
