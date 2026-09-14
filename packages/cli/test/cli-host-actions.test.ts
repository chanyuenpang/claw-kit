import {
  test,
  after,
  assert,
  fs,
  os,
  path,
  spawn,
  spawnSync,
  fileURLToPath,
  shouldRunKnowledgeHook,
  opencodeKnowledgeFinalizerEnvironment,
  parseOpencodeRunOutput,
  resolveInvocationHost,
  withoutInvocationHost,
  CODEX_SDK_VERSION,
  resolveSessionWorkflowContext,
  tryEndKnowledgePlan,
  type JsonRecord,
  thisDir,
  cliPackageVersion,
  temporaryDirectories,
  createTemporaryDirectory,
  createFixture,
  localDateDirectory,
  taskDirectory,
  taskFile,
  taskFinalizerJobsDirectory,
  createPlanLikeTemplate,
  ISOLATED_ENV_KEYS,
  buildSpawnEnv,
  runClaw,
  runClawExpectFailure,
  runClawRaw,
  runGit,
  runClawHook,
  waitForCompletionRefreshStatus,
  waitForCondition,
  getLatestCompletionRefreshStatusFile,
  getCompletionRefreshStatusFiles,
  waitForLatestCompletionRefreshStatus,
  createGitnexusShim,
  createNpmShim,
  createClawUpdateNpmShim,
} from "./cli-test-support.js";


test("cli codex driver returns an executable versioned source envelope", async () => {
  const root = createFixture("codex-driver-envelope");
  const envelope = runClaw(["codex", "driver"], root, { CLAW_HOST: "" });
  assert.equal(envelope.command, "codex.driver");
  assert.equal(envelope.driverVersion, 22);
  assert.equal(envelope.hostActionSchemaVersion, 1);
  assert.equal(envelope.cacheKey, "claw-kit:codex-driver:v22:s1");
  assert.match(String(envelope.sha256), /^[a-f0-9]{64}$/);

  const runner = (0, eval)(`(${String(envelope.source)})`) as (
    input: Record<string, unknown>,
    runtime: Record<string, unknown>,
  ) => Promise<JsonRecord>;
  const calls: Array<[string, unknown]> = [];
  const mutationResult = {
    ok: true,
    command: "plan.done",
    stage: "done",
    planSummary: "2/2 Demo",
    planPath: "G:\\example\\.claw\\tasks\\demo\\plan.json",
    planStatus: "end.completed",
    mutationId: "mutation",
    nextsteps: ["Start the next task through using-claw-kit."],
    notes: "Keep the route in view.",
    achievement: {
      status: "end.completed",
      title: "Demo",
      planSummary: "2/2 Demo",
      completedTasks: 2,
      totalTasks: 2,
      completedAt: "2026-07-19T00:00:00.000Z",
      retrospectiveSaved: true,
      keyDecisionsSaved: 1,
    },
    knowledgeDispatch: {
      schemaVersion: 1,
      policy: "subagent",
      finalizeId: "finalize-demo",
      prompt: "Use the internal knowledge delegate.",
    },
    hostActions: [
      {
        schemaVersion: 1,
        id: "mutation:create_goal",
        tool: "create_goal",
        input: { objective: "finish" },
      },
    ],
  };
  const actual = await runner(
    { argv: ["plan", "resume"], workdir: root },
    {
      tools: {
        shell_command: async (input: unknown) => {
          calls.push(["shell_command", input]);
          return JSON.stringify(mutationResult);
        },
        get_goal: async (input: unknown) => {
          calls.push(["get_goal", input]);
          return { goal: null };
        },
        create_goal: async (input: unknown) => calls.push(["create_goal", input]),
        update_goal: async (input: unknown) => calls.push(["update_goal", input]),
      },
      text: (input: unknown) => calls.push(["text", input]),
    },
  );

  assert.deepEqual(actual, {
    stage: "done",
    planSummary: "2/2 Demo",
    planPath: "G:\\example\\.claw\\tasks\\demo\\plan.json",
    planStatus: "end.completed",
    mutationId: "mutation",
    nextsteps: ["Start the next task through using-claw-kit."],
    notes: "Codex route: every claw plan, task, or subplan mutation must use the fixed code-mode driver. commandHints provide argv syntax only; do not run them directly in the shell. Keep the route in view.",
    achievement: mutationResult.achievement,
    knowledgeDispatch: mutationResult.knowledgeDispatch,
  });
  assert.equal("hostActions" in actual, false);
  assert.equal("command" in actual, false);
  assert.match(String((calls[0][1] as JsonRecord).command), /^claw codex invoke [a-f0-9]+$/);
  assert.deepEqual(calls.map(([name]) => name), ["shell_command", "get_goal", "create_goal", "text"]);
  assert.equal("hostActions" in JSON.parse(String(calls.at(-1)?.[1])), false);

  const recoveredEffect = await runner(
    { argv: ["plan", "edit", "--status", "process.active"], workdir: root },
    {
      tools: {
        shell_command: async () => JSON.stringify({
          ok: true,
          command: "plan.edit",
          stage: "execution",
          planPath: "G:\\example\\.claw\\tasks\\demo\\plan.json",
          planStatus: "process.active",
          mutationId: "mutation-effect-failure",
          hostActions: [{ schemaVersion: 1, id: "mutation-effect-failure:create_goal", tool: "create_goal", input: { objective: "continue" } }],
        }),
        get_goal: async () => ({ goal: null }),
        create_goal: async () => { throw new Error("Goal transport failed"); },
      },
      text: () => undefined,
    },
  );
  assert.deepEqual(recoveredEffect.hostEffectFailures, [{
    id: "mutation-effect-failure:create_goal",
    tool: "create_goal",
    message: "Goal transport failed",
  }]);
  assert.equal(recoveredEffect.planPath, "G:\\example\\.claw\\tasks\\demo\\plan.json");
  assert.equal(recoveredEffect.planStatus, "process.active");

  const taskGuidance = await runner(
    { argv: ["task", "edit", "--id", "2", "--status", "in_progress"], workdir: root },
    {
      tools: {
        shell_command: async () => JSON.stringify({
          ok: true,
          command: "task.edit",
          stage: "execution",
          nextsteps: ["Continue the current task."],
          notes: "Record completion only after the task is complete.",
        }),
      },
      text: () => {},
    },
  );
  assert.deepEqual(taskGuidance, {
    stage: "execution",
    nextsteps: ["Continue the current task."],
    notes: "Codex route: every claw plan, task, or subplan mutation must use the fixed code-mode driver. commandHints provide argv syntax only; do not run them directly in the shell. Record completion only after the task is complete.",
  });

  const execCalls: Array<[string, unknown]> = [];
  await runner(
    { argv: ["task", "done", "--id", "1"], workdir: root },
    {
      tools: {
        exec_command: async (input: unknown) => {
          execCalls.push(["exec_command", input]);
          return JSON.stringify({ ok: true, command: "task.done" });
        },
      },
      text: (input: unknown) => execCalls.push(["text", input]),
    },
  );
  assert.deepEqual(execCalls.map(([name]) => name), ["exec_command", "text"]);
  assert.match(String((execCalls[0][1] as JsonRecord).cmd), /^claw codex invoke [a-f0-9]+$/);
  assert.equal((execCalls[0][1] as JsonRecord).yield_time_ms, 30_000);

  const taskDoneActual = await runner(
    { argv: ["task", "done", "--id", "1"], workdir: root },
    {
      tools: {
        shell_command: async () => JSON.stringify({ ok: true, command: "task.done" }),
      },
      text: () => {},
    },
  );
  assert.deepEqual(taskDoneActual, {
    ok: true,
    command: "task.done",
    notes: "Codex route: every claw plan, task, or subplan mutation must use the fixed code-mode driver. commandHints provide argv syntax only; do not run them directly in the shell.",
  });
});

