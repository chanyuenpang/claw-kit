import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Readable } from "node:stream";
import { ClawSession, resolveDirectClawInvocation } from "../lib/claw-session.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeMockSubprocess() {
  const spawnCalls = [];
  const handles = [];
  const subprocess = {
    spawn(spec) {
      spawnCalls.push(spec);
      const stdin = {
        writes: [],
        write(line) {
          this.writes.push(line);
          return true;
        },
      };
      const stdout = new Readable({ read() {} });
      const handle = {
        stdin,
        stdout,
        done: new Promise(() => {}),
        collected: {},
        terminate: async () => {},
      };
      handles.push(handle);
      return handle;
    },
  };
  return { subprocess, spawnCalls, handles };
}

function pushLine(handle, value) {
  handle.stdout.push(`${JSON.stringify(value)}\n`);
}

test("session.open spawns `claw session open <workdir> <id> --host dsh`", async () => {
  const mock = makeMockSubprocess();
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  const spec = mock.spawnCalls[0];
  assert.ok(spec, "spawn must be called");
  const index = spec.argv.indexOf("session");
  assert.ok(index >= 0, "argv must contain the session subcommand");
  assert.deepEqual(
    spec.argv.slice(index, index + 6),
    ["session", "open", "C:/work", "sess-1", "--host", "dsh"],
  );
  assert.equal(spec.env.CLAW_SESSION_ID, "sess-1");
  assert.equal(spec.stdio.stdin, "pipe");
  assert.equal(spec.stdio.stdout, "pipe");
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;
});

test("request writes {operation, input} JSON and resolves the protocol response", async () => {
  const mock = makeMockSubprocess();
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;

  const pending = session.request("plan.create", { title: "T", scope: "session" });
  await delay(10);
  const written = JSON.parse(mock.handles[0].stdin.writes[0]);
  assert.deepEqual(written, { operation: "plan.create", input: { title: "T", scope: "session" } });

  pushLine(mock.handles[0], {
    ok: true,
    command: "plan.create",
    output: { planStatus: "process.discussing" },
    hostActions: [{ schemaVersion: 1, id: "x:create_goal", tool: "create_goal", input: { objective: "O" } }],
  });
  const response = await pending;
  assert.equal(response.ok, true);
  assert.equal(response.command, "plan.create");
  assert.equal(response.output.planStatus, "process.discussing");
  assert.equal(response.hostActions.length, 1);
});

test("requests are strictly serialized through the chain", async () => {
  const mock = makeMockSubprocess();
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;

  const first = session.request("plan.show", { simple: true });
  const second = session.request("task.done", { tasks: [{ id: 1 }] });
  await delay(10);
  // Only the first request may be in flight before any response arrives.
  assert.equal(mock.handles[0].stdin.writes.length, 1);
  assert.deepEqual(JSON.parse(mock.handles[0].stdin.writes[0]), { operation: "plan.show", input: { simple: true } });

  pushLine(mock.handles[0], { ok: true, command: "plan.show" });
  await first;
  await delay(10);
  assert.equal(mock.handles[0].stdin.writes.length, 2);
  assert.deepEqual(JSON.parse(mock.handles[0].stdin.writes[1]), { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  pushLine(mock.handles[0], { ok: true, command: "task.done" });
  const result = await second;
  assert.equal(result.command, "task.done");
});

test("open() rejects with CLAW_SESSION_OPEN_TIMEOUT when the handshake never completes", async () => {
  const subprocess = {
    spawn() {
      const stdout = new Readable({ read() {} });
      return {
        stdin: { write() { return true; } },
        stdout,
        done: new Promise(() => {}),
        collected: {},
        terminate: async () => {},
      };
    },
  };
  const session = new ClawSession(subprocess, "C:/work", "sess-1", "claw", 50);
  await assert.rejects(
    () => session.open(),
    (error) => error.code === "CLAW_SESSION_OPEN_TIMEOUT",
  );
});

test("open() rejects when the child dies before the handshake completes", async () => {
  const subprocess = {
    spawn() {
      const stdout = new Readable({ read() {} });
      return {
        stdin: { write() { return true; } },
        stdout,
        done: Promise.reject(new Error("child killed")),
        collected: {},
        terminate: async () => {},
      };
    },
  };
  const session = new ClawSession(subprocess, "C:/work", "sess-1");
  await assert.rejects(
    () => session.open(),
    (error) => /child killed/.test(error.message),
  );
});

test("open() immediately surfaces structured CLI stderr on a resolved nonzero exit", async () => {
  let finish;
  const subprocess = {
    spawn() {
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const done = new Promise((resolve) => { finish = resolve; });
      queueMicrotask(() => {
        stderr.push(JSON.stringify({ error: { code: "UNEXPECTED_ERROR", message: 'Task "missing" does not exist.' } }));
        finish({ code: 1 });
      });
      return {
        stdin: { write() { return true; } },
        stdout,
        stderr,
        done,
        terminate: async () => {},
      };
    },
  };
  const session = new ClawSession(subprocess, "C:/work", "sess-1", "claw", 1000);
  await assert.rejects(
    () => session.open(),
    (error) => error.code === "CLAW_SESSION_OPEN_FAILED"
      && /UNEXPECTED_ERROR/.test(error.message)
      && /Task "missing" does not exist/.test(error.message),
  );
});

test("open() reports collected startup stderr instead of a timeout", async () => {
  const subprocess = {
    spawn() {
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      queueMicrotask(() => stderr.push("invalid session binding"));
      return {
        stdin: { write() { return true; } },
        stdout,
        stderr,
        done: new Promise(() => {}),
        terminate: async () => {},
      };
    },
  };
  const session = new ClawSession(subprocess, "C:/work", "sess-1", "claw", 50);
  await assert.rejects(
    () => session.open(),
    (error) => error.code === "CLAW_SESSION_OPEN_FAILED"
      && /invalid session binding/.test(error.message),
  );
});

test("resolveDirectClawInvocation finds the adjacent npm layout and returns null otherwise", () => {
  const exists = (candidate) =>
    candidate.toLowerCase().includes("nvm4w")
    && (candidate.endsWith("claw.cmd") || candidate.endsWith("bin.js"));
  const resolved = resolveDirectClawInvocation({
    clawBinary: "claw",
    pathValue: "C:\\other\\bin;C:\\nvm4w\\nodejs",
    nodeExecutable: "C:\\node\\node.exe",
    exists,
  });
  assert.deepEqual(resolved, {
    executable: "C:\\node\\node.exe",
    script: path.join("C:\\nvm4w\\nodejs", "node_modules", "@veewo", "claw", "dist", "bin.js"),
  });

  const missing = resolveDirectClawInvocation({
    clawBinary: "claw",
    pathValue: "C:\\empty",
    nodeExecutable: "node.exe",
    exists: () => false,
  });
  assert.equal(missing, null);

  const noPath = resolveDirectClawInvocation({
    clawBinary: "claw",
    pathValue: undefined,
    nodeExecutable: "node.exe",
    exists: () => true,
  });
  assert.equal(noPath, null);
});

test("non-protocol diagnostics on stdout are ignored", async () => {
  const mock = makeMockSubprocess();
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  mock.handles[0].stdout.push("some daemon log line\n");
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;

  const pending = session.request("plan.show", {});
  await delay(10);
  mock.handles[0].stdout.push("unrelated\n");
  pushLine(mock.handles[0], { ok: true, command: "plan.show" });
  const response = await pending;
  assert.equal(response.command, "plan.show");
});
