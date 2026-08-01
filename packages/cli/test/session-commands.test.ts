import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, showPlan } from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-session-commands-${name}-`));
}

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
    input: { taskName: "service-plan", title: "Service plan", goalText: "Run without process globals" },
  });
  const simple = await service.execute(context, { operation: "plan.show", input: { simple: true } });
  assert.deepEqual(simple.output, {
    status: "process.active",
    goal: { text: "Run without process globals" },
    tasks: [{ title: "Run without process globals" }],
    rules: [],
  });

  const left = await service.execute(context, { operation: "plan.leave", input: {} });
  assert.equal((left.postCommitEffects?.[0] as { planStatus?: string } | undefined)?.planStatus, "end.leave");
  await assert.rejects(
    () => service.execute(context, { operation: "plan.show", input: {} }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && (error as { code: string }).code === "CURRENT_PLAN_REQUIRED",
  );
  assert.equal(showPlan({ cwd: projectRoot, taskName: "service-plan" }).plan.status, "end.leave");

  await service.execute(context, { operation: "plan.resume", input: { planId: "service-plan" } });
  assert.equal(showPlan({ cwd: projectRoot, taskName: "service-plan" }).plan.status, "process.active");
  assert.equal(registry.read(opened.identity.sessionKeyHash).currentPlan?.taskName, "service-plan");
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
  const edited = await service.execute(context, {
    operation: "task.edit",
    input: { taskId: 1, taskTitle: "First session task", taskStatus: "in_progress" },
  });
  const completed = await service.execute(context, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const added = await service.execute(context, {
    operation: "task.add",
    input: { tasks: [{ title: "Second session task", detail: "Added without plan id" }] },
  });
  for (const [result, commandSource] of [[edited, "task.edit"], [completed, "task.done"], [added, "task.add"]] as const) {
    const events = (result.output as { events: Array<{ commandSource: string }> }).events;
    assert.ok(events.length > 0);
    assert.ok(events.every((event) => event.commandSource === commandSource));
  }
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
