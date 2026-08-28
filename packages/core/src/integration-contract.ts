/**
 * Closed adapter integration capabilities. Core owns this host-neutral effect
 * contract; adapters own the native implementation of every enabled effect.
 */
export const INTEGRATION_HOSTS = ["codex", "opencode", "cindy", "dsh"] as const;
export type IntegrationHost = (typeof INTEGRATION_HOSTS)[number];

export type HostIntegrationProfile = {
  version: 1;
  consumesPlanGoalEffects: boolean;
  supportsNativeSubagentFinalization: boolean;
  registersKnowledgePlanOnCreation: boolean;
  tracksKnowledgeFinalization: boolean;
  suppressesAgentGoalGuidance: boolean;
  usesGoalObjectiveInTaskDetail: boolean;
  forcesSubagentKnowledgeWriter: boolean;
  usesAtomicKnowledgeDispatch: boolean;
  supportsClaimTimeReportCapture: boolean;
  providesActiveWorkflowRecovery: boolean;
  omitsCompactNotes: boolean;
};

const PROFILES: Readonly<Record<IntegrationHost, HostIntegrationProfile>> = {
  codex: { version: 1, consumesPlanGoalEffects: true, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: false, usesGoalObjectiveInTaskDetail: true, forcesSubagentKnowledgeWriter: false, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: true, omitsCompactNotes: false },
  opencode: { version: 1, consumesPlanGoalEffects: false, supportsNativeSubagentFinalization: false, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: false, forcesSubagentKnowledgeWriter: false, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: false, providesActiveWorkflowRecovery: false, omitsCompactNotes: false },
  cindy: { version: 1, consumesPlanGoalEffects: false, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: true, forcesSubagentKnowledgeWriter: true, usesAtomicKnowledgeDispatch: true, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: false, omitsCompactNotes: true },
  dsh: { version: 1, consumesPlanGoalEffects: true, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: false, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: false, usesGoalObjectiveInTaskDetail: true, forcesSubagentKnowledgeWriter: true, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: false, omitsCompactNotes: false },
};

export function resolveHostIntegrationProfile(host?: string | null): HostIntegrationProfile | undefined {
  return isIntegrationHost(host)
    ? PROFILES[host as IntegrationHost]
    : undefined;
}

export function isIntegrationHost(host?: string | null): host is IntegrationHost {
  return typeof host === "string" && (INTEGRATION_HOSTS as readonly string[]).includes(host);
}
