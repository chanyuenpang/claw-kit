import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const workerPath = path.resolve(testDir, "../plugin/node/claw-worker.cjs");
const mainPath = path.resolve(testDir, "../plugin/main.js");
const sqliteReaderPath = path.resolve(testDir, "../plugin/node/cindy-sqlite-reader.cjs");

test("Cindy Hook owns Goal continuation without claiming a native Host Goal API", () => {
  const source = fs.readFileSync(mainPath, "utf8");
  assert.match(source, /const goalSessions = new Map\(\)/);
  assert.match(source, /projection\.goal === 'resume'/);
  assert.match(source, /projection\.goal === 'pause' \|\| projection\.goal === 'complete' \|\| projection\.goal === 'stop'/);
  assert.match(source, /kind: 'claw-goal-continuation'/);
  assert.match(source, /claw-continue-goal/);
  assert.match(source, /userActionToken/);
  assert.match(source, /claw-goal-click-continuation/);
  assert.match(source, /mode: 'continue'/);
  assert.match(source, /msg\.name === 'did-turn-end'/);
  assert.match(source, /operation: 'plan.wait'/);
  assert.match(source, /taskId/);
  assert.match(source, /retryCount >= 2/);
  assert.match(source, /await continueGoalAfterTurnEnd\(msg\)/);
  assert.doesNotMatch(source, /await continueGoalAfterAssistant\(msg\)/);
  assert.match(source, /cindyAuthorizationCardIssued = new Set\(\)/);
  assert.doesNotMatch(source, /cindyAuthorizationCardIssued\.delete\(sessionId\)/);
});

test("Cindy session focus reconciliation preheats transport and recovers writer jobs", () => {
  const mainSource = fs.readFileSync(mainPath, "utf8");
  const workerSource = fs.readFileSync(workerPath, "utf8");
  assert.match(mainSource, /msg\.name === 'did-session-switched'/);
  assert.match(mainSource, /reconcilingSessions\.has\(sessionId\)/);
  assert.match(mainSource, /reconcileFocusedSession\(data\.sessionId, workdir\)/);
  assert.match(mainSource, /await captureTurnEndReport\(\{ data: \{ sessionId \} \}\)/);
  assert.match(mainSource, /claw\/resolve-session-context/);
  assert.match(mainSource, /cindySessionId/);
  assert.match(mainSource, /clawSessionId/);
  assert.match(workerSource, /await ensureSession\(params\.sessionId, params\.workdir\)/);
  assert.match(workerSource, /'knowledge', 'list'/);
  assert.match(workerSource, /'--job-host', 'cindy'/);
});

test("Cindy tool dispatch preserves Node broker failures with an exact reason", () => {
  const source = fs.readFileSync(mainPath, "utf8");
  assert.match(source, /errorCode: `NODE_\$\{brokerCode\}`/);
  assert.match(source, /reason: `Node request "\$\{method\}" failed \(\$\{brokerCode\}\): \$\{brokerReason\}`/);
  assert.match(source, /data: response\?\.data/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /CLAW_TOOL_DISPATCH_FAILED/);
});

test("Cindy writer gateway treats the persisted job as its durable supervisor state", () => {
  const source = fs.readFileSync(workerPath, "utf8");
  assert.match(source, /'knowledge', 'wait'/);
  assert.match(source, /'knowledge', 'claim'/);
  assert.match(source, /'internal-knowledge-complete'/);
  assert.match(source, /persisted\.status === 'running'/);
  assert.match(source, /typeof persisted\.claimToken === 'string'/);
  assert.doesNotMatch(source, /writerJobs/);
});

