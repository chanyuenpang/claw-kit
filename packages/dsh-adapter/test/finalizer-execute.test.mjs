import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { apply } from "../lib/index.js";

// Execute-level proof of the finalizer dedupe: the wiring, not just the
// decision. A pure-seam test can pass while execute never consults the resolver
// -- which is precisely the regression these tests exist to catch.

const WORKDIR = process.cwd();

function makeMockSubprocess(respond) {
  const handles = [];
  const subprocess = {
    spawn() {
      const handle = {
        stdin: {
          writes: [],
          write(line) {
            this.writes.push(line);
            const request = JSON.parse(line);
            const reply = respond(request);
            if (reply !== undefined) {
              setTimeout(() => handle.stdout.push(JSON.stringify(reply) + "\n"), 0);
            }
            return true;
          },
        },
        stdout: new Readable({ read() {} }),
        done: new Promise(() => {}),
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

function makeHarness({ subagents, dispatch, extraService }) {
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
  const mock = makeMockSubprocess((request) => (
    request.operation === "plan.done"
      ? { ok: true, command: "plan.done", output: { planStatus: "end.completed" }, knowledgeDispatch: dispatch }
      : undefined
  ));
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

test("a repeated dispatch for the same finalizeId starts exactly one writer child", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "aaaa1111bbbb", prompt: "run the finalizer" },
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
      { kind: "child", id: "durable-child", activity: "running", mode: "one-shot", label: "knowledge-finalizer-cccc2222dddd" },
    ],
  });
  const harness = makeHarness({
    subagents: service,
    dispatch: { policy: "subagent", finalizeId: "cccc2222dddd", prompt: "run the finalizer" },
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
    dispatch: { policy: "subagent", finalizeId: "eeee3333ffff", prompt: "run the finalizer" },
  });
  apply(harness.ctx, {});

  const first = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-3") });
  assert.equal(first.dispatch.reused, undefined);

  settleRun("done");
  await new Promise((resolve) => setTimeout(resolve, 10));

  const second = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-3") });
  assert.equal(second.dispatch.reused, undefined, "a settled child must not block a job that is still queued");
  assert.equal(state.starts, 2);
});

test("an unavailable subagents service reports a non-retryable dispatch", async () => {
  const harness = makeHarness({
    subagents: undefined,
    dispatch: { policy: "subagent", finalizeId: "9999aaaa0000", prompt: "run the finalizer" },
  });
  apply(harness.ctx, {});

  const result = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-4") });
  assert.equal(result.dispatch.ok, false);
  assert.equal(result.dispatch.retryable, false);
  assert.match(result.dispatch.guidance, /Do not run the knowledge finalizer yourself/);
});
