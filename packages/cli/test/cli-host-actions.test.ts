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
  const envelope = runClaw(["codex", "driver"], root);
  assert.equal(envelope.command, "codex.driver");
  assert.equal(envelope.driverVersion, 12);
  assert.equal(envelope.hostActionSchemaVersion, 1);
  assert.equal(envelope.cacheKey, "claw-kit:codex-driver:v12:s1");
  assert.match(String(envelope.sha256), /^[a-f0-9]{64}$/);
  assert.equal(
    envelope.sha256,
    "34d77319c16ffb6c814debefe2085c07b70317be1bfd79308f17dd4a78576015",
    "changing serialized driver source requires a driver version/cache-key bump",
  );

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
    nextsteps: ["Start the next task through using-claw-kit."],
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
        id: "mutation:update_plan",
        tool: "update_plan",
        input: { explanation: "resume", plan: [{ step: "work", status: "in_progress" }] },
      },
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
        update_plan: async (input: unknown) => calls.push(["update_plan", input]),
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
    nextsteps: ["Start the next task through using-claw-kit."],
    achievement: mutationResult.achievement,
    knowledgeDispatch: mutationResult.knowledgeDispatch,
  });
  assert.equal("hostActions" in actual, false);
  assert.equal("command" in actual, false);
  assert.match(String((calls[0][1] as JsonRecord).command), /^claw codex invoke [a-f0-9]+$/);
  assert.deepEqual(calls.map(([name]) => name), ["shell_command", "update_plan", "get_goal", "create_goal", "text"]);
  assert.equal("hostActions" in JSON.parse(String(calls.at(-1)?.[1])), false);

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
    notes: "Record completion only after the task is complete.",
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
  assert.deepEqual(taskDoneActual, { ok: true, command: "task.done" });
});

