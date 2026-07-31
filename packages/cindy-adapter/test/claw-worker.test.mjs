import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

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

test("Cindy tool dispatch preserves Node broker failures with an exact reason", () => {
  const source = fs.readFileSync(mainPath, "utf8");
  assert.match(source, /errorCode: `NODE_\$\{brokerCode\}`/);
  assert.match(source, /reason: `Node request "\$\{method\}" failed \(\$\{brokerCode\}\): \$\{brokerReason\}`/);
  assert.match(source, /data: response\?\.data/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /CLAW_TOOL_DISPATCH_FAILED/);
});

test("Cindy writer gateway uses exclusive claim and tokenized done without knowledge binding", () => {
  const source = fs.readFileSync(workerPath, "utf8");
  const waitIndex = source.indexOf("['knowledge', 'wait'");
  const claimIndex = source.indexOf("['knowledge', 'claim'");
  const doneIndex = source.indexOf("'knowledge', 'done'");

  assert.equal(waitIndex, -1);
  assert.ok(claimIndex >= 0);
  assert.ok(doneIndex >= 0);
  assert.match(source, /claimToken: claimed\.output\.claimToken/);
  assert.match(source, /'--claim-token', job\.claimToken/);
  assert.doesNotMatch(source, /internal-knowledge-(claim|complete|fail)/);
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
    fs.rmSync(fixtureDir, { recursive: true, force: true });
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

test("worker wraps the user-installed claw launcher with Cindy host and session identity on Windows", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-worker-"));
  const launcherPath = path.join(fixtureDir, "claw.cmd");
  fs.writeFileSync(
    launcherPath,
    '@echo off\r\necho {"planStatus":"process.active","planSummary":"1/3 Gateway Plan","sessionId":"%CLAW_SESSION_ID%","args":"%*","hostActions":[{"tool":"update_goal"}],"goalMode":{"recommendedObjective":"internal"},"goalTool":{"tool":"create_goal"},"commandHints":["claw task done --id 1","claw plan sync"],"nextsteps":["Run claw plan sync"],"notes":"internal host state","nextTask":{"id":1,"title":"Implement gateway","status":"pending"},"planView":{"title":"Gateway Plan","counts":{"completed":1,"total":3},"tasks":{"items":[{"id":2,"title":"Review gateway","status":"pending"},{"id":1,"title":"Implement gateway","status":"done"}]}}}\r\n',
  );

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
    assert.match(response.result.result.args, /plan start/);
    assert.match(response.result.result.args, /--requirements verify-card/);
    assert.match(response.result.result.args, /--acceptance shows-progress/);
    assert.match(response.result.result.args, /--add-task review-card/);
    assert.match(response.result.result.args, /--host cindy/);
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
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("worker preserves a structured CLI failure code and reason", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-worker-error-"));
  fs.writeFileSync(
    path.join(fixtureDir, "claw.cmd"),
    '@echo off\r\n>&2 echo {"error":{"code":"PROJECT_CONFIG_INVALID","message":"No plan is bound to the current session."}}\r\nexit /b 1\r\n',
  );
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
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("worker distinguishes invalid CLI JSON from an operation failure", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-worker-json-"));
  fs.writeFileSync(path.join(fixtureDir, "claw.cmd"), "@echo off\r\necho not-json\r\n");
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
    assert.match(response.result.reason, /^claw CLI returned invalid JSON:/);
  } finally {
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true });
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
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
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
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
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
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true });
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
        workdir: fixtureDir,
      },
    });
    assert.equal(response.result.ok, true);
    assert.equal(response.result.captured, true);
    assert.equal(response.result.finalizeId, "finalize-1");
    assert.equal(response.result.sessionId, "cindy-report-session");
    assert.match(response.result.args, /internal-knowledge-capture/);
    assert.match(response.result.args, /--host cindy/);
  } finally {
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