test("Cindy SQLite reader extracts task conclusions from the current session", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-sqlite-reader-"));
  const dbPath = path.join(fixtureDir, "cindy-reader.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_use_id TEXT,
      created_at INTEGER NOT NULL,
      rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id) VALUES (?)").run("session-1");
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("assistant-1", "session-1", "assistant", JSON.stringify("Finished task one."), 1);
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("tool-1", "session-1", "tool_result", JSON.stringify({ ok: true, command: "task.done" }), 2);
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("user-2", "session-1", "user", JSON.stringify("Continue."), 3);
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("assistant-2", "session-1", "assistant", JSON.stringify("Finished task two."), 4);
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("tool-2", "session-1", "tool_result", JSON.stringify({ ok: true, command: "task.done" }), 5);
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("assistant-final", "session-1", "assistant", JSON.stringify("Final result."), 6);
  db.close();

  const previous = process.env.CINDY_USER_DATA;
  process.env.CINDY_USER_DATA = fixtureDir;
  try {
    const { readTurnCapture } = require(sqliteReaderPath);
    assert.deepEqual(readTurnCapture("session-1"), {
      turnId: "assistant-final",
      message: "Final result.",
      taskConclusions: [{ turnId: "assistant-final", message: "Finished task two." }],
    });
  } finally {
    if (previous === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previous;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

function requestWorker(child, request) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`worker did not reply\nstderr:\n${stderr}`));
    }, 2_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      resolve(JSON.parse(stdout.slice(0, newline)));
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

async function stopWorker(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 1500);
  await closed;
  clearTimeout(timer);
}

