import type { KnowledgeWriterExecutionPolicy } from "./types.js";

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
  /**
   * Execution policies the host can actually run. `main-agent` means the
   * invoking agent performs knowledge deposition itself through the direct
   * `knowledge prepare/complete --source agent-memory` route with no
   * transcript or report capture. `background` requires turn-scope report
   * capture plus a host-owned background runner. `subagent` requires a
   * native subagent plus a claim-time report collector.
   */
  allowedKnowledgeExecutionPolicies: readonly KnowledgeWriterExecutionPolicy[];
  /**
   * Policy used when the effective configuration omits executionPolicy or
   * requests one this host cannot run. Always a member of
   * allowedKnowledgeExecutionPolicies.
   */
  defaultKnowledgeExecutionPolicy: KnowledgeWriterExecutionPolicy;
};

const MAIN_AGENT_ONLY_DEFAULT: readonly KnowledgeWriterExecutionPolicy[] = ["main-agent", "background"];
const SUBAGENT_DEFAULT: readonly KnowledgeWriterExecutionPolicy[] = ["main-agent", "subagent"];
const ALL_POLICIES: readonly KnowledgeWriterExecutionPolicy[] = ["main-agent", "background", "subagent"];

const PROFILES: Readonly<Record<IntegrationHost, HostIntegrationProfile>> = {
  codex: { version: 1, consumesPlanGoalEffects: true, consumesPlanProgress: true, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: false, usesGoalObjectiveInTaskDetail: true, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: true, omitsCompactNotes: false, allowedKnowledgeExecutionPolicies: ALL_POLICIES, defaultKnowledgeExecutionPolicy: "background" },
  opencode: { version: 1, consumesPlanGoalEffects: false, consumesPlanProgress: false, supportsNativeSubagentFinalization: false, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: false, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: false, providesActiveWorkflowRecovery: false, omitsCompactNotes: false, allowedKnowledgeExecutionPolicies: MAIN_AGENT_ONLY_DEFAULT, defaultKnowledgeExecutionPolicy: "background" },
  cindy: { version: 1, consumesPlanGoalEffects: false, consumesPlanProgress: false, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: true, usesAtomicKnowledgeDispatch: true, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: false, omitsCompactNotes: true, allowedKnowledgeExecutionPolicies: SUBAGENT_DEFAULT, defaultKnowledgeExecutionPolicy: "subagent" },
  dsh: { version: 1, consumesPlanGoalEffects: true, consumesPlanProgress: true, supportsNativeSubagentFinalization: true, registersKnowledgePlanOnCreation: false, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: false, usesGoalObjectiveInTaskDetail: true, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: true, providesActiveWorkflowRecovery: false, omitsCompactNotes: false, allowedKnowledgeExecutionPolicies: SUBAGENT_DEFAULT, defaultKnowledgeExecutionPolicy: "subagent" },
  standard: { version: 1, consumesPlanGoalEffects: false, consumesPlanProgress: false, supportsNativeSubagentFinalization: false, registersKnowledgePlanOnCreation: true, tracksKnowledgeFinalization: true, suppressesAgentGoalGuidance: true, usesGoalObjectiveInTaskDetail: false, usesAtomicKnowledgeDispatch: false, supportsClaimTimeReportCapture: false, providesActiveWorkflowRecovery: false, omitsCompactNotes: false, allowedKnowledgeExecutionPolicies: MAIN_AGENT_ONLY_DEFAULT, defaultKnowledgeExecutionPolicy: "main-agent" },
};

export function resolveHostIntegrationProfile(host?: string | null): HostIntegrationProfile | undefined {
  return isIntegrationHost(host)
    ? PROFILES[host as IntegrationHost]
    : undefined;
}

export function isIntegrationHost(host?: string | null): host is IntegrationHost {
  return typeof host === "string" && (INTEGRATION_HOSTS as readonly string[]).includes(host);
}

/**
 * Fill an omitted execution policy with the invoking host's matrix default.
 * An explicit policy passes through untouched so unsupported requests stay
 * visible to fail-fast configuration checks. Hostless invocations resolve
 * through the standard hostless profile.
 */
export function fillKnowledgeExecutionPolicyDefault(
  host: string | null | undefined,
  requested: KnowledgeWriterExecutionPolicy | undefined,
): KnowledgeWriterExecutionPolicy | undefined {
  if (requested !== undefined) {
    return requested;
  }
  const profile = resolveHostIntegrationProfile(host) ?? PROFILES.standard;
  return profile.defaultKnowledgeExecutionPolicy;
}

/**
 * Resolve the effective execution policy for a host against the capability
 * matrix, coercing unsupported requests to the host default. Runtime
 * sidecar paths use this so a misconfigured project never blocks the main
 * flow; configuration-time checks surface the coercion instead.
 */
export function resolveKnowledgeExecutionPolicyForHost(
  host: string | null | undefined,
  requested: KnowledgeWriterExecutionPolicy | undefined,
): { policy: KnowledgeWriterExecutionPolicy | undefined; coerced: boolean } {
  const profile = resolveHostIntegrationProfile(host) ?? PROFILES.standard;
  if (requested === undefined) {
    return { policy: profile.defaultKnowledgeExecutionPolicy, coerced: false };
  }
  if (profile.allowedKnowledgeExecutionPolicies.includes(requested)) {
    return { policy: requested, coerced: false };
  }
  return { policy: profile.defaultKnowledgeExecutionPolicy, coerced: true };
}
