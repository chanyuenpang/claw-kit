import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  consumeCodexHostActions,
  parseClawCommandResult,
  runCodexPlanMutation,
} from "../scripts/code-mode-host-action-consumer.mjs";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const unfinishedGoalError = () => new Error("cannot create a new goal because this thread has an unfinished goal; complete the existing goal first");
const noGoalError = () => new Error("this thread has no unfinished goal");

function makeActions() {
  return [
    {
      schemaVersion: 1,
      id: "mutation:update_plan",
      tool: "update_plan",
      input: { explanation: "sync", plan: [{ step: "work", status: "in_progress" }] },
    },
    {
      schemaVersion: 2,
      id: "mutation:ensure_goal:active",
      tool: "ensure_goal",
      input: { targetStatus: "active", objective: "finish work" },
      meta: { reason: "target state" },
    },
    {
      schemaVersion: 2,
      id: "mutation:ensure_goal:complete",
      tool: "ensure_goal",
      input: { targetStatus: "complete" },
      meta: { reason: "target state" },
    },
  ];
}

test("parseClawCommandResult extracts the first complete CLI JSON object", () => {
  const parsed = parseClawCommandResult(`Exit code: 0\nOutput:\n${JSON.stringify({ ok: true, command: "plan.edit" })}\ntrailer`);
  assert.deepEqual(parsed, { ok: true, command: "plan.edit" });
});

test("program consumes plan and goal target actions in order and ignores goalTool", async () => {
  const calls = [];
  const result = { hostActions: makeActions(), goalTool: { tool: "create_goal", objective: "must not execute" } };
  const hostTools = {
    update_plan: async (input) => calls.push(["update_plan", input]),
    create_goal: async (input) => calls.push(["create_goal", input]),
    update_goal: async (input) => calls.push(["update_goal", input]),
  };

  const consumption = await consumeCodexHostActions({ result, hostTools });

  assert.deepEqual(calls, [
    ["update_plan", result.hostActions[0].input],
    ["create_goal", { objective: "finish work" }],
    ["update_goal", { status: "complete" }],
  ]);
  assert.deepEqual(consumption.consumedActionIds, result.hostActions.map((action) => action.id));
});

test("active target replaces any unfinished goal without inspecting its prior status", async () => {
  const calls = [];
  let createAttempts = 0;
  const action = makeActions()[1];
  await consumeCodexHostActions({
    result: { hostActions: [action] },
    hostTools: {
      create_goal: async (input) => {
        calls.push(["create_goal", input]);
        createAttempts += 1;
        if (createAttempts === 1) throw unfinishedGoalError();
      },
      update_goal: async (input) => calls.push(["update_goal", input]),
    },
  });

  assert.deepEqual(calls, [
    ["create_goal", { objective: "finish work" }],
    ["update_goal", { status: "complete" }],
    ["create_goal", { objective: "finish work" }],
  ]);
});

test("terminal targets treat an absent unfinished goal as already satisfied", async () => {
  for (const targetStatus of ["blocked", "complete"]) {
    let calls = 0;
    await consumeCodexHostActions({
      result: { hostActions: [{ schemaVersion: 2, id: `mutation:${targetStatus}`, tool: "ensure_goal", input: { targetStatus } }] },
      hostTools: { update_goal: async () => { calls += 1; throw noGoalError(); } },
    });
    assert.equal(calls, 1);
  }
});

test("goal convergence fails closed for unexpected host errors", async () => {
  const active = makeActions()[1];
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [active] },
      hostTools: { create_goal: async () => { throw new Error("permission denied"); }, update_goal: async () => {} },
    }),
    /permission denied/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ schemaVersion: 2, id: "mutation:blocked", tool: "ensure_goal", input: { targetStatus: "blocked" } }] },
      hostTools: { update_goal: async () => { throw new Error("transport failed"); } },
    }),
    /transport failed/,
  );
});

test("program consumes an action id at most once", async () => {
  let calls = 0;
  const action = makeActions()[0];
  const consumedIds = new Set();
  const hostTools = { update_plan: async () => { calls += 1; } };

  await consumeCodexHostActions({ result: { hostActions: [action, action] }, hostTools, consumedIds });
  await consumeCodexHostActions({ result: { hostActions: [action] }, hostTools, consumedIds });

  assert.equal(calls, 1);
  assert.deepEqual([...consumedIds], [action.id]);
});

