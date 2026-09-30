import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { apply } from "../lib/index.js";

// Execute-level proof of the finalizer dedupe: the wiring, not just the
// decision. A pure-seam test can pass while execute never consults the resolver
// -- which is precisely the regression these tests exist to catch.

const WORKDIR = process.cwd();

function makeMockSubprocess(respond, pending) {
  const handles = [];
  const subprocess = {
    spawn(spec) {
      if (spec.argv.includes("internal-knowledge-pending") || spec.argv.includes("context")) {
        const text = spec.argv.includes("context")
          ? JSON.stringify({ project: { projectRoot: WORKDIR } })
          : JSON.stringify({ ok: true, command: "internal-knowledge-pending", dispatches: pending() });
        return { done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: { stdout: { readFrom: () => ({ text, lossy: false }) }, stderr: { readFrom: () => ({ text: "", lossy: false }) } },
          terminate: async () => {} };
      }
      let finish;
      const handle = {
        stdin: {
          writes: [],
          write(line) {
            this.writes.push(line);
            if (line === "session close\n") {
              setTimeout(() => finish({ code: 0 }), 0);
              return true;
            }
            const request = JSON.parse(line);
            const reply = respond(request);
            if (reply !== undefined) {
              setTimeout(() => handle.stdout.push(JSON.stringify(reply) + "\n"), 0);
            }
            return true;
          },
        },
        stdout: new Readable({ read() {} }),
        done: new Promise((resolve) => { finish = resolve; }),
        collected: {},
        terminate: async () => {},
      };
      handles.push(handle);
      setTimeout(() => handle.stdout.push(JSON.stringify({ ok: true, command: "session.open" }) + "\n"), 0);
      return handle;
    },
  };
  return { subprocess, handles };
}

function makeHarness({ subagents, dispatch, extraService, initialQueued = false, unknownClaim = false, receiptClaimed = true }) {
  let tool;
  const ctx = {
    get: (name) => {
      if (name === "subprocess") return harness.subprocess;
      if (name === "tools") return { register: (definition) => { if (definition.name === "claw_run") tool = definition; return () => {}; } };
      if (name === "systemPrompt") return { context: () => () => {}, section: () => () => {} };
      if (name === "subagents") return subagents;
      return extraService?.[name];
    },
    on: () => () => {},
  };
  let terminalCommitted = initialQueued;
  const mock = makeMockSubprocess((request) => {
    if (request.operation === "knowledge.claim" && unknownClaim) return { ok: false, command: "knowledge.claim",
      error: { code: "SESSION_CONNECTION_LOST", message: "connection was interrupted", outcome: "unknown" } };
    if (request.operation === "knowledge.claim.receipt") return { ok: true, command: "knowledge.claim.receipt", schemaVersion: 1,
      output: { claimed: receiptClaimed, claimToken: receiptClaimed ? "frozen-token" : undefined, assignments: [] } };
    if (request.operation === "plan.done") {
      terminalCommitted = true;
      return { ok: true, command: "plan.done", output: { planStatus: "end.completed" }, knowledgeDispatch: dispatch };
    }
    return { ok: true, command: request.operation, output: { planStatus: "process.active" } };
  }, () => terminalCommitted && dispatch ? [dispatch] : []);
  const harness = { ctx, mock, get tool() { return tool; } };
  harness.subprocess = mock.subprocess;
  return harness;
}

function makeAgent(id) {
  return { id, session: { header: { cwd: WORKDIR } } };
}

function makeSubagents({ onStart, children = () => [] } = {}) {
  const state = { starts: 0, listCalls: 0 };
  const service = {
    async start(_name, request) {
      state.starts += 1;
      // DSH's SubagentRun always carries `result` and `dispose`; a result
      // that never settles models a child that is still running.
      return onStart
        ? onStart(request, state)
        : { id: "run-" + state.starts, result: new Promise(() => {}), dispose: async () => {} };
    },
    async listChildren() {
      state.listCalls += 1;
      return children();
    },
  };
  return { service, state };
}

test("a queued job recovers on next context without replaying its lost plan terminal", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({ subagents: service, initialQueued: true,
    dispatch: { policy: "subagent", finalizeId: "d".repeat(64), prompt: "run recovered writer" } });
  apply(harness.ctx);
  const agent = makeAgent("recovered-parent");
  await Promise.all([
    harness.tool.execute({ operation: "context", args: {} }, { agent }),
    harness.tool.execute({ operation: "context", args: {} }, { agent }),
  ]);
  assert.equal(state.starts, 1);
  assert.equal(harness.mock.handles.length, 0, "only read-only one-off inspection ran, not plan.done");
});

test("lost claim response reads the frozen same-child receipt without second claim", async () => {
  const harness = makeHarness({ subagents: undefined, dispatch: undefined, unknownClaim: true });
  apply(harness.ctx);
  const result = await harness.tool.execute({ operation: "knowledge.claim",
    args: { finalize_id: "a".repeat(64) } }, { agent: makeAgent("writer-child") });
  assert.equal(result.claimed, true);
  assert.equal(result.claimToken, "frozen-token");
  assert.equal(result.recovered, true);
  const requests = harness.mock.handles.flatMap((handle) => handle.stdin.writes)
    .filter((line) => line.startsWith("{")).map((line) => JSON.parse(line).operation);
  assert.deepEqual(requests, ["knowledge.claim", "knowledge.claim.receipt"]);
});

