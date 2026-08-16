import {
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

    return Response.json({
      openai_api_key_present: isPresent(
        environment[OPENAI_KEY_ENVIRONMENT_NAME],
      ),
      sisyphus_live_enabled_present: isPresent(
        environment[LIVE_MODE_ENVIRONMENT_FLAG],
      ),
    });
  },
};

function isPresent(value: unknown): boolean {
  return typeof value === "string" && Boolean(value);
}
