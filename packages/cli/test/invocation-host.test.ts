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
    forcesSubagentKnowledgeWriter: false,
    usesAtomicKnowledgeDispatch: false,
    supportsClaimTimeReportCapture: true,
    providesActiveWorkflowRecovery: true,
    omitsCompactNotes: false,
  });
  assert.equal(isHostActionsHost("dsh"), true);
  assert.equal(isHostActionsHost("cindy"), false);
  assert.equal(isSubagentPolicyHost("cindy"), true);
  assert.equal(isSubagentPolicyHost("opencode"), false);
});