test("program rejects unsupported schema, tools, and invalid target inputs", async () => {
  await assert.rejects(
    consumeCodexHostActions({ result: { hostActions: [{ ...makeActions()[0], schemaVersion: 2 }] }, hostTools: { update_plan: async () => {} } }),
    /Unsupported hostAction schemaVersion/,
  );
  await assert.rejects(
    consumeCodexHostActions({ result: { hostActions: [{ ...makeActions()[0], tool: "delete_plan" }] }, hostTools: {} }),
    /Unsupported Codex hostAction tool/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ ...makeActions()[1], input: { targetStatus: "active", objective: "work", priorStatus: "blocked" } }] },
      hostTools: {},
    }),
    /unsupported input fields: priorStatus/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ ...makeActions()[1], input: { targetStatus: "active" } }] },
      hostTools: {},
    }),
    /objective must be a non-empty string/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ ...makeActions()[2], input: { targetStatus: "complete", objective: "not allowed" } }] },
      hostTools: {},
    }),
    /objective is only supported/,
  );
});

test("failed goal compensation remains retryable by action id", async () => {
  const action = makeActions()[1];
  const consumedIds = new Set();
  let updateAttempts = 0;
  let createAttempts = 0;
  const hostTools = {
    create_goal: async () => {
      createAttempts += 1;
      if (createAttempts <= 2) throw unfinishedGoalError();
    },
    update_goal: async () => {
      updateAttempts += 1;
      if (updateAttempts === 1) throw new Error("temporary failure");
    },
  };

  await assert.rejects(consumeCodexHostActions({ result: { hostActions: [action] }, hostTools, consumedIds }), /temporary failure/);
  assert.equal(consumedIds.has(action.id), false);
  await consumeCodexHostActions({ result: { hostActions: [action] }, hostTools, consumedIds });
  assert.equal(createAttempts, 3);
  assert.equal(updateAttempts, 2);
  assert.equal(consumedIds.has(action.id), true);
});

test("runCodexPlanMutation keeps CLI mutation and target convergence in one program", async () => {
  const calls = [];
  const result = { ok: true, command: "plan.done", hostActions: makeActions() };
  const run = await runCodexPlanMutation({
    command: "claw plan done --task example --summary done",
    runCommand: async (command) => { calls.push(["command", command]); return JSON.stringify(result); },
    hostTools: {
      update_plan: async () => calls.push(["host", "update_plan"]),
      create_goal: async () => calls.push(["host", "create_goal"]),
      update_goal: async () => calls.push(["host", "update_goal"]),
    },
  });

  assert.deepEqual(calls.map((call) => call[0] === "command" ? call[0] : call[1]), [
    "command", "update_plan", "create_goal", "update_goal",
  ]);
  assert.equal(run.result.command, "plan.done");
});

test("the embedded driver converges blocked goal to active in one code-mode call", async () => {
  const skill = await fs.readFile(path.resolve(hooksDir, "..", "skills", "using-claw-kit", "SKILL.md"), "utf8");
  const match = skill.match(/```javascript\n([\s\S]*?)\n```/);
  assert.ok(match, "using-claw-kit must embed the fixed code-mode driver");

  const calls = [];
  let createAttempts = 0;
  const result = { ok: true, command: "plan.start", hostActions: makeActions().slice(0, 2) };
  const context = vm.createContext({
    tools: {
      shell_command: async (options) => { calls.push(["command", options]); return `Exit code: 0\nOutput:\n${JSON.stringify(result)}`; },
      update_plan: async (input) => calls.push(["update_plan", input]),
      create_goal: async (input) => {
        calls.push(["create_goal", input]);
        createAttempts += 1;
        if (createAttempts === 1) throw unfinishedGoalError();
      },
      update_goal: async (input) => calls.push(["update_goal", input]),
    },
    text: (value) => calls.push(["text", value]),
    Set, JSON, Error, Object, String,
  });
  const runClawPlanMutation = vm.runInContext(`${match[1]}\nrunClawPlanMutation`, context);

  const actual = await runClawPlanMutation({ command: "claw plan start --task example", workdir: "G:\\example" });

  assert.equal(actual.command, "plan.start");
  assert.deepEqual(calls.map(([name]) => name), [
    "command", "update_plan", "create_goal", "update_goal", "create_goal", "text",
  ]);
});
