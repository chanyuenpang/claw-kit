import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSubplan,
  editPlan,
  initProject,
  showPlan,
  writePlan,
} from "@veewo/claw-core";
import {
  ClawClient,
  ClawSessionError,
} from "@veewo/claw-client";
import { startSessionDaemon } from "../dist/session-daemon.js";
import {
  SessionRegistryV2,
  sessionFocusKey,
} from "../dist/session-registry-v2.js";
import { ClawCommandService } from "../dist/command-service.js";

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-daemon-${name}-`));
}

test("daemon and lightweight client share authenticated persistent session commands", async () => {
  const runtimeRoot = fixture("shared-runtime");
  const projectRoot = fixture("shared-project");
  initProject({ cwd: projectRoot, projectName: "Daemon Shared", planning: false });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const client = new ClawClient({ runtimeRoot });
  const opened = await client.open("agent-daemon", projectRoot);

  const created = await opened.commandEnvelope({
    operation: "plan.create",
    input: {
      taskName: "daemon-plan",
      title: "Daemon plan",
      goalText: "Run through JSONL",
    },
  });
  assert.equal(created.schemaVersion, 1);
  const simple = await opened.command({
    operation: "plan.show",
    input: { simple: true },
  });
  assert.deepEqual(simple, {
    status: "process.active",
    goal: { text: "Run through JSONL" },
    tasks: [{ title: "Run through JSONL" }],
    rules: [],
  });
  const status = await opened.status() as {
    session: { state: string; currentPlan?: { taskName: string } };
    daemon: { protocolVersion: number };
  };
  assert.equal(status.session.state, "live");
  assert.equal(status.session.currentPlan?.taskName, "daemon-plan");
  assert.equal(status.daemon.protocolVersion, 1);
  assert.equal("token" in status.daemon, false);

  await opened.close();
  await daemon.close();
});

test("session open reconciles a root plan written before the focus journal was prepared", async () => {
  const runtimeRoot = fixture("pre-journal-root-runtime");
  const projectRoot = fixture("pre-journal-root-project");
  const agentSessionId = "pre-journal-root-agent";
  initProject({ cwd: projectRoot, projectName: "Pre-journal Root", planning: false });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const client = new ClawClient({ runtimeRoot, host: "codex", clientKind: "adapter" });
  const initial = await client.open(agentSessionId, projectRoot);
  await initial.close();

  await writePlan({
    cwd: projectRoot,
    taskName: "pre-journal-root-plan",
    title: "Pre-journal root plan",
    goalText: "Recover canonical focus",
    ownerSessionKey: agentSessionId,
    host: "codex",
  });

  const reopened = await client.open(agentSessionId, projectRoot);
  try {
    const openResult = reopened.openResult as { currentPlan?: unknown; session?: { currentPlan?: unknown } };
    assert.ok(openResult.currentPlan);
    assert.ok(openResult.session?.currentPlan);
    const shown = await reopened.command({ operation: "plan.show", input: {} }) as { taskName?: string };
    assert.equal(shown.taskName, "pre-journal-root-plan");
  } finally {
    await reopened.close();
    await daemon.close();
  }
});

test("session open completes parent linkage for a subplan written before the focus journal", async () => {
  const runtimeRoot = fixture("pre-journal-subplan-runtime");
  const projectRoot = fixture("pre-journal-subplan-project");
  const agentSessionId = "pre-journal-subplan-agent";
  initProject({ cwd: projectRoot, projectName: "Pre-journal Subplan", planning: false });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const client = new ClawClient({ runtimeRoot, host: "codex", clientKind: "adapter" });
  const opened = await client.open(agentSessionId, projectRoot);
  const created = await opened.command({
    operation: "plan.create",
    input: {
      taskName: "pre-journal-subplan-plan",
      title: "Pre-journal subplan plan",
      goalText: "Recover child focus and parent linkage",
    },
  }) as { taskName: string; planFile: string };
  await opened.close();

  const child = await createSubplan({
    cwd: projectRoot,
    parentTaskName: created.taskName,
    parentTaskId: 1,
    ownerSessionKey: agentSessionId,
    host: "codex",
    deferParentMutation: true,
  });

  const reopened = await client.open(agentSessionId, projectRoot);
  try {
    const shown = await reopened.command({ operation: "plan.show", input: {} }) as { planFile?: string };
    assert.equal(shown.planFile, child.planFile);
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
    await daemon.close();
  }
});

test("session open releases retained focus after a terminal write completed before its focus journal", async () => {
  const runtimeRoot = fixture("pre-journal-end-runtime");
  const projectRoot = fixture("pre-journal-end-project");
  const agentSessionId = "pre-journal-end-agent";
  initProject({ cwd: projectRoot, projectName: "Pre-journal End", planning: false });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const client = new ClawClient({ runtimeRoot, host: "codex", clientKind: "adapter" });
  const opened = await client.open(agentSessionId, projectRoot);
  const created = await opened.command({
    operation: "plan.create",
    input: {
      taskName: "pre-journal-end-plan",
      title: "Pre-journal end plan",
      goalText: "Release stale retained focus",
    },
  }) as { taskName: string; planFile: string };
  await opened.command({ operation: "task.done", input: { tasks: [{ id: 1 }] } });
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

  const reopened = await client.open(agentSessionId, projectRoot);
  try {
    const openResult = reopened.openResult as { currentPlan?: unknown; session?: { currentPlan?: unknown } };
    assert.equal(openResult.currentPlan, undefined);
    assert.equal(openResult.session?.currentPlan, undefined);
    await assert.rejects(
      () => reopened.command({ operation: "plan.show", input: {} }),
      (error: unknown) => error instanceof ClawSessionError && error.code === "CURRENT_PLAN_REQUIRED",
    );
  } finally {
    await reopened.close();
    await daemon.close();
  }
});

test("persistent session starts a planning plan through the typed protocol", async () => {
  const runtimeRoot = fixture("plan-start-runtime");
  const projectRoot = fixture("plan-start-project");
  const agentSessionId = `agent-plan-start-${path.basename(runtimeRoot)}`;
  initProject({ cwd: projectRoot, projectName: "Daemon Plan Start", planning: true });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const opened = await new ClawClient({ runtimeRoot, host: "cindy", clientKind: "adapter" })
    .open(agentSessionId, projectRoot);

  try {
    await opened.command({
      operation: "plan.create",
      input: {
        taskName: "plan-start",
        title: "Plan start",
        goalText: "Start through JSONL",
        scope: "session",
      },
    });
    const started = await opened.commandEnvelope({
      operation: "plan.start",
      input: {
        updates: {
          requirementsSummary: "Keep the session resident.",
          acceptanceCriteria: ["The typed start succeeds."],
        },
        appendTasks: [{ title: "Implement resident transport", detail: "Use one session connection." }],
      },
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
      ["Complete planning with claw-kit:planning", "done"],
      ["Implement resident transport", "pending"],
    ]);
  } finally {
    await opened.close();
    await daemon.close();
  }
});

test("session-scoped daemon completion omits knowledge dispatch and finalization jobs", async () => {
  const runtimeRoot = fixture("session-scope-closeout-runtime");
  const projectRoot = fixture("session-scope-closeout-project");
  const agentSessionId = `session-scope-closeout-${path.basename(runtimeRoot)}`;
  initProject({ cwd: projectRoot, projectName: "Session Scope Closeout", planning: false });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const opened = await new ClawClient({ runtimeRoot, host: "cindy", clientKind: "adapter" })
    .open(agentSessionId, projectRoot);

  try {
    const created = await opened.commandEnvelope({
      operation: "plan.create",
      input: {
        taskName: "session-scope-closeout-plan",
        title: "Session scope closeout",
        goalText: "Complete without project knowledge deposition",
        scope: "session",
      },
    });
    const planPath = String((created.output as { planPath?: string }).planPath);
    await opened.command({ operation: "task.done", input: { tasks: [{ id: 1 }] } });
    const done = await opened.commandEnvelope({
      operation: "plan.done",
      input: { retrospectiveSummary: "Session workflow complete" },
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
    await daemon.close();
  }
});

test("daemon preserves post-commit host actions in the typed command envelope", async () => {
  const runtimeRoot = fixture("host-actions-runtime");
  const projectRoot = fixture("host-actions-project");
  initProject({ cwd: projectRoot, projectName: "Daemon Host Actions", planning: false });
  const projectConfigPath = path.join(projectRoot, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf8")) as {
    knowledgeWriter: { executionPolicy: string };
  };
  projectConfig.knowledgeWriter.executionPolicy = "subagent";
  fs.writeFileSync(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf8");
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const opened = await new ClawClient({ runtimeRoot, host: "codex", clientKind: "adapter" })
    .open("agent-host-actions", projectRoot);

  try {
    await opened.command({
      operation: "plan.create",
      input: {
        taskName: "host-actions-plan",
        title: "Host actions plan",
        goalText: "Preserve effects",
      },
    });
    await opened.command({
      operation: "task.done",
      input: { tasks: [{ id: 1 }] },
    });
    const done = await opened.commandEnvelope({
      operation: "plan.done",
      input: { retrospectiveSummary: "Complete" },
    });

    assert.equal(done.schemaVersion, 1);
    const hostActions = done.hostActions as Array<{
      schemaVersion?: number;
      id?: string;
      tool?: string;
      input?: unknown;
    }> | undefined;
    assert.equal(hostActions?.length, 2);
    assert.equal(hostActions?.[0]?.schemaVersion, 1);
    assert.match(String(hostActions?.[0]?.id), /^[a-f0-9-]+:clear_progress$/);
    assert.equal(hostActions?.[0]?.tool, "update_plan");
    assert.deepEqual(hostActions?.[0]?.input, { explanation: "The plan is completed and ready for closeout.", plan: [] });
    assert.match(String(hostActions?.[1]?.id), /^[a-f0-9-]+:update_goal$/);
    assert.equal(hostActions?.[1]?.tool, "update_goal");
    assert.deepEqual(hostActions?.[1]?.input, { status: "complete" });
    assert.deepEqual(done.postCommitEffects, [{
      type: "completion.refresh",
      taskName: "host-actions-plan",
      planStatus: "end.completed",
    }]);
    assert.equal((done.knowledgeDispatch as { policy?: string } | undefined)?.policy, "subagent");
    assert.match(
      String((done.knowledgeDispatch as { finalizeId?: string } | undefined)?.finalizeId),
      /^[a-f0-9]{64}$/,
    );
  } finally {
    await opened.close();
    await daemon.close();
  }
});

test("Cindy daemon sessions coerce background config to the templated no-Stop knowledge dispatch", async () => {
  const runtimeRoot = fixture("cindy-atomic-dispatch-runtime");
  const projectRoot = fixture("cindy-atomic-dispatch-project");
  initProject({ cwd: projectRoot, projectName: "Cindy Atomic Dispatch", planning: false });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const opened = await new ClawClient({ runtimeRoot, host: "cindy", clientKind: "adapter" })
    .open("cindy-atomic-dispatch", projectRoot);

  try {
    await opened.command({
      operation: "plan.create",
      input: {
        taskName: "cindy-atomic-plan",
        title: "Cindy atomic plan",
        goalText: "Dispatch without a Stop hook",
      },
    });
    await opened.command({ operation: "task.done", input: { tasks: [{ id: 1 }] } });
    const done = await opened.commandEnvelope({
      operation: "plan.done",
      input: { retrospectiveSummary: "Complete" },
    });
    const dispatch = done.knowledgeDispatch as { policy?: string; prompt?: string } | undefined;
    assert.equal(dispatch?.policy, "subagent");
    assert.match(String(dispatch?.prompt), /resources[\\/]cindy-delegate-writer[\\/]TEMPLATE\.json/);
    assert.match(String(dispatch?.prompt), /session plan/i);
    assert.match(String(dispatch?.prompt), /assignment subplan/i);
    assert.match(String(dispatch?.prompt), /claw-kit.*Ghost/is);
    assert.doesNotMatch(String(dispatch?.prompt), /did-turn-end|Stop hook|knowledge wait/i);
  } finally {
    await opened.close();
    await daemon.close();
  }
});

test("DSH daemon sessions coerce a fresh project's default background config to native subagent dispatch", async () => {
  const runtimeRoot = fixture("dsh-default-dispatch-runtime");
  const projectRoot = fixture("dsh-default-dispatch-project");
  initProject({ cwd: projectRoot, projectName: "DSH Default Dispatch", planning: false });
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".claw", "project.json"), "utf8"),
  ) as { knowledgeWriter?: { executionPolicy?: string } };
  assert.equal(projectConfig.knowledgeWriter?.executionPolicy, "background");
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const opened = await new ClawClient({ runtimeRoot, host: "dsh", clientKind: "adapter" })
    .open("dsh-default-dispatch", projectRoot);

  try {
    await opened.command({
      operation: "plan.create",
      input: {
        taskName: "dsh-default-plan",
        title: "DSH default plan",
        goalText: "Dispatch with the default project configuration",
      },
    });
    await opened.command({ operation: "task.done", input: { tasks: [{ id: 1 }] } });
    const done = await opened.commandEnvelope({
      operation: "plan.done",
      input: { retrospectiveSummary: "Complete" },
    });
    const dispatch = done.knowledgeDispatch as { policy?: string; finalizeId?: string; prompt?: string } | undefined;
    assert.equal(dispatch?.policy, "subagent");
    assert.match(String(dispatch?.finalizeId), /^[a-f0-9]{64}$/);
    assert.match(String(dispatch?.prompt), /resources[\\/]delegate-writer[\\/]TEMPLATE\.json/);
  } finally {
    await opened.close();
    await daemon.close();
  }
});

test("Codex adapter sessions receive native plan and Goal actions without daemon loss", async () => {
  const runtimeRoot = fixture("codex-actions-runtime");
  const projectRoot = fixture("codex-actions-project");
  initProject({ cwd: projectRoot, projectName: "Daemon Codex Actions", planning: true });
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const opened = await new ClawClient({ runtimeRoot, host: "codex", clientKind: "adapter" })
    .open("agent-codex-actions", projectRoot);
  try {
    await opened.commandEnvelope({
      operation: "plan.create",
      input: {
        taskName: "codex-actions-plan",
        title: "Codex actions plan",
        goalText: "Project native host actions",
      },
    });
    await opened.command({
      operation: "task.add",
      input: {
        tasks: [
          { title: "Second task" },
          { title: "Third task" },
        ],
      },
    });
    const activated = await opened.commandEnvelope({
      operation: "plan.edit",
      input: {
        operations: [{ type: "plan.status", status: "process.active" }],
      },
    });
    assert.deepEqual(
      activated.hostActions?.map((action) => (action as { tool?: string }).tool),
      ["update_plan", "create_goal"],
    );
  } finally {
    await opened.close();
    await daemon.close();
  }
});

test("daemon rejects a second live client and reopens retained state after restart", async () => {
  const runtimeRoot = fixture("restart-runtime");
  const projectRoot = fixture("restart-project");
  initProject({ cwd: projectRoot, projectName: "Daemon Restart", planning: false });
  const firstDaemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const firstClient = new ClawClient({ runtimeRoot });
  const first = await firstClient.open("agent-restart", projectRoot);
  await first.command({
    operation: "plan.create",
    input: {
      taskName: "restart-plan",
      title: "Restart plan",
      goalText: "Survive daemon restart",
    },
  });

  const competingClient = new ClawClient({ runtimeRoot });
  await assert.rejects(
    () => competingClient.open("agent-restart", projectRoot),
    (error: unknown) => error instanceof ClawSessionError && error.code === "SESSION_BUSY",
  );

  await firstDaemon.close();
  await assert.rejects(
    () => first.command({ operation: "plan.show", input: { simple: true } }),
    (error: unknown) => error instanceof ClawSessionError
      && error.code === "SESSION_CONNECTION_LOST"
      && error.outcome === "unknown"
      && error.recoveryCommand === `claw session open "${path.resolve(projectRoot)}" "agent-restart"`,
  );

  const secondDaemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const reopened = await new ClawClient({ runtimeRoot }).open("agent-restart", projectRoot);
  const simple = await reopened.command({
    operation: "plan.show",
    input: { simple: true },
  }) as { goal: { text: string } };
  assert.equal(simple.goal.text, "Survive daemon restart");

  await reopened.close();
  await secondDaemon.close();
});

test("daemon expiry maintenance releases retained plan ownership before deleting session state", async () => {
  const runtimeRoot = fixture("expiry-runtime");
  const projectRoot = fixture("expiry-project");
  initProject({ cwd: projectRoot, projectName: "Daemon Expiry", planning: false });
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

  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const replacement = await new ClawClient({ runtimeRoot }).open("replacement-agent", projectRoot);
  await replacement.command({
    operation: "plan.resume",
    input: { planId: "expiry-plan" },
  });
  assert.equal(fs.existsSync(registry.sessionDirectory(expired.identity.sessionKeyHash)), false);

  await replacement.close();
  await daemon.close();
});
