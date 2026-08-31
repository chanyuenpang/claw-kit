import { test } from "node:test";
import assert from "node:assert/strict";
import { compactClawOutput, consumeHostActions } from "../lib/host-actions.js";

function fakeGoal(create = () => undefined, complete = () => undefined) {
  let current;
  return {
    get: () => current,
    create: (agent, request) => {
      current = { id: "g-1", revision: 1 };
      return create(agent, request);
    },
    complete: (agent, ref) => {
      current = undefined;
      return complete(agent, ref);
    },
  };
}

test("consumeHostActions: create_goal calls goals.create and reports consumed", () => {
  const calls = [];
  const goals = fakeGoal((agent, request) => calls.push(["create", request]));
  const { consumed, projection, failures } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "O" } }],
    goals,
    { id: "agent-1" },
  );
  assert.deepEqual(consumed, ["a:create_goal"]);
  assert.equal(projection, undefined);
  assert.deepEqual(failures, []);
  assert.deepEqual(calls, [["create", { objective: "O" }]]);
});

test("consumeHostActions: blocked then complete maps to one native completion and a consumed no-op", () => {
  const calls = [];
  const goals = fakeGoal((agent, request) => calls.push(["create", request]), (agent, ref) => calls.push(["complete", ref]));
  goals.create({}, { objective: "O" }); // seed an active goal
  const { consumed } = consumeHostActions(
    [
      { schemaVersion: 1, id: "a:blocked", tool: "update_goal", input: { status: "blocked" } },
      { schemaVersion: 1, id: "a:complete", tool: "update_goal", input: { status: "complete" } },
    ],
    goals,
    {},
  );
  assert.deepEqual(consumed, ["a:blocked", "a:complete"]);
  assert.deepEqual(calls, [["create", { objective: "O" }], ["complete", { id: "g-1", revision: 1 }]]);
  assert.equal(goals.get({}), undefined);
});

test("consumeHostActions: an existing native Goal retains create_goal and duplicate IDs are no-ops", () => {
  const calls = [];
  const goals = fakeGoal((agent, request) => calls.push(["create", request]));
  goals.create({}, { objective: "existing" });
  const action = { schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "replacement" } };
  const { consumed } = consumeHostActions([action, action], goals, {});
  assert.deepEqual(consumed, ["a:create_goal"]);
  assert.deepEqual(calls, [["create", { objective: "existing" }]]);
});

test("consumeHostActions: update_goal is a consumed no-op when no Goal is active", () => {
  const { consumed } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:update_goal", tool: "update_goal", input: { status: "complete" } }],
    fakeGoal(),
    {},
  );
  assert.deepEqual(consumed, ["a:update_goal"]);
});

test("consumeHostActions: update_plan returns the projection without consuming", () => {
  const action = { schemaVersion: 1, id: "a:update_plan", tool: "update_plan", input: { plan: [] } };
  const { consumed, projection } = consumeHostActions([action], fakeGoal(), {});
  assert.deepEqual(consumed, []);
  assert.equal(projection, action);
});

test("consumeHostActions: no goals service reports a post-commit failure without throwing", () => {
  const { consumed, failures } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "O" } }],
    undefined,
    {},
  );
  assert.deepEqual(consumed, []);
  assert.deepEqual(failures, [{
    actionId: "a:create_goal",
    tool: "create_goal",
    code: "SERVICE_UNAVAILABLE",
    message: "DSH goals service is unavailable.",
  }]);
});

test("consumeHostActions: consumer errors fail open", () => {
  const goals = fakeGoal(() => {
    throw new Error("boom");
  });
  const result = consumeHostActions(
    [{ schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "O" } }],
    goals,
    {},
  );
  assert.deepEqual(result.failures, [{
    actionId: "a:create_goal",
    tool: "create_goal",
    code: "APPLY_FAILED",
    message: "boom",
  }]);
});

test("consumeHostActions: reports non-v1 and unsupported actions", () => {
  const goals = fakeGoal();
  const { consumed, failures } = consumeHostActions(
    [
      { schemaVersion: 2, id: "x", tool: "create_goal", input: { objective: "O" } },
      { schemaVersion: 1, id: "y", tool: "mystery", input: {} },
    ],
    goals,
    {},
  );
  assert.deepEqual(consumed, []);
  assert.deepEqual(failures.map(({ code, actionId }) => ({ code, actionId })), [
    { code: "UNSUPPORTED_SCHEMA", actionId: "x" },
    { code: "UNSUPPORTED_TOOL", actionId: "y" },
  ]);
});

