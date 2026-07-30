import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(testDir, "../plugin/node/claw-worker.cjs");

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

test("session-start treats an empty successful hook response as no injected context", { skip: process.platform !== "win32" }, async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-empty-start-"));
  fs.writeFileSync(
    path.join(fixtureDir, "claw.cmd"),
    '@echo off\r\nif "%1"=="hook" exit /b 0\r\necho {}\r\n',
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
      params: { sessionId: "cindy-empty", workdir: fixtureDir },
    });
    assert.deepEqual(response.result, {});
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
  fs.writeFileSync(
    path.join(fixtureDir, "claw.cmd"),
    '@echo off\r\necho {"ok":true,"captured":true,"finalizeId":"finalize-1","jobPath":"C:\\\\jobs\\\\finalize-1.json","sessionId":"%CLAW_SESSION_ID%","args":"%*"}\r\n',
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
      method: "claw/capture-report",
      params: {
        sessionId: "cindy-report-session",
        workdir: fixtureDir,
        turnId: "cindy-hook-12",
        message: "Completed the requested change.",
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
