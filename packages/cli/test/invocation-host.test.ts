import test from "node:test";
import assert from "node:assert/strict";

import {
  isHostActionsHost,
  isSubagentPolicyHost,
  resolveHostIntegrationProfile,
} from "../dist/invocation-host.js";

test("host integration profiles preserve the current adapter capability matrix", () => {
  assert.equal(resolveHostIntegrationProfile(undefined), undefined);
  assert.deepEqual(resolveHostIntegrationProfile("codex"), {
    version: 1,
    consumesPlanGoalEffects: true,
    supportsNativeSubagentFinalization: true,
    registersKnowledgePlanOnCreation: true,
    tracksKnowledgeFinalization: true,
    suppressesAgentGoalGuidance: false,
    usesGoalObjectiveInTaskDetail: true,
    usesAtomicKnowledgeDispatch: false,
    supportsClaimTimeReportCapture: true,
    providesActiveWorkflowRecovery: true,
    omitsCompactNotes: false,
    allowedKnowledgeExecutionPolicies: ["main-agent", "background", "subagent"],
    defaultKnowledgeExecutionPolicy: "background",
  });
  assert.equal(isHostActionsHost("dsh"), true);
  assert.equal(isHostActionsHost("cindy"), false);
  assert.equal(isSubagentPolicyHost("cindy"), true);
  assert.equal(isSubagentPolicyHost("opencode"), false);
});

test("host capability matrix declares per-host allowed and default knowledge policies", () => {
  const cindy = resolveHostIntegrationProfile("cindy");
  const dsh = resolveHostIntegrationProfile("dsh");
  const standard = resolveHostIntegrationProfile("standard");
  const opencode = resolveHostIntegrationProfile("opencode");
  assert.deepEqual(cindy?.allowedKnowledgeExecutionPolicies, ["main-agent", "subagent"]);
  assert.equal(cindy?.defaultKnowledgeExecutionPolicy, "subagent");
  assert.deepEqual(dsh?.allowedKnowledgeExecutionPolicies, ["main-agent", "subagent"]);
  assert.equal(dsh?.defaultKnowledgeExecutionPolicy, "subagent");
  assert.deepEqual(standard?.allowedKnowledgeExecutionPolicies, ["main-agent", "background"]);
  assert.equal(standard?.defaultKnowledgeExecutionPolicy, "main-agent");
  assert.deepEqual(opencode?.allowedKnowledgeExecutionPolicies, ["main-agent", "background"]);
  assert.equal(opencode?.defaultKnowledgeExecutionPolicy, "background");
});
