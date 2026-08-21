import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { ClawSession } from "../lib/claw-session.js";

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
        done: Promise.resolve({ code: 0 }),
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
