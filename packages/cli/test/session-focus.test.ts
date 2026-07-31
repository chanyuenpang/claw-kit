import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activatePlan,
  createPlanRef,
  initProject,
  recoverProjectFocusTransitions,
  resolveProjectContext,
  showPlan,
  writePlan,
} from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import {
  SessionRegistryV2,
  RegistryFocusSessionStore,
  sessionFocusKey,
} from "../dist/session-registry-v2.js";

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-session-focus-${name}-`));
}

test("session subplan creation journals parent linkage together with focus transfer", async () => {
  const runtimeRoot = fixture("subplan-runtime");
  const projectRoot = fixture("subplan-project");
  initProject({ cwd: projectRoot, projectName: "Subplan Transaction", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("agent-subplan", projectRoot, { kind: "node" });
  const service = new ClawCommandService(registry);
  const context = {
    cwd: opened.identity.canonicalWorkdir,
    agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity),
    mode: "session" as const,
  };
  await service.execute(context, {
    operation: "plan.create",
    input: { taskName: "subplan-task", title: "Parent", goalText: "Create child" },
  });
  const created = await service.execute(context, {
    operation: "subplan.create",
    input: { parentTaskName: "subplan-task", parentTaskId: 1 },
  });
  const parent = showPlan({ cwd: projectRoot, taskName: "subplan-task" }).plan;
  const childFile = (created.output as { planFile: string }).planFile;
  assert.equal(parent.status, "end.leave");
  assert.equal(parent.tasks[0]?.execution?.subplan, childFile);
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.planFile, childFile);
  assert.equal((created.postCommitEffects?.[0] as { planStatus?: string } | undefined)?.planStatus, "end.leave");
});

test("v2 session store uses exact persisted after-images during focus recovery", async () => {
  const runtimeRoot = fixture("recovery-runtime");
  const projectRoot = fixture("recovery-project");
  initProject({ cwd: projectRoot, projectName: "V2 Focus Recovery", planning: false });
  await writePlan({
    cwd: projectRoot,
    taskName: "recover-plan",
    title: "Recover plan",
    goalText: "Recover v2 focus",
    content: {
      title: "Recover plan",
      status: "end.leave",
      leaveReason: "manual_leave",
      goal: { text: "Recover v2 focus" },
      tasks: [{ id: 1, title: "Continue", status: "pending" }],
    },
  });
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("agent-recover", projectRoot, { kind: "node" });
  const store = new RegistryFocusSessionStore(registry);
  const project = resolveProjectContext(projectRoot);
  const target = createPlanRef(project, "recover-plan");

  await assert.rejects(
    () => activatePlan({
      project,
      sessionKey: sessionFocusKey(opened.identity),
      target,
      sessionStore: store,
      testHooks: { failAt: "after_session" },
    }),
    /after_session/,
  );
  const recovery = await recoverProjectFocusTransitions({ project, sessionStore: store });

  assert.equal(recovery.recovered.length, 1);
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.taskName, "recover-plan");
  assert.equal(showPlan({ cwd: projectRoot, taskName: "recover-plan" }).plan.status, "process.active");
});
