import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { apply } from "../lib/index.js";

// Execute-level proof of the finalizer dedupe: the wiring, not just the
// decision. A pure-seam test can pass while execute never consults the resolver
// -- which is precisely the regression these tests exist to catch.

const WORKDIR = process.cwd();

function makeMockSubprocess(respond, pending, captureError, override) {
  const handles = [];
  const captures = [];
  const issues = [];
  const subprocess = {
    spawn(spec) {
      const custom = override?.(spec, { captures, issues });
      if (custom) return custom;
      if (spec.argv.includes("internal-dsh-finalizer-issue") || spec.argv.includes("internal-dsh-finalizer-alerts")) {
        const recording = spec.argv.includes("internal-dsh-finalizer-issue");
        if (recording) issues.push({ finalizeId: spec.argv[spec.argv.indexOf("--finalize-id") + 1],
          phase: spec.argv[spec.argv.indexOf("--phase") + 1], code: spec.argv[spec.argv.indexOf("--code") + 1] });
        const text = JSON.stringify({ ok: true, ...(recording ? {} : { alerts: issues }) });
        return { done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: { stdout: { readFrom: () => ({ text, lossy: false }) },
            stderr: { readFrom: () => ({ text: "", lossy: false }) } }, terminate: async () => {} };
      }
      if (spec.argv.includes("internal-dsh-host-report-capture")) {
        if (captureError) return { stdin: { end: (payload) => captures.push(JSON.parse(payload)) },
          done: Promise.resolve({ exitCode: 1, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: "", lossy: false }) },
            stderr: { readFrom: () => ({ text: captureError, lossy: false }) } }, terminate: async () => {} };
        return { stdin: { end: (payload) => captures.push(JSON.parse(payload)) },
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: JSON.stringify({ ok: true, captured: true }), lossy: false }) },
            stderr: { readFrom: () => ({ text: "", lossy: false }) } }, terminate: async () => {} };
      }
      if (spec.argv.includes("internal-knowledge-pending") || spec.argv.includes("context")) {
        const text = spec.argv.includes("context")
          ? JSON.stringify({ project: { projectRoot: WORKDIR } })
          : JSON.stringify({ ok: true, command: "internal-knowledge-pending", dispatches: pending().map((item) =>
            ({ ...item, startedAt: item.startedAt ?? "2026-01-01T00:00:00.000Z",
              captureStatus: item.captureStatus ?? "pending" })) });
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
  return { subprocess, handles, captures, issues };
}

function makeHarness({ subagents, dispatch, extraService, initialQueued = false, unknownClaim = false, receiptClaimed = true, captureError }) {
  let tool;
  const ctx = {
    get: (name) => {
      if (name === "subprocess") return harness.subprocess;
      if (name === "tools") return { register: (definition) => { if (definition.name === "claw_run") tool = definition; return () => {}; } };
      if (name === "systemPrompt") return { context: () => () => {}, section: () => () => {} };
      if (name === "subagents") return subagents;
      if (name === "sessionQuery") return extraService && Object.hasOwn(extraService, "sessionQuery")
        ? extraService.sessionQuery : { readSession: async () => ({ events: [] }) };
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
  }, () => terminalCommitted && dispatch ? [dispatch] : [], captureError);
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
    getProvider: () => ({ name: "spawn", inheritsParentContext: false, start() {}, capabilities: { agentOptions: true } }),
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

test("live parent capture sends only proven in-plan finals before child dispatch", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({ subagents: service, initialQueued: true,
    dispatch: { policy: "subagent", finalizeId: "6".repeat(64), prompt: "writer" },
    extraService: { sessionQuery: { readSession: async (id) => {
      assert.equal(id, "parent-capture");
      return { events: [
        { type: "assistant/final", time: Date.parse("2025-12-31T23:00:00Z"), data: { turn: 1, message: { content: [{ type: "text", text: "old" }] } } },
        { type: "assistant/message", time: Date.parse("2026-01-02T00:00:00Z"), data: { turn: 2, message: { content: [{ type: "text", text: "commentary" }] } } },
        { type: "assistant/final", time: Date.parse("2026-01-02T01:00:00Z"), data: { turn: 2, message: { content: [{ type: "text", text: "verified" }] } } },
      ] };
    } } },
  });
  apply(harness.ctx);
  await harness.tool.execute({ operation: "context", args: {} }, { agent: makeAgent("parent-capture") });
  assert.equal(state.starts, 1);
  assert.deepEqual(harness.mock.captures.flatMap((x) => x.events.map((event) => event.message)), ["verified"]);
});

