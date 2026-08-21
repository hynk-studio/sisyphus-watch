import {
  isLiveAnalysisEnabled,
  LIVE_MODE_ENVIRONMENT_FLAG,
  OPERATOR_LIVE_ENVIRONMENT_FLAG,
  OPENAI_KEY_ENVIRONMENT_NAME,
} from "../app/lib/live-mode";

export interface LocalWorkerRuntimeBindings {
  vars: Record<string, string>;
  secrets?: {
    required: string[];
  };
}

export function buildLocalWorkerRuntimeBindings(
  liveModeValue: string | undefined,
  operatorLiveModeValue?: string,
): LocalWorkerRuntimeBindings {
  const vars: Record<string, string> = {};
  if (liveModeValue) {
    vars[LIVE_MODE_ENVIRONMENT_FLAG] = liveModeValue;
  }
  if (operatorLiveModeValue) {
    vars[OPERATOR_LIVE_ENVIRONMENT_FLAG] = operatorLiveModeValue;
  }

  return {
    vars,
    ...(isLiveAnalysisEnabled(liveModeValue)
      ? { secrets: { required: [OPENAI_KEY_ENVIRONMENT_NAME] } }
      : {}),
  };
}
