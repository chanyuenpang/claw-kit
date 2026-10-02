import test from "node:test";
import assert from "node:assert/strict";

import {
  isHostActionsHost,
  isNativeKnowledgeFinalizationHost,
  resolveHostIntegrationProfile,
} from "../dist/invocation-host.js";

test("host integration profiles preserve the current adapter capability matrix", () => {
  assert.equal(resolveHostIntegrationProfile(undefined), undefined);
  assert.deepEqual(resolveHostIntegrationProfile("codex"), {
    version: 1,
    consumesPlanGoalEffects: true,
    consumesPlanProgress: false,
    supportsNativeSubagentFinalization: true,
    registersKnowledgePlanOnCreation: true,
    tracksKnowledgeFinalization: true,
    suppressesAgentGoalGuidance: false,
    usesGoalObjectiveInTaskDetail: true,
    usesAtomicKnowledgeDispatch: false,
    supportsClaimTimeReportCapture: true,
    providesActiveWorkflowRecovery: true,
    omitsCompactNotes: false,
  });
  assert.equal(isHostActionsHost("dsh"), true);
  assert.equal(resolveHostIntegrationProfile("dsh")?.consumesPlanProgress, true);
  for (const host of ["cindy", "opencode", "standard"] as const) {
    assert.equal(resolveHostIntegrationProfile(host)?.consumesPlanProgress, false);
  }
  assert.equal(isHostActionsHost("cindy"), false);
  assert.equal(isNativeKnowledgeFinalizationHost("cindy"), true);
  assert.equal(isNativeKnowledgeFinalizationHost("opencode"), false);
});
