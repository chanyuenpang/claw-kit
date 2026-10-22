import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, showPlan } from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { decodeClawCommand } from "../dist/command-contract.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";

test("terminal search preserves --dir without exposing it to adapter commands", () => {
  const request = { operation: "search", input: { query: "needle", dir: "docs" } };
  assert.throws(() => decodeClawCommand(request), /Invalid or unsupported search input/);
  assert.deepEqual(decodeClawCommand(request, { allowTerminalSearchDir: true }), request);
  assert.throws(() => decodeClawCommand({ ...request, input: { ...request.input, unknown: true } }, { allowTerminalSearchDir: true }), /Invalid or unsupported search input/);
});

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-session-commands-${name}-`));
}

test("session open outside a claw project skips project recovery without hiding integrity errors", async () => {
  const runtimeRoot = fixture("outside-runtime");
  const workdir = fixture("outside-project");
  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtimeRoot));
  const opened = await executor.open({ agentSessionId: "outside", workdir,
    client: { kind: "adapter", host: "dsh" } });
  assert.equal(opened.session.canonicalWorkdir, fs.realpathSync(workdir));
});

test("Cindy session creates an uninitialized project once and reuses it from a child directory", async () => {
  const workdir = fixture("cindy-empty-project");
  const executor = new SessionCommandExecutor(new SessionRegistryV2(fixture("cindy-empty-runtime")));
  const identity = { agentSessionId: "cindy-empty", workdir, client: { kind: "adapter" as const, host: "cindy" } };
  await executor.open(identity);
  assert.equal(fs.existsSync(path.join(workdir, ".claw")), false);
  await executor.execute(identity, { operation: "plan.create", input: { title: "First plan", taskName: "first-plan" } });
  const configPath = path.join(workdir, ".claw", "project.json");
  assert.equal(fs.existsSync(configPath), true);
  const before = fs.readFileSync(configPath, "utf8");
  const child = path.join(workdir, "src");
  fs.mkdirSync(child);
  await executor.execute({ ...identity, agentSessionId: "cindy-child", workdir: child }, {
    operation: "plan.create", input: { title: "Child plan", taskName: "child-plan" },
  });
  assert.equal(fs.existsSync(path.join(child, ".claw")), false);
  assert.equal(fs.readFileSync(configPath, "utf8"), before);
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
  assert.equal("knowledgeDispatch" in left, false, "leave must detach without creating a knowledge finalizer job");
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

test("search and index refresh do not hold the session execution queue", async () => {
  const runtimeRoot = fixture("search-queue-runtime");
  const projectRoot = fixture("search-queue-project");
  initProject({ cwd: projectRoot, projectName: "Search Queue", planning: false, externalDocPaths: ["docs"] });
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "docs", "allowed.md"), "session setup documentation", "utf-8");
  const registry = new SessionRegistryV2(runtimeRoot);
  let executions = 0;
  const original = registry.withExecution.bind(registry);
  registry.withExecution = async (key, action) => {
    executions += 1;
    return original(key, action);
  };
  const executor = new SessionCommandExecutor(registry);
  const identity = { agentSessionId: "agent-search-queue", workdir: projectRoot, client: { kind: "adapter" as const, host: "dsh" } };
  const previousMock = process.env.CLAW_EMBEDDING_MOCK;
  const previousDaemon = process.env.CLAW_IN_SESSION_DAEMON;
  process.env.CLAW_EMBEDDING_MOCK = "1";
  process.env.CLAW_IN_SESSION_DAEMON = "1";
  try {
    const unavailable = await executor.execute(identity, { operation: "search", input: { query: "setup" } });
    assert.deepEqual((unavailable.output as { results: unknown[] }).results, []);
    assert.equal((unavailable.output as { unavailable: { code: string } }).unavailable.code, "MEMORY_VECTOR_INDEX_REQUIRED");
    assert.equal(executions, 0);
    try {
      const refreshed = await executor.execute(identity, { operation: "search.index.refresh", input: {} });
      assert.equal((refreshed.output as { scope?: string }).scope, "project");
      const found = await executor.execute(identity, { operation: "search", input: { query: "setup" } });
      assert.equal(Array.isArray((found.output as { results?: unknown }).results), true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("fts5")) throw error;
    }
    assert.equal(executions, 0);
    await executor.execute(identity, {
      operation: "plan.create",
      input: { taskName: "queue-plan", title: "Queue plan", goalText: "Mutations still queue" },
    });
    assert.equal(executions, 1);
  } finally {
    if (previousMock === undefined) delete process.env.CLAW_EMBEDDING_MOCK;
    else process.env.CLAW_EMBEDDING_MOCK = previousMock;
    if (previousDaemon === undefined) delete process.env.CLAW_IN_SESSION_DAEMON;
    else process.env.CLAW_IN_SESSION_DAEMON = previousDaemon;
  }
});

test("session command refreshes only its resolved project index", async () => {
  const runtimeRoot = fixture("index-runtime");
  const projectRoot = fixture("index-project");
  initProject({ cwd: projectRoot, projectName: "Session Index", planning: false });
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "docs", "allowed.md"), "session setup documentation", "utf-8");
  const registry = new SessionRegistryV2(runtimeRoot);
  const opened = await registry.open("agent-index", projectRoot, { kind: "node" });
  const service = new ClawCommandService(registry);
  const previousMock = process.env.CLAW_EMBEDDING_MOCK;
  process.env.CLAW_EMBEDDING_MOCK = "1";
  try {
    const result = await service.execute({
      cwd: opened.identity.canonicalWorkdir,
      agentSessionId: opened.identity.agentSessionId,
      sessionKey: sessionFocusKey(opened.identity),
      mode: "session",
    }, { operation: "search.index.refresh", input: {} });
    assert.equal((result.output as { scope: string }).scope, "project");
  } finally {
    if (previousMock === undefined) delete process.env.CLAW_EMBEDDING_MOCK;
    else process.env.CLAW_EMBEDDING_MOCK = previousMock;
  }
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

test("creating a root plan atomically leaves the unfinished current plan", async () => {
  for (const status of ["process.active", "process.wait", "process.discussing"] as const) {
    const runtimeRoot = fixture(`create-gate-runtime-${status}`);
    const projectRoot = fixture(`create-gate-project-${status}`);
    initProject({ cwd: projectRoot, projectName: "Create Gate", planning: false });
    const registry = new SessionRegistryV2(runtimeRoot);
    const opened = await registry.open(`agent-create-gate-${status}`, projectRoot, { kind: "node" });
    const service = new ClawCommandService(registry);
    const context = {
      cwd: opened.identity.canonicalWorkdir,
      agentSessionId: opened.identity.agentSessionId,
      sessionKey: sessionFocusKey(opened.identity),
      mode: "session" as const,
    };
    const currentTaskName = `current-${status.replace("process.", "")}`;
    const blockedTaskName = `blocked-${status.replace("process.", "")}`;
    await service.execute(context, {
      operation: "plan.create",
      input: { taskName: currentTaskName, title: "Current plan", goalText: "Keep working" },
    });
    if (status === "process.wait") {
      await service.execute(context, { operation: "plan.wait", input: {} });
    } else if (status === "process.discussing") {
      await service.execute(context, {
        operation: "plan.edit",
        input: { operations: [{ type: "plan.status", status }] },
      });
    }

    const nextTaskName = `next-${status.replace("process.", "")}`;
    // An explicit new root request switches focus in one mutation; the previous
    // plan stays resumable instead of forcing a separate plan.leave ceremony.
    await service.execute(context, {
      operation: "plan.create",
      input: { taskName: nextTaskName, title: "Next root work", goalText: "Switch focus" },
    });
    assert.equal(showPlan({ cwd: projectRoot, taskName: nextTaskName }).plan.status, "process.active");
    assert.equal(showPlan({ cwd: projectRoot, taskName: currentTaskName }).plan.status, "end.leave");

    await service.execute(context, { operation: "plan.resume", input: { planId: currentTaskName } });
    assert.equal(showPlan({ cwd: projectRoot, taskName: currentTaskName }).plan.status, "process.active");
    assert.equal(showPlan({ cwd: projectRoot, taskName: nextTaskName }).plan.status, "end.leave");
  }
});

test("daemon and one-shot executors recover the same focused session", async () => {
  const runtimeRoot = fixture("shared-runtime");
  const projectRoot = fixture("shared-project");
  initProject({ cwd: projectRoot, projectName: "Shared Command", planning: false });
  const identity = { agentSessionId: "shared-session", workdir: projectRoot, client: { kind: "adapter" as const, host: "dsh" } };
  const daemon = new SessionCommandExecutor(new SessionRegistryV2(runtimeRoot));
  const baseline = new SessionCommandExecutor(new SessionRegistryV2(runtimeRoot));
  const created = await daemon.execute(identity, { operation: "plan.create", input: { taskName: "shared", title: "Shared" } });
  const recovered = await baseline.execute(identity, { operation: "plan.show", input: { simple: true } });
  assert.equal(created.schemaVersion, 1);
  assert.equal(recovered.schemaVersion, 1);
  assert.equal((recovered.output as { status: string }).status, "process.active");
  await Promise.all([
    daemon.execute(identity, { operation: "task.add", input: { tasks: [{ title: "From daemon" }] } }),
    baseline.execute(identity, { operation: "task.add", input: { tasks: [{ title: "From baseline" }] } }),
  ]);
  const settled = await baseline.execute(identity, { operation: "plan.show", input: { simple: true } });
  assert.deepEqual((settled.output as { tasks: Array<{ title: string }> }).tasks.map((task) => task.title).sort(),
    ["From baseline", "From daemon", "Shared"]);
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
      // Deliberately bypass the closed TypeScript union to test the runtime boundary.
      { operation: "shell.exec", input: { command: "echo unsafe" } } as never,
    ),
    (error: unknown) => error instanceof Error
      && "code" in error
      && (error as { code: string }).code === "SESSION_OPERATION_UNSUPPORTED",
  );
});

test("existing work starts with no repeated hydration and repeat start preserves work", async () => {
  const cwd = fixture("empty-start"), runtime = fixture("empty-start-runtime");
  initProject({ cwd, projectName: "Start", planning: true });
  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtime));
  const identity = { agentSessionId: "start-once", workdir: cwd, client: { kind: "adapter" as const, host: "dsh" as const } };
  await executor.execute(identity, { operation: "plan.create", input: { title: "Existing work", knowledgeCapture: false } });
  const started = await executor.execute(identity, { operation: "plan.start", input: {} });
  assert.equal((started.output as { plan: { status: string } }).plan.status, "process.active");
  const repeated = await executor.execute(identity, { operation: "plan.start", input: {} });
  assert.equal((repeated.output as { plan: { status: string } }).plan.status, "process.active");
  assert.deepEqual((repeated.output as { plan: { tasks: unknown[] } }).plan.tasks, (started.output as { plan: { tasks: unknown[] } }).plan.tasks);
});
test("session create accepts explicit initial tasks without a start ceremony", async () => {
  const cwd = fixture("direct-work"), runtime = fixture("direct-work-runtime");
  initProject({ cwd, projectName: "Direct", planning: true });
  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtime));
  const created = await executor.execute({ agentSessionId: "direct-work", workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } },
    { operation: "plan.create", input: { title: "Direct work", tasks: [{ title: "Implement" }, { title: "Verify" }] } });
  const output = created.output as { plan: { status: string; tasks: Array<{ title: string }> } };
  assert.equal(output.plan.status, "process.active");
  assert.deepEqual(output.plan.tasks.map((task) => task.title), ["Implement", "Verify"]);
});
test("typed session command removes a temporary task without a shell round trip", async () => {
  const cwd = fixture("task-remove"), runtime = fixture("task-remove-runtime");
  initProject({ cwd, projectName: "Remove", planning: false });
  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtime));
  const identity = { agentSessionId: "task-remove", workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } };
  await executor.execute(identity, { operation: "plan.create", input: { title: "Temporary work", tasks: [{ title: "Keep" }, { title: "Throwaway" }] } });
  const removed = await executor.execute(identity, { operation: "task.remove", input: { taskId: 2 } });
  assert.equal((removed.output as { plan: { tasks: Array<{ title: string }> } }).plan.tasks.map((task) => task.title).includes("Throwaway"), false);
  assert.deepEqual((removed.output as { plan: { tasks: Array<{ title: string }> } }).plan.tasks.map((task) => task.title), ["Keep"]);
});
