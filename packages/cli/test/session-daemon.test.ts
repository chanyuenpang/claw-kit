import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject } from "@veewo/claw-core";
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
  assert.equal(done.hostActions, undefined);
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

  await opened.close();
  await daemon.close();
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
