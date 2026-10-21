import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSessionWorkflowContext, initProject, knowledgeSessionRegistryPath, resolveProjectContext, resolveSessionBoundPlan, showPlan } from "@veewo/claw-core";
import { runClaw } from "./cli-test-support.js";
import { ClawCommandService } from "../dist/command-service.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";

// DSH's session service must return a successful envelope after the same
// rejected-session-create precondition as the Windows smoke report.
test("DSH parent-child lifecycle and closeout survive a retained session manifest", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-subplan-scope-"));
  const projectRoot = path.join(root, "project");
  fs.mkdirSync(projectRoot);
  initProject({ cwd: projectRoot, projectName: "DSH subplan scope" });
  const previousRuntime = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = path.join(root, "sessions");
  try {
    const registry = new SessionRegistryV2(path.join(root, "registry"));
    const opened = await registry.open(`dsh-${path.basename(root)}`, projectRoot, { kind: "node" });
    const service = new ClawCommandService(registry);
    const context = { cwd: opened.identity.canonicalWorkdir,
      agentSessionId: opened.identity.agentSessionId, sessionKey: sessionFocusKey(opened.identity),
      mode: "session" as const, host: "dsh" };
    // Preserve the old manifest as recovery data, not as a public create mode.
    createSessionWorkflowContext(projectRoot, context.agentSessionId);
    await assert.rejects(service.execute(context, { operation: "plan.create", input: {
      taskName: "rejected-session", title: "Rejected", goalText: "No target", scope: "session" } } as any),
      { code: "PLAN_SCOPE_REMOVED" });
    await service.execute(context, { operation: "plan.create", input: {
      taskName: "冒烟父计划", title: "Parent", goalText: "Root objective" } });
    const project = resolveProjectContext(projectRoot);
    const captureRegistryPath = knowledgeSessionRegistryPath(project, context.agentSessionId);
    const readCapture = (): { activePlanPath?: string; activeStartedAt?: string } =>
      fs.existsSync(captureRegistryPath) ? JSON.parse(fs.readFileSync(captureRegistryPath, "utf8")) : {};
    const rootStartedAt = readCapture().activeStartedAt;
    await service.execute(context, { operation: "plan.start", input: { appendTasks: [{ title: "Child work" }] } });
    const result = await service.execute(context, { operation: "subplan.create", input: {
      parentTaskName: "冒烟父计划", parentTaskId: 2 } });
    const output = result.output as { scope: string; planFile: string; parentPlan: string; parentTaskId: number;
      workflowGuidance: { stage: string } };
    assert.equal(output.scope, "project");
    assert.equal(output.parentPlan, "plan.json");
    assert.equal(output.parentTaskId, 2);
    assert.equal(output.workflowGuidance.stage, "discussion");
    const focused = registry.read(opened.identity.sessionKeyHash).currentPlan;
    assert.equal(focused?.scope, "project");
    assert.equal(focused?.planFile, output.planFile);
    const parent = showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划" }).plan;
    assert.equal(parent.tasks.find((task) => task.id === 2)?.execution?.subplan, output.planFile);
    await service.reconcileCanonicalFocus(context);
    const shown = await service.execute(context, { operation: "plan.show", input: {} });
    assert.equal((shown.output as { planFile: string }).planFile, output.planFile);
    await service.execute(context, { operation: "plan.edit", input: { operations: [
      { type: "plan.update", updates: { requirementsSummary: "Verify child lifecycle", rules: ["Keep root ownership"] } },
    ] } });
    await service.execute(context, { operation: "plan.start", input: { appendTasks: [{ title: "Finish child" }] } });
    const waiting = await service.execute(context, { operation: "plan.wait", input: {} });
    assert.equal((waiting.output as { planStatus: string }).planStatus, "process.wait");
    await service.execute(context, { operation: "plan.resume", input: {} });
    const resumed = await service.execute(context, { operation: "plan.show", input: {} });
    assert.equal((resumed.output as { plan: { status: string } }).plan.status, "process.active");
    const childBeforeClose = showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划", planFile: output.planFile }).plan.tasks;
    const childDone = await service.execute(context, { operation: "plan.done", input: {
      retrospectiveSummary: "Child lifecycle verified" } });
    const restored = childDone.output as { planFile: string; planStatus: string;
      completedSubplan: { planFile: string; planStatus: string } };
    assert.equal(restored.planFile, "plan.json");
    assert.equal(restored.planStatus, "process.active");
    assert.equal(restored.completedSubplan.planFile, output.planFile);
    assert.equal(restored.completedSubplan.planStatus, "end.completed");
    assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.planFile, "plan.json");
    const parentPath = showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划" }).planPath;
    assert.equal(resolveSessionBoundPlan(project, context.agentSessionId), parentPath,
      "successful return must publish the binding used by true context recovery");
    const recovered = runClaw(["context"], projectRoot, { CLAW_HOST: "dsh", CLAW_SESSION_ID: context.agentSessionId,
      CLAW_SESSION_RUNTIME_DIR: process.env.CLAW_SESSION_RUNTIME_DIR });
    assert.equal((recovered.activeWorkflow as { planPath: string })?.planPath, parentPath);
    assert.ok(childDone.knowledgeDispatch, "unfinished child must dispatch its own finalizer");
    assert.deepEqual(showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划", planFile: output.planFile }).plan.tasks, childBeforeClose, "early close preserves actual child progress");
    assert.ok(rootStartedAt, "DSH creation must register the capture start");
    assert.equal(readCapture().activeStartedAt, rootStartedAt, "child switch and return retain the root interval");
    assert.equal(showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划" }).plan.tasks
      .find((task) => task.id === 2)?.status, "done");
    await service.execute(context, { operation: "task.add", input: { tasks: [{ title: "Unfinished parent work" }] } });
    const parentBeforeClose = showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划" }).plan.tasks;
    const parentDone = await service.execute(context, { operation: "plan.done", input: {
      retrospectiveSummary: "Parent and child lifecycle verified" } });
    assert.equal((parentDone.output as { planStatus: string }).planStatus, "end.completed");
    assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan, undefined);
    assert.ok(parentDone.knowledgeDispatch, "default knowledge closeout must return a dispatch contract");
    const jobsDir = path.join(path.dirname(parentPath), ".runtime", "knowledge-finalization");
    const jobs = fs.readdirSync(jobsDir).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
    assert.equal(jobs.length, 2, "child and root each own a finalizer job");
    assert.notEqual(childDone.knowledgeDispatch!.finalizeId, parentDone.knowledgeDispatch!.finalizeId);
    assert.deepEqual(showPlan({ cwd: projectRoot, scope: "project", taskName: "冒烟父计划" }).plan.tasks, parentBeforeClose, "early root close preserves actual progress");
    const job = JSON.parse(fs.readFileSync(path.join(jobsDir, `${parentDone.knowledgeDispatch!.finalizeId}.json`), "utf8"));
    assert.equal(job.planPath, parentPath);
    assert.equal(job.reportCapture.startedAt, rootStartedAt);
    assert.ok(Date.parse(job.reportCapture.endedAt) >= Date.parse(job.reportCapture.startedAt));
    assert.equal(readCapture().activeStartedAt, undefined);
    assert.equal(resolveSessionBoundPlan(project, context.agentSessionId), null);
  } finally {
    if (previousRuntime === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previousRuntime;
  }
});

