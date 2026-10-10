import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { daemonInput, isUncertainConnectionFailure, isUnknownCommandOutcome, operationFailureError, renderGuidanceSnapshot } from "../lib/protocol.js";

test("uncertain transport failures are identified so callers do not replay a mutation", () => {
  assert.equal(isUncertainConnectionFailure("SESSION_CONNECTION_LOST: pipe closed"), true);
  assert.equal(isUncertainConnectionFailure("claw session timeout"), true);
  assert.equal(isUncertainConnectionFailure("connection was interrupted after request"), true);
  assert.equal(isUncertainConnectionFailure("validation rejected the task id"), false);
});

test("owner outcomes override transport-looking text and retain partial-effect evidence", () => {
  assert.equal(isUnknownCommandOutcome({ outcome: "known", message: "session connection rejected this task" }), false);
  assert.equal(isUnknownCommandOutcome({ outcome: "unknown", message: "opaque failure" }), true);
  assert.equal(isUnknownCommandOutcome({ message: "SESSION_CONNECTION_LOST" }), true);
  const error = operationFailureError("subplan.create", { code: "PLAN_STALE_EDIT", message: "changed", outcome: "known", phase: "commit", effect: "partial" });
  assert.equal(error.code, "PLAN_STALE_EDIT");
  assert.equal(error.effect, "partial");
  assert.match(error.message, /phase=commit/);
  assert.match(error.message, /do not replay/);
});

test("plan.create maps capture intent and rejects removed scope", () => {
  assert.deepEqual(
    daemonInput("plan.create", { title: "T", goal: "G", knowledge_capture: false }),
    { title: "T", goalText: "G", knowledgeCapture: false },
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

test("removed scope is not silently converted and invalid capture reaches owner validation", () => {
  assert.deepEqual(daemonInput("plan.create", { title: "T", tasks: [{ title: "Do it" }] }), { title: "T", tasks: [{ title: "Do it" }] });
  assert.throws(() => daemonInput("plan.create", { title: "T", scope: "session" }), /scope/);
  assert.deepEqual(daemonInput("plan.create", { title: "T", knowledge_capture: "false" }), { title: "T", knowledgeCapture: "false" });
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

test("implicit subplan input never invents a parent name or task zero", () => {
  assert.deepEqual(daemonInput("subplan.create", {}), {});
  assert.deepEqual(daemonInput("subplan.create", { template_file: "writer.json" }), { templateFile: "writer.json" });
  assert.throws(() => daemonInput("subplan.create", { session_id: "other" }), /Unsupported/);
});

test("task.add / task.edit / subplan.create / search map canonical fields", () => {
  assert.deepEqual(daemonInput("task.add", { title: "X", detail: "D" }), { tasks: [{ title: "X", detail: "D" }] });
  assert.deepEqual(daemonInput("task.add", { tasks: [{ title: "X" }, { title: "Y" }] }), { tasks: [{ title: "X" }, { title: "Y" }] });
  assert.deepEqual(daemonInput("task.edit", { id: 2, title: "N" }), { taskId: 2, taskTitle: "N" });
  assert.deepEqual(daemonInput("subplan.create", { parent: "P", task_id: 5 }), { parentTaskName: "P", parentTaskId: 5 });
  assert.deepEqual(daemonInput("task.remove", { id: 3 }), { tasks: [{ id: 3 }] });
  assert.deepEqual(daemonInput("task.remove", { task_ids: [1, "2"] }), { tasks: [{ id: 1 }, { id: 2 }] });
  assert.throws(() => daemonInput("task.remove", { id: "x" }), /integer task id/);
  assert.deepEqual(daemonInput("search", { query: "q" }), { query: "q" });
  assert.deepEqual(daemonInput("search.index.refresh", {}), {});
  assert.throws(
    () => daemonInput("search.index.refresh", { dir: "G:/Projects/other" }),
    (error) => error.message === "Unsupported search.index.refresh argument(s): dir",
  );
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

test("knowledge operations map strict snake_case arguments", () => {
  const finalize_id = "a".repeat(64);
  assert.deepEqual(daemonInput("knowledge.claim", { finalize_id }), { finalizeId: finalize_id });
  assert.deepEqual(daemonInput("knowledge.done", { finalize_id, claim_token: "token", status: "succeeded", result: "ok" }),
    { finalizeId: finalize_id, claimToken: "token", status: "succeeded", result: "ok" });
  assert.deepEqual(daemonInput("knowledge.done", { finalize_id, claim_token: "token", status: "failed", error: "oops" }),
    { finalizeId: finalize_id, claimToken: "token", status: "failed", error: "oops" });
  for (const [operation, args] of [
    ["knowledge.claim", { finalize_id, job: "outside" }],
    ["knowledge.claim", { finalize_id: "../wrong" }],
    ["knowledge.done", { finalize_id, claim_token: "", status: "succeeded", result: "ok" }],
    ["knowledge.done", { finalize_id, claim_token: "token", status: "failed", result: "ok" }],
    ["knowledge.done", { finalize_id, claim_token: "token", status: "succeeded", result: "ok", error: "bad" }],
    ["knowledge.done", { finalize_id, claim_token: "token", status: "succeeded", result: "ok", job_path: "other" }],
  ]) assert.throws(() => daemonInput(operation, args));
});

test("unknown operations are rejected at the model command boundary", () => {
  assert.throws(() => daemonInput("knowledge.wait", { finalize_id: "f" }), /outside the model command contract/);
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

test("DSH prompt registration retains identity before context recovery succeeds", () => {
  const source = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /text:[^\n]*=>\s*guidanceByAgent\.get\(context\.scope\)\s*\|\|\s*renderGuidanceSnapshot\(undefined\)/);
  assert.match(renderGuidanceSnapshot(undefined), /^\[claw host\]\nplatform: dsh\n/);
});

test("renderGuidanceSnapshot retains adapter identity without a workflow", () => {
  for (const context of [undefined, {}, { activeWorkflow: { planStatus: "process.wait" } }]) {
    const text = renderGuidanceSnapshot(context);
    assert.match(text, /^\[claw host\]\nplatform: dsh\n/);
    assert.doesNotMatch(text, /\[claw workflow\]|snapshot is recovered/);
  }
});

test("DSH identity is fixed by the adapter, not model provider or stale skill paths", () => {
  const context = { model: "codex", provider: "openai", platform: "cindy", skillPath: ".agents/skills/using-claw-kit", project: { projectName: "P" } };
  const before = JSON.stringify(context);
  const first = renderGuidanceSnapshot(context);
  assert.match(first, /^\[claw host\]\nplatform: dsh\n/);
  assert.equal(renderGuidanceSnapshot(context), first);
  assert.equal(JSON.stringify(context), before);
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
