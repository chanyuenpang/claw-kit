import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { apply } from "../lib/index.js";

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-source-tool-"));
  const operations = [], spawned = [], events = new Map(); let tool;
  const sourcePlan = { title: "Source", status: "end.completed", retrospective: { summary: "Source work" } };
  const material = { command: "knowledge.materials", sourcePlan, reportPath: path.join(root, "conversation.jsonl"),
    startedAt: new Date(1000).toISOString(), endedAt: new Date(2000).toISOString(), conversationStatus: "host-owned" };
  const subprocess = { spawn(spec) {
    spawned.push(spec.argv);
    if (spec.argv.includes("context")) { const text = JSON.stringify({ project: { projectRoot: root } }); return {
      done: Promise.resolve({ exitCode: 0, signal: null }), collected: { stdout: { readFrom: () => ({ text, lossy: false }) }, stderr: { readFrom: () => ({ text: "", lossy: false }) } }, terminate() {} }; }
    assert.ok(!spec.argv.some(x => x.startsWith("internal-")), "no legacy capture, inventory or ledger process");
    let finish;
    const handle = { stdout: new Readable({ read() {} }), done: new Promise(r => { finish = r; }), collected: {},
      stdin: { write(line) {
        if (line === "session close\n") { finish({ code: 0 }); return true; }
        const req = JSON.parse(line); operations.push(req.operation);
        const reply = options.failure ? { ok: false, command: req.operation, error: options.failure }
          : { ok: true, command: req.operation, output: req.operation === "knowledge.materials" ? material : { planStatus: "end.completed" },
            ...(req.operation === "plan.done" ? { knowledgeDispatch: { schemaVersion: 2, dispatchId: "a".repeat(64), projectRoot: root,
              sourceSessionKey: "parent", sourcePlan: path.join(root, "plan.json"), prompt: "Maintain knowledge" } } : {}) };
        setTimeout(() => handle.stdout.push(JSON.stringify(reply) + "\n"), 0); return true;
      } }, terminate() { finish({ code: 0 }); } };
    setTimeout(() => handle.stdout.push(JSON.stringify({ ok: true, command: "session.open" }) + "\n"), 0);
    return handle;
  } };
  let starts = 0, reads = 0;
  const ctx = { on: (event, callback) => { events.set(event, callback); return () => {}; }, get(name) {
    if (name === "subprocess") return subprocess;
    if (name === "tools") return { register: def => { if (def.name === "claw_run") tool = def; return () => {}; } };
    if (name === "systemPrompt") return { context: () => () => {}, section: () => () => {} };
    if (name === "subagents") return { startActivation: async () => { starts++; return { childId: "writer" }; } };
    if (name === "sessionQuery") return { readSession: async id => { reads++; assert.equal(id, "parent"); if (options.historyError) throw options.historyError; return { events: options.history ?? [] }; } };
  } };
  apply(ctx);
  t.after(() => { events.get("dispose")?.(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, material, operations, spawned, get starts() { return starts; }, get reads() { return reads; },
    call: (operation, args = {}, id = "parent") => tool.execute({ operation, args }, { agent: { id, session: { header: { cwd: root } } } }) };
}

test("source plan completion dispatches once without parent capture or legacy job recovery", async t => {
  const f = harness(t, { historyError: new Error("history unavailable") });
  const result = await f.call("plan.done");
  assert.equal(result.dispatch.ok, true); assert.equal(result.knowledgeDispatch.schemaVersion, 2);
  await f.call("context");
  assert.equal(f.starts, 1); assert.equal(f.reads, 0);
  assert.deepEqual(f.operations, ["plan.done"]);
});
test("materials read native parent history on demand and preserve the full source plan", async t => {
  const f = harness(t, { history: [
    { time: 800, type: "user/message", data: { role: "user", id: "u", source: { kind: "user" }, content: [{ type: "text", text: "request" }] } },
    { time: 900, type: "assistant/message", data: { message: { id: "a", content: [{ type: "text", text: "pre-plan reply" }] } } },
    { time: 1500, type: "assistant/message", data: { message: { id: "b", content: [{ type: "text", text: "work" }, { type: "thinking", text: "secret" }] } } },
    { time: 2000, type: "assistant/message", data: { message: { content: [{ type: "text", text: "after" }] } } },
  ] });
  const result = await f.call("knowledge.materials", { source_session_key: "parent", source_plan: path.join(f.root, "plan.json") }, "worker");
  assert.equal(result.conversationStatus, "available"); assert.equal(result.sourcePlan.retrospective.summary, "Source work");
  assert.deepEqual(fs.readFileSync(f.material.reportPath, "utf8").trim().split("\n").map(x => JSON.parse(x).message), ["request", "pre-plan reply", "work"]);
  assert.deepEqual(f.operations, ["knowledge.materials"]);
});
test("history errors preserve their code and source plan instead of fabricating empty material", async t => {
  const f = harness(t, { historyError: Object.assign(new Error("read failed"), { code: "SESSION_QUERY_CORRUPT_SESSION" }) });
  const result = await f.call("knowledge.materials", { source_session_key: "parent", source_plan: path.join(f.root, "plan.json") }, "worker");
  assert.equal(f.reads, 2); assert.equal(result.conversationStatus, "unavailable");
  assert.equal(result.diagnostic.code, "SESSION_QUERY_CORRUPT_SESSION"); assert.ok(result.sourcePlan);
  assert.equal(fs.existsSync(f.material.reportPath), false);
});
test("owner rejection preserves structured evidence without repeat calls", async t => {
  const failure = { code: "PLAN_FOCUS_CHANGED", message: "target changed", outcome: "known", phase: "prepare", effect: "none" };
  const f = harness(t, { failure });
  assert.deepEqual((await f.call("subplan.create")).error, failure);
  assert.deepEqual(f.operations, ["subplan.create"]);
});