function writePersistentClawFixture(fixtureDir, commandHandlerSource) {
  const scriptPath = path.join(fixtureDir, 'fake-claw-session.cjs');
  fs.writeFileSync(scriptPath, `
const readline = require('node:readline');
const args = process.argv.slice(2);
if (args[0] !== 'session' || args[1] !== 'open') process.exit(2);
process.stdout.write(JSON.stringify({ ok: true, command: 'session.open', session: { state: 'live' } }) + '\\n');
const handle = ${commandHandlerSource};
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === 'session close') process.exit(0);
  handle(JSON.parse(line), args);
});
`, 'utf8');
  fs.writeFileSync(
    path.join(fixtureDir, 'claw.cmd'),
    `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
    'utf8',
  );
}

test("Cindy SQLite reader prepares subagent report input as soon as knowledgeDispatch is persisted", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-claim-capture-"));
  const dbPath = path.join(fixtureDir, "cindy-reader.db");
  const finalizeId = "b".repeat(64);
  const emptyFinalizeId = "c".repeat(64);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, sdk_session_id TEXT);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id) VALUES (?, ?)").run("originating-cindy-session", "originating-sdk-session");
  db.prepare("INSERT INTO sessions (id, sdk_session_id) VALUES (?, ?)").run("empty-cindy-session", "empty-sdk-session");
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("assistant-1", "turn-1", "originating-cindy-session", "assistant", JSON.stringify("Implemented the report fix."), 1);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, tool_use_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("task-use", "turn-1", "originating-cindy-session", "tool_use", JSON.stringify({
      toolUseId: "call-task-edit-done",
      toolName: "mcp__cindy__ghost_call",
      input: { ghost_id: "claw-kit", tool: "call_tool", args: { name: "task.edit", args: { id: 2, status: "done", detail: "Implemented the report fix." } } },
    }), "call-task-edit-done", 2);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, tool_use_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("task-result", "turn-1", "originating-cindy-session", "tool_result", JSON.stringify({ ok: true, result: { planStatus: "process.active", completedTaskIds: [2] } }), "call-task-edit-done", 3);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("assistant-2", "turn-1", "originating-cindy-session", "assistant", JSON.stringify("Closed the plan and dispatched the writer."), 4);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("plan-result", "turn-1", "originating-cindy-session", "tool_result", JSON.stringify({ ok: true, result: { knowledgeDispatch: { policy: "subagent", finalizeId } } }), 5);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("empty-assistant", "empty-turn", "empty-cindy-session", "assistant", JSON.stringify("Closed a plan without a task conclusion."), 1);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("empty-plan-result", "empty-turn", "empty-cindy-session", "tool_result", JSON.stringify({ ok: true, result: { knowledgeDispatch: { policy: "subagent", finalizeId: emptyFinalizeId } } }), 2);
  db.close();

  const previous = process.env.CINDY_USER_DATA;
  process.env.CINDY_USER_DATA = fixtureDir;
  try {
    const { readKnowledgeClaimCapture } = require(sqliteReaderPath);
    assert.deepEqual(readKnowledgeClaimCapture("originating-sdk-session", finalizeId), {
      sessionId: "originating-sdk-session",
      turnId: "turn-1",
      taskConclusions: [{ turnId: "turn-1", message: "Implemented the report fix." }],
    });
    assert.deepEqual(readKnowledgeClaimCapture("empty-sdk-session", emptyFinalizeId), {
      sessionId: "empty-sdk-session",
      turnId: "empty-turn",
      taskConclusions: [],
    });
  } finally {
    if (previous === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previous;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("Cindy session context resolves the SDK identity that owns the claw plan", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-session-context-"));
  const projectDir = path.join(fixtureDir, "project");
  const runtimeDir = path.join(projectDir, ".claw", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "session-bindings.json"), JSON.stringify({
    version: 1,
    bindings: { "sdk-session": "tasks/2026-08-01/current-plan/plan.json" },
  }));

  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, sdk_session_id TEXT, agent_kind TEXT,
      workspace_kind TEXT, working_dir TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, agent_meta TEXT, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id, agent_kind, workspace_kind, working_dir) VALUES (?, ?, ?, ?, ?)")
    .run("cindy-session", "sdk-session", "codex", "project", projectDir);
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at, agent_meta) VALUES (?, ?, ?, ?, ?, ?)")
    .run("historical", "cindy-session", "assistant", JSON.stringify("Earlier turn."), 1, JSON.stringify({ sdkSessionId: "old-sdk-session" }));
  db.close();

  const previous = process.env.CINDY_USER_DATA;
  process.env.CINDY_USER_DATA = fixtureDir;
  try {
    const { resolveCindySessionContext } = require(sqliteReaderPath);
    assert.deepEqual(resolveCindySessionContext("cindy-session"), {
      ok: true,
      status: "bound",
      cindySessionId: "cindy-session",
      clawSessionId: "sdk-session",
      workdir: path.resolve(projectDir),
      planPath: "tasks/2026-08-01/current-plan/plan.json",
      agentKind: "codex",
      workspaceKind: "project",
    });
  } finally {
    if (previous === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previous;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("Cindy session context resolves under the Host-sanitized Ghost Node environment", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-sanitized-env-context-"));
  const fakeHome = path.join(fixtureDir, "home");
  const userDataDir = path.join(fakeHome, "AppData", "Roaming", "Cindy");
  const projectDir = path.join(fixtureDir, "project");
  const runtimeDir = path.join(projectDir, ".claw", "runtime");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "session-bindings.json"), JSON.stringify({
    version: 1,
    bindings: { "sanitized-sdk-session": "tasks/2026-08-01/sanitized-plan/plan.json" },
  }));

  const db = new DatabaseSync(path.join(userDataDir, "cindy-sanitized.db"));
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, sdk_session_id TEXT, agent_kind TEXT,
      workspace_kind TEXT, working_dir TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, agent_meta TEXT, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id, agent_kind, workspace_kind, working_dir) VALUES (?, ?, ?, ?, ?)")
    .run("sanitized-cindy-session", "sanitized-sdk-session", "codex", "project", projectDir);
  db.close();

  try {
    const { resolveCindySessionContext } = require(sqliteReaderPath);
    assert.deepEqual(resolveCindySessionContext("sanitized-cindy-session", {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP },
      homeDir: fakeHome,
    }), {
      ok: true,
      status: "bound",
      cindySessionId: "sanitized-cindy-session",
      clawSessionId: "sanitized-sdk-session",
      workdir: path.resolve(projectDir),
      planPath: "tasks/2026-08-01/sanitized-plan/plan.json",
      agentKind: "codex",
      workspaceKind: "project",
    });
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("Cindy session context rejects candidate identities bound to different plans", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-session-conflict-"));
  const projectDir = path.join(fixtureDir, "project");
  const runtimeDir = path.join(projectDir, ".claw", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "session-bindings.json"), JSON.stringify({
    version: 1,
    bindings: {
      "cindy-session": "tasks/2026-08-01/cindy-plan/plan.json",
      "sdk-session": "tasks/2026-08-01/sdk-plan/plan.json",
    },
  }));

  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, sdk_session_id TEXT, agent_kind TEXT,
      workspace_kind TEXT, working_dir TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, agent_meta TEXT, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id, agent_kind, workspace_kind, working_dir) VALUES (?, ?, ?, ?, ?)")
    .run("cindy-session", "sdk-session", "codex", "project", projectDir);
  db.close();

  const previous = process.env.CINDY_USER_DATA;
  process.env.CINDY_USER_DATA = fixtureDir;
  try {
    const { resolveCindySessionContext } = require(sqliteReaderPath);
    assert.deepEqual(resolveCindySessionContext("cindy-session"), {
      ok: false,
      status: "identity-conflict",
      errorCode: "CINDY_SESSION_IDENTITY_CONFLICT",
      reason: "Cindy session identities are bound to different claw plans.",
      cindySessionId: "cindy-session",
      workdir: path.resolve(projectDir),
    });
  } finally {
    if (previous === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previous;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("Cindy session context resolves the terminal knowledge owner after plan unbind", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-terminal-context-"));
  const projectDir = path.join(fixtureDir, "project");
  const runtimeDir = path.join(projectDir, ".claw", "runtime");
  const knowledgeDir = path.join(runtimeDir, "knowledge-sessions");
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "session-bindings.json"), JSON.stringify({ version: 1, bindings: {} }));
  const registryName = `${createHash("sha256").update("sdk-session").digest("hex")}.json`;
  fs.writeFileSync(path.join(knowledgeDir, registryName), JSON.stringify({
    schemaVersion: 1,
    sessionId: "sdk-session",
    pendingTurnOwner: {
      planPath: "tasks/2026-08-01/completed-plan/plan.json",
      reportPath: "tasks/2026-08-01/completed-plan/plan.report",
      finalizeId: "finalize-terminal",
    },
  }));

  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, sdk_session_id TEXT, agent_kind TEXT,
      workspace_kind TEXT, working_dir TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, agent_meta TEXT, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id, agent_kind, workspace_kind, working_dir) VALUES (?, ?, ?, ?, ?)")
    .run("cindy-session", "sdk-session", "codex", "project", projectDir);
  db.close();

  const previous = process.env.CINDY_USER_DATA;
  process.env.CINDY_USER_DATA = fixtureDir;
  try {
    const { resolveCindySessionContext } = require(sqliteReaderPath);
    assert.deepEqual(resolveCindySessionContext("cindy-session"), {
      ok: true,
      status: "bound",
      cindySessionId: "cindy-session",
      clawSessionId: "sdk-session",
      workdir: path.resolve(projectDir),
      planPath: "tasks/2026-08-01/completed-plan/plan.json",
      agentKind: "codex",
      workspaceKind: "project",
    });
  } finally {
    if (previous === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previous;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("Cindy session context resolves a DeepSeek session-scoped terminal knowledge owner", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-session-scope-context-"));
  const projectDir = path.join(fixtureDir, "project");
  const sessionRuntimeDir = path.join(fixtureDir, "session-runtime");
  const cindySessionId = "deepseek-cindy-session";
  const workflowKey = createHash("sha256").update(cindySessionId).digest("hex");
  const workflowDir = path.join(sessionRuntimeDir, workflowKey);
  const knowledgeDir = path.join(workflowDir, "runtime", "knowledge-sessions");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, "session.json"), JSON.stringify({
    version: 1,
    scope: "session",
    originCwd: projectDir,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  fs.writeFileSync(path.join(knowledgeDir, `${workflowKey}.json`), JSON.stringify({
    schemaVersion: 1,
    sessionId: cindySessionId,
    pendingTurnOwner: {
      planPath: "tasks/2026-08-01/deepseek-plan/plan.json",
      reportPath: "tasks/2026-08-01/deepseek-plan/plan.report",
      finalizeId: "finalize-deepseek",
    },
  }));

  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, sdk_session_id TEXT, agent_kind TEXT,
      workspace_kind TEXT, working_dir TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, agent_meta TEXT, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id, agent_kind, workspace_kind, working_dir) VALUES (?, ?, ?, ?, ?)")
    .run(cindySessionId, "deepseek-sdk-session", "codex", "project", projectDir);
  db.close();

  const previousUserData = process.env.CINDY_USER_DATA;
  const previousSessionRuntime = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CINDY_USER_DATA = fixtureDir;
  process.env.CLAW_SESSION_RUNTIME_DIR = sessionRuntimeDir;
  try {
    const { resolveCindySessionContext } = require(sqliteReaderPath);
    assert.deepEqual(resolveCindySessionContext(cindySessionId), {
      ok: true,
      status: "bound",
      cindySessionId,
      clawSessionId: cindySessionId,
      workdir: path.resolve(projectDir),
      planPath: "tasks/2026-08-01/deepseek-plan/plan.json",
      agentKind: "codex",
      workspaceKind: "project",
    });
  } finally {
    if (previousUserData === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previousUserData;
    if (previousSessionRuntime === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = previousSessionRuntime;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("Cindy session context reports an explicit unbound state", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-unbound-context-"));
  const projectDir = path.join(fixtureDir, "project");
  const runtimeDir = path.join(projectDir, ".claw", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "session-bindings.json"), JSON.stringify({ version: 1, bindings: {} }));
  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, sdk_session_id TEXT, agent_kind TEXT,
      workspace_kind TEXT, working_dir TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, agent_meta TEXT, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id, sdk_session_id, agent_kind, workspace_kind, working_dir) VALUES (?, ?, ?, ?, ?)")
    .run("cindy-session", "sdk-session", "codex", "project", projectDir);
  db.close();

  const previous = process.env.CINDY_USER_DATA;
  process.env.CINDY_USER_DATA = fixtureDir;
  try {
    const { resolveCindySessionContext } = require(sqliteReaderPath);
    assert.deepEqual(resolveCindySessionContext("cindy-session"), {
      ok: false,
      status: "unbound",
      errorCode: "CINDY_SESSION_UNBOUND",
      reason: "No claw plan is bound to this Cindy session.",
      cindySessionId: "cindy-session",
      workdir: path.resolve(projectDir),
    });
  } finally {
    if (previous === undefined) delete process.env.CINDY_USER_DATA;
    else process.env.CINDY_USER_DATA = previous;
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("knowledge completion recovers a persisted running Cindy job after worker restart", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-writer-recovery-"));
  const jobPath = path.join(fixtureDir, "knowledge-job.json");
  const finalizeId = "a".repeat(64);
  const templatePath = path.join(fixtureDir, `${finalizeId}.assignments.json`);
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId,
    host: "cindy",
    status: "running",
    claimToken: "persisted-claim",
    projectRoot: fixtureDir,
    planPath: path.join(fixtureDir, "plan.json"),
    reportPath: path.join(fixtureDir, "plan.report"),
    writer: { executionPolicy: "background", externalSkills: [] },
    attempts: 1,
  }), "utf8");
  fs.writeFileSync(templatePath, "{}\n", "utf8");
  const scriptPath = path.join(fixtureDir, "fake-claw-writer.cjs");
  fs.writeFileSync(scriptPath, `
const args = process.argv.slice(2);
if (args[0] === 'knowledge' && args[1] === 'wait') {
  process.stdout.write(JSON.stringify({ ok: true, command: 'knowledge.wait', jobPath: ${JSON.stringify(jobPath)}, status: 'running' }) + '\\n');
  process.exit(0);
}
if (args[0] === 'internal-knowledge-complete') {
  process.stdout.write(JSON.stringify({ ok: true, completed: true, finalizeId: ${JSON.stringify(finalizeId)} }) + '\\n');
  process.exit(0);
}
process.stderr.write('unexpected command: ' + args.join(' '));
process.exit(2);
`, "utf8");
  fs.writeFileSync(
    path.join(fixtureDir, "claw.cmd"),
    `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
    "utf8",
  );
  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: { ...process.env, PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}` },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const registration = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/register-knowledge-writer",
      params: { sessionId: "writer-session", finalizeId, jobPath, workdir: fixtureDir },
    });
    assert.deepEqual(registration.result, {
      ok: true,
      resumed: true,
      status: "running",
      finalizeId,
      claimToken: "persisted-claim",
      templatePath,
      projectRoot: fixtureDir,
      planPath: path.join(fixtureDir, "plan.json"),
      reportPath: path.join(fixtureDir, "plan.report"),
      writer: { executionPolicy: "background", externalSkills: [] },
    });

    const inspection = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "claw/inspect-knowledge-writer",
      params: { sessionId: "writer-session", finalizeId, jobPath, workdir: fixtureDir },
    });
    assert.deepEqual(inspection.result, {
      ok: true,
      finalizeId,
      status: "running",
      attempts: 1,
      executionPolicy: "background",
    });

    const completion = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "claw/execute",
      params: {
        operation: "knowledge.complete",
        args: { finalizeId, result: "Truth and ADR updated." },
        sessionId: "writer-session",
        workdir: fixtureDir,
      },
    });
    assert.equal(completion.result.ok, true);
    assert.equal(completion.result.result.completed, true);
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("worker wraps the user-installed claw launcher with Cindy host and session identity on Windows", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-worker-"));
  writePersistentClawFixture(fixtureDir, `(request, args) => process.stdout.write(JSON.stringify({
    ok: true,
    command: request.operation,
    schemaVersion: 1,
    output: {
      planStatus: 'process.active',
      planSummary: '1/3 Gateway Plan',
      sessionId: args[3],
      request,
      hostActions: [{ tool: 'update_goal' }],
      goalMode: { recommendedObjective: 'internal' },
      goalTool: { tool: 'create_goal' },
      commandHints: ['claw task done --id 1', 'claw plan sync'],
      nextsteps: ['Run claw plan sync'],
      notes: 'internal host state',
      nextTask: { id: 1, title: 'Implement gateway', status: 'pending' },
      planView: { title: 'Gateway Plan', counts: { completed: 1, total: 3 }, tasks: { items: [
        { id: 2, title: 'Review gateway', status: 'pending' },
        { id: 1, title: 'Implement gateway', status: 'done' },
      ] } },
    },
    postCommitEffects: [{ type: 'projection.refresh' }],
  }) + '\\n')`);

  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}`,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/execute",
      params: {
        operation: "plan.start",
        args: {
          requirements: "verify-card",
          acceptance: ["shows-progress"],
          addTasks: [{ title: "review-card", detail: "inspect-projection" }],
        },
        sessionId: "cindy-session",
        workdir: fixtureDir,
      },
    });

    assert.equal(response.result.ok, true);
    assert.equal(response.result.operation, "plan.start");
    assert.equal(response.result.result.sessionId, "cindy-session");
    assert.deepEqual(response.result.result.request, {
      operation: 'plan.start',
      input: {
        updates: { requirementsSummary: 'verify-card', acceptanceCriteria: ['shows-progress'] },
        appendTasks: [{ title: 'review-card', detail: 'inspect-projection' }],
      },
    });
    assert.deepEqual(response.result.postCommitEffects, [{ type: 'projection.refresh' }]);
    assert.equal("hostActions" in response.result.result, false);
    assert.equal("goalMode" in response.result.result, false);
    assert.equal("goalTool" in response.result.result, false);
    assert.equal("commandHints" in response.result.result, false);
    assert.equal("nextsteps" in response.result.result, false);
    assert.equal("notes" in response.result.result, false);
    assert.deepEqual(response.result.result.guidance, {
      nextStep: "Work on the current plan task, then record its completion through claw-kit tools.",
      nextTask: { id: 1, title: "Implement gateway", status: "pending" },
      commandHints: [{
        tool: "call_tool",
        arguments: { name: "task.done", args: { id: 1 } },
        description: "Record completion for the indicated task.",
      }],
    });
    assert.deepEqual(response.result.projection, {
      goal: "resume",
      planStatus: "process.active",
      card: {
        title: "Gateway Plan",
        completedTasks: 1,
        totalTasks: 3,
        tasks: [
          { id: 2, title: "Review gateway", status: "pending" },
          { id: 1, title: "Implement gateway", status: "done" },
        ],
        currentTask: { id: 2, title: "Review gateway", status: "pending" },
        nextTask: { id: 1, title: "Implement gateway", status: "pending" },
      },
    });
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("worker preserves a structured CLI failure code and reason", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-worker-error-"));
  writePersistentClawFixture(fixtureDir, `() => process.stdout.write(JSON.stringify({ ok: false, error: {
    code: 'PROJECT_CONFIG_INVALID', message: 'No plan is bound to the current session.', outcome: 'known'
  } }) + '\\n')`);
  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}`,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/execute",
      params: {
        operation: "plan.show",
        args: {},
        sessionId: "cindy-session",
        workdir: fixtureDir,
      },
    });

    assert.deepEqual(response.result, {
      ok: false,
      operation: "plan.show",
      errorCode: "PROJECT_CONFIG_INVALID",
      reason: "No plan is bound to the current session.",
    });
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("worker distinguishes invalid CLI JSON from an operation failure", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-worker-json-"));
  writePersistentClawFixture(fixtureDir, `() => process.stdout.write('not-json\\n')`);
  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: { ...process.env, PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}` },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/execute",
      params: {
        operation: "plan.show",
        args: {},
        sessionId: "cindy-session",
        workdir: fixtureDir,
      },
    });

    assert.equal(response.result.ok, false);
    assert.equal(response.result.errorCode, "CLAW_CLI_INVALID_JSON");
    assert.match(response.result.reason, /^claw session returned invalid JSON/);
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("worker rejects a missing session workdir before spawning claw", async () => {
  const child = spawn(process.execPath, [workerPath], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/execute",
      params: {
        operation: "plan.show",
        args: {},
        sessionId: "cindy-session",
      },
    });

    assert.deepEqual(response.result, {
      ok: false,
      operation: "plan.show",
      errorCode: "SESSION_WORKDIR_UNAVAILABLE",
      reason: "Cindy did not provide a workdir for this session.",
    });
  } finally {
    await stopWorker(child);
  }
});