test("Codex driver silently repairs an outdated CLI once for plan create", async () => {
  const root = createFixture("codex-driver-cli-repair");
  const envelope = runClaw(["codex", "driver"], root, { CLAW_HOST: "" });
  const runner = (0, eval)(`(${String(envelope.source)})`) as (
    input: Record<string, unknown>,
    runtime: Record<string, unknown>,
  ) => Promise<JsonRecord>;
  const commands: string[] = [];
  let invocations = 0;

  await runner(
    { argv: ["plan", "create", "--title", "demo"], workdir: root, pluginVersion: "0.2.37.0" },
    {
      tools: {
        shell_command: async ({ command }: JsonRecord) => {
          commands.push(String(command));
          if (String(command).startsWith("npm install")) return { exit_code: 0, output: "" };
          invocations += 1;
          return invocations === 1
            ? JSON.stringify({ error: { code: "CLI_PLUGIN_VERSION_LAGGING", message: "CLI is outdated" } })
            : JSON.stringify({ ok: true, command: "plan.create", stage: "planning" });
        },
      },
      text: () => undefined,
    },
  );

  assert.equal(commands.length, 3);
  assert.equal(commands[1], "npm install --global @veewo/claw@0.2.37 --silent --no-audit --no-fund");
  const decodeInvocation = (command: string): string => {
    const hex = command.slice("claw codex invoke ".length);
    let value = "";
    for (let index = 0; index < hex.length; index += 4) value += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
    return value;
  };
  assert.deepEqual(JSON.parse(decodeInvocation(commands[0])), ["plan", "create", "--title", "demo", "--plugin-version", "0.2.37.0"]);
  assert.deepEqual(JSON.parse(decodeInvocation(commands[2])), ["plan", "create", "--title", "demo", "--plugin-version", "0.2.37.0"]);
});

