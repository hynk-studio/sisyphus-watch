import {
  getServerEnvironmentValue,
  LIVE_MODE_ENVIRONMENT_FLAG,
  OPENAI_KEY_ENVIRONMENT_NAME,
} from "../../app/lib/live-mode";
import productionWorker from "../../worker/index";

interface ProbeEnvironment {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
  [key: string]: unknown;
}

// Test-only Worker entry. The production Vite config never includes this
// diagnostic surface.
export default {
  async fetch(
    request: Request,
    environment: ProbeEnvironment,
    context: ExecutionContext,
  ): Promise<Response> {
    const productionResponse = await productionWorker.fetch(
      new Request(new URL("/api/cases", request.url)),
      environment,
      context,
    );
    if (!productionResponse.ok) {
      return new Response("Production Worker request failed.", { status: 500 });
    }
    await productionResponse.arrayBuffer();

    const accessorOpenAIKey = await getServerEnvironmentValue(
      OPENAI_KEY_ENVIRONMENT_NAME,
    );
    const accessorLiveMode = await getServerEnvironmentValue(
      LIVE_MODE_ENVIRONMENT_FLAG,
    );

    return Response.json({
      openai_api_key_handler_present: isPresent(
        environment[OPENAI_KEY_ENVIRONMENT_NAME],
      ),
      openai_api_key_accessor_present: isPresent(accessorOpenAIKey),
      sisyphus_live_enabled_handler_present: isPresent(
        environment[LIVE_MODE_ENVIRONMENT_FLAG],
      ),
      sisyphus_live_enabled_accessor_present: isPresent(accessorLiveMode),
    });
  },
};

function isPresent(value: unknown): boolean {
  return typeof value === "string" && Boolean(value);
}
