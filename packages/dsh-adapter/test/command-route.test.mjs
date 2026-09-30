import { test } from "node:test";
import assert from "node:assert/strict";
import { routeCommand, runCommandBaseline } from "../lib/command-route.js";

test("known pre-execution unsupported operation uses baseline once", async () => {
  let count = 0;
  const result = await routeCommand(
    async () => ({ ok: false, command: "knowledge.claim", error: { code: "SESSION_OPERATION_UNSUPPORTED", outcome: "known" } }),
    async () => { count++; return { ok: true, command: "knowledge.claim", output: { claimed: true } }; },
  );
  assert.equal(count, 1);
  assert.equal(result.output.claimed, true);
});

test("pre-send daemon startup failure invokes baseline once", async () => {
  let count = 0;
  const result = await routeCommand(
    async () => { throw Object.assign(new Error("open timed out"), { code: "CLAW_SESSION_OPEN_TIMEOUT", beforeSend: true }); },
    async () => { count++; return { ok: true, command: "plan.show", output: {} }; },
  );
  assert.equal(result.ok, true);
  assert.equal(count, 1);
});

test("unknown outcome or domain failure never falls back", async () => {
  for (const error of [
    { code: "SESSION_OPERATION_UNSUPPORTED", outcome: "unknown" },
    { code: "PLAN_FOCUS_CONFLICT", outcome: "known" },
  ]) {
    let count = 0;
    const result = await routeCommand(
      async () => ({ ok: false, command: "plan.resume", error }),
      async () => { count++; throw new Error("unexpected baseline"); },
    );
    assert.equal(result.error.code, error.code);
    assert.equal(count, 0);
  }
  let count = 0;
  await assert.rejects(routeCommand(
    async () => { throw Object.assign(new Error("lost after send"), { code: "SESSION_CONNECTION_LOST" }); },
    async () => { count++; throw new Error("unexpected baseline"); },
  ), /lost after send/);
  assert.equal(count, 0);
});

test("trusted baseline passes JSON via stdin and preserves host effects", async () => {
  let spec, request;
  const output = { ok: true, command: "plan.show", schemaVersion: 1,
    output: { planStatus: "process.active" }, hostActions: [{ id: "effect" }] };
  const process = { spawn(value) {
    spec = value;
    return { stdin: { write(line) { request = JSON.parse(line); return true; }, on() {} },
      done: Promise.resolve({ exitCode: 0, signal: null }),
      collected: { stdout: { readFrom() { return { text: JSON.stringify(output), lossy: false }; } } },
      async terminate() { throw new Error("must not terminate"); } };
  } };
  const result = await runCommandBaseline(process, "C:/work & space", "session-id", "plan.show", { simple: true }, "C:/tagged & source/bin.js");
  assert.deepEqual(spec.argv.slice(1), ["C:/tagged & source/bin.js", "internal-command"]);
  assert.equal(spec.cwd, "C:/work & space");
  assert.equal(spec.env.CLAW_SESSION_ID, "session-id");
  assert.deepEqual(request, { operation: "plan.show", input: { simple: true } });
  assert.deepEqual(result.hostActions, output.hostActions);
});
