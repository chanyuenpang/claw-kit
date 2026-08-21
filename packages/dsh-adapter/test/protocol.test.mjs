import { test } from "node:test";
import assert from "node:assert/strict";
import { daemonInput, renderGuidanceSnapshot } from "../lib/protocol.js";

test("plan.create maps title/goal/scope/template to daemon input", () => {
  assert.deepEqual(
    daemonInput("plan.create", { title: "T", goal: "G", scope: "session" }),
    { title: "T", goalText: "G", scope: "session" },
  );
  assert.deepEqual(
    daemonInput("plan.create", { title: "T", template: "default" }),
    { title: "T", templateName: "default" },
  );
  assert.deepEqual(
    daemonInput("plan.create", { title: "T", template_file: "x.json" }),
    { title: "T", templateFile: "x.json" },
  );
});

test("plan.start maps requirements/acceptance/add_tasks to updates/appendTasks", () => {
  assert.deepEqual(
    daemonInput("plan.start", { requirements: "R", acceptance: ["A1", "A2"] }),
    { updates: { requirementsSummary: "R", acceptanceCriteria: ["A1", "A2"] } },
  );
  assert.deepEqual(
    daemonInput("plan.start", { add_tasks: [{ title: "X" }] }),
    { appendTasks: [{ title: "X" }] },
  );
  assert.deepEqual(daemonInput("plan.start", {}), {});
});

test("plan.resume restates the status operation; plan.wait is empty", () => {
  assert.deepEqual(
    daemonInput("plan.resume", {}),
    { operations: [{ type: "plan.status", status: "process.active" }] },
  );
  assert.deepEqual(daemonInput("plan.wait", {}), {});
});

test("plan.edit builds plan.update / plan.status operations", () => {
  assert.deepEqual(
    daemonInput("plan.edit", { goal: "G", summary: "S" }),
    { operations: [{ type: "plan.update", updates: { goalText: "G", planSummary: "S" } }] },
  );
  assert.deepEqual(
    daemonInput("plan.edit", { status: "process.active" }),
    { operations: [{ type: "plan.status", status: "process.active" }] },
  );
});

test("plan.done maps retrospective and key_decision", () => {
  assert.deepEqual(
    daemonInput("plan.done", { retrospective: "R", key_decision: "K" }),
    { retrospectiveSummary: "R", keyDecisions: ["K"] },
  );
});

test("task.done accepts single id or explicit tasks array", () => {
  assert.deepEqual(daemonInput("task.done", { id: 3 }), { tasks: [{ id: 3 }] });
  assert.deepEqual(
    daemonInput("task.done", { tasks: [{ id: 1 }, { id: 2 }] }),
    { tasks: [{ id: 1 }, { id: 2 }] },
  );
});

test("task.add / task.edit / subplan.create / search map canonical fields", () => {
  assert.deepEqual(daemonInput("task.add", { title: "X", detail: "D" }), { tasks: [{ title: "X", detail: "D" }] });
  assert.deepEqual(daemonInput("task.edit", { id: 2, title: "N" }), { taskId: 2, taskTitle: "N" });
  assert.deepEqual(daemonInput("subplan.create", { parent: "P", task_id: 5 }), { parentTaskName: "P", parentTaskId: 5 });
  assert.deepEqual(daemonInput("search", { query: "q" }), { query: "q" });
});

test("unknown operations pass args through untouched", () => {
  assert.deepEqual(daemonInput("knowledge.wait", { finalize_id: "f" }), { finalize_id: "f" });
});

test("renderGuidanceSnapshot renders the compact workflow snapshot", () => {
  const text = renderGuidanceSnapshot({
    activeWorkflow: {
      planSummary: "1/3 Build the thing",
      planStatus: "process.active",
      workflowGuidance: {
        stage: "execution",
        nextTask: { id: 2, title: "Implement", status: "pending" },
        nextsteps: ["Resume with task #2.", "Run `claw task done --id 2`."],
      },
    },
  });
  assert.match(text, /Plan: 1\/3 Build the thing/);
  assert.match(text, /Status: process\.active/);
  assert.match(text, /Stage: execution/);
  assert.match(text, /Current task: Implement/);
  assert.match(text, /Next steps:/);
  assert.match(text, /Resume with task #2/);
});

test("renderGuidanceSnapshot returns empty for absent workflow or guidance", () => {
  assert.equal(renderGuidanceSnapshot(undefined), "");
  assert.equal(renderGuidanceSnapshot({}), "");
  assert.equal(renderGuidanceSnapshot({ activeWorkflow: { planStatus: "process.wait" } }), "");
});

test("renderGuidanceSnapshot emits version-sync notice when CLI lags", () => {
  const text = renderGuidanceSnapshot({
    startupRecovery: {
      versionSync: {
        cliVersion: "0.2.24",
        latestPublishedVersion: "0.2.25",
        cliVersionLagging: true,
        updateAvailable: true,
        updateSkill: "claw-kit:update",
      },
    },
    project: { projectName: "claw-kit" },
  });
  assert.match(text, /newer claw-kit version is available/);
  assert.match(text, /installed CLI 0\.2\.24, published latest 0\.2\.25/);
  assert.match(text, /claw project claw-kit/);
});

test("renderGuidanceSnapshot falls back to project context without a workflow", () => {
  const text = renderGuidanceSnapshot({
    project: { projectId: "p-123", projectName: "Sample" },
    searchGuidance: "Use claw search before rg.",
  });
  assert.match(text, /claw project Sample/);
  assert.match(text, /Load the using-claw-kit skill as the main workflow skill/);
  assert.match(text, /Use claw search before rg/);
});

test("renderGuidanceSnapshot flags protocol check failures", () => {
  const text = renderGuidanceSnapshot({
    project: { projectName: "P" },
    protocolCheck: { ok: false },
  });
  assert.match(text, /protocol needs attention/);
});

test("renderGuidanceSnapshot normalizes flat claw/execute output", () => {
  // plan.start / task.done daemon output carries workflow fields at the top
  // level; the renderer must treat it like an activeWorkflow snapshot so the
  // injected [claw workflow] context stays current after every mutation.
  const text = renderGuidanceSnapshot({
    planSummary: "3/5 In progress",
    planStatus: "process.active",
    workflowGuidance: {
      stage: "execution",
      nextTask: { id: 4, title: "Verify Codex", status: "pending" },
      nextsteps: ["Continue with task #4."],
    },
  });
  assert.match(text, /Plan: 3\/5 In progress/);
  assert.match(text, /Status: process\.active/);
  assert.match(text, /Stage: execution/);
  assert.match(text, /Current task: Verify Codex/);
  assert.match(text, /Continue with task #4/);
});
