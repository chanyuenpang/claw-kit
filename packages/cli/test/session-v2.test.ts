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
  SESSION_RECORD_TTL_MS,
  SessionRegistryV2,
  RegistryFocusSessionStore,
  canonicalizeSessionWorkdir,
  sessionFocusKey,
} from "../dist/session-registry-v2.js";

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-session-v2-${name}-`));
}

test("v2 session identity isolates the same agent id by canonical workdir", async () => {
  const runtimeRoot = fixture("identity-runtime");
  const firstRoot = fixture("identity-first");
  const secondRoot = fixture("identity-second");
  const registry = new SessionRegistryV2(runtimeRoot);

  const first = await registry.open("agent-1", firstRoot, { kind: "node" });
  const same = await registry.open("agent-1", path.join(firstRoot, "."), { kind: "terminal" });
  const second = await registry.open("agent-1", secondRoot, { kind: "adapter", host: "test" });

  assert.equal(first.identity.sessionKeyHash, same.identity.sessionKeyHash);
  assert.notEqual(first.identity.sessionKeyHash, second.identity.sessionKeyHash);
  assert.equal(first.record.canonicalWorkdir, canonicalizeSessionWorkdir(firstRoot));
  assert.equal(same.created, false);
  assert.equal(second.created, true);
});

test("v2 session records recover live state and expire only disconnected v2 directories", async () => {
  const parent = fixture("retention-parent");
  const runtimeRoot = path.join(parent, "session-daemon-v2");
  const workdir = fixture("retention-workdir");
  const unrelated = path.join(parent, "legacy-cache");
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, "keep.txt"), "keep", "utf-8");
  const registry = new SessionRegistryV2(runtimeRoot);
  const old = new Date("2026-07-01T00:00:00.000Z");
  const opened = await registry.open("agent-expired", workdir, { kind: "node" }, old);

  const recovered = registry.recover(new Date(old.getTime() + SESSION_RECORD_TTL_MS + 1));

  assert.deepEqual(recovered.normalized, [opened.identity.sessionKeyHash]);
  assert.deepEqual(recovered.removed, [opened.identity.sessionKeyHash]);
  assert.equal(fs.existsSync(registry.sessionDirectory(opened.identity.sessionKeyHash)), false);
  assert.equal(fs.readFileSync(path.join(unrelated, "keep.txt"), "utf-8"), "keep");
});

test("typed command service uses explicit context and keeps current plan in v2 session state", async () => {
  const runtimeRoot = fixture("command-runtime");
  const projectRoot = fixture("command-project");
  initProject({ cwd: projectRoot, projectName: "Command Service", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("agent-command", projectRoot, { kind: "node" });
  const service = new ClawCommandService(registry);
  const context = {
    cwd: opened.identity.canonicalWorkdir,
    agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity),
    mode: "session" as const,
  };

  await service.execute(context, {
    operation: "plan.create",
    input: {
      taskName: "service-plan",
      title: "Service plan",
      goalText: "Run without process globals",
    },
  });
  const simple = await service.execute(context, {
    operation: "plan.show",
    input: { simple: true },
  });
  assert.deepEqual(simple.output, {
    status: "process.active",
    goal: { text: "Run without process globals" },
    tasks: [{ title: "Run without process globals" }],
    rules: [],
  });

  const left = await service.execute(context, { operation: "plan.leave", input: {} });
  assert.equal(
    (left.postCommitEffects?.[0] as { planStatus?: string } | undefined)?.planStatus,
    "end.leave",
  );
  await assert.rejects(
    () => service.execute(context, { operation: "plan.show", input: {} }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && (error as { code: string }).code === "CURRENT_PLAN_REQUIRED",
  );
  assert.equal(showPlan({ cwd: projectRoot, taskName: "service-plan" }).plan.status, "end.leave");

  await service.execute(context, {
    operation: "plan.resume",
    input: { planId: "service-plan" },
  });
  assert.equal(showPlan({ cwd: projectRoot, taskName: "service-plan" }).plan.status, "process.active");
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.taskName, "service-plan");
});

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
  const childFile = (
    created.output as { planFile: string }
  ).planFile;
  assert.equal(parent.status, "end.leave");
  assert.equal(parent.tasks[0]?.execution?.subplan, childFile);
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.planFile, childFile);
  assert.equal(
    (created.postCommitEffects?.[0] as { planStatus?: string } | undefined)?.planStatus,
    "end.leave",
  );
});

test("typed command service implicitly targets current plan for plan and task mutations", async () => {
  const runtimeRoot = fixture("mutations-runtime");
  const projectRoot = fixture("mutations-project");
  initProject({ cwd: projectRoot, projectName: "Session Mutations", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("agent-mutations", projectRoot, { kind: "node" });
  const service = new ClawCommandService(registry);
  const context = {
    cwd: opened.identity.canonicalWorkdir,
    agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity),
    mode: "session" as const,
  };
  await service.execute(context, {
    operation: "plan.create",
    input: { taskName: "mutation-plan", title: "Mutation plan", goalText: "Mutate implicitly" },
  });
  await service.execute(context, {
    operation: "task.edit",
    input: { taskId: 1, taskTitle: "First session task", taskStatus: "in_progress" },
  });
  await service.execute(context, {
    operation: "task.done",
    input: { tasks: [{ id: 1 }] },
  });
  await service.execute(context, {
    operation: "task.add",
    input: { tasks: [{ title: "Second session task", detail: "Added without plan id" }] },
  });
  await service.execute(context, { operation: "plan.wait", input: {} });
  assert.equal(showPlan({ cwd: projectRoot, taskName: "mutation-plan" }).plan.status, "process.wait");
  await service.execute(context, { operation: "plan.resume", input: {} });
  const done = await service.execute(context, {
    operation: "plan.done",
    input: { retrospectiveSummary: "Session command surface complete." },
  });
  assert.equal((done.output as { planStatus: string }).planStatus, "end.completed");
  assert.deepEqual(done.postCommitEffects, [{
    type: "completion.refresh",
    taskName: "mutation-plan",
    planStatus: "end.completed",
  }]);
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan, undefined);
});

test("typed command service rejects unsupported operations without shell evaluation", async () => {
  const runtimeRoot = fixture("unsupported-runtime");
  const projectRoot = fixture("unsupported-project");
  initProject({ cwd: projectRoot, projectName: "Unsupported", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const service = new ClawCommandService(registry);

  await assert.rejects(
    () => service.execute(
      { cwd: projectRoot, mode: "stateless" },
      { operation: "shell.exec", input: { command: "echo unsafe" } },
    ),
    (error: unknown) => error instanceof Error
      && "code" in error
      && (error as { code: string }).code === "SESSION_OPERATION_UNSUPPORTED",
  );
});

test("v2 session store uses exact persisted after-images during focus recovery", async () => {
  const runtimeRoot = fixture("focus-recovery-runtime");
  const projectRoot = fixture("focus-recovery-project");
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