test("compactClawOutput keeps only the whitelist guidance fields", () => {
  const output = {
    command: "task.edit",
    taskName: "t",
    planPath: "P",
    planStatus: "process.active",
    previousPlanStatus: "process.discussing",
    workflowGuidance: {
      stage: "execution",
      summary: "1/3 T",
      nextsteps: ["Resume."],
      notes: "Note.",
      nextTask: { id: 2, title: "X", status: "pending" },
      commandHints: ["claw task done --id 2"],
    },
    planView: { collapsedSummary: "1/3 T", tasks: { items: [] } },
    plan: { title: "T" },
    hostActions: [],
  };
  const visible = compactClawOutput(output);
  assert.equal(visible.ok, true);
  assert.equal(visible.planStatus, "process.active");
  assert.equal(visible.stage, "execution");
  assert.equal(visible.planSummary, "1/3 T");
  assert.deepEqual(visible.nextsteps, ["Resume."]);
  assert.deepEqual(visible.commandHints, ["claw task done --id 2"]);
  assert.equal(
    visible.notes,
    "DSH route: every claw plan, task, or subplan mutation must use claw_run(operation, args). commandHints map to its operation and args syntax only; do not run them directly in pwsh or a shell. Note.",
  );
  assert.equal(visible.planPath, "P");
  // Non-whitelist fields never leak.
  assert.equal("hostActions" in visible, false);
  assert.equal("planView" in visible, false);
  assert.equal("previousPlanStatus" in visible, false);
  assert.equal("taskName" in visible, false);
  // Non-discussing plans do not carry the full plan document.
  assert.equal("plan" in visible, false);
});

test("compactClawOutput includes the plan document only in discussion", () => {
  const output = {
    planStatus: "process.discussing",
    workflowGuidance: { stage: "discussion" },
    plan: { title: "T" },
  };
  assert.equal(compactClawOutput(output).plan.title, "T");
});

test("compactClawOutput adds DSH route guidance without changing command hints", () => {
  const visible = compactClawOutput({
    command: "task.done",
    workflowGuidance: { commandHints: ["claw plan done"] },
  });
  assert.equal(
    visible.notes,
    "DSH route: every claw plan, task, or subplan mutation must use claw_run(operation, args). commandHints map to its operation and args syntax only; do not run them directly in pwsh or a shell.",
  );
  assert.deepEqual(visible.commandHints, ["claw plan done"]);
});

test("compactClawOutput does not add DSH route guidance to read-only operations", () => {
  const visible = compactClawOutput({ command: "plan.show", workflowGuidance: {} });
  assert.equal("notes" in visible, false);
});

test("compactClawOutput handles undefined output", () => {
  const visible = compactClawOutput(undefined);
  assert.equal(visible.ok, true);
  assert.equal(visible.command, "claw");
});

test("compactClawOutput surfaces search recall verbatim", () => {
  const output = {
    command: "search",
    scope: "project",
    storePath: "X",
    results: [
      { sourcePath: "a.md", kind: "truth_doc", snippet: "snip", score: 0.5, extra: "hidden" },
      { sourcePath: "b.md", kind: "adr_doc", snippet: "snip2" },
    ],
    count: 2,
  };
  const visible = compactClawOutput(output);
  assert.equal(visible.query, undefined); // no query in this fixture
  assert.deepEqual(visible.results, [
    { sourcePath: "a.md", kind: "truth_doc", snippet: "snip", score: 0.5 },
    { sourcePath: "b.md", kind: "adr_doc", snippet: "snip2" },
  ]);
  assert.equal(visible.count, 2);
  // Internal fields stay hidden.
  assert.equal("storePath" in visible, false);
  assert.equal("extra" in visible.results[0], false);
});

test("compactClawOutput keeps plan.show --simple projection visible", () => {
  const output = {
    status: "process.active",
    goal: { text: "Publish a release" },
    tasks: [
      { id: 1, title: "T1", status: "pending", detail: "d1", extra: "hidden" },
      { title: "T2" },
    ],
    rules: [],
  };
  const visible = compactClawOutput(output);
  assert.equal(visible.planStatus, "process.active");
  assert.equal(visible.goal, "Publish a release");
  assert.deepEqual(visible.tasks, [
    { id: 1, title: "T1", status: "pending", detail: "d1" },
    { title: "T2" },
  ]);
  // rules and per-task extras stay hidden.
  assert.equal("rules" in visible, false);
  assert.equal("extra" in visible.tasks[0], false);
});
