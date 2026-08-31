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
import { runNativeFinalizer } from "../scripts/knowledge-finalizer.mjs";

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

test("native knowledge finalizer keeps lifecycle ownership in CLI and SDK ownership in the adapter", async () => {
  const calls = [];
  class FakeCodex {
    constructor(options) { calls.push(["sdk", options]); }
    startThread(options) {
      calls.push(["thread", options]);
      return { id: "writer-session", run: async (prompt) => { calls.push(["run", prompt]); return { finalResponse: "deposited" }; } };
    }
  }
  const runClawCommand = (argv) => {
    calls.push(["claw", argv]);
    const command = argv[0] === "internal-knowledge-dispatch" ? argv[0] : argv.slice(0, 2).join(" ");
    const body = command === "knowledge claim"
      ? { ok: true, claimed: true, claimToken: "claim-token" }
      : command === "internal-knowledge-dispatch"
        ? { ok: true, projectRoot: "G:\\project", writer: { reasoningEffort: "medium" }, dispatch: { prompt: "write knowledge" } }
        : { ok: true };
    return { ok: true, stdout: JSON.stringify(body), stderr: "" };
  };

  await runNativeFinalizer("G:\\project\\job.json", { CodexClass: FakeCodex, runClawCommand });

  assert.deepEqual(calls.filter(([name]) => name === "claw").map(([, argv]) => argv[0] === "internal-knowledge-dispatch" ? argv[0] : argv.slice(0, 2).join(" ")), [
    "knowledge claim", "internal-knowledge-dispatch", "knowledge verify-session", "knowledge done",
  ]);
  const done = calls.find(([name, argv]) => name === "claw" && argv[0] === "knowledge" && argv[1] === "done")[1];
  assert.deepEqual(done.slice(-4), ["--status", "succeeded", "--result", "deposited"]);
  assert.equal(calls.find(([name]) => name === "run")[1], "write knowledge");
});

test("native knowledge finalizer never starts a writer after its claim has expired", async () => {
  const calls = [];
  class FakeCodex { constructor() { calls.push("sdk"); } }
  const runClawCommand = (argv) => {
    calls.push(argv.slice(0, 2).join(" "));
    return { ok: true, stdout: JSON.stringify({ ok: true, claimed: true, claimToken: "claim-token", expiresAt: "2000-01-01T00:00:00.000Z" }), stderr: "" };
  };
  await assert.rejects(() => runNativeFinalizer("G:\\project\\job.json", { CodexClass: FakeCodex, runClawCommand }), /expired before the writer could start/);
  assert.deepEqual(calls, ["knowledge claim", "knowledge done"]);
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

test("native Goal tool failures preserve the canonical mutation outcome as recoverable effect failures", async () => {
  const createFailure = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[1]] },
    hostTools: {
      get_goal: async () => ({ goal: null }),
      create_goal: async () => { throw new Error("permission denied"); },
    },
  });
  assert.deepEqual(createFailure.hostEffectFailures, [{ id: "mutation:create_goal", tool: "create_goal", message: "permission denied", syncRequired: true }]);
  const updateFailure = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[2]] },
    hostTools: {
      get_goal: async () => ({ goal: { status: "active" } }),
      update_goal: async () => { throw new Error("transport failed"); },
    },
  });
  assert.deepEqual(updateFailure.hostEffectFailures, [{ id: "mutation:update_goal", tool: "update_goal", message: "transport failed", syncRequired: true }]);
});

test("Goal actions preserve an active Goal and do not close an already closed Goal", async () => {
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
  assert.deepEqual(resume.goalRecovery, {
    reason: "Retained the existing unfinished Codex Goal; recovery creates a Goal only when none is unfinished.",
  });

  hostTools.get_goal = async () => ({ goal: { status: "complete" } });
  const done = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[2]] },
    hostTools,
    consumedIds,
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(done.consumedActionIds, ["mutation:update_goal"]);
});

test("a blocked Goal is retained during recovery and can be completed", async () => {
  const calls = [];
  const hostTools = {
    get_goal: async () => ({ goal: { status: "blocked" } }),
    create_goal: async () => calls.push("create_goal"),
    update_goal: async (input) => calls.push(["update_goal", input]),
  };
  const result = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[1]] },
    hostTools,
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result.goalRecovery, {
    reason: "Retained the existing unfinished Codex Goal; recovery creates a Goal only when none is unfinished.",
  });

  await consumeCodexHostActions({ result: { hostActions: [makeActions()[2]] }, hostTools });
  assert.deepEqual(calls, [["update_goal", { status: "complete" }]]);
});