test("Codex driver rejects legacy progress host actions", async () => {
  const root = createFixture("codex-driver-protocol-validation");
  const envelope = runClaw(["codex", "driver"], root);
  const runner = (0, eval)(`(${String(envelope.source)})`) as (
    input: Record<string, unknown>,
    runtime: Record<string, unknown>,
  ) => Promise<JsonRecord>;
  const validResult = {
    ok: true,
    command: "plan.edit",
    stage: "execution",
    hostActions: [{
      schemaVersion: 1,
      id: "edit:update_plan",
      tool: "update_plan",
      input: {
        explanation: "sync",
        plan: [{ step: "work", status: "in_progress" }],
      },
    }],
  };
  await assert.rejects(
    runner(
    { argv: ["plan", "edit", "--summary", "ready"], workdir: root },
    {
      tools: {
        shell_command: async () => `warning: ${JSON.stringify({ diagnostic: true })}\n${JSON.stringify(validResult)}`,
      },
      text: () => {},
    },
    ),
    /unsupported Codex hostAction/,
  );
});

test("Codex driver preserves structured CLI errors returned on stderr", async () => {
  const root = createFixture("codex-driver-cli-error");
  const envelope = runClaw(["codex", "driver"], root);
  const runner = (0, eval)(`(${String(envelope.source)})`) as (
    input: Record<string, unknown>,
    runtime: Record<string, unknown>,
  ) => Promise<JsonRecord>;

  await assert.rejects(
    runner(
      { argv: ["plan", "sync"], workdir: root },
      {
        tools: {
          shell_command: async () => ({
            stdout: "",
            stderr: JSON.stringify({
              error: {
                code: "PROJECT_CONFIG_INVALID",
                message: "No plan is bound to this Codex session.",
              },
            }),
          }),
        },
        text: () => {},
      },
    ),
    /claw mutation failed \[PROJECT_CONFIG_INVALID\]: No plan is bound to this Codex session\./,
  );
});

test("codex invoke preserves structured user values without shell interpretation", () => {
  const root = createFixture("codex-structured-invoke");
  runClaw(["init", "--name", "Codex Structured Invoke", "--planning", "false"], root);
  const title = "literal $(Get-ChildItem); --host opencode";
  const argv = ["plan", "create", "--title", title, "--goal", "Keep every value literal"];
  const json = JSON.stringify(argv);
  let encoded = "";
  for (let index = 0; index < json.length; index += 1) {
    encoded += json.charCodeAt(index).toString(16).padStart(4, "0");
  }

  const result = runClaw(["codex", "invoke", encoded], root, {
    CODEX_THREAD_ID: "thread-structured-invoke",
  });

  assert.equal(result.ok, true);
  const plan = JSON.parse(fs.readFileSync(String(result.planPath), "utf8")) as { title?: string };
  assert.equal(plan.title, title);

});