test("Codex driver skips unrelated JSON diagnostics and validates native action shapes", async () => {
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
  const calls: string[] = [];
  const actual = await runner(
    { argv: ["plan", "edit", "--summary", "ready"], workdir: root },
    {
      tools: {
        shell_command: async () => `warning: ${JSON.stringify({ diagnostic: true })}\n${JSON.stringify(validResult)}`,
        update_plan: async () => calls.push("update_plan"),
      },
      text: () => {},
    },
  );
  assert.equal(actual.stage, "execution");
  assert.deepEqual(calls, ["update_plan"]);

  for (const input of [
    { explanation: "sync", plan: [{ step: "work", status: "unknown" }] },
    { explanation: "sync", plan: [{ step: "work", status: "pending", extra: true }] },
    { explanation: 1, plan: [{ step: "work", status: "pending" }] },
  ]) {
    await assert.rejects(
      runner(
        { argv: ["plan", "edit", "--summary", "ready"], workdir: root },
        {
          tools: {
            shell_command: async () => JSON.stringify({
              ...validResult,
              hostActions: [{ ...validResult.hostActions[0], input }],
            }),
            update_plan: async () => {},
          },
          text: () => {},
        },
      ),
      /invalid Codex hostAction input/,
    );
  }
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

test("Codex driver preserves a nonterminal Goal and creates one only when none exists", async () => {
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
        id: "resume:update_plan",
        tool: "update_plan",
        input: { plan: [{ step: "resume work", status: "in_progress" }] },
      },
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
    update_plan: async () => calls.push("update_plan"),
    get_goal: async () => ({ goal: { status: goalStatus } }),
    create_goal: async () => { calls.push("create_goal"); goalStatus = "active"; },
    update_goal: async () => { calls.push("update_goal"); goalStatus = "complete"; },
  };

  const retained = await runner({ argv: ["plan", "resume"], workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, ["update_plan"]);
  assert.deepEqual(retained.goalRecovery, {
    reason: "Retained the existing nonterminal Codex Goal; recovery creates a Goal only when none is active.",
  });

  commandResult = {
    ok: true,
    command: "plan.sync",
    stage: "execution",
    hostActions: [
      {
        schemaVersion: 1,
        id: "sync:update_plan",
        tool: "update_plan",
        input: { plan: [{ step: "resume work", status: "in_progress" }] },
      },
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
  assert.deepEqual(calls, ["update_plan", "update_plan", "create_goal"]);

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
  assert.deepEqual(calls, ["update_plan", "update_plan", "create_goal"]);

  commandResult = {
    ok: true,
    command: "plan.resume",
    stage: "execution",
    hostActions: [
      {
        schemaVersion: 1,
        id: "blocked:update_plan",
        tool: "update_plan",
        input: { plan: [{ step: "resume work", status: "in_progress" }] },
      },
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
  assert.deepEqual(calls, ["update_plan", "update_plan", "create_goal", "update_plan"]);
  assert.deepEqual(recovered.goalRecovery, {
    reason: "Retained the existing nonterminal Codex Goal; recovery creates a Goal only when none is active.",
  });
});

test("Codex lightweight plans skip Goal and progress synchronization", () => {
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
  assert.equal("hostActions" in result, false);
  assert.equal("plan" in result, false);
  assert.equal(result.planSummary, "0/1 demo-task");
  assert.ok(Array.isArray(result.nextsteps));
  assert.equal(typeof result.notes, "string");
  assert.ok(Array.isArray(result.commandHints));
});

test("Codex template-backed plans keep Goal and progress synchronization below the task threshold", () => {
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

  assert.deepEqual((result.hostActions as JsonRecord[]).map((action) => action.tool), ["update_plan", "create_goal"]);
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

test("background worker environments drop the foreground invocation host", () => {
  const source = { PATH: "test-path", CLAW_HOST: "codex", CLAW_GUIDANCE_CONFIG: "guide.json" };
  const workerEnv = withoutInvocationHost(source);
  assert.equal(workerEnv.CLAW_HOST, undefined);
  assert.equal(workerEnv.PATH, "test-path");
  assert.equal(workerEnv.CLAW_GUIDANCE_CONFIG, "guide.json");
  assert.equal(source.CLAW_HOST, "codex");
});

test("Codex lightweight wait and resume results omit host synchronization", () => {
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
  assert.equal("hostActions" in waitResult, false);

  const resumeResult = runClaw(["plan", "resume", "--task-name", "demo-task", "--host", "codex"], root);
  assert.equal(resumeResult.command, "plan.resume");
  assert.equal(resumeResult.planStatus, "process.active");
  assert.equal(resumeResult.stage, "execution");
  assert.equal("goalMode" in resumeResult, false);
  assert.equal("goalTool" in resumeResult, false);
  assert.ok(Array.isArray(resumeResult.nextsteps));
  assert.equal("hostActions" in resumeResult, false);
});

test("Codex lightweight plan sync skips host progress and Goal Mode", () => {
  const root = createFixture("codex-plan-sync");
  const env = { CODEX_THREAD_ID: "thread-plan-sync" };
  runClaw(["init", "--name", "Codex Plan Sync", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Restore host state"], root, env);

  const sync = runClaw(["plan", "sync", "--host", "codex"], root, env);

  assert.equal(sync.command, "plan.sync");
  assert.equal(sync.planStatus, "process.active");
  assert.equal("hostActions" in sync, false);
});

test("Codex plan sync respects the project goalMode override above the task threshold", () => {
  const root = createFixture("codex-plan-sync-goal-mode-disabled");
  const env = { CODEX_THREAD_ID: "thread-plan-sync-no-goal" };
  runClaw(["init", "--name", "Codex Plan Sync No Goal", "--planning", "false"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "project-override.json"), JSON.stringify({ goalMode: false }), "utf-8");
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Restore only progress"], root, env);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root, env);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root, env);

  const sync = runClaw(["plan", "sync", "--host", "codex"], root, env);

  assert.deepEqual((sync.hostActions as JsonRecord[]).map((action) => action.tool), ["update_plan"]);
});

test("Codex emits update_plan only when the projected host plan changes", () => {
  const root = createFixture("codex-projected-plan-change");
  runClaw(["init", "--name", "Codex Projection", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Track projection"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Third task"], root);

  const metadataOnly = runClaw([
    "plan", "edit", "--task-name", "demo-task", "--summary", "Document context", "--host", "codex",
  ], root);
  assert.equal("hostActions" in metadataOnly, false);

  const detailOnly = runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "1", "--detail", "More detail", "--host", "codex",
  ], root);
  assert.equal("hostActions" in detailOnly, false);

  const titleChanged = runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "Renamed work", "--host", "codex",
  ], root);
  const actions = titleChanged.hostActions as JsonRecord[];
  assert.deepEqual(actions.map((action) => action.tool), ["update_plan"]);
  assert.deepEqual(((actions[0]!.input as JsonRecord).plan), [
    { step: "Renamed work", status: "in_progress" },
    { step: "Second task", status: "pending" },
    { step: "Third task", status: "pending" },
  ]);
});

test("Codex progress projection follows the task actually marked in progress", () => {
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
  assert.deepEqual(actions.map((action) => action.tool), ["update_plan"]);
  assert.deepEqual((actions[0]!.input as JsonRecord).plan, [
    { step: "Track actual task", status: "pending" },
    { step: "Second task", status: "in_progress" },
    { step: "Third task", status: "pending" },
  ]);
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

test("cli routes host-neutral Goal guidance by paused and resumed plan status", () => {
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
  assert.deepEqual(waitResult.goalTool, {
    tool: "update_goal",
    status: "blocked",
    reason: "Execution is paused in `process.wait`, so the current active thread goal should be ended as blocked until work resumes.",
  });
  assert.equal("hostActions" in waitResult, false);
  assert.equal(waitResult.goalMode, undefined);

  const resumeResult = runClaw(["plan", "resume", "--task-name", "demo-task"], root);
  assert.equal(resumeResult.command, "plan.resume");
  const resumeGoalMode = resumeResult.goalMode as JsonRecord;
  const resumeGoalTool = resumeResult.goalTool as JsonRecord;
  assert.equal(resumeResult.planStatus, "process.active");
  assert.deepEqual(resumeResult.nextsteps, [
    "Sync thread progress with `update_plan`.",
    "Restore Goal Mode to the active state.",
    "Resume with task #1.",
  ]);
  assert.match(
    String(resumeResult.notes),
    /Goal Mode should be restored to the active state before work resumes/,
  );
  assert.match(String(resumeResult.notes), /task done.*no conclusion option/i);
  assert.equal(resumeGoalMode.setWhen, "on_resume_process_active");
  assert.match(String(resumeGoalMode.recommendedObjective), /Pause and resume cleanly/);
  assert.equal(resumeGoalTool.tool, "create_goal");
  assert.equal(resumeGoalTool.allowOverwrite, true);
  assert.equal("hostActions" in resumeResult, false);

  const discussingResult = runClaw(
    ["plan", "edit", "--task-name", "demo-task", "--status", "process.discussing"],
    root,
  );
  assert.equal(discussingResult.planStatus, "process.discussing");
  assert.equal("hostActions" in discussingResult, false);
});

test("Codex subplan create completes the parent goal before any child goal is created", () => {
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
  assert.deepEqual(actions.map((action) => action.tool), ["update_goal", "update_plan"]);
  assert.equal("planSummary" in result, false);
  assert.equal("plan" in result, true);
  assert.deepEqual(actions.map((action) => Object.keys(action).sort()), [
    ["id", "input", "schemaVersion", "tool"],
    ["id", "input", "schemaVersion", "tool"],
  ]);
  assert.equal(((actions[0]?.input as JsonRecord).status), "complete");
  assert.equal(actions.some((action) => action.tool === "create_goal"), false);
});

test("parseOpencodeRunOutput reconstructs final assistant text from NDJSON", () => {
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

test("parseOpencodeRunOutput handles empty and malformed output gracefully", () => {
  assert.equal(parseOpencodeRunOutput("").finalResponse, "");
  assert.equal(parseOpencodeRunOutput("not json\n{broken").finalResponse, "");
});

test("parseOpencodeRunOutput recovers the session id when session.created is absent", () => {
  const ndjson = [
    JSON.stringify({ type: "message.updated", properties: { sessionID: "sess-message", info: { id: "msg-asst", role: "assistant" } } }),
    JSON.stringify({ type: "message.part.updated", properties: { sessionID: "sess-message", part: { messageID: "msg-asst", type: "text", text: "Completed." } } }),
  ].join("\n");
  assert.deepEqual(parseOpencodeRunOutput(ndjson), {
    finalResponse: "Completed.",
    threadId: "sess-message",
  });
});

test("parseOpencodeRunOutput supports opencode CLI top-level JSON events", () => {
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

test("opencode host finalization routes through opencode runner, not Codex SDK", () => {
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
