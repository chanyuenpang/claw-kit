import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { initProject, resolveProjectContext, resolveSessionWorkflowContext, showPlan, unbindSession, writePlan } from "@veewo/claw-core";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2, createSessionIdentity } from "../dist/session-registry-v2.js";

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-project-scope-recovery-"));
  const previous = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = path.join(root, "session-workflows");
  t.after(() => {
    if (previous === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previous;
    try {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch (error) {
      // Windows can retain SQLite/completion-refresh handles until this worker exits.
      if (!["EPERM", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  });
  const cwd = path.join(root, "project");
  fs.mkdirSync(cwd);
  initProject({ cwd, projectName: "Scope recovery", planning: false });
  const registry = new SessionRegistryV2(path.join(root, "daemon"));
  const executor = new SessionCommandExecutor(registry);
  const identity = { agentSessionId: "same-agent", workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } };
  const execute = (operation: string, input: Record<string, unknown> = {}) => executor.execute(identity, { operation, input });
  return { cwd, registry, executor, identity, execute };
}

async function finishSessionPlan(execute: (operation: string, input?: Record<string, unknown>) => Promise<unknown>) {
  await execute("plan.create", { title: "Temporary release", taskName: "temporary-release", scope: "session", knowledgeCapture: false, goalText: "Finish release", planStatus: "process.active" });
  await execute("task.done", { tasks: [{ id: 1 }] });
  await execute("plan.done", {});
}

test("completed session storage cannot strand the next project plan on open, start or resume", async (t) => {
  const { cwd, registry, executor, identity, execute } = fixture(t);
  await finishSessionPlan(execute);
  assert.ok(resolveSessionWorkflowContext(identity.agentSessionId), "retained session manifest reproduces the original trigger");
  const created = await execute("plan.create", { title: "Project work", taskName: "project-work", goalText: "Implement project work", knowledgeCapture: false, forcePlanning: true });
  const output = created.output as { planPath: string; scope: string };
  assert.equal(output.scope, "project");
  assert.ok(output.planPath.startsWith(path.join(cwd, ".claw", "tasks")));
  const hash = createSessionIdentity(identity.agentSessionId, cwd).sessionKeyHash;
  assert.equal(registry.read(hash).currentPlan?.scope, "project");
  await executor.open(identity);
  await execute("plan.start", { updates: { requirementsSummary: "Project requirements", acceptanceCriteria: ["Implementation verified"] }, appendTasks: [{ title: "Implement project work" }] });
  await execute("plan.wait");
  await execute("plan.resume");
  await execute("plan.resume", { planId: "project-work" });
  assert.equal(showPlan({ cwd, scope: "project", taskName: "project-work" }).plan.status, "process.active");
  await assert.rejects(execute("plan.create", { title: "Do not replace active work", knowledgeCapture: false }), /Cannot create a new plan/);
  assert.equal(registry.read(hash).currentPlan?.taskName, "project-work");
  const temporary = showPlan({ cwd, scope: "session", ownerSessionKey: identity.agentSessionId, taskName: "temporary-release" });
  assert.equal(temporary.plan.status, "end.completed");
  const remaining = showPlan({ cwd, scope: "project", taskName: "project-work" }).plan.tasks
    .filter((task) => task.status !== "done").map((task) => ({ id: task.id }));
  if (remaining.length) await execute("task.done", { tasks: remaining });
  await execute("plan.done", { retrospectiveSummary: "Verified project work." });
  await execute("plan.create", { title: "Next project", taskName: "next-project", knowledgeCapture: false });
  await executor.open(identity);
  assert.equal(registry.read(hash).currentPlan?.scope, "project");
  assert.equal(registry.read(hash).currentPlan?.taskName, "next-project");
});

test("explicit resume finds an unfocused project draft despite an old session manifest", async (t) => {
  const { cwd, registry, identity, execute } = fixture(t);
  await finishSessionPlan(execute);
  await writePlan({ cwd, scope: "project", taskName: "unfocused-project", title: "Recover draft", knowledgeCapture: false,
    content: { title: "Recover draft", goal: { text: "Recover draft" }, status: "process.discussing", tasks: [{ id: 1, title: "Implement", status: "pending" }] } });
  await execute("plan.resume", { planId: "unfocused-project" });
  const hash = createSessionIdentity(identity.agentSessionId, cwd).sessionKeyHash;
  assert.equal(registry.read(hash).currentPlan?.scope, "project");
  assert.equal(registry.read(hash).currentPlan?.taskName, "unfocused-project");
  await execute("plan.show");
});

test("unfocused same-name plans in both scopes remain ambiguous and unmodified", async (t) => {
  const { cwd, registry, identity, execute } = fixture(t);
  await finishSessionPlan(execute);
  for (const scope of ["project", "session"] as const) {
    await writePlan({ cwd, scope, ownerSessionKey: identity.agentSessionId, taskName: "same-name", title: scope, knowledgeCapture: false,
      content: { title: scope, goal: { text: "Inspect scope" }, status: "process.discussing", tasks: [{ id: 1, title: "Inspect", status: "pending" }] } });
  }
  unbindSession(resolveProjectContext(cwd), identity.agentSessionId);
  unbindSession(resolveSessionWorkflowContext(identity.agentSessionId)!, identity.agentSessionId);
  await assert.rejects(execute("plan.resume", { planId: "same-name" }), /ambiguous|both.*scope/i);
  const hash = createSessionIdentity(identity.agentSessionId, cwd).sessionKeyHash;
  assert.equal(registry.read(hash).currentPlan, undefined);
  for (const scope of ["project", "session"] as const) {
    assert.equal(showPlan({ cwd, scope, ownerSessionKey: identity.agentSessionId, taskName: "same-name" }).plan.status, "process.discussing");
  }
});

test("canonical project binding repairs a lost focus despite retained session storage", async (t) => {
  const { cwd, registry, executor, identity, execute } = fixture(t);
  await finishSessionPlan(execute);
  await writePlan({ cwd, scope: "project", ownerSessionKey: identity.agentSessionId,
    taskName: "bound-project", title: "Bound project", knowledgeCapture: false,
    content: { title: "Bound project", goal: { text: "Restore bound project" }, status: "process.discussing", tasks: [{ id: 1, title: "Work", status: "pending" }] } });
  await executor.open(identity);
  const hash = createSessionIdentity(identity.agentSessionId, cwd).sessionKeyHash;
  assert.equal(registry.read(hash).currentPlan?.scope, "project");
  assert.equal(registry.read(hash).currentPlan?.taskName, "bound-project");
  await execute("plan.show");
});

test("unfocused session-only resume still resolves its own storage", async (t) => {
  const { cwd, registry, identity, execute } = fixture(t);
  await finishSessionPlan(execute);
  await writePlan({ cwd, scope: "session", ownerSessionKey: identity.agentSessionId,
    taskName: "session-draft", title: "Session draft", knowledgeCapture: false,
    content: { title: "Session draft", goal: { text: "Resume temporary work" }, status: "process.discussing", tasks: [{ id: 1, title: "Temporary work", status: "pending" }] } });
  unbindSession(resolveSessionWorkflowContext(identity.agentSessionId)!, identity.agentSessionId);
  await execute("plan.resume", { planId: "session-draft" });
  await execute("task.add", { tasks: [{ title: "Extra temporary work" }] });
  const hash = createSessionIdentity(identity.agentSessionId, cwd).sessionKeyHash;
  assert.equal(registry.read(hash).currentPlan?.scope, "session");
  assert.equal(showPlan({ cwd, scope: "session", ownerSessionKey: identity.agentSessionId, taskName: "session-draft" }).plan.tasks.length, 2);
  assert.throws(() => showPlan({ cwd, scope: "project", taskName: "session-draft" }), /does not exist/);
});

function oneOffContext(cwd: string, agentSessionId: string) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/bin.js", import.meta.url)), "context", "--host", "dsh"], {
    cwd, encoding: "utf8", windowsHide: true,
    env: { ...process.env, CLAW_HOST: "dsh", CLAW_SESSION_ID: agentSessionId,
      CODEX_THREAD_ID: "", CODEX_SESSION_ID: "", CLAW_GUIDANCE_CONFIG: "",
      CLAW_SESSION_DAEMON_RUNTIME_DIR: path.join(cwd, "..", "daemon"),
      CLAW_EMBEDDING_WARMUP_DISABLE_LAUNCH: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as {
    project: { scope?: string };
    session?: { boundPlan: boolean };
    activeWorkflow?: { taskName: string; planPath: string; planSummary: string;
      planContent: { tasks: Array<{ id: number; status: string }> };
      workflowGuidance: { nextTask?: { id: number } } };
  };
}

test("one-off context returns project binding and 3/6 progress with a retained session manifest", async (t) => {
  const { cwd, identity, execute } = fixture(t);
  await finishSessionPlan(execute);
  const created = await writePlan({ cwd, scope: "project", ownerSessionKey: identity.agentSessionId,
    taskName: "context-project", title: "Context project", knowledgeCapture: false,
    content: { title: "Context project", goal: { text: "Recover exact progress" }, status: "process.active",
      tasks: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, title: "Task " + (index + 1), status: index < 3 ? "done" as const : "pending" as const })) } });
  const context = oneOffContext(cwd, identity.agentSessionId);
  assert.equal(context.project.scope, undefined);
  assert.equal(context.session, undefined, "an existing canonical binding must not report boundPlan:false");
  assert.equal(context.activeWorkflow?.taskName, "context-project");
  assert.equal(context.activeWorkflow?.planPath, created.planPath);
  assert.match(context.activeWorkflow!.planSummary, /3\/6/);
  assert.equal(context.activeWorkflow?.planContent.tasks.filter((task) => task.status === "done").length, 3);
  assert.equal(context.activeWorkflow?.workflowGuidance.nextTask?.id, 4);
});

test("one-off context preserves an active session-bound workflow", async (t) => {
  const { cwd, identity, execute } = fixture(t);
  const created = await execute("plan.create", { title: "Session context", taskName: "context-session",
    scope: "session", knowledgeCapture: false, goalText: "Continue session work", planStatus: "process.active" });
  const context = oneOffContext(cwd, identity.agentSessionId);
  assert.equal(context.project.scope, "session");
  assert.equal(context.session, undefined);
  assert.equal(context.activeWorkflow?.taskName, "context-session");
  assert.equal(context.activeWorkflow?.planPath, (created.output as { planPath: string }).planPath);
});
