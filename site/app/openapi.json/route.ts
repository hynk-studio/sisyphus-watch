import { openAPIResponse } from "../lib/agent-surface";

export function GET(): Response {
  return openAPIResponse();
}
