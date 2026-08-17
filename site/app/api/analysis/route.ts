import { jsonError } from "../../lib/analysis/handler";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return jsonError(
    404,
    "public_analysis_route_disabled",
    "This public route does not execute provider work. Use the bounded investigation route.",
  );
}