test("worker distinguishes a vanished session workdir from a missing CLI", async () => {
  const vanishedWorkdir = path.join(os.tmpdir(), `claw-cindy-vanished-${Date.now()}`);
  const child = spawn(process.execPath, [workerPath], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/execute",
      params: {
        operation: "plan.show",
        args: {},
        sessionId: "cindy-session",
        workdir: vanishedWorkdir,
      },
    });

    assert.deepEqual(response.result, {
      ok: false,
      operation: "plan.show",
      errorCode: "SESSION_WORKDIR_INVALID",
      reason: `Cindy session workdir is not an accessible directory: ${vanishedWorkdir}`,
    });
  } finally {
    await stopWorker(child);
  }
});

test("session-start turns an unavailable CLI into an installation prompt", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-session-start-install-"));
  fs.writeFileSync(
    path.join(fixtureDir, "claw.cmd"),
    '@echo off\r\n>&2 echo claw CLI is unavailable\r\nexit /b 1\r\n',
  );
  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: { ...process.env, PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}` },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/session-start",
      params: { sessionId: "cindy-install", workdir: fixtureDir },
    });
    assert.match(response.result.errorPrompt, /claw CLI.*unavailable/i);
    assert.match(response.result.errorPrompt, /install|update/i);
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("worker captures a final Cindy report through the host-neutral CLI hand-off", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-report-capture-"));
  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL, tool_use_id TEXT, created_at INTEGER NOT NULL,
      rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id) VALUES (?)").run("cindy-report-session");
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("assistant-final", "cindy-report-session", "assistant", JSON.stringify("Completed the requested change."), 1);
  db.close();
  fs.writeFileSync(
    path.join(fixtureDir, "claw.cmd"),
    '@echo off\r\necho {"ok":true,"captured":true,"finalizeId":"finalize-1","jobPath":"C:\\\\jobs\\\\finalize-1.json","sessionId":"%CLAW_SESSION_ID%","args":"%*"}\r\n',
  );
  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: { ...process.env, CINDY_USER_DATA: fixtureDir, PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}` },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const response = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/capture-report",
      params: {
        sessionId: "cindy-report-session",
        clawSessionId: "sdk-report-session",
        workdir: fixtureDir,
      },
    });
    assert.equal(response.result.ok, true);
    assert.equal(response.result.captured, true);
    assert.equal(response.result.finalizeId, "finalize-1");
    assert.equal(response.result.sessionId, "sdk-report-session");
    assert.equal(response.result.cindySessionId, "cindy-report-session");
    assert.equal(response.result.clawSessionId, "sdk-report-session");
    assert.match(response.result.args, /internal-knowledge-capture/);
    assert.match(response.result.args, /--host cindy/);
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("worker exposes atomic Cindy knowledge claim and done operations without did-turn-end", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-atomic-knowledge-"));
  const finalizeId = "c".repeat(64);
  const originatingSessionId = "originating-cindy-session";
  const jobPath = path.join(fixtureDir, "knowledge-job.json");
  const commandLogPath = path.join(fixtureDir, "commands.ndjson");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId,
    sessionId: originatingSessionId,
    projectRoot: fixtureDir,
    taskName: "atomic-task",
    host: "cindy",
    planPath: path.join(fixtureDir, "plan.json"),
    reportPath: path.join(fixtureDir, "plan.report"),
    reportCapture: { mode: "claim", status: "pending" },
    writer: { executionPolicy: "subagent", externalSkills: [] },
    status: "queued",
    attempts: 0,
  }), "utf8");

  const db = new DatabaseSync(path.join(fixtureDir, "cindy-reader.db"));
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, client_id TEXT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tool_use_id TEXT,
      created_at INTEGER NOT NULL, rewind_at INTEGER
    );
  `);
  db.prepare("INSERT INTO sessions (id) VALUES (?)").run(originatingSessionId);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("assistant", "turn-atomic", originatingSessionId, "assistant", JSON.stringify("Implemented the atomic Cindy finalizer."), 1);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("task-result", "turn-atomic", originatingSessionId, "tool_result", JSON.stringify({ ok: true, command: "task.done" }), 2);
  db.prepare("INSERT INTO messages (id, client_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("done-result", "turn-atomic", originatingSessionId, "tool_result", JSON.stringify({ ok: true, result: { knowledgeDispatch: { policy: "subagent", finalizeId } } }), 3);
  db.close();

  const scriptPath = path.join(fixtureDir, "fake-claw-atomic.cjs");
  fs.writeFileSync(scriptPath, `