test("Codex CLI project subplan remains compatible in a clean session", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-codex-subplan-scope-"));
  const ownerSessionKey = `codex-${path.basename(root)}`;
  const runtime = path.join(root, "sessions");
  const previousRuntime = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = runtime;
  try {
    initProject({ cwd: root, projectName: "Codex scope" });
    const env = { CODEX_THREAD_ID: ownerSessionKey, CLAW_HOST: "codex", CLAW_SESSION_RUNTIME_DIR: runtime };
    runClaw(["plan", "create", "--title", "codex-parent", "--goal", "Root objective"], root, env);
    runClaw(["plan", "start", "--add-task", "Child work"], root, env);
    const result = runClaw(["subplan", "create", "--parent", "codex-parent", "--task-id", "2"], root, env);
    const child = JSON.parse(fs.readFileSync(String(result.planPath), "utf8")) as { parentPlan: string; parentTaskId: number };
    assert.equal(child.parentPlan, "plan.json");
    assert.equal(child.parentTaskId, 2);
    const parent = showPlan({ cwd: root, scope: "project", taskName: "codex-parent" }).plan;
    assert.equal(parent.goal.text, "Root objective");
    assert.equal(parent.tasks.find((task) => task.id === 2)?.execution?.subplan, path.basename(String(result.planPath)));
  } finally {
    if (previousRuntime === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previousRuntime;
  }
});
