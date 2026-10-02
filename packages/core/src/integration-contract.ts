/**
 * Closed adapter integration capabilities. Core owns this host-neutral effect
 * contract; adapters own the native implementation of every enabled effect.
 */
export const INTEGRATION_HOSTS = ["codex", "opencode", "cindy", "dsh", "standard"] as const;
export type IntegrationHost = (typeof INTEGRATION_HOSTS)[number];

export type HostIntegrationProfile = {
  version: 1;
  consumesPlanGoalEffects: boolean;
  consumesPlanProgress: boolean;
  supportsNativeSubagentFinalization: boolean;
  registersKnowledgePlanOnCreation: boolean;
  tracksKnowledgeFinalization: boolean;
  suppressesAgentGoalGuidance: boolean;
  usesGoalObjectiveInTaskDetail: boolean;
  usesAtomicKnowledgeDispatch: boolean;
  supportsClaimTimeReportCapture: boolean;
  providesActiveWorkflowRecovery: boolean;
  omitsCompactNotes: boolean;
};

const PROFILES: Readonly<Record<IntegrationHost, HostIntegrationProfile>> = {
  // Claw plan mutations remain available through the driver; Codex exposes
  // native Goal tools but no native update_plan progress tool.
  codex: { version: 1, consumesPlanGoalEffects: true, consumesPlanProgress: false, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: false, usesGoalObjectiveInTaskDetail: true, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: true, omitsCompactNotes: false },
  opencode: { version: 1, consumesPlanGoalEffects: false, consumesPlanProgress: false, supportsNativeSubagentFinalization: false, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: false, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: false, providesActiveWorkflowRecovery: false, omitsCompactNotes: false },
  cindy: { version: 1, consumesPlanGoalEffects: false, consumesPlanProgress: false, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: true, usesAtomicKnowledgeDispatch: true, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: false, omitsCompactNotes: true },
  dsh: { version: 1, consumesPlanGoalEffects: true, consumesPlanProgress: true, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: false, usesGoalObjectiveInTaskDetail: true, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: false, omitsCompactNotes: false },
  standard: { version: 1, consumesPlanGoalEffects: false, consumesPlanProgress: false, supportsNativeSubagentFinalization: false, registersKnowledgePlanOnCreation: false, tracksKnowledgeFinalization: false, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: false, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: false, providesActiveWorkflowRecovery: false, omitsCompactNotes: false },
};

export function resolveHostIntegrationProfile(host?: string | null): HostIntegrationProfile | undefined {
  return isIntegrationHost(host)
    ? PROFILES[host as IntegrationHost]
    : undefined;
}

export function isIntegrationHost(host?: string | null): host is IntegrationHost {
  return typeof host === "string" && (INTEGRATION_HOSTS as readonly string[]).includes(host);
}
