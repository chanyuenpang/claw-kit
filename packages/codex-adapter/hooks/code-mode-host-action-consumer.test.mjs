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

function makeActions() {
  return [
    {
      schemaVersion: 1,
      id: "mutation:update_plan",
      tool: "update_plan",
      input: { explanation: "sync", plan: [{ step: "work", status: "in_progress" }] },
    },
    {
      schemaVersion: 1,
      id: "mutation:create_goal",
      tool: "create_goal",
      input: { objective: "finish work" },
      meta: { allowOverwrite: true, reason: "policy only" },
    },
    {
      schemaVersion: 1,
      id: "mutation:update_goal",
      tool: "update_goal",
      input: { status: "complete" },
      meta: { reason: "policy only" },
    },
  ];
}

test("parseClawCommandResult extracts the first complete CLI JSON object", () => {
  const parsed = parseClawCommandResult(`Exit code: 0\nOutput:\n${JSON.stringify({ ok: true, command: "plan.edit" })}\ntrailer`);
  assert.deepEqual(parsed, { ok: true, command: "plan.edit" });
});

test("program consumes every supported host action in order and passes only input", async () => {
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
    ["create_goal", result.hostActions[1].input],
    ["update_goal", result.hostActions[2].input],
  ]);
  assert.deepEqual(consumption.consumedActionIds, result.hostActions.map((action) => action.id));
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

test("program rejects unsupported schema, tools, and leaked policy fields", async () => {
  const hostTools = { update_plan: async () => {} };
  await assert.rejects(
    consumeCodexHostActions({ result: { hostActions: [{ ...makeActions()[0], schemaVersion: 2 }] }, hostTools }),
    /Unsupported hostAction schemaVersion/,
  );
  await assert.rejects(
    consumeCodexHostActions({ result: { hostActions: [{ ...makeActions()[0], tool: "delete_plan" }] }, hostTools }),
    /Unsupported Codex hostAction tool/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ ...makeActions()[1], input: { objective: "work", allowOverwrite: true } }] },
      hostTools: { create_goal: async () => {} },
    }),
    /unsupported input fields: allowOverwrite/,
  );
});

test("failed host actions remain retryable by id", async () => {
  const action = makeActions()[0];
  const consumedIds = new Set();
  let attempts = 0;
  const hostTools = {
    update_plan: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
    },
  };

  await assert.rejects(consumeCodexHostActions({ result: { hostActions: [action] }, hostTools, consumedIds }), /temporary failure/);
  assert.equal(consumedIds.has(action.id), false);
  await consumeCodexHostActions({ result: { hostActions: [action] }, hostTools, consumedIds });
  assert.equal(attempts, 2);
  assert.equal(consumedIds.has(action.id), true);
});

test("runCodexPlanMutation keeps CLI mutation and host consumption in one program", async () => {
  const calls = [];
  const result = { ok: true, command: "plan.done", hostActions: makeActions() };
  const run = await runCodexPlanMutation({
    command: "claw plan done --task example --summary done",
    runCommand: async (command) => {
      calls.push(["command", command]);
      return JSON.stringify(result);
    },
    hostTools: {
      update_plan: async () => calls.push(["host", "update_plan"]),
      create_goal: async () => calls.push(["host", "create_goal"]),
      update_goal: async () => calls.push(["host", "update_goal"]),
    },
  });

  assert.deepEqual(calls.map((call) => call[0] === "command" ? call[0] : call[1]), [
    "command",
    "update_plan",
    "create_goal",
    "update_goal",
  ]);
  assert.equal(run.result.command, "plan.done");
});

test("the driver embedded in using-claw-kit runs unchanged in an isolated code-mode context", async () => {
  const skill = await fs.readFile(path.resolve(hooksDir, "..", "skills", "using-claw-kit", "SKILL.md"), "utf8");
  const match = skill.match(/```javascript\n([\s\S]*?)\n```/);
  assert.ok(match, "using-claw-kit must embed the fixed code-mode driver");

  const calls = [];
  const result = { ok: true, command: "plan.start", hostActions: makeActions() };
  const context = vm.createContext({
    tools: {
      shell_command: async (options) => {
        calls.push(["command", options]);
        return `Exit code: 0\nOutput:\n${JSON.stringify(result)}`;
      },
      update_plan: async (input) => calls.push(["update_plan", input]),
      create_goal: async (input) => calls.push(["create_goal", input]),
      update_goal: async (input) => calls.push(["update_goal", input]),
    },
    text: (value) => calls.push(["text", value]),
    Set,
    JSON,
    Error,
    Object,
  });
  const runClawPlanMutation = vm.runInContext(`${match[1]}\nrunClawPlanMutation`, context);

  const actual = await runClawPlanMutation({ command: "claw plan start --task example", workdir: "G:\\example" });

  assert.equal(actual.command, "plan.start");
  assert.deepEqual(calls.map(([name]) => name), ["command", "update_plan", "create_goal", "update_goal", "text"]);
});
