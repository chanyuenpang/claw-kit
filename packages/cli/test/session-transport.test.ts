import test, { after } from "node:test";
import { removeTestDirectory } from "./fixture-cleanup.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  editPlan,
  initProject,
  showPlan,
  writePlan,
} from "@veewo/claw-core";
import {
  openPersistentSession,
  SESSION_OPEN_QUEUE_TIMEOUT_MS,
  SessionCommandExecutor,
  type PersistentClawSession,
} from "../dist/session-command.js";
import {
  SessionRegistryV2,
  createSessionIdentity,
  sessionFocusKey,
} from "../dist/session-registry-v2.js";
import { ClawCommandService } from "../dist/command-service.js";

type Envelope = {
  schemaVersion?: number;
  output?: Record<string, unknown>;
  hostActions?: Array<{ schemaVersion?: number; id?: string; tool?: string; input?: unknown }>;
  postCommitEffects?: unknown[];
  knowledgeDispatch?: {
    finalizeId?: string;
    policy?: string;
    prompt?: string;
    preferReuse?: boolean;
    [key: string]: unknown;
  };
};

type SessionStatus = {
  session: { state?: string; currentPlan?: { taskName?: string } };
  transport?: { mode?: string; pid?: number; startedAt?: string };
};

const temporaryRoots: string[] = [];
function fixture(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claw-transport-${name}-`));
  temporaryRoots.push(root);
  return root;
}
after(async () => {
  for (const root of temporaryRoots) await removeTestDirectory(root);
});

function openSession(
  runtimeRoot: string,
  workdir: string,
  agentSessionId: string,
  extra: { host?: string; clientKind?: "terminal" | "node" | "adapter"; receiptOnly?: boolean } = {},
): Promise<PersistentClawSession> {
  return openPersistentSession({ runtimeRoot, workdir, agentSessionId, ...extra });
}

async function command(
  session: PersistentClawSession,
  operation: string,
  input: Record<string, unknown> = {},
): Promise<Envelope> {
  return await session.execute({ operation, input }) as unknown as Envelope;
}

function statusOf(session: PersistentClawSession): SessionStatus {
  return session.status() as unknown as SessionStatus;
}

test("direct persistent session returns the retained record and executes plan commands", async () => {
  const runtimeRoot = fixture("shared-runtime");
  const projectRoot = fixture("shared-project");
  initProject({ cwd: projectRoot, projectName: "Direct Shared", planning: false });
  const session = await openSession(runtimeRoot, projectRoot, "agent-direct");

  try {
    const created = await command(session, "plan.create", {
      taskName: "direct-plan",
      title: "Direct plan",
      goalText: "Run in process",
    });
    assert.equal(created.schemaVersion, 1);
    const simple = await command(session, "plan.show", { simple: true });
    assert.deepEqual(simple.output, {
      status: "process.active",
      goal: { text: "Run in process" },
      tasks: [{ title: "Run in process" }],
      rules: [],
    });
    const status = statusOf(session);
    assert.equal(status.session.state, "live");
    assert.equal(status.session.currentPlan?.taskName, "direct-plan");
    assert.equal(status.transport?.mode, "direct");
    assert.equal(typeof status.transport?.pid, "number");
    assert.match(String(status.transport?.startedAt), /^\d{4}-\d{2}-\d{2}T/);

    // The open envelope stays additive: retained session plus direct transport
    // telemetry, without a daemon handshake field.
    const openResult = session.openResult as {
      session?: { state?: string };
      telemetry?: { transport?: string; durationMs?: unknown };
    };
    assert.equal(openResult.session?.state, "live");
    assert.equal(openResult.telemetry?.transport, "direct");
    assert.equal(typeof openResult.telemetry?.durationMs, "number");
  } finally {
    await session.close();
  }
});

test("session open reconciles a root plan written before the focus journal was prepared", async () => {
  const runtimeRoot = fixture("pre-journal-root-runtime");
  const projectRoot = fixture("pre-journal-root-project");
  const agentSessionId = "pre-journal-root-agent";
  initProject({ cwd: projectRoot, projectName: "Pre-journal Root", planning: false });
  const initial = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "codex", clientKind: "adapter" });
  await initial.close();

  await writePlan({
    cwd: projectRoot,
    taskName: "pre-journal-root-plan",
    title: "Pre-journal root plan",
    goalText: "Recover canonical focus",
    ownerSessionKey: agentSessionId,
    host: "codex",
  });

  const reopened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "codex", clientKind: "adapter" });
  try {
    const openResult = reopened.openResult as { currentPlan?: unknown; session?: { currentPlan?: unknown } };
    assert.ok(openResult.currentPlan);
    assert.ok(openResult.session?.currentPlan);
    const shown = await command(reopened, "plan.show", {});
    assert.equal((shown.output as { taskName?: string }).taskName, "pre-journal-root-plan");
  } finally {
    await reopened.close();
  }
});

test("session open completes parent linkage for a legacy subplan written before the focus journal", async () => {
  const runtimeRoot = fixture("pre-journal-subplan-runtime");
  const projectRoot = fixture("pre-journal-subplan-project");
  const agentSessionId = "pre-journal-subplan-agent";
  initProject({ cwd: projectRoot, projectName: "Pre-journal Subplan", planning: false });
  const opened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "codex", clientKind: "adapter" });
  const createdResult = await command(opened, "plan.create", {
    taskName: "pre-journal-subplan-plan",
    title: "Pre-journal subplan plan",
    goalText: "Recover child focus and parent linkage",
  });
  const created = createdResult.output as { taskName: string; planFile: string };
  await opened.close();

  // Reconstruct the old pre-journal state explicitly. createSubplan now commits
  // the full write set and must no longer be used to manufacture this gap.
  const child = await writePlan({
    cwd: projectRoot,
    taskName: created.taskName,
    filePath: "legacy-child.json", title: "Legacy child", goalText: "Recover legacy child",
    parentPlanFile: created.planFile, parentTaskId: 1,
    ownerSessionKey: agentSessionId,
    host: "codex",
    deferParentMutation: true,
  });

  const reopened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "codex", clientKind: "adapter" });
  try {
    const shown = await command(reopened, "plan.show", {});
    assert.equal((shown.output as { planFile?: string }).planFile, child.planFile);
    const parent = showPlan({
      cwd: projectRoot,
      taskName: created.taskName,
      planFile: created.planFile,
      ownerSessionKey: agentSessionId,
    });
    assert.equal(parent.plan.tasks[0]?.execution?.subplan, child.planFile);
    assert.equal(parent.plan.tasks[0]?.status, "in_progress");
  } finally {
    await reopened.close();
  }
});

test("session open releases retained focus after a terminal write completed before its focus journal", async () => {
  const runtimeRoot = fixture("pre-journal-end-runtime");
  const projectRoot = fixture("pre-journal-end-project");
  const agentSessionId = "pre-journal-end-agent";
  initProject({ cwd: projectRoot, projectName: "Pre-journal End", planning: false });
  const opened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "codex", clientKind: "adapter" });
  const created = (await command(opened, "plan.create", {
    taskName: "pre-journal-end-plan",
    title: "Pre-journal end plan",
    goalText: "Release stale retained focus",
  })).output as { taskName: string; planFile: string };
  await command(opened, "task.done", { tasks: [{ id: 1 }] });
  await opened.close();

  await editPlan({
    cwd: projectRoot,
    taskName: created.taskName,
    planFile: created.planFile,
    operations: [
      { type: "plan.update", updates: { retrospectiveSummary: "Completed before focus journal." } },
      { type: "plan.status", status: "end.completed" },
    ],
    commandSource: "plan.done",
    ownerSessionKey: agentSessionId,
    host: "codex",
    deferSubplanClosure: true,
  });

  const reopened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "codex", clientKind: "adapter" });
  try {
    const openResult = reopened.openResult as { currentPlan?: unknown; session?: { currentPlan?: unknown } };
    assert.equal(openResult.currentPlan, undefined);
    assert.equal(openResult.session?.currentPlan, undefined);
    await assert.rejects(
      () => command(reopened, "plan.show", {}),
      { code: "CURRENT_PLAN_REQUIRED" },
    );
  } finally {
    await reopened.close();
  }
});

test("persistent session starts a planning plan through the typed protocol", async () => {
  const runtimeRoot = fixture("plan-start-runtime");
  const projectRoot = fixture("plan-start-project");
  const agentSessionId = `agent-plan-start-${path.basename(runtimeRoot)}`;
  initProject({ cwd: projectRoot, projectName: "Direct Plan Start", planning: true });
  const opened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "cindy", clientKind: "adapter" });

  try {
    await command(opened, "plan.create", {
      taskName: "plan-start",
      title: "Plan start",
      goalText: "Start through JSONL",
      knowledgeCapture: false,
    });
    const started = await command(opened, "plan.start", {
      updates: {
        requirementsSummary: "Keep the session resident.",
        acceptanceCriteria: ["The typed start succeeds."],
      },
      appendTasks: [{ title: "Implement resident transport", detail: "Use one session connection." }],
    });
    const output = started.output as {
      planStatus: string;
      plan: {
        requirements: { summary: string; acceptanceCriteria: string[] };
        tasks: Array<{ title: string; status: string }>;
      };
    };
    assert.equal(output.planStatus, "process.active");
    assert.equal(output.plan.requirements.summary, "Keep the session resident.");
    assert.deepEqual(output.plan.requirements.acceptanceCriteria, ["The typed start succeeds."]);
    assert.deepEqual(output.plan.tasks.map((task) => [task.title, task.status]), [
      ["Complete planning with planning", "done"],
      ["Implement resident transport", "pending"],
    ]);
  } finally {
    await opened.close();
  }
});

test("DSH persistent session emits host actions for session-scoped workflows", async () => {
  const runtimeRoot = fixture("dsh-session-actions-runtime");
  const projectRoot = fixture("dsh-session-actions-project");
  const agentSessionId = `dsh-session-actions-${path.basename(runtimeRoot)}`;
  initProject({ cwd: projectRoot, projectName: "DSH Session Actions", planning: true });
  const opened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" });

  try {
    const created = await command(opened, "plan.create", {
      taskName: "dsh-session-actions",
      title: "DSH session actions",
      goalText: "Project native Todo and Goal state",
      knowledgeCapture: false,
    });
    assert.deepEqual(created.hostActions?.map((action) => action.tool), ["update_plan"]);
    const started = await command(opened, "plan.start", {
      updates: {
        requirementsSummary: "Verify DSH session projection.",
        acceptanceCriteria: ["Todo and Goal actions are present."],
      },
      appendTasks: [{ title: "Verify projection", detail: "Inspect host actions." }],
    });
    assert.deepEqual(started.hostActions?.map((action) => action.tool), ["update_plan", "create_goal"]);

    const taskDone = await command(opened, "task.done", { tasks: [{ id: 2 }] });
    assert.deepEqual(taskDone.hostActions?.map((action) => action.tool), ["update_plan"]);

    const completed = await command(opened, "plan.done", {
      retrospectiveSummary: "Non-capturing workflow and Goal projection verified.",
    });
    assert.deepEqual(completed.hostActions?.map((action) => action.tool), ["update_plan", "update_goal"]);
    assert.deepEqual(completed.hostActions?.[0]?.input, {
      explanation: "The plan is completed and ready for closeout.",
      plan: [],
    });
    assert.equal(completed.knowledgeDispatch, undefined);
  } finally {
    await opened.close();
  }
});

test("non-capturing persistent session completion omits knowledge dispatch and finalization jobs", async () => {
  const runtimeRoot = fixture("session-scope-closeout-runtime");
  const projectRoot = fixture("session-scope-closeout-project");
  const agentSessionId = `session-scope-closeout-${path.basename(runtimeRoot)}`;
  initProject({ cwd: projectRoot, projectName: "Session Scope Closeout", planning: false });
  const opened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "cindy", clientKind: "adapter" });

  try {
    const created = await command(opened, "plan.create", {
      taskName: "session-scope-closeout-plan",
      title: "Session scope closeout",
      goalText: "Complete without project knowledge deposition",
      knowledgeCapture: false,
    });
    const planPath = String((created.output as { planPath?: string }).planPath);
    await command(opened, "task.done", { tasks: [{ id: 1 }] });
    const done = await command(opened, "plan.done", {
      retrospectiveSummary: "Session workflow complete",
    });

    assert.equal(done.knowledgeDispatch, undefined);
    const guidance = (done.output as { workflowGuidance?: unknown }).workflowGuidance;
    assert.doesNotMatch(
      JSON.stringify(guidance),
      /knowledgeDispatch|knowledge[ ._-]*(?:claim|done|finaliz)|spawn_agent/i,
    );
    const finalizationDir = path.join(path.dirname(planPath), ".runtime", "knowledge-finalization");
    const finalizationJobs = fs.existsSync(finalizationDir)
      ? fs.readdirSync(finalizationDir).filter((entry) => entry.endsWith(".json"))
      : [];
    assert.deepEqual(finalizationJobs, []);
  } finally {
    await opened.close();
  }
});

test("persistent session preserves post-commit host actions in the typed command envelope", async () => {
  const runtimeRoot = fixture("host-actions-runtime");
  const projectRoot = fixture("host-actions-project");
  initProject({ cwd: projectRoot, projectName: "Direct Host Actions", planning: false });
  const projectConfigPath = path.join(projectRoot, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf8")) as {
    knowledgeWriter: { executionPolicy: string };
  };
  projectConfig.knowledgeWriter.executionPolicy = "subagent";
  fs.writeFileSync(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf8");
  const opened = await openSession(runtimeRoot, projectRoot, "agent-host-actions", { host: "codex", clientKind: "adapter" });

  try {
    await command(opened, "plan.create", {
      taskName: "host-actions-plan",
      title: "Host actions plan",
      goalText: "Preserve effects",
    });
    await command(opened, "task.done", { tasks: [{ id: 1 }] });
    const done = await command(opened, "plan.done", {
      retrospectiveSummary: "Complete",
    });

    assert.equal(done.schemaVersion, 1);
    // One envelope carries the canonical output and every post-commit surface.
    assert.equal(typeof done.output, "object");
    const hostActions = done.hostActions;
    assert.equal(hostActions?.length, 1);
    assert.equal(hostActions?.[0]?.schemaVersion, 1);
    assert.match(String(hostActions?.[0]?.id), /^[a-f0-9-]+:update_goal$/);
    assert.equal(hostActions?.[0]?.tool, "update_goal");
    assert.deepEqual(hostActions?.[0]?.input, { status: "complete" });
    assert.deepEqual(done.postCommitEffects, [{
      type: "completion.refresh",
      taskName: "host-actions-plan",
      planStatus: "end.completed",
    }]);
    assert.equal("policy" in (done.knowledgeDispatch as object), false);
    assert.match(
      String(done.knowledgeDispatch?.dispatchId),
      /^[a-f0-9]{64}$/,
    );
  } finally {
    await opened.close();
  }
});

test("Cindy persistent sessions coerce background config to the templated no-Stop knowledge dispatch", async () => {
  const runtimeRoot = fixture("cindy-atomic-dispatch-runtime");
  const projectRoot = fixture("cindy-atomic-dispatch-project");
  initProject({ cwd: projectRoot, projectName: "Cindy Atomic Dispatch", planning: false });
  const opened = await openSession(runtimeRoot, projectRoot, "cindy-atomic-dispatch", { host: "cindy", clientKind: "adapter" });

  try {
    await command(opened, "plan.create", {
      taskName: "cindy-atomic-plan",
      title: "Cindy atomic plan",
      goalText: "Dispatch without a Stop hook",
    });
    await command(opened, "task.done", { tasks: [{ id: 1 }] });
    const done = await command(opened, "plan.done", {
      retrospectiveSummary: "Complete",
    });
    const dispatch = done.knowledgeDispatch;
    assert.equal("policy" in (dispatch ?? {}), false);
    assert.match(String(dispatch?.prompt), /knowledge\.materials/);
    assert.match(String(dispatch?.prompt), /auxiliary plan with knowledge_capture=false/i);
    assert.match(String(dispatch?.prompt), /governance subplan/i);
    assert.match(String(dispatch?.prompt), /Cindy Ghost/is);
    assert.doesNotMatch(String(dispatch?.prompt), /did-turn-end|Stop hook|knowledge wait/i);
  } finally {
    await opened.close();
  }
});

test("DSH persistent sessions coerce a fresh project's default background config to native subagent dispatch", async () => {
  const runtimeRoot = fixture("dsh-default-dispatch-runtime");
  const projectRoot = fixture("dsh-default-dispatch-project");
  initProject({ cwd: projectRoot, projectName: "DSH Default Dispatch", planning: false });
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".claw", "project.json"), "utf8"),
  ) as { knowledgeWriter?: { executionPolicy?: string } };
  // Fresh scaffolds omit executionPolicy; the DSH capability matrix resolves
  // the omitted policy to its subagent default at dispatch time.
  assert.equal(projectConfig.knowledgeWriter?.executionPolicy, undefined);
  const opened = await openSession(runtimeRoot, projectRoot, "dsh-default-dispatch", { host: "dsh", clientKind: "adapter" });

  try {
    await command(opened, "plan.create", {
      taskName: "dsh-default-plan",
      title: "DSH default plan",
      goalText: "Dispatch with the default project configuration",
    });
    await command(opened, "task.done", { tasks: [{ id: 1 }] });
    const done = await command(opened, "plan.done", {
      retrospectiveSummary: "Complete",
    });
    const dispatch = done.knowledgeDispatch;
    assert.equal(dispatch?.schemaVersion, 2);
    assert.equal("policy" in (dispatch ?? {}), false);
    assert.match(String(dispatch?.dispatchId), /^[a-f0-9]{64}$/);
    assert.match(String(dispatch?.prompt), /claw_run knowledge.materials/);
    assert.match(String(dispatch?.prompt), /ordinary auxiliary plan/);
    assert.doesNotMatch(String(dispatch?.prompt), /knowledge[ .](claim|done)|claimToken/);
    assert.equal(dispatch?.preferReuse, false);
    assert.equal(dispatch?.sourceSessionKey, "dsh-default-dispatch");
    assert.equal(dispatch?.sourcePlan, (done.output as { planPath: string }).planPath);
    assert.ok(String(dispatch?.prompt).includes(String(dispatch?.sourcePlan).replaceAll("\\", "\\\\")));
    assert.doesNotMatch(String(dispatch?.prompt), /claw plan create --template-file/);
  } finally {
    await opened.close();
  }
});

test("Codex adapter sessions receive native Goal actions without progress projection", async () => {
  const runtimeRoot = fixture("codex-actions-runtime");
  const projectRoot = fixture("codex-actions-project");
  initProject({ cwd: projectRoot, projectName: "Direct Codex Actions", planning: true });
  const opened = await openSession(runtimeRoot, projectRoot, "agent-codex-actions", { host: "codex", clientKind: "adapter" });
  try {
    await command(opened, "plan.create", {
      taskName: "codex-actions-plan",
      title: "Codex actions plan",
      goalText: "Project native host actions",
    });
    await command(opened, "task.add", {
      tasks: [
        { title: "Second task" },
        { title: "Third task" },
      ],
    });
    const activated = await command(opened, "plan.edit", {
      operations: [{ type: "plan.status", status: "process.active" }],
    });
    assert.deepEqual(
      activated.hostActions?.map((action) => action.tool),
      ["create_goal"],
    );
  } finally {
    await opened.close();
  }
});

test("sequential sessions for the same identity retain currentPlan; state only records the last clean close", async () => {
  const runtimeRoot = fixture("sequential-runtime");
  const projectRoot = fixture("sequential-project");
  const agentSessionId = "agent-sequential";
  initProject({ cwd: projectRoot, projectName: "Sequential Sessions", planning: false });
  const first = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" });
  await command(first, "plan.create", {
    taskName: "sequential-plan",
    title: "Sequential plan",
    goalText: "Stay retained",
  });
  await first.close();

  const registry = new SessionRegistryV2(runtimeRoot);
  const hash = createSessionIdentity(agentSessionId, projectRoot).sessionKeyHash;
  const closed = registry.read(hash);
  assert.equal(closed.state, "disconnected");
  assert.equal(closed.currentPlan?.taskName, "sequential-plan");

  const second = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" });
  try {
    const openResult = second.openResult as {
      currentPlan?: { status?: string };
      session?: { state?: string; currentPlan?: { taskName?: string } };
    };
    // The open result carries the simple currentPlan view; the retained record
    // separately carries the canonical plan reference.
    assert.equal(openResult.currentPlan?.status, "process.active");
    assert.equal(openResult.session?.currentPlan?.taskName, "sequential-plan");
    assert.equal(openResult.session?.state, "live");
    const shown = await command(second, "plan.show", { simple: true });
    assert.equal((shown.output as { status?: string }).status, "process.active");
  } finally {
    await second.close();
  }
  const reopened = registry.read(hash);
  assert.equal(reopened.state, "disconnected");
  assert.equal(reopened.currentPlan?.taskName, "sequential-plan");
});

test("concurrent sessions for the same identity serialize through execution.queue.json", async () => {
  const runtimeRoot = fixture("concurrent-runtime");
  const projectRoot = fixture("concurrent-project");
  const agentSessionId = "agent-concurrent";
  initProject({ cwd: projectRoot, projectName: "Concurrent Sessions", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const hash = createSessionIdentity(agentSessionId, projectRoot).sessionKeyHash;
  const queuePath = path.join(registry.sessionDirectory(hash), "execution.queue.json");
  const first = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" });
  let second: PersistentClawSession | undefined;
  let release: (() => void) | undefined;
  let held: Promise<void> | undefined;
  try {
    await command(first, "plan.create", {
      taskName: "concurrent-plan",
      title: "Concurrent plan",
      goalText: "Serialize mutations",
    });

    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => { openGate = resolve; });
    release = openGate;
    held = registry.withExecution(hash, async () => {
      entered();
      await gate;
    });
    await acquired;

    // SQLite owns occupancy; existence of an old owner JSON is not authority.
    assert.equal(fs.existsSync(queuePath), false);
    assert.equal(fs.existsSync(queuePath + ".mutex.sqlite"), true);

    let opened = false;
    const opening = openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" })
      .then((session) => { opened = true; return session; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(opened, false, "a same-identity open must wait for the held execution queue");

    openGate();
    await held;
    second = await opening;
    assert.equal(opened, true);

    await Promise.all([
      command(first, "task.add", { tasks: [{ title: "From first session" }] }),
      command(second, "task.add", { tasks: [{ title: "From second session" }] }),
    ]);
    const shown = await command(second, "plan.show", { simple: true });
    assert.deepEqual(
      (shown.output as { tasks: Array<{ title: string }> }).tasks.map((task) => task.title).sort(),
      ["From first session", "From second session", "Serialize mutations"],
    );
  } finally {
    release?.();
    if (held) await held.catch(() => undefined);
    await first.close();
    if (second) await second.close();
  }
});

test("an abnormal exit leaves a lazy live record and the same identity reopens from it", async () => {
  const runtimeRoot = fixture("crash-runtime");
  const projectRoot = fixture("crash-project");
  const agentSessionId = "agent-crash";
  initProject({ cwd: projectRoot, projectName: "Crash Recovery", planning: false });
  const crashed = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" });
  const created = (await command(crashed, "plan.create", {
    taskName: "crash-plan",
    title: "Crash plan",
    goalText: "Survive an abnormal exit",
  })).output as { taskName?: string };
  // Do not close: the CLI process died and only the retained record remains.
  const registry = new SessionRegistryV2(runtimeRoot);
  const hash = createSessionIdentity(agentSessionId, projectRoot).sessionKeyHash;
  const retained = registry.read(hash);
  assert.equal(retained.state, "live");
  assert.equal(retained.currentPlan?.taskName, created.taskName);

  const reopened = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" });
  try {
    const openResult = reopened.openResult as {
      currentPlan?: { status?: string };
      session?: { state?: string; currentPlan?: { taskName?: string } };
    };
    assert.equal(openResult.currentPlan?.status, "process.active");
    assert.equal(openResult.session?.currentPlan?.taskName, created.taskName);
    assert.equal(openResult.session?.state, "live");
    const shown = await command(reopened, "plan.show", { simple: true });
    assert.equal((shown.output as { goal?: { text?: string } }).goal?.text, "Survive an abnormal exit");
  } finally {
    await reopened.close();
  }
  assert.equal(registry.read(hash).state, "disconnected");
});

test("receipt-only open omits currentPlan and skips business recovery", async () => {
  const runtimeRoot = fixture("receipt-only-runtime");
  const projectRoot = fixture("receipt-only-project");
  const agentSessionId = "agent-receipt-only";
  initProject({ cwd: projectRoot, projectName: "Receipt Only", planning: false });
  const seeded = await openSession(runtimeRoot, projectRoot, agentSessionId, { host: "opencode", clientKind: "adapter" });
  await command(seeded, "plan.create", {
    taskName: "receipt-only-plan",
    title: "Receipt only plan",
    goalText: "Do not recover on a receipt read",
  });
  await seeded.close();

  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtimeRoot));
  let recoveryCalls = 0;
  const reconcile = executor.service.reconcileCanonicalFocus.bind(executor.service);
  executor.service.reconcileCanonicalFocus = async (context) => {
    recoveryCalls += 1;
    return await reconcile(context);
  };
  const identity = { agentSessionId, workdir: projectRoot, client: { kind: "adapter" as const, host: "opencode" } };

  const receipt = await executor.open(identity, true);
  assert.equal(receipt.currentPlan, undefined);
  assert.equal(recoveryCalls, 0, "receipt-only open must not restore focus");

  const normal = await executor.open(identity);
  assert.equal(normal.currentPlan !== undefined, true);
  assert.equal(recoveryCalls, 1);
});

test("new sessions cannot restore or release an expired session; only its own reopen restores focus", async () => {
  const runtimeRoot = fixture("expiry-runtime");
  const projectRoot = fixture("expiry-project");
  initProject({ cwd: projectRoot, projectName: "Session Expiry", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const expired = await registry.open("expired-agent", projectRoot, { kind: "node" });
  const service = new ClawCommandService(registry);
  await service.execute({
    cwd: expired.identity.canonicalWorkdir,
    agentSessionId: expired.identity.agentSessionId,
    sessionKey: sessionFocusKey(expired.identity),
    mode: "session",
  }, {
    operation: "plan.create",
    input: { taskName: "expiry-plan", title: "Expiry plan", goalText: "Release ownership" },
  });
  const expiredRecord = registry.read(expired.identity.sessionKeyHash);
  registry.write(expired.identity.sessionKeyHash, {
    ...expiredRecord,
    state: "disconnected",
    expiresAt: "2000-01-01T00:00:00.000Z",
  });

  const recordPath = registry.recordPath(expired.identity.sessionKeyHash);
  const original = fs.readFileSync(recordPath, "utf8");
  const replacement = await openSession(runtimeRoot, projectRoot, "replacement-agent");
  try {
    assert.equal(fs.readFileSync(recordPath, "utf8"), original);
    await assert.rejects(replacement.execute({
      operation: "plan.resume",
      input: { planId: "expiry-plan" },
    }), { code: "PLAN_FOCUS_CONFLICT" });
    assert.equal(fs.readFileSync(recordPath, "utf8"), original);
  } finally { await replacement.close(); }

  const owner = await openSession(runtimeRoot, projectRoot, "expired-agent");
  try {
    const restored = registry.read(expired.identity.sessionKeyHash);
    assert.equal(restored.state, "live");
    assert.deepEqual(restored.currentPlan, expiredRecord.currentPlan);
    assert.ok(Date.parse(restored.expiresAt) > Date.now());
    const plan = await command(owner, "plan.show", { simple: true });
    assert.equal((plan.output as { goal?: { text?: string } }).goal?.text, "Release ownership");
  } finally { await owner.close(); }
});

test("open exceeding the queue wait reports the queue owner failure below the adapter budget", async () => {
  const runtimeRoot = fixture("queue-timeout-runtime");
  const projectRoot = fixture("queue-timeout-project");
  const agentSessionId = "agent-queue-timeout";
  initProject({ cwd: projectRoot, projectName: "Queue Timeout", planning: false });
  const registry = new SessionRegistryV2(runtimeRoot);
  const hash = createSessionIdentity(agentSessionId, projectRoot).sessionKeyHash;
  const queuePath = path.join(registry.sessionDirectory(hash), "execution.queue.json");
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  let release!: () => void;
  let entered!: () => void;
  const acquired = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held = registry.withExecution(hash, async () => { entered(); await gate; });
  await acquired;
  const startedAt = Date.now();
  try {
    await assert.rejects(
      openSession(runtimeRoot, projectRoot, agentSessionId, { host: "dsh", clientKind: "adapter" }),
      (error: unknown) => {
        const failure = error as { code?: string; details?: { targetPath?: string; timeoutMs?: number; reason?: string } };
        return failure.code === "PLAN_WRITE_CONFLICT"
          && failure.details?.reason === "busy"
          && failure.details?.targetPath === queuePath
          && failure.details?.timeoutMs === SESSION_OPEN_QUEUE_TIMEOUT_MS;
      },
    );
    assert.ok(Date.now() - startedAt >= SESSION_OPEN_QUEUE_TIMEOUT_MS - 250,
      "the queue wait must be bounded by the owner timeout, not by an outer adapter budget");
    assert.equal(fs.existsSync(path.join(registry.sessionDirectory(hash), "session.json")), false,
      "a failed queue acquisition must not write a session record");
  } finally {
    release();
    await held;
  }
});
