import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply } from "../lib/index.js";

// Exercise the real adapter entry with the public Host pre-step record, not a
// replacement recovery resolver. Only the read-only CLI transport is controlled.
function harness(t, snapshot) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-todo-recovery-"));
  const events = new Map(), calls = [], writes = [], prompts = [], tools = [];
  let done;
  const actor = { id: "host-session", session: { header: { cwd: root },
    append(type, data) { writes.push({ type, data }); } } };
  const services = {
    subprocess: { spawn(spec) {
      calls.push(spec);
      assert.ok(spec.argv.includes("context"));
      assert.ok(!spec.argv.includes("resume"));
      assert.equal(spec.env.CLAW_SESSION_ID, actor.id);
      assert.equal(spec.cwd, root);
      let value = snapshot;
      if (typeof snapshot === "function") value = snapshot(spec);
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return { done: value === undefined ? new Promise(resolve => { done = resolve; })
        : Promise.resolve({ exitCode: 0, signal: null }),
        collected: { stdout: { readFrom: () => ({ text: text ?? "", lossy: false }) },
          stderr: { readFrom: () => ({ text: "", lossy: false }) } }, terminate() {} };
    } },
    tools: { register(definition) { tools.push(definition); return () => {}; } },
    systemPrompt: { context(spec) { prompts.push(spec); return () => {}; },
      section(spec) { prompts.push(spec); return () => {}; } },
    goals: { create() { assert.fail("recovery must not create Goal state"); },
      complete() { assert.fail("recovery must not complete Goal state"); } },
  };
  apply({ get: name => services[name], on(name, callback) { events.set(name, callback); return () => {}; } });
  t.after(() => { events.get("dispose")?.(); fs.rmSync(root, { recursive: true, force: true }); });
  const decision = { kind: "enter", messages: [{ role: "user", content: "continue" }] };
  let nextCalls = 0;
  return { actor, calls, writes, prompts, tools, events, decision, get nextCalls() { return nextCalls; },
    finish: () => done?.({ exitCode: 0, signal: null }),
    async step(step = 1, signal = new AbortController().signal) {
      return events.get("agent/pre-step")({ agent: actor, turn: 2, step, signal, messages: decision.messages },
        async () => { nextCalls++; return decision; });
    } };
}

const context = (status = "process.active", title = "active plan") => ({
  activeWorkflow: { planStatus: status, planContent: { status,
    tasks: [{ title, status: "in_progress" }] } },
});

for (const status of ["process.active", "process.wait", "process.discussing"]) {
  test("silent first-step recovery retains " + status, async t => {
    const h = harness(t, context(status));
    const before = h.prompts.map(p => typeof p.text === "function" ? p.text({ scope: h.actor }) : p.text);
    assert.equal(await h.step(), h.decision);
    assert.deepEqual(h.writes, [{ type: "todo/write", data: { todos: [{ content: "active plan", status: "in_progress" }] } }]);
    assert.deepEqual(h.prompts.map(p => typeof p.text === "function" ? p.text({ scope: h.actor }) : p.text), before);
    assert.equal(h.tools.length, 1); assert.equal(h.tools[0].name, "claw_run");
    assert.deepEqual(h.decision.messages, [{ role: "user", content: "continue" }]);
    assert.equal(h.nextCalls, 1);
    await h.step(2);
    assert.equal(h.calls.length, 1, "no repeated context read within one turn");
  });
}

for (const status of ["end.completed", "end.closed", "end.leave"]) {
  test("all exit states clear: " + status, async t => {
    const h = harness(t, context(status)); await h.step();
    assert.deepEqual(h.writes, [{ type: "todo/write", data: { todos: [] } }]);
  });
}

test("loads the current subplan or parent, not a cached list", async t => {
  let active = "child";
  const h = harness(t, () => context("process.active", active));
  await h.step(); active = "parent"; await h.step();
  assert.deepEqual(h.writes.map(w => w.data.todos[0].content), ["child", "parent"]);
});

test("authoritative no-binding result clears the previous plan", async t => {
  const h = harness(t, { session: { boundPlan: false } }); await h.step();
  assert.deepEqual(h.writes, [{ type: "todo/write", data: { todos: [] } }]);
});

for (const [name, snapshot] of [
  ["failed read", () => { throw new Error("owner unavailable"); }],
  ["invalid JSON", "not a protocol result"],
  ["incomplete result", {}],
  ["incomplete plan", { activeWorkflow: { planStatus: "process.active", planContent: {} } }],
]) test(name + " does not fabricate a clear or affect the next step", async t => {
  const h = harness(t, snapshot);
  assert.equal(await h.step(), h.decision); assert.deepEqual(h.writes, []); assert.equal(h.nextCalls, 1);
});

test("an already cancelled turn performs no read or write", async t => {
  const h = harness(t, context()); const abort = new AbortController(); abort.abort();
  assert.equal(await h.step(1, abort.signal), h.decision);
  assert.deepEqual(h.calls, []); assert.deepEqual(h.writes, []);
});

test("cancelled reads cannot publish a late snapshot", async t => {
  let started; const ready = new Promise(resolve => { started = resolve; });
  const h = harness(t, () => { started(); return undefined; });
  const abort = new AbortController(); const pending = h.step(1, abort.signal);
  await ready; abort.abort();
  assert.equal(await pending, h.decision); h.finish();
  await Promise.resolve(); assert.deepEqual(h.writes, []);
  assert.equal(h.calls[0].signal.aborted, true);
});

test("a stuck read has a bounded budget and does not block the turn indefinitely", async t => {
  const h = harness(t, () => undefined);
  // A real Host subprocess honours signal; this fixture deliberately never settles
  // done, proving that the adapter also stops awaiting an unresponsive read.
  assert.equal(await h.step(), h.decision);
  assert.equal(h.calls[0].signal.aborted, true); assert.deepEqual(h.writes, []); h.finish();
});
