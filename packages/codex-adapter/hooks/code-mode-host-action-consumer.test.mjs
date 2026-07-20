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
    },
    {
      schemaVersion: 1,
      id: "mutation:update_goal",
      tool: "update_goal",
      input: { status: "complete" },
    },
  ];
}

test("parseClawCommandResult extracts the first complete CLI JSON object", () => {
  const parsed = parseClawCommandResult(`Exit code: 0\nOutput:\n${JSON.stringify({ ok: true, command: "plan.edit" })}\ntrailer`);
  assert.deepEqual(parsed, { ok: true, command: "plan.edit" });
});

test("program dispatches each native plan and Goal action exactly once", async () => {
  const calls = [];
  let goalStatus = "complete";
  const result = { hostActions: makeActions() };
  const hostTools = {
    update_plan: async (input) => calls.push(["update_plan", input]),
    get_goal: async () => ({ goal: { status: goalStatus } }),
    create_goal: async (input) => { calls.push(["create_goal", input]); goalStatus = "active"; },
    update_goal: async (input) => { calls.push(["update_goal", input]); goalStatus = "complete"; },
  };

  const consumption = await consumeCodexHostActions({ result, hostTools });

  assert.deepEqual(calls, [
    ["update_plan", result.hostActions[0].input],
    ["create_goal", { objective: "finish work" }],
    ["update_goal", { status: "complete" }],
  ]);
  assert.deepEqual(consumption.consumedActionIds, result.hostActions.map((action) => action.id));
});

test("native Goal tool failures propagate unchanged for Agent-level outcome handling", async () => {
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [makeActions()[1]] },
      hostTools: {
        get_goal: async () => ({ goal: null }),
        create_goal: async () => { throw new Error("permission denied"); },
      },
    }),
    /permission denied/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [makeActions()[2]] },
      hostTools: {
        get_goal: async () => ({ goal: { status: "active" } }),
        update_goal: async () => { throw new Error("transport failed"); },
      },
    }),
    /transport failed/,
  );
});

test("Goal actions reuse an active Goal and do not close an already closed Goal", async () => {
  const calls = [];
  const consumedIds = new Set();
  const hostTools = {
    get_goal: async () => ({ goal: { status: "active" } }),
    create_goal: async () => calls.push("create_goal"),
    update_goal: async () => calls.push("update_goal"),
  };

  const resume = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[1]] },
    hostTools,
    consumedIds,
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(resume.consumedActionIds, ["mutation:create_goal"]);

  hostTools.get_goal = async () => ({ goal: { status: "complete" } });
  const done = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[2]] },
    hostTools,
    consumedIds,
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(done.consumedActionIds, ["mutation:update_goal"]);
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

test("program rejects unsupported schema, tools, and invalid native Goal inputs", async () => {
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
      result: { hostActions: [{ ...makeActions()[1], input: { objective: "work", priorStatus: "blocked" } }] },
      hostTools: {},
    }),
    /unsupported input fields: priorStatus/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ ...makeActions()[1], input: {} }] },
      hostTools: {},
    }),
    /objective must be a non-empty string/,
  );
  await assert.rejects(
    consumeCodexHostActions({
      result: { hostActions: [{ ...makeActions()[2], input: { status: "active" } }] },
      hostTools: {},
    }),
    /status must be complete or blocked/,
  );
});

test("runCodexPlanMutation keeps CLI mutation and direct host dispatch in one program", async () => {
  const calls = [];
  let goalStatus = "complete";
  const result = { ok: true, command: "plan.done", hostActions: makeActions() };
  const run = await runCodexPlanMutation({
    command: "claw plan done --retrospective done",
    runCommand: async (command) => { calls.push(["command", command]); return JSON.stringify(result); },
    hostTools: {
      update_plan: async () => calls.push(["host", "update_plan"]),
      get_goal: async () => ({ goal: { status: goalStatus } }),
      create_goal: async () => { calls.push(["host", "create_goal"]); goalStatus = "active"; },
      update_goal: async () => { calls.push(["host", "update_goal"]); goalStatus = "complete"; },
    },
  });

  assert.deepEqual(calls.map((call) => call[0] === "command" ? call[0] : call[1]), [
    "command", "update_plan", "create_goal", "update_goal",
  ]);
  assert.equal(run.result.command, "plan.done");
});

test("the embedded bootstrap caches the CLI driver and dispatches native host actions", async () => {
  const skill = await fs.readFile(path.resolve(hooksDir, "..", "skills", "using-claw-kit", "SKILL.md"), "utf8");
  const match = skill.match(/```javascript\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, "using-claw-kit must embed the short code-mode bootstrap");

  const calls = [];
  const result = { ok: true, command: "plan.start", stage: "execution", planSummary: "1/2 example", hostActions: makeActions() };
  const driverSource = `async ({ command, workdir, timeout_ms }, { tools, text }) => {
    const raw = await tools.shell_command({ command: command + " --host codex", workdir, timeout_ms });
    const parsed = JSON.parse(raw);
    for (const action of parsed.hostActions ?? []) await tools[action.tool](action.input);
    const visible = { stage: parsed.stage, planSummary: parsed.planSummary };
    text(JSON.stringify(visible));
    return visible;
  }`;
  const cache = new Map();
  const context = vm.createContext({
    tools: {
      shell_command: async (options) => {
        calls.push(["command", options]);
        if (options.command === "claw codex driver") {
          return JSON.stringify({
            ok: true,
            cacheKey: "claw-kit:codex-driver:v6:s1",
            driverVersion: 6,
            hostActionSchemaVersion: 1,
            source: driverSource,
          });
        }
        return JSON.stringify(result);
      },
      update_plan: async (input) => calls.push(["update_plan", input]),
      create_goal: async (input) => calls.push(["create_goal", input]),
      update_goal: async (input) => calls.push(["update_goal", input]),
    },
    text: (value) => calls.push(["text", value]),
    load: (key) => cache.get(key),
    store: (key, value) => cache.set(key, value),
    Set, JSON, Error, Object, String, Map, eval,
  });
  const runClawPlanMutation = vm.runInContext(`${match[1]}\nrunClawPlanMutation`, context);

  const actual = await runClawPlanMutation({ command: "claw plan start --requirements ready", workdir: "G:\\example" });
  await runClawPlanMutation({ command: "claw plan edit --summary example", workdir: "G:\\example" });

  assert.deepEqual(actual, { stage: "execution", planSummary: "1/2 example" });
  assert.equal("hostActions" in actual, false);
  assert.deepEqual(calls.map(([name]) => name), [
    "command", "command", "update_plan", "create_goal", "update_goal", "text",
    "command", "update_plan", "create_goal", "update_goal", "text",
  ]);
  assert.equal(calls.filter(([name, input]) => name === "command" && input.command === "claw codex driver").length, 1);
});