test("an unrecognized nonterminal Goal state is retained", async () => {
  const calls = [];
  const result = await consumeCodexHostActions({
    result: { hostActions: [makeActions()[1]] },
    hostTools: {
      get_goal: async () => ({ goal: { status: "unknown_future_state" } }),
      create_goal: async () => calls.push("create_goal"),
      update_goal: async (input) => calls.push(["update_goal", input]),
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(result.goalRecovery.reason, "Retained the existing unfinished Codex Goal; recovery creates a Goal only when none is unfinished.");
});

test("Goal updates follow the allowed active and blocked transition matrix", async () => {
  const calls = [];
  let goalStatus = "active";
  const hostTools = {
    get_goal: async () => ({ goal: { status: goalStatus } }),
    update_goal: async (input) => calls.push(["update_goal", input]),
  };

  const blocked = { schemaVersion: 1, id: "active-blocked:update_goal", tool: "update_goal", input: { status: "blocked" } };
  await consumeCodexHostActions({ result: { hostActions: [blocked] }, hostTools });
  assert.deepEqual(calls, [["update_goal", { status: "blocked" }]]);
  calls.length = 0;

  goalStatus = "blocked";
  await consumeCodexHostActions({ result: { hostActions: [blocked] }, hostTools });
  assert.deepEqual(calls, []);

  goalStatus = "unknown_future_state";
  await consumeCodexHostActions({ result: { hostActions: [makeActions()[2]] }, hostTools });
  assert.deepEqual(calls, []);
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

test("program records unsupported Host actions as recoverable projection failures", async () => {
  const cases = [
    [{ ...makeActions()[0], schemaVersion: 2 }, /Unsupported hostAction schemaVersion/],
    [{ ...makeActions()[0], tool: "delete_plan" }, /Unsupported Codex hostAction tool/],
    [{ ...makeActions()[1], input: { objective: "work", priorStatus: "blocked" } }, /unsupported input fields: priorStatus/],
    [{ ...makeActions()[1], input: {} }, /objective must be a non-empty string/],
    [{ ...makeActions()[2], input: { status: "active" } }, /status must be complete or blocked/],
  ];
  for (const [action, expected] of cases) {
    const result = await consumeCodexHostActions({ result: { hostActions: [action] }, hostTools: { update_plan: async () => {} } });
    assert.match(result.hostEffectFailures?.[0]?.message ?? "", expected);
  }
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
  const driverSource = `async ({ argv, workdir, timeout_ms }, { tools, text }) => {
    const raw = await tools.shell_command({ command: "claw codex invoke " + argv.join("-"), workdir, timeout_ms });
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
            cacheKey: "claw-kit:codex-driver:v19:s1",
            driverVersion: 19,
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

  const actual = await runClawPlanMutation({ argv: ["plan", "start", "--requirements", "ready"], workdir: "G:\\example" });
  await runClawPlanMutation({ argv: ["plan", "edit", "--summary", "example"], workdir: "G:\\example" });

  assert.deepEqual(actual, { stage: "execution", planSummary: "1/2 example" });
  assert.equal("hostActions" in actual, false);
  assert.deepEqual(calls.map(([name]) => name), [
    "command", "command", "update_plan", "create_goal", "update_goal", "text",
    "command", "update_plan", "create_goal", "update_goal", "text",
  ]);
  assert.equal(calls.filter(([name, input]) => name === "command" && input.command === "claw codex driver").length, 1);
});

test("the embedded bootstrap uses exec_command when shell_command is unavailable", async () => {
  const skill = await fs.readFile(path.resolve(hooksDir, "..", "skills", "using-claw-kit", "SKILL.md"), "utf8");
  const match = skill.match(/```javascript\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, "using-claw-kit must embed the short code-mode bootstrap");

  const calls = [];
  const driverSource = `async ({ argv, workdir, timeout_ms }, { tools, text }) => {
    const raw = await tools.exec_command({ cmd: "claw codex invoke " + argv.join("-"), workdir, yield_time_ms: timeout_ms });
    const parsed = JSON.parse(raw);
    const visible = { stage: parsed.stage, planSummary: parsed.planSummary };
    text(JSON.stringify(visible));
    return visible;
  }`;
  const cache = new Map();
  const context = vm.createContext({
    tools: {
      exec_command: async (options) => {
        calls.push(["exec_command", options]);
        if (options.cmd === "claw codex driver") {
          return JSON.stringify({
            ok: true,
            cacheKey: "claw-kit:codex-driver:v19:s1",
            driverVersion: 19,
            hostActionSchemaVersion: 1,
            source: driverSource,
          });
        }
        return JSON.stringify({ ok: true, stage: "execution", planSummary: "1/2 example" });
      },
    },
    text: (value) => calls.push(["text", value]),
    load: (key) => cache.get(key),
    store: (key, value) => cache.set(key, value),
    JSON, Error, eval,
  });
  const runClawPlanMutation = vm.runInContext(`${match[1]}\nrunClawPlanMutation`, context);

  const actual = await runClawPlanMutation({ argv: ["plan", "start", "--requirements", "ready"], workdir: "G:\\example" });

  assert.deepEqual(actual, { stage: "execution", planSummary: "1/2 example" });
  assert.deepEqual(calls.map(([name]) => name), ["exec_command", "exec_command", "text"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {
    cmd: "claw codex driver",
    workdir: "G:\\example",
    yield_time_ms: 30000,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), {
    cmd: "claw codex invoke plan-start---requirements-ready",
    workdir: "G:\\example",
    yield_time_ms: 30000,
  });
});
