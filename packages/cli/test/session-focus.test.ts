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
  unbindSession,
  resolveSessionBoundPlan,
} from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
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
    input: {},
  });
  const parent = showPlan({ cwd: projectRoot, taskName: "subplan-task" }).plan;
  const childFile = (created.output as { planFile: string }).planFile;
  assert.equal(parent.status, "end.leave");
  assert.equal(parent.leaveReason, "switch_to_new_plan");
  assert.equal(parent.tasks[0]?.execution?.subplan, childFile);
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.planFile, childFile);
  assert.equal((created.postCommitEffects?.[0] as { planStatus?: string } | undefined)?.planStatus, "end.leave");
  assert.equal(created.knowledgeDispatch, undefined, "temporary parent leave must not dispatch knowledge finalization");
});

test("unfinished preparation also owns the session root focus", async () => {
  const projectRoot = fixture("preparing-project");
  initProject({ cwd: projectRoot, projectName: "Preparing", planning: false });
  const registry = new SessionRegistryV2(fixture("preparing-runtime"));
  const opened = await registry.open("preparing-agent", projectRoot, { kind: "node" });
  const service = new ClawCommandService(registry);
  const context = { cwd: projectRoot, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), mode: "session" as const };
  const templateFile = path.join(projectRoot, "preparing-template.json");
  fs.writeFileSync(templateFile, JSON.stringify({ id: "preparing", version: "1.0.0",
    status: "prepare.requirements", goal: { text: "Prepare" },
    tasks: [{ id: 1, title: "Clarify", status: "pending" }],
  }));
  await service.execute(context, { operation: "plan.create", input: {
    taskName: "preparing", title: "Preparing", goalText: "Prepare", templateFile, forcePlanning: true,
  } });
  assert.equal(showPlan({ cwd: projectRoot, taskName: "preparing" }).plan.status, "prepare.requirements");
  // Switching to an explicit new root is one owner mutation; the unfinished
  // preparation plan is left resumable rather than blocking the switch.
  await service.execute(context, { operation: "plan.create", input: {
    taskName: "other-root", title: "Other", goalText: "Replace unfinished work",
  } });
  assert.equal(showPlan({ cwd: projectRoot, taskName: "other-root" }).plan.status, "process.active");
  assert.equal(showPlan({ cwd: projectRoot, taskName: "preparing" }).plan.status, "end.leave");
  await service.execute(context, { operation: "plan.resume", input: { planId: "preparing" } });
  assert.equal(showPlan({ cwd: projectRoot, taskName: "preparing" }).plan.status, "process.active");
});

test("session subplan completion returns parent guidance without touching the root Goal", async () => {
  const runtimeRoot = fixture("subplan-return-runtime");
  const projectRoot = fixture("subplan-return-project");
  initProject({ cwd: projectRoot, projectName: "Subplan Return", planning: false });
  await writePlan({
    cwd: projectRoot,
    taskName: "subplan-return",
    title: "Parent",
    goalText: "Complete the parent plan",
    content: {
      title: "Parent",
      status: "end.leave",
      goal: { text: "Complete the parent plan" },
      tasks: [
        { id: 1, title: "Child work", status: "in_progress", execution: { type: "subplan", subplan: "child.json" } },
        { id: 2, title: "Resume parent work", status: "pending" },
        { id: 3, title: "Finish parent work", status: "pending" },
      ],
    },
  });
  await writePlan({
    cwd: projectRoot,
    taskName: "subplan-return",
    filePath: "child.json",
    title: "Child",
    goalText: "Complete child work",
    parentPlanFile: "plan.json",
    parentTaskId: 1,
    content: {
      title: "Child",
      status: "process.active",
      parentPlan: "plan.json",
      parentTaskId: 1,
      goal: { text: "Complete child work" },
      tasks: [{ id: 1, title: "Finish child", status: "pending" }],
    },
  });
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("agent-subplan-return", projectRoot, { kind: "node" });
  const focusStore = new RegistryFocusSessionStore(registry);
  const project = resolveProjectContext(projectRoot);
  await activatePlan({
    project,
    sessionKey: sessionFocusKey(opened.identity),
    target: createPlanRef(project, "subplan-return", "child.json"),
    sessionStore: focusStore,
  });
  const service = new ClawCommandService(registry);
  const context = {
    cwd: opened.identity.canonicalWorkdir,
    agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity),
    mode: "session" as const,
    host: "codex",
  };
  await service.execute(context, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const completed = await service.execute(context, {
    operation: "plan.done",
    input: { retrospectiveSummary: "Child work completed." },
  });
  const output = completed.output as {
    planFile: string;
    planStatus: string;
    workflowGuidance: { transition?: string; nextTask?: { id: number; title: string } };
    completedSubplan?: { planFile: string; planStatus: string };
  };
  assert.equal(output.planFile, "plan.json");
  assert.equal(output.planStatus, "process.active");
  assert.equal(output.workflowGuidance.transition, "subplan_returned");
  assert.deepEqual(output.workflowGuidance.nextTask, { id: 2, title: "Resume parent work", status: "pending" });
  assert.equal(output.completedSubplan?.planFile, "child.json");
  assert.equal(output.completedSubplan?.planStatus, "end.completed");
  assert.equal(completed.hostActions, undefined);
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.planFile, "plan.json");
});

test("session recovery and child return retain the original dated container", async () => {
  const cwd = fixture("dated-project");
  initProject({ cwd, projectName: "Dated focus", planning: false });
  const registry = new SessionRegistryV2(fixture("dated-runtime"));
  const executor = new SessionCommandExecutor(registry);
  const identity = { agentSessionId: "dated-agent", workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } };
  const created = await executor.execute(identity, { operation: "plan.create", input: {
    taskName: "duplicate", title: "Original", goalText: "Original root objective", knowledgeCapture: false,
  } });
  const root = created.output as { taskDir: string; planPath: string };
  const original = fs.readFileSync(root.planPath, "utf8");
  const project = resolveProjectContext(cwd);
  const other = path.join(project.tasksDir, "9999-01-01", "duplicate");
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, "plan.json"), original);
  // Exercise retained focus recovery without help from the live binding.
  unbindSession(project, identity.agentSessionId);
  await executor.open(identity);
  assert.equal(resolveSessionBoundPlan(project, identity.agentSessionId), root.planPath);
  const result = await executor.execute(identity, { operation: "subplan.create", input: {} });
  const child = result.output as { taskDir: string; planPath: string; planFile: string };
  assert.equal(child.taskDir, root.taskDir);
  await executor.execute(identity, { operation: "plan.start", input: { appendTasks: [{ title: "Finish child" }] } });
  await executor.execute(identity, { operation: "task.done", input: { tasks: [{ id: 2 }] } });
  await executor.execute(identity, { operation: "plan.done", input: { retrospectiveSummary: "Child finished" } });
  assert.equal(resolveSessionBoundPlan(project, identity.agentSessionId), root.planPath);
  assert.equal(JSON.parse(fs.readFileSync(root.planPath, "utf8")).status, "process.active");
  assert.equal(fs.readFileSync(path.join(other, "plan.json"), "utf8"), original);
  assert.equal(fs.existsSync(path.join(other, child.planFile)), false);
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