test("Codex driver preserves unfinished Goals, recreates completed Goals, and completes blocked Goals", async () => {
  const root = createFixture("codex-driver-goal-idempotency");
  const envelope = runClaw(["codex", "driver"], root);
  const runner = (0, eval)(`(${String(envelope.source)})`) as (
    input: Record<string, unknown>,
    runtime: Record<string, unknown>,
  ) => Promise<JsonRecord>;
  const calls: string[] = [];
  let commandResult: JsonRecord = {
    ok: true,
    command: "plan.resume",
    stage: "execution",
    hostActions: [
      {
        schemaVersion: 1,
        id: "resume:create_goal",
        tool: "create_goal",
        input: { objective: "resume work" },
      },
    ],
  };
  let goalStatus = "active";
  const tools = {
    shell_command: async () => JSON.stringify(commandResult),
    get_goal: async () => ({ goal: { status: goalStatus } }),
    create_goal: async () => { calls.push("create_goal"); goalStatus = "active"; },
    update_goal: async () => { calls.push("update_goal"); goalStatus = "complete"; },
  };

  const retained = await runner({ argv: ["plan", "resume"], workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, []);
  assert.deepEqual(retained.goalRecovery, {
    reason: "Retained the existing unfinished Codex Goal; recovery creates a Goal only when none is unfinished.",
  });

  commandResult = {
    ok: true,
    command: "plan.sync",
    stage: "execution",
    hostActions: [
      {
        schemaVersion: 1,
        id: "sync:create_goal",
        tool: "create_goal",
        input: { objective: "resume work" },
      },
    ],
  };
  goalStatus = "complete";
  const recreated = await runner({ argv: ["plan", "sync"], workdir: root }, { tools, text: () => {} });
  assert.equal(recreated.goalRecovery, undefined);
  assert.deepEqual(calls, ["create_goal"]);

  commandResult = {
    ok: true,
    command: "plan.done",
    stage: "done",
    hostActions: [{
      schemaVersion: 1,
      id: "done:update_goal",
      tool: "update_goal",
      input: { status: "complete" },
    }],
  };
  goalStatus = "complete";
  await runner({ argv: ["plan", "done", "--retrospective", "done"], workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, ["create_goal"]);

  commandResult = {
    ok: true,
    command: "plan.resume",
    stage: "execution",
    hostActions: [
      {
        schemaVersion: 1,
        id: "blocked:create_goal",
        tool: "create_goal",
        input: { objective: "resume work" },
      },
    ],
  };
  goalStatus = "blocked";
  const recovered = await runner(
    { argv: ["plan", "resume"], workdir: root },
    { tools, text: () => {} },
  );
  assert.deepEqual(calls, ["create_goal"]);
  assert.deepEqual(recovered.goalRecovery, {
    reason: "Retained the existing unfinished Codex Goal; recovery creates a Goal only when none is unfinished.",
  });

  commandResult = {
    ok: true,
    command: "plan.done",
    stage: "done",
    hostActions: [{
      schemaVersion: 1,
      id: "blocked-done:update_goal",
      tool: "update_goal",
      input: { status: "complete" },
    }],
  };
  await runner({ argv: ["plan", "done", "--retrospective", "done"], workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, ["create_goal", "update_goal"]);
});

test("Codex driver applies only active to blocked Goal updates", async () => {
  const root = createFixture("codex-driver-active-to-blocked");
  const envelope = runClaw(["codex", "driver"], root);
  const runner = (0, eval)(`(${String(envelope.source)})`) as (
    input: Record<string, unknown>,
    runtime: Record<string, unknown>,
  ) => Promise<JsonRecord>;
  const calls: unknown[] = [];
  let goalStatus = "active";
  const commandResult = {
    ok: true,
    command: "plan.blocked",
    stage: "blocked",
    hostActions: [{
      schemaVersion: 1,
      id: "active-blocked:update_goal",
      tool: "update_goal",
      input: { status: "blocked" },
    }],
  };
  const tools = {
    shell_command: async () => JSON.stringify(commandResult),
    get_goal: async () => ({ goal: { status: goalStatus } }),
    update_goal: async (input: unknown) => { calls.push(input); goalStatus = "blocked"; },
  };

  await runner({ argv: ["plan", "blocked"], workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, [{ status: "blocked" }]);
  await runner({ argv: ["plan", "blocked"], workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, [{ status: "blocked" }]);
});

test("Codex lightweight process plans create Goal Mode without progress synchronization", () => {
  const root = createFixture("codex-stage-minimal-result");
  runClaw(["init", "--name", "Codex Minimal Result", "--planning", "false"], root);
  const result = runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Keep Codex output focused", "--host", "codex"],
    root,
  );

  assert.equal(result.planStatus, "process.active");
  assert.equal("goalMode" in result, false);
  assert.equal("goalTool" in result, false);
  assert.equal("previousPlanStatus" in result, false);
  assert.equal("emittedEvents" in result, false);
  assert.equal("events" in result, false);
  assert.equal("changedTaskIds" in result, false);
  assert.equal("appendedTaskIds" in result, false);
  assert.deepEqual((result.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);
  assert.equal("plan" in result, false);
  assert.equal(result.planSummary, "0/1 demo-task");
  assert.ok(Array.isArray(result.nextsteps));
  assert.equal(typeof result.notes, "string");
  assert.ok(Array.isArray(result.commandHints));
});

test("Codex template-backed plans keep Goal synchronization below the task threshold", () => {
  const root = createFixture("codex-template-host-integration");
  const templatePath = path.join(root, "template.json");
  fs.writeFileSync(templatePath, `${JSON.stringify(createPlanLikeTemplate({
    id: "single-task-template",
    status: "process.active",
    tasks: [{ id: 1, title: "Run template work", status: "pending" }],
  }), null, 2)}\n`, "utf-8");
  runClaw(["init", "--name", "Codex Template Integration", "--planning", "false"], root);

  const result = runClaw(
    ["plan", "create", "--title", "template-task", "--template-file", templatePath, "--host", "codex"],
    root,
  );

  assert.deepEqual((result.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);
});

test("host-neutral and opencode plan results never expose Codex hostActions", () => {
  const neutralRoot = createFixture("neutral-no-host-actions");
  runClaw(["init", "--name", "Neutral Host", "--planning", "false"], neutralRoot);
  const neutral = runClaw(
    ["plan", "create", "--title", "neutral-task", "--goal", "Stay host neutral"],
    neutralRoot,
  );
  assert.equal("hostActions" in neutral, false);

  const opencodeRoot = createFixture("opencode-no-host-actions");
  runClaw(["init", "--name", "OpenCode Host", "--planning", "false"], opencodeRoot);
  const opencode = runClaw(
    ["plan", "create", "--title", "opencode-task", "--goal", "Use OpenCode", "--host", "opencode"],
    opencodeRoot,
  );
  assert.equal("hostActions" in opencode, false);
  assert.ok(Array.isArray(opencode.nextsteps));
});

test("Cindy plan results retain shared nextsteps while omitting host actions and Goal fields", () => {
  const root = createFixture("cindy-agent-guidance");
  runClaw(["init", "--name", "Cindy Guidance", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Keep the Agent focused"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root);

  const result = runClaw(["plan", "wait", "--task-name", "demo-task", "--host", "cindy"], root);
  assert.equal(result.planStatus, "process.wait");
  assert.equal("hostActions" in result, false);
  assert.ok(Array.isArray(result.commandHints));
  assert.ok(Array.isArray(result.nextsteps));
  assert.equal("notes" in result, false);
  assert.equal("goalMode" in result, false);
  assert.equal("goalTool" in result, false);
  const planView = result.planView as JsonRecord;
  assert.equal(String(planView.title), "demo-task");
  assert.deepEqual(planView.counts, { completed: 0, total: 3 });
  assert.equal(String((planView.goal as JsonRecord).text), "Keep the Agent focused");
});

test("invocation host rejects invalid and conflicting sources before project mutation", () => {
  const invalidRoot = createFixture("invalid-host");
  const invalid = runClawExpectFailure(["init", "--name", "Must Not Initialize"], invalidRoot, {
    CLAW_HOST: "third-party",
  });
  assert.match(String((invalid.error as JsonRecord).message), /Unsupported CLAW_HOST value/);
  assert.equal(fs.existsSync(path.join(invalidRoot, ".claw")), false);

  const conflictRoot = createFixture("conflicting-host");
  const conflict = runClawExpectFailure(
    ["init", "--name", "Must Not Initialize", "--host", "codex"],
    conflictRoot,
    { CLAW_HOST: "opencode" },
  );
  assert.match(String((conflict.error as JsonRecord).message), /Conflicting host sources/);
  assert.equal(fs.existsSync(path.join(conflictRoot, ".claw")), false);

  assert.equal(resolveInvocationHost("codex", "codex"), "codex");
});

test("foreground commands run hostless under the standard flow, while hostless commands stay available", () => {
  const root = createFixture("hostless-standard-command-gate");
  const hostlessEnv = { CLAW_HOST: "" };
  runClaw(["init", "--name", "Hostless Standard Flow", "--planning", "false"], root, hostlessEnv);
  // Workflow commands with no host are the standard hostless flow: they must
  // parse and execute instead of rejecting with a missing-host error.
  const created = runClaw(["plan", "create", "--title", "demo-task", "--goal", "Hostless standard flow"], root, hostlessEnv);
  assert.equal(created.command, "plan.create");
  assert.equal("hostActions" in created, false);
  const context = runClaw(["context"], root, hostlessEnv);
  assert.equal("error" in context, false);
  const searchHelp = runClawRaw(["search", "help"], root, hostlessEnv);
  assert.equal(searchHelp.status, 0);
});

test("background worker environments drop the foreground invocation host", () => {
  const source = { PATH: "test-path", CLAW_HOST: "codex", CLAW_GUIDANCE_CONFIG: "guide.json" };
  const workerEnv = withoutInvocationHost(source);
  assert.equal(workerEnv.CLAW_HOST, undefined);
  assert.equal(workerEnv.PATH, "test-path");
  assert.equal(workerEnv.CLAW_GUIDANCE_CONFIG, "guide.json");
  assert.equal(source.CLAW_HOST, "codex");
});

test("Codex lightweight process states pause and resume Goal Mode without progress synchronization", () => {
  const root = createFixture("codex-wait-resume-minimal-result");
  runClaw(["init", "--name", "Codex Wait Resume", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Pause and resume cleanly"], root);
  runClaw(["task", "edit", "--task-name", "demo-task", "--id", "1", "--status", "in_progress"], root);

  const waitResult = runClaw(["plan", "wait", "--task-name", "demo-task", "--host", "codex"], root);
  assert.equal(waitResult.command, "plan.wait");
  assert.equal(waitResult.planStatus, "process.wait");
  assert.equal(waitResult.stage, "paused");
  assert.equal("goalMode" in waitResult, false);
  assert.equal("goalTool" in waitResult, false);
  assert.ok(Array.isArray(waitResult.nextsteps));
  assert.deepEqual(waitResult.commandHints, ["claw plan resume"]);
  assert.deepEqual((waitResult.hostActions as JsonRecord[]).map((action) => action.tool), ["update_goal"]);

  const resumeResult = runClaw(["plan", "resume", "--task-name", "demo-task", "--host", "codex"], root);
  assert.equal(resumeResult.command, "plan.resume");
  assert.equal(resumeResult.planStatus, "process.active");
  assert.equal(resumeResult.stage, "execution");
  assert.equal("goalMode" in resumeResult, false);
  assert.equal("goalTool" in resumeResult, false);
  assert.ok(Array.isArray(resumeResult.nextsteps));
  assert.deepEqual((resumeResult.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);
});

test("Codex end statuses complete the Goal without clearing progress", () => {
  for (const endStatus of ["end.closed", "end.leave"] as const) {
    const root = createFixture(`codex-${endStatus}-clears-host-state`);
    runClaw(["init", "--name", `Codex ${endStatus}`, "--planning", "false"], root);
    runClaw(["plan", "create", "--title", "demo-task", "--goal", "Close host state"], root);
    runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
    runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root);

    const result = runClaw(["plan", "edit", "--task-name", "demo-task", "--status", endStatus, "--host", "codex"], root);
    const actions = result.hostActions as JsonRecord[];
    assert.deepEqual(actions.map((action) => action.tool), ["update_goal"]);
    assert.deepEqual(actions[0]?.input, { status: "complete" });
  }

  const completedRoot = createFixture("codex-end-completed-clears-host-state");
  runClaw(["init", "--name", "Codex completed", "--planning", "false"], completedRoot);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Finish host state"], completedRoot);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], completedRoot);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], completedRoot);
  for (const id of [1, 2, 3]) runClaw(["task", "done", "--task-name", "demo-task", "--id", String(id)], completedRoot);
  const completed = runClaw([
    "plan", "done", "--task-name", "demo-task", "--retrospective", "Finished host-state lifecycle.", "--host", "codex",
  ], completedRoot);
  const completedActions = completed.hostActions as JsonRecord[];
  assert.deepEqual(completedActions.map((action) => action.tool), ["update_goal"]);
  assert.deepEqual(completedActions[0]?.input, { status: "complete" });
});

test("Codex lightweight plan sync restores Goal Mode without progress synchronization", () => {
  const root = createFixture("codex-plan-sync");
  const env = { CODEX_THREAD_ID: "thread-plan-sync" };
  runClaw(["init", "--name", "Codex Plan Sync", "--planning", "false"], root, env);
  const created = runClaw([
    "plan", "create", "--title", "demo-task", "--goal", "Restore host state", "--host", "codex",
  ], root, env);

  assert.deepEqual((created.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);

  const sync = runClaw(["plan", "sync", "--host", "codex"], root, env);

  assert.equal(sync.command, "plan.sync");
  assert.equal(sync.planStatus, "process.active");
  assert.deepEqual((sync.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);
});

test("Codex plan sync respects the project goalMode override above the task threshold", () => {
  const root = createFixture("codex-plan-sync-goal-mode-disabled");
  const env = { CODEX_THREAD_ID: "thread-plan-sync-no-goal" };
  runClaw(["init", "--name", "Codex Plan Sync No Goal", "--planning", "false"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "project-override.json"), JSON.stringify({ goalMode: false }), "utf-8");
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Restore host state"], root, env);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root, env);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root, env);

  const sync = runClaw(["plan", "sync", "--host", "codex"], root, env);

  assert.deepEqual((sync.hostActions as JsonRecord[]).map((action) => action.tool), []);
});

test("Codex task additions do not synchronize progress", () => {
  const root = createFixture("codex-task-add-progress-reconciliation");
  runClaw(["init", "--name", "Codex Task Add Progress", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Reconcile task progress"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);

  const added = runClaw([
    "task", "add", "--task-name", "demo-task", "--title", "Third task", "--host", "codex",
  ], root);

  const actions = added.hostActions as JsonRecord[];
  assert.deepEqual(actions.map((action) => action.tool), ["create_goal"]);
});

test("Codex never emits update_plan when task details change", () => {
  const root = createFixture("codex-projected-plan-change");
  runClaw(["init", "--name", "Codex Projection", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Track projection"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root);

  const metadataOnly = runClaw([
    "plan", "edit", "--task-name", "demo-task", "--summary", "Document context", "--host", "codex",
  ], root);
  assert.deepEqual((metadataOnly.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);

  const detailOnly = runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "1", "--detail", "More detail", "--host", "codex",
  ], root);
  assert.deepEqual((detailOnly.hostActions as JsonRecord[]).map((action) => action.tool), ["create_goal"]);

  const titleChanged = runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "Renamed work", "--host", "codex",
  ], root);
  const actions = titleChanged.hostActions as JsonRecord[];
  assert.deepEqual(actions.map((action) => action.tool), ["create_goal"]);
});

test("Codex task transitions do not project progress", () => {
  const root = createFixture("codex-actual-in-progress-task");
  runClaw(["init", "--name", "Codex Actual Progress", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Track actual task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root);
  runClaw(["plan", "edit", "--task-name", "demo-task", "--status", "process.active"], root);

  const result = runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "2", "--status", "in_progress", "--host", "codex",
  ], root);

  const actions = result.hostActions as JsonRecord[];
  assert.deepEqual(actions.map((action) => action.tool), ["create_goal"]);
  assert.deepEqual(result.nextsteps, ["Continue the current task."]);
});

test("cli plan edit executes repeated options in order and emits only net Goal guidance", () => {
  const root = createFixture("cli-plan-edit-ordered-chain");
  runClaw(["init", "--name", "Ordered Plan Chain", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Apply ordered mutations"], root);

  const result = runClaw([
    "plan", "edit", "--task-name", "demo-task",
    "--acceptance", "First criterion",
    "--status", "process.wait",
    "--acceptance", "Second criterion",
    "--status", "process.active",
  ], root);

  assert.equal(result.planStatus, "process.active");
  assert.equal("hostActions" in result, false);
  const plan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.deepEqual((plan.requirements as JsonRecord).acceptanceCriteria, ["First criterion", "Second criterion"]);

  runClaw(["plan", "wait", "--task-name", "demo-task"], root);
  const inactiveRoundTrip = runClaw([
    "plan", "edit", "--task-name", "demo-task",
    "--status", "process.active",
    "--status", "process.wait",
  ], root);
  assert.equal(inactiveRoundTrip.planStatus, "process.wait");
  assert.equal("hostActions" in inactiveRoundTrip, false);
});

test("OpenCode keeps paused-plan guidance separate from Codex Goal actions", () => {
  const root = createFixture("plan-edit-wait-and-resume-guidance");
  runClaw(["init", "--name", "Wait And Resume Guidance", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Pause and resume cleanly"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root);

  const patchPath = path.join(root, "wait-guidance-tasks.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify({ tasks: [{ id: 1, title: "Implement work", status: "in_progress" }] }, null, 2),
    "utf-8",
  );
  runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "1",
    "--title", "Implement work", "--status", "in_progress",
  ], root);

  const waitResult = runClaw(["plan", "wait", "--task-name", "demo-task"], root);
  assert.equal(waitResult.command, "plan.wait");
  assert.equal(waitResult.planStatus, "process.wait");
  assert.deepEqual(waitResult.nextsteps, [
    "1. Use `update_goal(status=\"blocked\")` to end the current active thread goal.",
    "2. When resuming the plan, restore the active thread goal after re-entering `process.active`.",
    "3. Resume through `process.active` when execution should continue.",
  ]);
  assert.equal(waitResult.goalTool, undefined);
  assert.equal("hostActions" in waitResult, false);
  assert.equal(waitResult.goalMode, undefined);

  const resumeResult = runClaw(["plan", "resume", "--task-name", "demo-task"], root);
  assert.equal(resumeResult.command, "plan.resume");
  assert.equal(resumeResult.planStatus, "process.active");
  assert.equal(resumeResult.goalMode, undefined);
  assert.equal(resumeResult.goalTool, undefined);
  assert.equal("hostActions" in resumeResult, false);

  const discussingResult = runClaw(
    ["plan", "edit", "--task-name", "demo-task", "--status", "process.discussing"],
    root,
  );
  assert.equal(discussingResult.planStatus, "process.discussing");
  assert.equal("hostActions" in discussingResult, false);
});

test("Codex subplan create preserves the parent Goal", () => {
  const root = createFixture("cli-subplan-create-goal-handoff");
  const env = { CODEX_THREAD_ID: "thread-subplan-goal-handoff" };
  runClaw(["init", "--name", "Subplan Goal Handoff", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root, env);
  runClaw([
    "task", "edit", "--id", "1",
    "--title", "Implement child work", "--detail", "Split the risky work into a subplan",
  ], root, env);

  const result = runClaw([
    "subplan", "create", "--parent", "demo-task", "--task-id", "1", "--host", "codex",
  ], root, env);
  const actions = result.hostActions as JsonRecord[];
  assert.deepEqual(actions.map((action) => action.tool), []);
  assert.equal("planSummary" in result, false);
  assert.equal("plan" in result, true);
  assert.deepEqual(actions.map((action) => Object.keys(action).sort()), [
    ["id", "input", "schemaVersion", "tool"],
  ]);
  assert.equal(actions.some((action) => action.tool === "update_goal"), false);
  assert.equal(actions.some((action) => action.tool === "create_goal"), false);
});

test("Codex child plan sync restores the root Goal without projecting child progress", () => {
  const root = createFixture("cli-subplan-sync-root-goal");
  const env = { CODEX_THREAD_ID: "thread-subplan-sync-root-goal" };
  runClaw(["init", "--name", "Subplan Sync Root Goal", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "ROOT OBJECTIVE"], root, env);
  runClaw([
    "task", "edit", "--id", "1",
    "--title", "Child work", "--detail", "CHILD OBJECTIVE DETAIL",
  ], root, env);
  const child = runClaw([
    "subplan", "create", "--parent", "demo-task", "--task-id", "1", "--host", "codex",
  ], root, env);
  const childFile = path.basename(String(child.planPath));
  const started = runClaw([
    "plan", "start", "--plan-file", childFile,
    "--requirements", "Implement child work safely.",
    "--add-task", "Implement child work", "--host", "codex",
  ], root, env);
  const startGoal = (started.hostActions as JsonRecord[]).find((action) => action.tool === "create_goal");
  assert.match(String((startGoal?.input as JsonRecord).objective), /ROOT OBJECTIVE/);
  assert.doesNotMatch(String((startGoal?.input as JsonRecord).objective), /CHILD OBJECTIVE DETAIL/);

  const sync = runClaw(["plan", "sync", "--host", "codex"], root, env);
  const actions = sync.hostActions as JsonRecord[];
  assert.deepEqual(actions.map((action) => action.tool), ["create_goal"]);
  assert.match(String((actions[0]?.input as JsonRecord).objective), /ROOT OBJECTIVE/);
  assert.doesNotMatch(String((actions[0]?.input as JsonRecord).objective), /CHILD OBJECTIVE DETAIL/);
});

test.skip("retired: parseOpencodeRunOutput reconstructs final assistant text from NDJSON", () => {
  const ndjson = [
    JSON.stringify({ type: "session.created", properties: { sessionID: "sess-abc" } }),
    JSON.stringify({ type: "message.updated", properties: { sessionID: "sess-abc", info: { id: "msg-user", role: "user" } } }),
    JSON.stringify({ type: "message.updated", properties: { sessionID: "sess-abc", info: { id: "msg-asst", role: "assistant" } } }),
    JSON.stringify({ type: "message.part.updated", properties: { part: { messageID: "msg-user", type: "text", text: "ignored user text" } } }),
    JSON.stringify({ type: "message.part.updated", properties: { part: { messageID: "msg-asst", type: "text", text: "Deposited truth and ADRs." } } }),
    JSON.stringify({ type: "session.idle", properties: {} }),
  ].join("\n");
  const result = parseOpencodeRunOutput(ndjson);
  assert.equal(result.finalResponse, "Deposited truth and ADRs.");
  assert.equal(result.threadId, "sess-abc");
});

test.skip("retired: parseOpencodeRunOutput handles empty and malformed output gracefully", () => {
  assert.equal(parseOpencodeRunOutput("").finalResponse, "");
  assert.equal(parseOpencodeRunOutput("not json\n{broken").finalResponse, "");
});

test.skip("retired: parseOpencodeRunOutput recovers the session id when session.created is absent", () => {
  const ndjson = [
    JSON.stringify({ type: "message.updated", properties: { sessionID: "sess-message", info: { id: "msg-asst", role: "assistant" } } }),
    JSON.stringify({ type: "message.part.updated", properties: { sessionID: "sess-message", part: { messageID: "msg-asst", type: "text", text: "Completed." } } }),
  ].join("\n");
  assert.deepEqual(parseOpencodeRunOutput(ndjson), {
    finalResponse: "Completed.",
    threadId: "sess-message",
  });
});

test.skip("retired: parseOpencodeRunOutput supports opencode CLI top-level JSON events", () => {
  const ndjson = [
    JSON.stringify({ type: "step_start", sessionID: "sess-cli", part: { type: "step-start" } }),
    JSON.stringify({ type: "text", sessionID: "sess-cli", part: { messageID: "msg-cli", type: "text", text: "CLI completed." } }),
    JSON.stringify({ type: "step_finish", sessionID: "sess-cli", part: { type: "step-finish" } }),
  ].join("\n");
  assert.deepEqual(parseOpencodeRunOutput(ndjson), {
    finalResponse: "CLI completed.",
    threadId: "sess-cli",
  });
});

test.skip("retired: opencode host finalization routes through opencode runner, not Codex SDK", () => {
  const root = createFixture("hook-stop-opencode-routing");
  const sessionId = "thread-opencode-routing";
  const env = { CLAW_HOST: "opencode", CODEX_THREAD_ID: sessionId, CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1" };
  runClaw(["init", "--name", "OpenCode Routing", "--planning", "false"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.knowledgeWriter = {
    externalSkills: ["custom-knowledge-writer"],
    model: "gpt-test-writer",
    reasoningEffort: "high",
  };
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Route via opencode run"], root, env);
  runClaw(["task", "done", "--id", "1"], root, env);
  runClaw(["plan", "done", "--retrospective", "Completed."], root, env);

  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-opencode-routing",
    message: "Ready for deposition.",
    cwd: root,
  }, env);
  assert.equal(stop.status, 0);
  const jobsDir = taskFinalizerJobsDirectory(root, "demo-task");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const jobPath = path.join(jobsDir, jobFiles[0]!);
  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.host, "opencode");

  const missingBinary = path.join(root, "missing-opencode.exe");
  const finalize = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    ...env,
    CLAW_OPENCODE_PATH_OVERRIDE: missingBinary,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
  });
  assert.equal(finalize.status, 0);
  const failedJob = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(failedJob.status, "failed");
  assert.match(String((failedJob.error as JsonRecord).message), /opencode runner|ENOENT|spawn/i);
});
