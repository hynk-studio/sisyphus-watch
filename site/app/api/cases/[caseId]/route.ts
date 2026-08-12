import type { FocusKind } from "../../../lib/contracts";
import {
  getPreparedCase,
  getPreparedCaseDetail,
} from "../../../lib/read-model";

const focusKinds = new Set<FocusKind>([
  "source",
  "claim",
  "timeline",
  "question",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const url = new URL(request.url);
  const focus = url.searchParams.get("focus");
  const id = url.searchParams.get("id");

  try {
    if (!focus && !id) {
      return Response.json(getPreparedCase(caseId));
    }
    if (!focus || !id || !focusKinds.has(focus as FocusKind)) {
      return Response.json(
        { error: "focus must be source, claim, timeline, or question and include id" },
        { status: 400 },
      );
    }

    const result = getPreparedCaseDetail(caseId, focus as FocusKind, id);
    return result
      ? Response.json(result)
      : Response.json({ error: "Focused record not found" }, { status: 404 });
  } catch {
    return Response.json({ error: "Prepared case not found" }, { status: 404 });
  }
}
