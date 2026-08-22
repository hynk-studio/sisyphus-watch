import type { InternalAnalysisRunEnvelope } from "../analysis/relation-cues";
import { buildSiteReadyCasePacketFromAnalysis } from "./builder";
import type { SiteReadyCasePacket } from "./contracts";
import {
  executeCapturedSourcePlan,
  planCapturedSourcePages,
  type CaptureDependencies,
  type CaptureExecutionResult,
} from "./source-capture";

export interface InternalLineageRunEnvelope extends CaptureExecutionResult {
  site_ready_case_packet: SiteReadyCasePacket;
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
  return {
    site_ready_case_packet: siteReadyCasePacket,
    ...capture,
  };
}
