import { buildPreparedSiteReadyCasePacket } from "../../../lib/lineage/builder";
import { DETAIL_KINDS, type SiteDetailKind } from "../../../lib/lineage/contracts";
import { getSiteReadyCaseDetail } from "../../../lib/lineage/details";
import { getPreparedCase, getPreparedCaseDetail } from "../../../lib/read-model";

const detailKinds = new Set<SiteDetailKind>(DETAIL_KINDS);

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const url = new URL(request.url);
  const focus = url.searchParams.get("focus");
  const id = url.searchParams.get("id");

  try {
    const packet = buildPreparedSiteReadyCasePacket(getPreparedCase(caseId));
    if (!focus && !id) return Response.json(packet);
    if (!focus || !id || !detailKinds.has(focus as SiteDetailKind)) {
      return Response.json(
        { error: `focus must be one of ${DETAIL_KINDS.join(", ")} and include id` },
        { status: 400 },
      );
    }
    if (focus === "source") {
      const sourceDetail = getPreparedCaseDetail(caseId, "source", id);
      return sourceDetail
        ? Response.json({
            case_id: caseId,
            run_id: packet.run_id,
            focus_kind: "source",
            focus_id: id,
            detail: sourceDetail.detail,
          })
        : Response.json({ error: "Focused lineage record not found" }, { status: 404 });
    }
    const result = getSiteReadyCaseDetail(packet, focus as SiteDetailKind, id);
    return result
      ? Response.json(result)
      : Response.json({ error: "Focused lineage record not found" }, { status: 404 });
  } catch {
    return Response.json({ error: "Site-ready case not found" }, { status: 404 });
  }
}
