import type { InternalAnalysisRunEnvelope } from "../analysis/relation-cues";
import { buildSiteReadyCasePacketFromAnalysis } from "./builder";
import type { SiteReadyCasePacket } from "./contracts";
import {
  executeCapturedSourcePlan,
  planCapturedSourcePages,
  type CaptureDependencies,
  type CaptureExecutionResult,
} from "./source-capture";
import {
  assessSourceSupportedRelations,
  type SourceSupportedRelationAssessment,
  type SourceSupportedRelationWorkSummary,
  type SourceSupportedTargetIdentityProof,
} from "./source-supported-relations";

export interface InternalLineageRunEnvelope extends CaptureExecutionResult {
  site_ready_case_packet: SiteReadyCasePacket;
  source_supported_relation_assessments: SourceSupportedRelationAssessment[];
  source_supported_target_identity_proofs: SourceSupportedTargetIdentityProof[];
  source_supported_relation_work_summary: SourceSupportedRelationWorkSummary;
}

export async function runLineageInternal(
  analysisEnvelope: InternalAnalysisRunEnvelope,
  dependencies: CaptureDependencies = {},
): Promise<InternalLineageRunEnvelope> {
  const siteReadyCasePacket = buildSiteReadyCasePacketFromAnalysis(
    analysisEnvelope.analysis_run,
  );
  const plan = planCapturedSourcePages({
    analysisRun: analysisEnvelope.analysis_run,
    lineagePacket: siteReadyCasePacket,
    relationCueDiagnostics: analysisEnvelope.relation_cue_diagnostics,
  });
  const capture = await executeCapturedSourcePlan(
    plan,
    analysisEnvelope.workflow_deadline_at_ms,
    dependencies,
  );
  const sourceSupportedRelations = assessSourceSupportedRelations({
    analysisRun: analysisEnvelope.analysis_run,
    lineagePacket: siteReadyCasePacket,
    relationCueDiagnostics: analysisEnvelope.relation_cue_diagnostics,
    capturePlan: plan,
    captureResult: capture,
  });
  return {
    site_ready_case_packet: siteReadyCasePacket,
    ...capture,
    source_supported_relation_assessments: sourceSupportedRelations.assessments,
    source_supported_target_identity_proofs:
      sourceSupportedRelations.target_identity_proofs,
    source_supported_relation_work_summary: sourceSupportedRelations.summary,
  };
}
