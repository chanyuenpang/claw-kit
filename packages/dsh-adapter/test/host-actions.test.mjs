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
    complete: (agent, ref) => complete(agent, ref),
  };
}

test("consumeHostActions: create_goal calls goals.create and reports consumed", () => {
  const calls = [];
  const goals = fakeGoal((agent, request) => calls.push(["create", request]));
  const { consumed, projection } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "O" } }],
    goals,
    { id: "agent-1" },
  );
  assert.deepEqual(consumed, ["a:create_goal"]);
  assert.equal(projection, undefined);
  assert.deepEqual(calls, [["create", { objective: "O" }]]);
});

test("consumeHostActions: update_goal complete/blocked completes the native goal", () => {
  const goals = fakeGoal();
  goals.create({}, { objective: "O" }); // seed an active goal
  const { consumed } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:update_goal", tool: "update_goal", input: { status: "complete" } }],
    goals,
    {},
  );
  assert.deepEqual(consumed, ["a:update_goal"]);
});

test("consumeHostActions: update_goal is skipped when no goal is active", () => {
  const { consumed } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:update_goal", tool: "update_goal", input: { status: "complete" } }],
    fakeGoal(),
    {},
  );
  assert.deepEqual(consumed, []);
});

test("consumeHostActions: update_plan returns the projection without consuming", () => {
  const action = { schemaVersion: 1, id: "a:update_plan", tool: "update_plan", input: { plan: [] } };
  const { consumed, projection } = consumeHostActions([action], fakeGoal(), {});
  assert.deepEqual(consumed, []);
  assert.equal(projection, action);
});

test("consumeHostActions: no goals service degrades to no consumption", () => {
  const { consumed } = consumeHostActions(
    [{ schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "O" } }],
    undefined,
    {},
  );
  assert.deepEqual(consumed, []);
});

test("consumeHostActions: consumer errors fail open", () => {
  const goals = fakeGoal(() => {
    throw new Error("boom");
  });
  assert.doesNotThrow(() =>
    consumeHostActions(
      [{ schemaVersion: 1, id: "a:create_goal", tool: "create_goal", input: { objective: "O" } }],
      goals,
      {},
    ),
  );
});

test("consumeHostActions: ignores non-v1 or malformed actions", () => {
  const goals = fakeGoal();
  const { consumed } = consumeHostActions(
    [
      { schemaVersion: 2, id: "x", tool: "create_goal", input: { objective: "O" } },
      { schemaVersion: 1, id: "y", tool: "mystery", input: {} },
    ],
    goals,
    {},
  );
  assert.deepEqual(consumed, []);
});

test("compactClawOutput keeps only the whitelist guidance fields", () => {
  const output = {
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