const fs = require('node:fs');
const args = process.argv.slice(2);
const input = fs.readFileSync(0, 'utf8');
fs.appendFileSync(${JSON.stringify(commandLogPath)}, JSON.stringify({ args, input }) + '\\n');
if (args[0] === 'knowledge' && args[1] === 'wait') {
  process.stdout.write(JSON.stringify({ ok: true, command: 'knowledge.wait', jobPath: ${JSON.stringify(jobPath)}, status: 'queued' }) + '\\n');
  process.exit(0);
}
if (args[0] === 'knowledge' && args[1] === 'claim') {
  process.stdout.write(JSON.stringify({ ok: true, command: 'knowledge.claim', claimed: true, finalizeId: ${JSON.stringify(finalizeId)}, jobPath: ${JSON.stringify(jobPath)}, claimToken: 'claim-atomic', assignments: [{ index: 0, prompt: 'Update Truth.' }] }) + '\\n');
  process.exit(0);
}
if (args[0] === 'knowledge' && args[1] === 'done') {
  process.stdout.write(JSON.stringify({ ok: true, command: 'knowledge.done', finalizeId: ${JSON.stringify(finalizeId)}, status: 'succeeded' }) + '\\n');
  process.exit(0);
}
process.stderr.write('unexpected command: ' + args.join(' '));
process.exit(2);
`, "utf8");
  fs.writeFileSync(path.join(fixtureDir, "claw.cmd"), `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, "utf8");
  const child = spawn(process.execPath, [workerPath], {
    cwd: fixtureDir,
    env: { ...process.env, CINDY_USER_DATA: fixtureDir, PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}` },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const claim = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "claw/execute",
      params: {
        operation: "knowledge.claim",
        args: { finalizeId },
        readOnly: false,
        sessionId: "knowledge-finalizer-worker",
        workdir: fixtureDir,
      },
    });
    assert.equal(claim.result.ok, true);
    assert.equal(claim.result.result.claimed, true);
    assert.equal(claim.result.result.claimToken, "claim-atomic");
    const commandsAfterClaim = fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const claimCommand = commandsAfterClaim.find(({ args }) => args[0] === "knowledge" && args[1] === "claim");
    assert.ok(claimCommand);
    assert.match(claimCommand.args.join(" "), /--cindy-report-stdin/);
    assert.deepEqual(JSON.parse(claimCommand.input), {
      session_id: originatingSessionId,
      turn_id: "turn-atomic",
      task_conclusions: [{ turnId: "turn-atomic", message: "Implemented the atomic Cindy finalizer." }],
    });

    const done = await requestWorker(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "claw/execute",
      params: {
        operation: "knowledge.done",
        args: { finalizeId, claimToken: "claim-atomic", status: "succeeded", result: "Truth updated." },
        readOnly: false,
        sessionId: "knowledge-finalizer-worker",
        workdir: fixtureDir,
      },
    });
    assert.equal(done.result.ok, true);
    assert.equal(done.result.result.status, "succeeded");
    const commandsAfterDone = fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const doneCommand = commandsAfterDone.find(({ args }) => args[0] === "knowledge" && args[1] === "done");
    assert.ok(doneCommand);
    assert.match(doneCommand.args.join(" "), /--claim-token claim-atomic --status succeeded --result Truth updated\./);
  } finally {
    await stopWorker(child);
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