test("unavailable claim receipt retains unknown outcome without mutation replay", async () => {
  const harness = makeHarness({ subagents: undefined, dispatch: undefined, unknownClaim: true, receiptClaimed: false });
  apply(harness.ctx);
  await assert.rejects(harness.tool.execute({ operation: "knowledge.claim",
    args: { finalize_id: "a".repeat(64) } }, { agent: makeAgent("writer-child") }), /CLAW_OUTCOME_UNKNOWN/);
  const requests = harness.mock.handles.flatMap((handle) => handle.stdin.writes)
    .filter((line) => line.startsWith("{")).map((line) => JSON.parse(line).operation);
  assert.deepEqual(requests, ["knowledge.claim", "knowledge.claim.receipt"]);
});

test("a repeated dispatch for the same finalizeId starts exactly one writer child", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "a".repeat(64), prompt: "run the finalizer" },
  });
  apply(harness.ctx, {});

  const first = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-1") });
  assert.equal(first.dispatch.ok, true);
  assert.equal(first.dispatch.reused, undefined, "the first dispatch starts a child");

  const second = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-1") });
  assert.equal(second.dispatch.ok, true);
  assert.equal(second.dispatch.reused, true);
  assert.equal(second.dispatch.runId, "run-1");
  assert.equal(state.starts, 1, "a second writer child must never be started for the same finalizeId");
});

test("a running durable child with the finalizeId label is reused after an adapter restart", async () => {
  const { service, state } = makeSubagents({
    children: () => [
      { kind: "child", id: "durable-child", activity: "running", mode: "one-shot", label: "knowledge-finalizer-" + "c".repeat(64) },
    ],
  });
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "c".repeat(64), prompt: "run the finalizer" },
  });
  apply(harness.ctx, {});

  const result = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-2") });
  assert.equal(result.dispatch.ok, true);
  assert.equal(result.dispatch.reused, true);
  assert.equal(result.dispatch.runId, "durable-child");
  assert.equal(state.starts, 0, "the durable catalog already holds this finalizeId's writer");
});

test("a settled writer child releases the record so a stranded job can be retried", async () => {
  let settleRun;
  const { service, state } = makeSubagents({
    onStart: () => ({ id: "run-1", result: new Promise((resolve) => { settleRun = resolve; }), dispose: async () => {} }),
  });
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "e".repeat(64), prompt: "run the finalizer" },
  });
  apply(harness.ctx, {});

  const first = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-3") });
  assert.equal(first.dispatch.reused, undefined);

  settleRun("done");
  await new Promise((resolve) => setTimeout(resolve, 10));

  const second = await harness.tool.execute({ operation: "plan.show", args: {} }, { agent: makeAgent("parent-3") });
  assert.equal(second.command, "plan.show", "a read-only next entry recovers the queued writer");
  assert.equal(state.starts, 2, "the settled child does not block an unclaimed queued job");
});

test("plan.done releases only its own transport after dispatch, then same agent reopens", async () => {
  const { service } = makeSubagents();
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "f".repeat(64), prompt: "writer independent of transport" },
  });
  apply(harness.ctx);
  const agent = makeAgent("same-agent");
  const done = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent });
  assert.equal(done.dispatch.ok, true);
  assert.equal(harness.mock.handles[0].stdin.writes.at(-1), "session close\n");
  await harness.tool.execute({ operation: "plan.create", args: { title: "next" } }, { agent });
  assert.equal(harness.mock.handles.length, 2);
  assert.equal(harness.mock.handles[1].stdin.writes.length, 1);
  assert.equal(harness.mock.handles[1].stdin.writes[0].includes("plan.create"), true);
});

test("an already queued next-plan request prevents completed-plan eviction", async () => {
  let unblock;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const { service } = makeSubagents({
    onStart: async () => {
      entered();
      await new Promise((resolve) => { unblock = resolve; });
      return { id: "writer", result: new Promise(() => {}), dispose: async () => {} };
    },
  });
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "b".repeat(64), prompt: "writer" },
  });
  apply(harness.ctx);
  const agent = makeAgent("race-agent");
  const finishing = harness.tool.execute({ operation: "plan.done", args: {} }, { agent });
  await started;
  const next = harness.tool.execute({ operation: "plan.create", args: { title: "next" } }, { agent });
  await next;
  unblock();
  await finishing;
  assert.equal(harness.mock.handles.length, 1);
  assert.equal(harness.mock.handles[0].stdin.writes.includes("session close\n"), false);
});

test("claw_run keeps knowledge.done receipt when daemon omits command", async () => {
  const harness = makeHarness({ subagents: undefined, dispatch: undefined });
  apply(harness.ctx, {});
  const result = await harness.tool.execute({ operation: "knowledge.done", args: { finalize_id: "a".repeat(64), claim_token: "token", status: "succeeded", result: "ok" } }, { agent: makeAgent("done-receipt") });
  // This harness supplies only planStatus for other operations; a dedicated
  // compact helper test verifies the daemon's commandless terminal payload.
  assert.equal(result.command, "knowledge.done");
  const request = JSON.parse(harness.mock.handles[0].stdin.writes[0]);
  assert.deepEqual(request.input, { finalizeId: "a".repeat(64), claimToken: "token", status: "succeeded", result: "ok" });
});

test("an unavailable subagents service reports a non-retryable dispatch", async () => {
  const harness = makeHarness({
    subagents: undefined,
    dispatch: { policy: "subagent", finalizeId: "9".repeat(64), prompt: "run the finalizer" },
  });
  apply(harness.ctx, {});

  const result = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-4") });
  assert.equal(result.dispatch.ok, false);
  assert.equal(result.dispatch.retryable, false);
  assert.match(result.dispatch.guidance, /Do not run or retry the knowledge finalizer manually/);
});
