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

  const shadowed = resolveDirectClawInvocation({
    clawBinary: "claw",
    pathValue: "C:/custom;C:/nvm4w/nodejs",
    nodeExecutable: "node.exe",
    exists: (candidate) => candidate.endsWith("claw.cmd") || candidate.toLowerCase().includes("nvm4w"),
  });
  assert.equal(shadowed, null, "do not bypass the first PATH shim to reach another installation");

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

test("idle lease evicts only quiescent transports; a later session reopens retained identity", async () => {
  const mock = makeMockSubprocess();
  let evictions = 0;
  const create = () => new ClawSession(mock.subprocess, "C:/work", "sess-1", "claw", 1000, 35, (session) => {
    evictions++;
    void session.close();
  });
  const session = create();
  const first = session.request("plan.show", {});
  await delay(5);
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await delay(5);
  assert.equal(session.status().state, "active");
  await delay(55);
  assert.equal(evictions, 0, "in-flight operation must protect the lease");
  pushLine(mock.handles[0], { ok: true, command: "plan.show" });
  await first;
  await delay(55);
  assert.equal(evictions, 1);
  assert.equal(session.status().state, "reclaiming");
  assert.ok(mock.handles[0].stdin.writes.includes("session close\n"));
  const restored = create();
  const opened = restored.open();
  pushLine(mock.handles[1], { ok: true, command: "session.open" });
  await opened;
  assert.equal(mock.spawnCalls.length, 2);
  await restored.close();
});

test("close is idempotent, drains queued requests, and joins graceful exit", async () => {
  const mock = makeMockSubprocess();
  let finish;
  let terminations = 0;
  mock.subprocess.spawn = (spec) => {
    const handle = makeMockSubprocess().subprocess.spawn(spec);
    handle.done = new Promise((resolve) => { finish = resolve; });
    handle.terminate = async () => { terminations++; finish({ code: 1 }); };
    mock.handles.push(handle);
    return handle;
  };
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;
  const request = session.request("plan.show", {});
  const close1 = session.close();
  const close2 = session.close();
  assert.equal(close1, close2);
  await delay(5);
  assert.equal(mock.handles[0].stdin.writes.length, 1);
  pushLine(mock.handles[0], { ok: true, command: "plan.show" });
  await request;
  await delay(5);
  assert.equal(mock.handles[0].stdin.writes.at(-1), "session close\n");
  finish({ code: 0 });
  await close1;
  assert.equal(terminations, 0);
  await assert.rejects(session.request("plan.show", {}), { code: "SESSION_CONNECTION_LOST" });
});

test("unexpected exit resets the connection and rejects in-flight work", async () => {
  const mock = makeMockSubprocess();
  let finish;
  mock.subprocess.spawn = (spec) => {
    const handle = makeMockSubprocess().subprocess.spawn(spec);
    handle.done = new Promise((resolve) => { finish = resolve; });
    mock.handles.push(handle);
    return handle;
  };
  let deadNotifications = 0;
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1", "claw", 15000, 300000, undefined, () => { deadNotifications++; });
  const opened = session.open();
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;
  const request = session.request("plan.show", {});
  await delay(5);
  finish({ code: 1 });
  await assert.rejects(request, { code: "SESSION_CONNECTION_LOST" });
  await delay(0);
  assert.equal(deadNotifications, 1);
  const reopened = session.open();
  pushLine(mock.handles[1], { ok: true, command: "session.open" });
  await reopened;
  await session.close();
});

test("request timeout drops the stale handle before reconnect", async () => {
  const mock = makeMockSubprocess();
  let terminations = 0;
  const spawn = mock.subprocess.spawn;
  mock.subprocess.spawn = (spec) => {
    const handle = spawn(spec);
    handle.terminate = async () => { terminations++; };
    return handle;
  };
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;
  const failed = session.request("plan.show", {}, 25);
  await assert.rejects(failed, { code: "CLAW_SESSION_TIMEOUT" });
  assert.equal(terminations, 1);
  const next = session.request("plan.show", {}, 1000);
  let settled = false;
  void next.then(() => { settled = true; });
  await delay(5);
  pushLine(mock.handles[1], { ok: true, command: "session.open" });
  await delay(5);
  pushLine(mock.handles[0], { ok: true, command: "plan.show", output: { stale: true } });
  await delay(5);
  assert.equal(settled, false, "late old-process frame must not resolve the new request");
  pushLine(mock.handles[1], { ok: true, command: "plan.show" });
  await next;
  assert.equal(mock.spawnCalls.length, 2);
});

test("broken stdin retires the connection instead of caching a dead pipe", async () => {
  const mock = makeMockSubprocess();
  const session = new ClawSession(mock.subprocess, "C:/work", "sess-1");
  const opened = session.open();
  pushLine(mock.handles[0], { ok: true, command: "session.open" });
  await opened;
  mock.handles[0].stdin.write = () => { throw new Error("pipe broken"); };
  await assert.rejects(session.request("plan.show", {}), { code: "SESSION_CONNECTION_LOST" });
  const reopened = session.open();
  pushLine(mock.handles[1], { ok: true, command: "session.open" });
  await reopened;
  assert.equal(mock.spawnCalls.length, 2);
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