test("missing parent history blocks writer before claim without fabricating empty capture", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({ subagents: service,
    dispatch: { policy: "subagent", finalizeId: "f".repeat(64), prompt: "writer" },
    extraService: { sessionQuery: undefined },
  });
  apply(harness.ctx);
  const result = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-no-history") });
  assert.equal(result.dispatch.ok, false);
  assert.equal(result.dispatch.phase, "capture");
  assert.equal(result.dispatch.code, "DSH_REPORT_HOST_UNAVAILABLE");
  assert.equal(state.starts, 0);
  assert.equal(harness.mock.captures.length, 0);
  const context = await harness.tool.execute({ operation: "context", args: {} }, { agent: makeAgent("parent-no-history") });
  assert.equal(context.finalizationAlerts[0].code, "DSH_REPORT_HOST_UNAVAILABLE");
  assert.equal(state.starts, 0);
});

test("collector stderr yields only a safe error code in parent receipts", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({ subagents: service,
    dispatch: { policy: "subagent", finalizeId: "8".repeat(64), prompt: "writer" },
    captureError: "DSH_REPORT_CAPTURE_DENIED: private path C:\\secret\\plan.report",
  });
  apply(harness.ctx);
  const result = await harness.tool.execute({ operation: "plan.done", args: {} }, { agent: makeAgent("parent-sensitive") });
  assert.equal(result.dispatch.code, "DSH_REPORT_CAPTURE_DENIED");
  assert.equal(state.starts, 0);
  assert.equal(harness.mock.issues[0].code, "DSH_REPORT_CAPTURE_DENIED");
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("queued job with durable capture receipt resumes without another Host history read", async () => {
  const { service, state } = makeSubagents();
  const harness = makeHarness({ subagents: service, initialQueued: true,
    dispatch: { policy: "subagent", finalizeId: "7".repeat(64), prompt: "writer", captureStatus: "captured" },
    extraService: { sessionQuery: undefined },
  });
  apply(harness.ctx);
  await harness.tool.execute({ operation: "context", args: {} }, { agent: makeAgent("recovered-captured-parent") });
  assert.equal(state.starts, 1);
  assert.equal(harness.mock.captures.length, 0);
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

test("actual adapter reuses one Team writer and wakes B after both A ends with no parent turn", async t => {
  const parent = makeAgent("two-job-lead");
  parent.options = { provider: "llm", model: "model", reasoningEffort: "medium" };
  const actors = new Map([[parent.id, parent]]);
  const members = [];
  const sent = [];
  let spawned = 0;
  let tool, dispose;
  let second;
  const secondDelivered = new Promise(resolve => { second = resolve; });
  const jobs = ["a", "b"].map((letter, i) => ({
    finalizeId: (letter + "0").repeat(32), preferReuse: true, status: "queued", readyForNext: true, delegateEnded: false,
    expiresAt: "2099-01-01T00:00:00Z", prompt: "perform frozen job " + letter,
    startedAt: "2026-01-01T00:00:00Z", endedAt: i === 0 ? "2026-01-03T00:00:00Z" : "2026-01-05T00:00:00Z",
  }));
  const reply = value => ({ done: Promise.resolve({ exitCode: 0 }), collected: {
    stdout: { readFrom: () => ({ text: JSON.stringify(value), lossy: false }) },
    stderr: { readFrom: () => ({ text: "", lossy: false }) },
  }, terminate: async () => {} });
  const native = {
    start() { throw new Error("must not use legacy native start in Team route"); },
    listChildren: async () => [], startContinuable() {}, sendMessage() {},
    getProvider: () => ({ name: "spawn", inheritsParentContext: false, start() {}, prepareContinuable() {} }),
  };
  const team = {
    tryMembership: actor => actor === parent ? { root: parent, id: parent.id, role: "lead" }
      : actors.get(actor.id) === actor ? { root: parent, id: parent.id, role: "teammate" } : undefined,
    listMembers: () => members,
    async spawnTeammate(actor, request) {
      assert.equal(actor, parent); spawned++;
      assert.doesNotMatch(request.prompt[0].text, /aaaaaaaaaaaaaaaa/);
      const row = { id: "reused-member", name: request.name, description: request.description,
        role: "teammate", status: "inactive", provider: request.provider, context: request.context, diagnostics: [] };
      members.push(row);
      const child = makeAgent(row.id);
      child.session.header.parentSession = parent.id;
      child.options = { ...parent.options };
      actors.set(row.id, child);
      return { member: row };
    },
    async sendMessage(actor, request) {
      assert.equal(actor, parent);
      const id = request.content[0].text.split("\n")[0].split(":").at(-1);
      sent.push(id);
      if (id === jobs[1].finalizeId) second();
      return { messageId: "message-" + id, status: "queued" };
    },
  };
  let shownPlan;
  const internalOperations = [];
  const mock = makeMockSubprocess(request => {
    internalOperations.push(request.operation);
    if (request.operation === "knowledge.claim") return { ok: true, command: request.operation, output: { claimed: false } };
    if (request.operation === "plan.show") return { ok: true, command: request.operation, output: shownPlan };
    if (shownPlan && request.operation === "task.done") shownPlan.plan.tasks.at(-1).status = "done";
    if (shownPlan && ["plan.done", "plan.edit"].includes(request.operation)) {
      shownPlan.plan.status = "end.completed";
      jobs.find(job => job.execution?.delegatePlanPath === shownPlan.planPath).delegateEnded = true;
    }
    return { ok: true, command: request.operation, output: { planStatus: "end.completed" } };
  },
    () => jobs.filter(j => j.status === "queued").map(j => ({ ...j, policy: "background" })), undefined,
    (spec, state) => {
      const id = spec.argv[spec.argv.indexOf("--finalize-id") + 1];
      const job = jobs.find(j => j.finalizeId === id);
      if (spec.argv.includes("internal-dsh-host-report-capture")) {
        return { ...reply({ ok: true, captured: true }), stdin: { end: payload => {
          const capture = JSON.parse(payload); state.captures.push(capture);
          job.captureStatus = "captured";
        } } };
      }
      if (spec.argv.includes("internal-dsh-finalizer-inspect")) return reply({ ok: true,
        executions: jobs.filter(j => !spec.argv.includes("--finalize-id") || j === job) });
      if (spec.argv.includes("internal-dsh-finalizer-reserve")) {
        assert.equal(jobs.some(j => j !== job && j.execution && !j.readyForNext), false);
        job.readyForNext = false;
        job.execution = { route: "team", parentSessionId: parent.id, memberSessionId: "reused-member", teamId: parent.id,
          provider: "spawn", configFingerprint: spec.argv[spec.argv.indexOf("--config-fingerprint") + 1],
          deliveryKey: id, delivery: { state: "reserved" } };
        return reply({ ok: true, admitted: true, execution: job.execution });
      }
      if (spec.argv.includes("internal-dsh-finalizer-delivery")) {
        const next = spec.argv[spec.argv.indexOf("--state") + 1];
        const deliver = next === "attempted" && job.execution.delivery.state === "reserved";
        job.execution.delivery = { state: next, ...(next === "accepted" ? { receiptId: spec.argv[spec.argv.indexOf("--receipt-id") + 1] } : {}) };
        return reply({ ok: true, deliver, execution: job.execution });
      }
      if (spec.argv.includes("internal-dsh-finalizer-release")) {
        const released = ["succeeded", "failed", "expired"].includes(job.status) && job.delegateEnded;
        if (released) { job.readyForNext = true; job.execution.releasedAt = new Date().toISOString(); }
        return reply({ ok: true, released, parentSessionId: parent.id });
      }
    });
  const services = { subprocess: mock.subprocess, subagents: native, agentTeams: team,
    agents: { get: id => actors.get(id) },
    tools: { register: definition => { tool = definition; }, get: (name, actor) => name === "spawn_teammate" && actor === parent
      ? { parameters: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, prompt: { type: "string" } } } } : undefined },
    systemPrompt: { context() {}, section() {} },
    sessionQuery: { readSession: async id => { assert.equal(id, parent.id); return { events: [
      { type: "assistant/final", time: Date.parse("2026-01-02T00:00:00Z"), data: { turn: 1, message: { content: [{ type: "text", text: "A material" }] } } },
      { type: "assistant/final", time: Date.parse("2026-01-04T00:00:00Z"), data: { turn: 2, message: { content: [{ type: "text", text: "B later material" }] } } },
    ] }; } },
  };
  apply({ get: name => services[name], on: (name, callback) => { if (name === "dispose") dispose = callback; } });
  t.after(() => dispose?.());
  await tool.execute({ operation: "context" }, { agent: parent });
  assert.equal(spawned, 1);
  assert.deepEqual(sent, [jobs[0].finalizeId]);
  assert.equal(mock.captures.length, 2, "B capture freezes even while A owns the role");
  assert.deepEqual(mock.captures[0].events.map(e => e.message), ["A material"]);
  const child = actors.get("reused-member");
  jobs[0].status = "succeeded";
  await tool.execute({ operation: "knowledge.done", args: { finalize_id: jobs[0].finalizeId, claim_token: "A-token", status: "succeeded", result: "A done" } }, { agent: child });
  assert.deepEqual(sent, [jobs[0].finalizeId], "job terminal alone cannot release unfinished delegate");
  jobs[0].delegateEnded = true;
  await tool.execute({ operation: "plan.done", args: { retrospective: "A delegate ended" } }, { agent: child });
  await secondDelivered;
  assert.deepEqual(sent, jobs.map(j => j.finalizeId));
  assert.equal(spawned, 1, "no new parent tool call or new member was needed");
  assert.equal(mock.captures.length, 2, "queued B retains its frozen capture");
  assert.equal(jobs[1].execution.memberSessionId, jobs[0].execution.memberSessionId);
  assert.notEqual(jobs[1].execution.deliveryKey, jobs[0].execution.deliveryKey);
  jobs[1].execution.delegatePlanPath = WORKDIR + "/B-delegate.json";
  shownPlan = { planPath: jobs[1].execution.delegatePlanPath, plan: { templateId: "internal-dsh-knowledge-delegate", knowledgeCapture: false,
    status: "process.active", tasks: [{ id: 1, status: "done" }, { id: 2, status: "done" }, { id: 3, status: "pending" }] } };
  const stale = await tool.execute({ operation: "knowledge.claim", args: { finalize_id: jobs[0].finalizeId } }, { agent: child });
  assert.notEqual(stale.delegateClosed, true);
  assert.equal(shownPlan.plan.status, "process.active", "old A cannot close current B");
  jobs[1].status = "succeeded";
  const completed = await tool.execute({ operation: "knowledge.done", args: { finalize_id: jobs[1].finalizeId, claim_token: "B-token", status: "succeeded", result: "B done" } }, { agent: child });
  assert.equal(completed.delegateClosed, true, "adapter completes only matching final bookkeeping, without another worker instruction");
  assert.equal(jobs[1].delegateEnded, true);
  assert.ok(jobs[1].execution.releasedAt);
  assert.ok(internalOperations.includes("task.done"));
});
