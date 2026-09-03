import { test } from "node:test";
import assert from "node:assert/strict";
import { daemonInput, isUncertainConnectionFailure, renderGuidanceSnapshot } from "../lib/protocol.js";

test("uncertain transport failures are identified so callers do not replay a mutation", () => {
  assert.equal(isUncertainConnectionFailure("SESSION_CONNECTION_LOST: pipe closed"), true);
  assert.equal(isUncertainConnectionFailure("claw session timeout"), true);
  assert.equal(isUncertainConnectionFailure("connection was interrupted after request"), true);
  assert.equal(isUncertainConnectionFailure("validation rejected the task id"), false);
});

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

test("plan.start maps the full plan field set and appended tasks", () => {
  assert.deepEqual(
    daemonInput("plan.start", {
      goal: "G",
      requirements: "R",
      questions: ["Q"],
      acceptance: ["A1", "A2"],
      rules: ["Rule"],
      key_decisions: ["Decision"],
      references: [{ path: "report.md", why: "Evidence" }],
      add_tasks: [{ title: "X" }],
    }),
    {
      updates: {
        goalText: "G",
        requirementsSummary: "R",
        openQuestions: ["Q"],
        acceptanceCriteria: ["A1", "A2"],
        rules: ["Rule"],
        keyDecisions: ["Decision"],
        references: [{ path: "report.md", why: "Evidence" }],
      },
      appendTasks: [{ title: "X" }],
    },
  );
  assert.deepEqual(daemonInput("plan.start", {}), {});
});

test("plan.resume maps an optional explicit plan id; plan.wait is empty", () => {
  assert.deepEqual(daemonInput("plan.resume", {}), {});
  assert.deepEqual(daemonInput("plan.resume", { plan_id: "task/child.json" }), { planId: "task/child.json" });
  assert.deepEqual(daemonInput("plan.wait", {}), {});
});

test("plan.edit maps all canonical plan fields and preserves explicit operation order", () => {
  assert.deepEqual(
    daemonInput("plan.edit", {
      goal: "G",
      requirements: "R",
      question: "Q",
      remove_questions: ["old Q"],
      acceptance: ["A"],
      remove_acceptance: ["old A"],
      summary: "S",
      rule: "Rule",
      remove_rules: ["old rule"],
      key_decision: "K",
      remove_key_decisions: ["old K"],
      reference: { path: "report.md", why: "Evidence" },
      remove_references: ["old.md"],
      retrospective: "Retro",
      what_worked: ["Tests"],
      issue: "Gap",
      follow_up: "Ship",
      status: "process.active",
    }),
    { operations: [
      { type: "plan.update", updates: {
        goalText: "G",
        requirementsSummary: "R",
        openQuestions: ["Q"],
        removeOpenQuestions: ["old Q"],
        acceptanceCriteria: ["A"],
        removeAcceptanceCriteria: ["old A"],
        planSummary: "S",
        rules: ["Rule"],
        removeRules: ["old rule"],
        keyDecisions: ["K"],
        removeKeyDecisions: ["old K"],
        references: [{ path: "report.md", why: "Evidence" }],
        removeReferencePaths: ["old.md"],
        retrospectiveSummary: "Retro",
        whatWorked: ["Tests"],
        issues: ["Gap"],
        followUps: ["Ship"],
      } },
      { type: "plan.status", status: "process.active" },
    ] },
  );
  const operations = [
    { type: "plan.update", updates: { references: [{ path: "a.md", why: "First" }] } },
    { type: "plan.status", status: "process.wait" },
    { type: "plan.update", updates: { planSummary: "After wait" } },
  ];
  assert.deepEqual(daemonInput("plan.edit", { operations }), { operations });
  assert.throws(
    () => daemonInput("plan.edit", { operations, reference: { path: "b.md", why: "mixed" } }),
    (error) => error.message === "plan.edit operations cannot be combined with mapped field arguments: reference",
  );
});

test("plan.done maps the complete closeout field set", () => {
  assert.deepEqual(
    daemonInput("plan.done", {
      retrospective: "R",
      key_decisions: ["K1", "K2"],
      what_worked: ["W"],
      issues: ["I"],
      follow_ups: ["F"],
    }),
    {
      retrospectiveSummary: "R",
      keyDecisions: ["K1", "K2"],
      whatWorked: ["W"],
      issues: ["I"],
      followUps: ["F"],
    },
  );
});

test("task.done maps choice aliases for single and batch completion", () => {
  assert.deepEqual(daemonInput("task.done", { id: 3, choice: "yes" }), { tasks: [{ id: 3, choiceId: "yes" }] });
  assert.deepEqual(
    daemonInput("task.done", { tasks: [{ id: 1, choice: "a" }, { id: 2, choice_id: "b" }] }),
    { tasks: [{ id: 1, choiceId: "a" }, { id: 2, choiceId: "b" }] },
  );
});

test("task.add / task.edit / subplan.create / search map canonical fields", () => {
  assert.deepEqual(daemonInput("task.add", { title: "X", detail: "D" }), { tasks: [{ title: "X", detail: "D" }] });
  assert.deepEqual(daemonInput("task.add", { tasks: [{ title: "X" }, { title: "Y" }] }), { tasks: [{ title: "X" }, { title: "Y" }] });
  assert.deepEqual(daemonInput("task.edit", { id: 2, title: "N" }), { taskId: 2, taskTitle: "N" });
  assert.deepEqual(daemonInput("subplan.create", { parent: "P", task_id: 5 }), { parentTaskName: "P", parentTaskId: 5 });
  assert.deepEqual(daemonInput("search", { query: "q" }), { query: "q" });
});

test("known mapped operations reject unsupported arguments instead of silently dropping them", () => {
  assert.throws(
    () => daemonInput("plan.edit", { reference_path: "report.md" }),
    (error) => error.message === "Unsupported plan.edit argument(s): reference_path",
  );
  assert.throws(
    () => daemonInput("task.add", { tasks: [{ title: "X" }], ignored: true }),
    (error) => error.message === "Unsupported task.add argument(s): ignored",
  );
  assert.throws(
    () => daemonInput("task.edit", { id: 1, stauts: "completed" }),
    (error) => error.message === "Unsupported task.edit argument(s): stauts",
  );
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
  assert.match(text, /every claw plan, task, or subplan mutation must use claw_run\(operation, args\)/);
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
  assert.doesNotMatch(text, /every claw plan, task, or subplan mutation must use claw_run/);
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
