import { buildSiteReadyCasePacketFromAnalysis } from "../../app/lib/lineage/builder";
import {
  validateSiteReadyCasePacket,
  type SiteReadyCasePacketV2,
} from "../../app/lib/lineage/contracts";
import { sourceSupportedSupersedesAnalysisRun } from "./source-supported-supersedes";

export const SOURCE_SUPPORTED_STATEMENT =
  "supersedes Guidance G-1";

export function buildSourceSupportedSitePacketV2Fixture(): SiteReadyCasePacketV2 {
  const base = buildSiteReadyCasePacketFromAnalysis(
    sourceSupportedSupersedesAnalysisRun(),
  );
  const relation = base.relation_candidates[0];
  const statement = base.claim_occurrences.find(
    (occurrence) => occurrence.claim_id === "candidate_owner",
  )!;
  const target = base.claim_occurrences.find(
    (occurrence) => occurrence.claim_id === "candidate_target",
  )!;
  return validateSiteReadyCasePacket({
    ...base,
    contract_version: "site_ready_case_packet.v2",
    source_supported_relation_signals: [{
      relation_candidate_id: relation.relation_id,
      supported_relation_type: "supersedes",
      from_occurrence_id: statement.occurrence_id,
      to_occurrence_id: target.occurrence_id,
      support_status: "direct_source_support",
      review_status: "pending_review",
      statement_source_id: statement.source_id,
      statement_snapshot_id: statement.snapshot_id,
      statement_excerpt: SOURCE_SUPPORTED_STATEMENT,
      target_source_id: target.source_id,
      target_snapshot_id: target.snapshot_id,
    }],
  }) as SiteReadyCasePacketV2;
}
