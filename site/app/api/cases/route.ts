import { listPreparedCases } from "../../lib/read-model";

export function GET() {
  return Response.json({ cases: listPreparedCases() });
}
