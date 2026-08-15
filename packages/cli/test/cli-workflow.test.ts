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


test("cli lifecycle e2e covers plan, truth, goalMode, memory refresh, and gitnexus fallback refresh", async () => {
  const root = createFixture("e2e");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "external alpha doc\n", "utf-8");
  const shim = createGitnexusShim("fallback");
  const env = {
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    CLAW_EMBEDDING_MOCK: "1",
  };

  const initResult = runClaw(
    [
      "init",
      "--name",
      "CLI E2E",
      "--gitnexus",
      "true",
      "--ext-path",
      "docs/",
      "--external-writer-skill",
      "external-knowledge-writer",
    ],
    root,
    env,
  );
  assert.equal(initResult.projectId, "cli-e2e");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "cli-e2e",
        name: "CLI E2E",
        maxTasksToKeep: 99,
        planning: false,
        goalMode: true,
        knowledgeWriter: {
          externalSkills: ["external-knowledge-writer"],
          model: null,
          reasoningEffort: "medium",
        },
        externalPlanningSkill: null,
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: true,
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["search", "index", "--refresh"], root, {
    ...env,
  });

  const writeResult = runClaw(
    ["plan", "create", "--title", "e2e-task", "--goal", "Verify the CLI lifecycle"],
    root,
    env,
  );
  assert.equal("stage" in writeResult, false);
  assert.equal("summary" in writeResult, false);
  assert.equal("taskName" in writeResult, false);
  assert.equal("planFile" in writeResult, false);
  assert.equal(writeResult.planSummary, "0/1 e2e-task");
  assert.equal("goalMode" in writeResult, false);
  assert.equal("goalTool" in writeResult, false);
  assert.equal("nextAction" in writeResult, false);
  assert.equal("instruction" in writeResult, false);
  assert.equal("askUser" in writeResult, false);
  assert.equal(
    writeResult.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption. Before each successful `task done`, state a concise evidence-backed task conclusion in the immediately preceding assistant message; `task done` has no conclusion option. Use `plan done --retrospective` and repeatable `--key-decision` values for full-plan closeout.",
  );
  assert.equal((writeResult.plan as JsonRecord).title, "e2e-task");
  assert.equal((writeResult.plan as JsonRecord).status, "process.active");

  const inProgressPath = path.join(root, "mark-in-progress.json");
  fs.writeFileSync(
    inProgressPath,
    JSON.stringify(
      {
        tasks: [{ id: 3, title: "Verify the CLI lifecycle", status: "in_progress" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  const inProgressResult = runClaw(
    ["task", "edit", "--task-name", "e2e-task", "--id", "1", "--status", "in_progress"],
    root,
    env,
  );
  assert.deepEqual(inProgressResult.nextsteps, ["Continue the current task."]);
  assert.equal("nextTask" in inProgressResult, false);
  assert.deepEqual(inProgressResult.commandHints, [
    "claw task done --id 1",
  ]);
  assert.equal("notes" in inProgressResult, false);

  const taskDone = runClaw(
    ["task", "done", "--task-name", "e2e-task", "--id", "1"],
    root,
    env,
  );
  assert.equal("stage" in taskDone, false);
  assert.equal((taskDone.nextsteps as string[]).some((step) => step.includes("writer")), false);
  assert.deepEqual(taskDone.nextsteps, [
    "1. Clear thread progress with `update_plan`.",
    "2. Run `claw plan done --retrospective` once. Add `--key-decision` only for real durable decisions not already recorded.",
    "3. Stop after the canonical plan transition; no separate closeout action is required from the main agent.",
  ]);
  assert.deepEqual(taskDone.commandHints, [
    "claw plan done --retrospective \"<summary>\" [--key-decision \"<durable decision>\"]",
  ]);
  assert.equal(
    taskDone.notes,
    "Background maintenance is fail-open and requires no main-agent action; it must not change plan completion or subplan resume.",
  );

  const truthInputPath = path.join(root, "truth-report.md");
  fs.writeFileSync(truthInputPath, "# Finding\n\nDurable truth.\n", "utf-8");
  const truthResult = runClaw(
    ["truth", "ingest", "--target", "features/e2e.md", "--input", truthInputPath],
    root,
    env,
  );
  assert.match(String(truthResult.targetPath), /\\.claw[\\/]+truth[\\/]+features[\\/]+e2e\.md$/);

  const searchResult = runClaw(["search", "--query", "alpha"], root, {
    ...env,
  });
  assert.equal(searchResult.command, "search");
  assert.equal(searchResult.scope, "project");
  assert.ok(Array.isArray(searchResult.results));

  const doneResult = runClaw(
    ["plan", "done", "--task-name", "e2e-task", "--retrospective", "CLI flow completed."],
    root,
    env,
  );
  assert.equal("completionRefresh" in doneResult, false);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  const gitnexus = refreshStatus.gitnexus as JsonRecord;
  assert.equal(refreshStatus.ok, true);
  assert.ok(Number((memory.project as JsonRecord).indexedCount) > 0);
  assert.equal(memory.task, undefined);
  assert.equal(gitnexus.enabled, true);
  assert.equal(gitnexus.command, "gitnexus analyze --embeddings");
  assert.equal(doneResult.planSummary, "1/1 e2e-task");
  const achievement = doneResult.achievement as JsonRecord;
  assert.equal(achievement.status, "end.completed");
  assert.equal(achievement.title, "e2e-task");
  assert.equal(achievement.planSummary, "1/1 e2e-task");
  assert.equal(achievement.completedTasks, 1);
  assert.equal(achievement.totalTasks, 1);
  assert.equal(achievement.retrospectiveSaved, true);
  assert.equal(achievement.keyDecisionsSaved, 0);
  assert.match(String(achievement.completedAt), /^\d{4}-\d{2}-\d{2}T/);

  const gitnexusLog = fs.readFileSync(shim.logPath, "utf-8");
  assert.match(gitnexusLog, /analyze --embeddings --no-ai-context/);
  assert.match(gitnexusLog, /analyze --embeddings\r?\n?$/m);
  assert.doesNotMatch(gitnexusLog, /^analyze --no-ai-context\r?$/m);
  assert.doesNotMatch(gitnexusLog, /^analyze\r?$/m);
});

test("cli plan create accepts a positional title and seeds planning discussion by default", () => {
  const root = createFixture("positional-title");
  runClaw(["init", "--name", "Positional Title"], root);

  const writeResult = runClaw(["plan", "create", "这是一个任务标题"], root);
  assert.equal(writeResult.planSummary, "0/1 这是一个任务标题");
  assert.equal(writeResult.goalMode, undefined);
  assert.equal((writeResult.commandHints as string[])[0], 'claw search --query "<topic>"');
  assert.equal(
    (writeResult.commandHints as string[])[1],
    "claw plan start --requirements \"<summary>\" --acceptance \"<criterion>\" --add-task \"<title>\" --detail \"<detail>\"",
  );
  assert.equal("goalTool" in writeResult, false);
  assert.equal((writeResult.plan as JsonRecord).status, "process.discussing");
  const plan = writeResult.plan as JsonRecord;
  const tasks = plan.tasks as JsonRecord[];
  assert.equal(String((tasks[0] as JsonRecord).title), "Complete planning with claw-kit:planning");
  assert.equal(tasks.length, 1);
});

test("cli plan create accepts an explicit template flag", () => {
  const root = createFixture("template-flag");
  runClaw(["init", "--name", "Template Alias"], root);

  const result = runClaw(["plan", "create", "Templated task", "--template", "default"], root);
  const plan = result.plan as JsonRecord;
  const tasks = plan.tasks as JsonRecord[];

  assert.equal(result.command, "plan.create");
  assert.equal((plan.status as string), "process.discussing");
  assert.equal((result.commandHints as string[])[0], 'claw search --query "<topic>"');
  assert.equal("goalTool" in result, false);
  assert.equal(String((tasks[0] as JsonRecord).title), "Complete planning with claw-kit:planning");
  assert.equal(tasks.length, 1);
});

test("cli plan create uses project-config defaultPlanTemplate when --template is omitted", () => {
  const root = createFixture("cli-plan-default-template");
  runClaw(["init", "--name", "CLI Plan Default Template"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "team-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "team-default",
      tasks: [
        {
          id: 1,
          title: "Project default planning task",
          detail: "Use {{planningSkill}} to refine this task.",
          status: "pending",
        },
        {
          id: 2,
          title: "Project default activation task",
          detail: "Move to process.active after planning.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.defaultPlanTemplate = "team-default";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["plan", "create", "Uses configured template"], root);
  const tasks = (((result.plan as JsonRecord).tasks as JsonRecord[]) ?? []);

  assert.equal(String((tasks[0] as JsonRecord).title), "Project default planning task");
  assert.equal(String((tasks[1] as JsonRecord).title), "Project default activation task");
});

test("cli plan create lets explicit --template override defaultPlanTemplate", () => {
  const root = createFixture("cli-plan-explicit-template-wins");
  runClaw(["init", "--name", "CLI Plan Explicit Template Wins"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "config-default.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "config-default",
      tasks: [
        {
          id: 1,
          title: "Config default planning task",
          detail: "Use {{planningSkill}} from config.",
          status: "pending",
        },
        {
          id: 2,
          title: "Config default activation task",
          detail: "Move to process.active from config.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "explicit.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "explicit",
      tasks: [
        {
          id: 1,
          title: "Explicit planning task",
          detail: "Use {{planningSkill}} from explicit template.",
          status: "pending",
        },
        {
          id: 2,
          title: "Explicit activation task",
          detail: "Move to process.active from explicit template.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.defaultPlanTemplate = "config-default";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["plan", "create", "Uses explicit template", "--template", "explicit"], root);
  const tasks = (((result.plan as JsonRecord).tasks as JsonRecord[]) ?? []);

  assert.equal(String((tasks[0] as JsonRecord).title), "Explicit planning task");
  assert.equal(String((tasks[1] as JsonRecord).title), "Explicit activation task");
});

test("cli plan edit accepts single-reference shortcut flags", () => {
  const root = createFixture("plan-edit-reference-flags");
  runClaw(["init", "--name", "Reference Flags", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Track one reference"], root);

  runClaw(
    [
      "plan",
      "edit",
      "--task-name",
      "demo-task",
      "--reference",
      "packages/cli/src/cli.ts",
      "--why",
      "flag parsing entrypoint",
    ],
    root,
  );

  const planPath = taskFile(root, "demo-task", "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  assert.deepEqual(plan.references, [
    {
      path: "packages/cli/src/cli.ts",
      why: "flag parsing entrypoint",
    },
  ]);
});

test("cli plan start performs one atomic activation without returning raw events", () => {
  const root = createFixture("plan-start-atomic");
  runClaw(["init", "--name", "Atomic Start"], root);
  const created = runClaw(["plan", "create", "atomic-task", "--goal", "Start in one mutation"], root);
  const taskName = path.basename(path.dirname(String(created.planPath)));

  const result = runClaw([
    "plan", "start", "--task-name", taskName,
    "--requirements", "Ready",
    "--acceptance", "Started",
    "--add-task", "Implement outcome",
  ], root);
  assert.equal(result.command, "plan.start");
  assert.equal(result.planStatus, "process.active");
  assert.deepEqual(result.changedTaskIds, [1]);
  assert.deepEqual(result.appendedTaskIds, [2]);
  assert.equal("emittedEvents" in result, false);
  assert.equal("events" in result, false);
  assert.equal("hostActions" in result, false);
});

test("an explicit template remains project-scoped inside a claw project", () => {
  const cwd = createFixture("template-project-scope-cwd");
  const homeRoot = createFixture("template-project-scope-home");
  const runtimeDir = createFixture("template-project-scope-runtime");
  const skillDir = path.join(homeRoot, ".codex", "skills", "project-harness");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "TEMPLATE.json"), `${JSON.stringify(createPlanLikeTemplate({
    id: "project-harness",
    status: "process.active",
    tasks: [{ id: 1, title: "Run project work", status: "pending" }],
  }), null, 2)}\n`, "utf-8");
  runClaw(["init", "--name", "Template project scope"], cwd);

  const env = {
    HOME: homeRoot,
    USERPROFILE: homeRoot,
    CODEX_THREAD_ID: "thread-template-project-scope",
    CLAW_SESSION_RUNTIME_DIR: runtimeDir,
  };
  const created = runClaw(["plan", "create", "Project template harness", "--template", "project-harness"], cwd, env);

  assert.match(String(created.planPath), new RegExp(path.join(cwd, ".claw").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(fs.existsSync(runtimeDir), true);
  assert.equal(fs.readdirSync(runtimeDir, { withFileTypes: true }).some((entry) => entry.isDirectory()), false);
});

test("cli plan edit rejects partial single-reference shortcut flags", () => {
  const root = createFixture("plan-edit-reference-flags-missing-half");
  runClaw(["init", "--name", "Reference Flags Missing Half", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Track one reference"], root);

  const result = runClawExpectFailure(
    [
      "plan",
      "edit",
      "--task-name",
      "demo-task",
      "--reference",
      "packages/cli/src/cli.ts",
    ],
    root,
  );

  const error = result.error as JsonRecord;
  assert.match(String(error.message), /--reference must be followed immediately by --why/);
});

test("cli plan edit rejects removed patch and append-tasks flags", () => {
  const root = createFixture("plan-edit-removed-generic-inputs");
  runClaw(["init", "--name", "Removed Generic Inputs", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Reject removed inputs"], root);

  for (const args of [
    ["plan", "edit", "--task-name", "demo-task", "--patch", "plan.json"],
    ["plan", "edit", "--task-name", "demo-task", "--append-tasks", "tasks.json"],
  ]) {
    const result = runClawExpectFailure(args, root);
    assert.match(String((result.error as JsonRecord).message), /Unknown argument for plan edit/);
  }
});

test("cli plan edit applies explicit field and collection flags", () => {
  const root = createFixture("cli-plan-edit-explicit-fields");
  runClaw(["init", "--name", "CLI Explicit Fields", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Use explicit fields"], root);

  runClaw([
    "plan", "edit", "--task-name", "demo-task",
    "--requirements", "Updated summary",
    "--question", "Question A",
    "--acceptance", "Criterion A",
    "--summary", "Detailed summary",
    "--reference", "docs/example.md", "--why", "carry context",
    "--rule", "Explicit rule",
    "--key-decision", "Explicit decision",
  ], root);
  runClaw(["task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "Updated task", "--detail", "Updated detail"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task", "--detail", "Second detail"], root);

  const plan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.deepEqual(plan.requirements, {
    summary: "Updated summary",
    openQuestions: ["Question A"],
    acceptanceCriteria: ["Criterion A"],
  });
  assert.equal(plan.summary, "Detailed summary");
  assert.deepEqual(plan.references, [{ path: "docs/example.md", why: "carry context" }]);
  assert.deepEqual(plan.rules, ["Explicit rule"]);
  assert.deepEqual(plan.keyDecisions, ["Explicit decision"]);
  assert.deepEqual((plan.tasks as JsonRecord[]).map((task) => task.title), ["Updated task", "Second task"]);

  runClaw([
    "plan", "remove", "--task-name", "demo-task",
    "--question", "Question A",
    "--acceptance", "Criterion A",
    "--rule", "Explicit rule",
    "--key-decision", "Explicit decision",
    "--reference", "docs/example.md",
  ], root);
  runClaw(["task", "remove", "--task-name", "demo-task", "--id", "2"], root);
  const reducedPlan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.deepEqual((reducedPlan.requirements as JsonRecord).openQuestions, []);
  assert.deepEqual((reducedPlan.requirements as JsonRecord).acceptanceCriteria, []);
  assert.deepEqual(reducedPlan.rules, []);
  assert.deepEqual(reducedPlan.keyDecisions, []);
  assert.deepEqual(reducedPlan.references, []);
  assert.deepEqual((reducedPlan.tasks as JsonRecord[]).map((task) => task.id), [1]);

  const missing = runClawExpectFailure(
    ["plan", "remove", "--task-name", "demo-task", "--rule", "Missing rule"],
    root,
  );
  assert.match(String((missing.error as JsonRecord).message), /exact value not found/i);
});

test("cli task commands accept repeated groups without cross-command edit syntax", () => {
  const root = createFixture("cli-task-repeated-groups");
  runClaw(["init", "--name", "Repeated Task Groups", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Batch same-type task operations"], root);

  runClaw([
    "task", "add", "--task-name", "demo-task",
    "--title", "Second task", "--detail", "Second detail",
    "--title", "Third task",
  ], root);
  runClaw([
    "task", "edit", "--task-name", "demo-task",
    "--id", "2", "--title", "Updated second task",
    "--id", "3", "--detail", "Third detail",
  ], root);
  runClaw(["task", "remove", "--task-name", "demo-task", "--id", "2", "--id", "3"], root);
  runClaw([
    "task", "add", "--task-name", "demo-task",
    "--title", "Replacement task",
    "--title", "Final task",
  ], root);

  const beforeDone = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  const remainingIds = (beforeDone.tasks as JsonRecord[]).map((task) => Number(task.id));
  runClaw([
    "task", "done", "--task-name", "demo-task",
    ...remainingIds.flatMap((id) => ["--id", String(id)]),
  ], root);

  const plan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.ok((plan.tasks as JsonRecord[]).every((task) => task.status === "done"));
  assert.deepEqual((plan.tasks as JsonRecord[]).map((task) => task.title), ["Batch same-type task operations", "Replacement task", "Final task"]);
});

test("cli task edit stops at the first semantic failure and preserves prior operations", () => {
  const root = createFixture("cli-task-edit-partial-chain");
  runClaw(["init", "--name", "Partial Task Chain", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Stop ordered mutations safely"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);

  const raw = runClawRaw([
    "task", "edit", "--task-name", "demo-task",
    "--id", "1", "--title", "Updated first task",
    "--id", "99", "--status", "done",
    "--id", "2", "--title", "Skipped second task",
  ], root);

  assert.equal(raw.status, 1);
  const result = JSON.parse(raw.stdout) as JsonRecord;
  assert.equal(result.ok, true);
  assert.equal(result.chainStatus, "partial");
  assert.equal(result.completedOperations, 1);
  assert.equal(result.remainingOperations, 1);
  assert.equal((result.failedOperation as JsonRecord).index, 1);
  const plan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.deepEqual((plan.tasks as JsonRecord[]).map((task) => task.title), ["Updated first task", "Second task"]);
});

test("cli task edit validates the full syntax before committing any operation", () => {
  const root = createFixture("cli-task-edit-syntax-atomic");
  runClaw(["init", "--name", "Task Chain Syntax", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Reject malformed chains atomically"], root);

  const failure = runClawExpectFailure([
    "task", "edit", "--task-name", "demo-task",
    "--id", "1", "--title", "Must not persist",
    "--id", "2", "--title",
  ], root);
  assert.match(String((failure.error as JsonRecord).message), /Missing value/);

  const plan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.notEqual((plan.tasks as JsonRecord[])[0].title, "Must not persist");
});

test("cli task edit computes task completion guidance from the initial and final states", () => {
  const root = createFixture("cli-task-edit-net-completion");
  runClaw(["init", "--name", "Net Task Completion", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Use net task completion"], root);

  const result = runClaw([
    "task", "edit", "--task-name", "demo-task",
    "--id", "1", "--status", "done",
    "--id", "1", "--status", "pending",
  ], root);

  assert.equal(result.planStatus, "process.active");
  assert.equal("nextTask" in result, true);
  assert.equal("hostActions" in result, false);
  const plan = JSON.parse(fs.readFileSync(taskFile(root, "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.equal((plan.tasks as JsonRecord[])[0].status, "pending");
});

test("cli task add auto-assigns ids", () => {
  const root = createFixture("append-auto-task-ids");
  runClaw(["init", "--name", "Append Auto Ids", "--planning", "false"], root);
  runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Verify auto ids"],
    root,
  );

  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Existing numbered task"], root);
  const result = runClaw(["task", "add", "--task-name", "demo-task", "--title", "Auto numbered task"], root);

  assert.equal(result.planSummary, "0/3 demo-task");
  assert.deepEqual(result.nextTask, {
    id: 1,
    title: "Verify auto ids",
    status: "pending",
  });

  const planShow = runClaw(["plan", "show", "--task-name", "demo-task"], root);
  const planView = planShow.planView as JsonRecord;
  const tasks = ((planView.tasks as JsonRecord).items as JsonRecord[]).map((task) => ({
    id: Number(task.id),
    title: String(task.title),
    status: String(task.status),
  }));
  assert.deepEqual(tasks, [
    { id: 1, title: "Verify auto ids", status: "pending" },
      { id: 2, title: "Existing numbered task", status: "pending" },
      { id: 3, title: "Auto numbered task", status: "pending" },
  ]);
});

test("cli task done requires --choice when the template defines guidance.onDone.choices", () => {
  const root = createFixture("cli-task-done-choice-required");
  runClaw(["init", "--name", "Task Done Choice Required", "--planning", "false"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "choice-required.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "choice-required",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                simple: {
                  summary: "Simple route",
                  nextsteps: ["Keep going."],
                },
                advanced: {
                  summary: "Advanced route",
                  nextsteps: ["Take the advanced branch."],
                },
              },
            },
          },
        },
        {
          id: 2,
          title: "Activation task",
          detail: "Activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const created = runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Require an explicit route choice", "--template", "choice-required"],
    root,
  );
  assert.deepEqual((created.nextTask as JsonRecord).completionChoices, ["simple", "advanced"]);
  assert.equal(
    (created.commandHints as string[]).filter((command) => command.includes("claw task done")).length,
    1,
  );
  assert.equal(
    (created.commandHints as string[]).includes("claw task done --id 1 --choice <choice>"),
    true,
  );
  assert.equal((created.nextsteps as string[]).some((step) => /simple|advanced/.test(step)), false);

  const raw = runClawRaw(["task", "done", "--task-name", "demo-task", "--id", "1"], root);
  assert.equal(raw.status, 1);
  const failure = JSON.parse(raw.stdout) as JsonRecord;
  assert.equal(failure.chainStatus, "partial");
  const error = ((failure.failedOperation as JsonRecord).error) as JsonRecord;
  assert.match(String(error.message), /requires --choice/i);
  assert.match(String(error.message), /claw task done --id 1 --choice <choice>/i);
  assert.match(String(error.message), /simple, advanced/i);
});

test("cli task done persists choiceId for route-aware templates", () => {
  const root = createFixture("cli-task-done-choice-valid");
  runClaw(["init", "--name", "Task Done Choice Valid", "--planning", "false"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "choice-valid.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "choice-valid",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                simple: {
                  summary: "Simple route",
                  nextsteps: ["Keep going."],
                },
              },
            },
          },
        },
        {
          id: 2,
          title: "Activation task",
          detail: "Activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  const result = runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Persist the selected route", "--template", "choice-valid"],
    root,
  );
  assert.equal(result.command, "plan.create");
  assert.deepEqual((result.nextTask as JsonRecord).completionChoices, ["simple"]);
  assert.equal(
    (result.commandHints as string[]).includes("claw task done --id 1 --choice <choice>"),
    true,
  );
  assert.equal(
    (result.commandHints as string[]).includes("claw task done --id <id>"),
    false,
  );

  const taskDone = runClaw(
    ["task", "done", "--task-name", "demo-task", "--id", "1", "--choice", "simple"],
    root,
  );
  assert.equal(taskDone.command, "task.done");

  const planPath = taskFile(root, "demo-task", "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  const tasks = (plan.tasks as JsonRecord[]) ?? [];
  assert.equal(String((tasks[0] as JsonRecord).choiceId), "simple");
});

test("cli task edit forwards --choice for route-aware templates", () => {
  const root = createFixture("cli-plan-edit-task-choice");
  runClaw(["init", "--name", "Plan Edit Task Choice", "--planning", "false"], root);
  fs.mkdirSync(path.join(root, ".claw", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "templates", "choice-through-edit.json"),
    `${JSON.stringify(createPlanLikeTemplate({
      id: "choice-through-edit",
      status: "process.active",
      tasks: [
        {
          id: 1,
          title: "Choose a route",
          detail: "Pick the execution route.",
          status: "pending",
          guidance: {
            onDone: {
              choices: {
                branch_a: {
                  summary: "Branch A",
                  nextsteps: ["Continue on branch A."],
                },
              },
            },
          },
        },
        {
          id: 2,
          title: "Activation task",
          detail: "Activation detail.",
          goalModeDetail: "If Goal Mode is enabled for this project, start Goal Mode.",
          status: "pending",
        },
      ],
    }), null, 2)}\n`,
    "utf-8",
  );

  runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Support generic edit routing", "--template", "choice-through-edit"],
    root,
  );

  runClaw(
    ["task", "edit", "--task-name", "demo-task", "--id", "1", "--status", "done", "--choice", "branch_a"],
    root,
  );

  const planPath = taskFile(root, "demo-task", "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  const tasks = (plan.tasks as JsonRecord[]) ?? [];
  assert.equal(String((tasks[0] as JsonRecord).choiceId), "branch_a");
});

test("cli task status changed back to pending does not return nextTask", () => {
  const root = createFixture("cli-pending-no-next-task");
  runClaw(["init", "--name", "Pending No NextTask", "--planning", "false"], root);

  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Keep pending edits lightweight"], root);
  runClaw(["task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "Current task", "--status", "in_progress"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Later task"], root);
  runClaw(["plan", "edit", "--task-name", "demo-task", "--status", "process.active"], root);

  const result = runClaw(
    ["task", "edit", "--task-name", "demo-task", "--id", "1", "--status", "pending"],
    root,
  );

  assert.deepEqual(result.nextsteps, ["Continue with task #1."]);
  assert.equal("nextTask" in result, false);
  assert.deepEqual(result.commandHints, [
    "claw task done --id <id>",
  ]);
});

test("cli subplan create keeps task rootPlan stable and derives goal from the parent task", () => {
  const root = createFixture("cli-subplan-create");
  const env = { CODEX_THREAD_ID: "thread-subplan-create" };
  runClaw(["init", "--name", "Subplan Write", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root, env);

  runClaw([
    "task", "edit", "--id", "1",
    "--title", "Implement child work", "--detail", "Split the risky work into a subplan",
  ], root, env);

  const result = runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root, env);

  assert.match(String(result.planPath), /tasks[\\/]\d{4}-\d{2}-\d{2}[\\/]demo-task[\\/]Implement-child-work\.json$/);
  const registry = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8"),
  ) as { bindings: Record<string, string> };
  const childPlan = JSON.parse(fs.readFileSync(String(result.planPath), "utf-8")) as JsonRecord;
  assert.equal(registry.bindings["thread-subplan-create"], path.relative(path.join(root, ".claw"), String(result.planPath)).replace(/\\/g, "/"));
  assert.equal(fs.existsSync(taskFile(root, "demo-task", "meta.json")), false);
  assert.equal(childPlan.title, "Implement child work");
  assert.equal(childPlan.status, "process.discussing");
  assert.match(String((result.nextsteps as string[])[0] ?? ""), /^1\. Use claw-kit:planning /);
  assert.equal((result.commandHints as string[])[0], 'claw search --query "<topic>"');
  assert.equal("goalMode" in result, false);
  assert.equal("goalTool" in result, false);
  assert.match(String(result.notes), /parent\/root Goal remains active/i);
  assert.equal(((childPlan.goal as JsonRecord).text), "Implement child work: Split the risky work into a subplan");
});

test("cli subplan create accepts an explicit template flag", () => {
  const root = createFixture("cli-subplan-create-template-goal");
  runClaw(["init", "--name", "Subplan Create Template Goal"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root);

  runClaw([
    "task", "edit", "--task-name", "demo-task", "--id", "1",
    "--title", "Implement child work", "--detail", "Execute child work",
  ], root);

  const result = runClaw(
    [
      "subplan",
      "create",
      "--parent",
      "demo-task",
      "--task-id",
      "1",
      "--template",
      "default",
    ],
    root,
  );

  const childPlan = JSON.parse(fs.readFileSync(String(result.planPath), "utf-8")) as JsonRecord;
  assert.equal(result.command, "subplan.create");
  assert.equal(childPlan.status, "process.discussing");
  assert.equal(childPlan.title, "Implement child work");
  assert.equal(((childPlan.goal as JsonRecord).text), "Implement child work: Execute child work");
  assert.equal((childPlan.tasks as unknown[]).length, 1);
});

test("cli plan, subplan, and template validate share the skill-local template resolver", () => {
  const root = createFixture("cli-shared-template-resolver");
  const skillDir = path.join(root, "packages", "test-adapter", "skills", "create-claw-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(
    path.resolve(thisDir, "..", "..", "..", "shared", "skills", "create-claw-skill", "TEMPLATE.json"),
    path.join(skillDir, "TEMPLATE.json"),
  );
  runClaw(["init", "--name", "Shared Template Resolver"], root);

  const rootResult = runClaw(
    ["plan", "create", "--title", "template-parent", "--goal", "Convert a root skill", "--template", "create-claw-skill"],
    root,
  );
  const rootPlan = JSON.parse(fs.readFileSync(String(rootResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(rootPlan.templateId, "create-claw-skill");

  const childResult = runClaw(
    ["subplan", "create", "--parent", "template-parent", "--task-id", "1", "--template", "create-claw-skill"],
    root,
  );
  const childPlan = JSON.parse(fs.readFileSync(String(childResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(childPlan.templateId, "create-claw-skill");

  const validation = runClaw(["template", "validate", "--template", "create-claw-skill"], root);
  assert.equal(validation.command, "template.validate");
  assert.equal(validation.ok, true);
  assert.equal(validation.templateId, "create-claw-skill");
  assert.equal(validation.version, cliPackageVersion);
  assert.deepEqual(validation.choiceRequiredTasks, []);
});

test("template validation routes missing and older versions through create-claw-skill", () => {
  const root = createFixture("template-version-upgrade-route");
  runClaw(["init", "--name", "Template Version Upgrade Route"], root);

  for (const [name, version] of [["missing", undefined], ["older", "0.1.85"]] as const) {
    const template = createPlanLikeTemplate({
      id: `${name}-version`,
      tasks: [{ id: 1, title: "Run work", status: "pending" }],
    });
    if (version === undefined) {
      delete template.version;
    } else {
      template.version = version;
    }
    const templatePath = path.join(root, `${name}.json`);
    fs.writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf-8");

    const failure = runClawExpectFailure(["template", "validate", "--file", templatePath], root);
    const error = failure.error as JsonRecord;
    const details = error.details as JsonRecord;
    assert.equal(error.message, "Template out of date. Use claw-kit:create-claw-skill to upgrade template.");
    assert.equal(details.requiredSkill, "claw-kit:create-claw-skill");
    assert.equal(details.reason, version === undefined ? "missing_version" : "older_version");
    assert.equal(details.cliVersion, cliPackageVersion);
    assert.equal(details.templateVersion, version ?? null);
    assert.match(String(details.prompt), /upgrade the template[\s\S]*inspect and optimize/i);
  }
});

test("cli plan and subplan create can select an exact template file when skill ids conflict", () => {
  const root = createFixture("cli-exact-template-file");
  const codexTemplatePath = path.join(root, "packages", "codex-adapter", "skills", "update", "TEMPLATE.json");
  const opencodeTemplatePath = path.join(root, "packages", "opencode-adapter", "skills", "update", "TEMPLATE.json");
  for (const [templatePath, taskTitle] of [
    [codexTemplatePath, "Refresh Codex"],
    [opencodeTemplatePath, "Refresh OpenCode"],
  ] as const) {
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(
      templatePath,
      `${JSON.stringify(createPlanLikeTemplate({
        id: "update",
        tasks: [{ id: 1, title: taskTitle, status: "pending" }],
      }), null, 2)}\n`,
      "utf-8",
    );
  }
  runClaw(["init", "--name", "Exact Template File"], root);

  const rootResult = runClaw(
    ["plan", "create", "--title", "codex-update", "--template-file", codexTemplatePath],
    root,
  );
  const rootPlan = JSON.parse(fs.readFileSync(String(rootResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(((rootPlan.tasks as JsonRecord[])[0]?.title), "Refresh Codex");
  assert.equal(rootPlan.templateFile, codexTemplatePath);

  const childResult = runClaw(
    ["subplan", "create", "--parent", "codex-update", "--task-id", "1", "--template-file", opencodeTemplatePath],
    root,
  );
  const childPlan = JSON.parse(fs.readFileSync(String(childResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(((childPlan.tasks as JsonRecord[])[0]?.title), "Refresh OpenCode");
  assert.equal(childPlan.templateFile, opencodeTemplatePath);
});

test("cli plan create rejects template name and exact template file together", () => {
  const root = createFixture("cli-template-file-conflict");
  runClaw(["init", "--name", "Template File Conflict"], root);

  const failure = runClawExpectFailure(
    ["plan", "create", "--title", "conflict", "--template", "default", "--template-file", "TEMPLATE.json"],
    root,
  );
  assert.match(String((failure.error as JsonRecord).message), /mutually exclusive/i);
});

test("cli plan show reads a completed task during the delayed archive window", () => {
  const root = createFixture("plan-show-archived");
  runClaw(["init", "--name", "Archived Show", "--max-tasks-to-keep", "99", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "archived-task", "--goal", "Show archived plan"], root);
  runClaw(["plan", "done", "--task-name", "archived-task", "--retrospective", "Archive this task."], root);

  const result = runClaw(["plan", "show", "--task-name", "archived-task"], root);

  assert.equal("archived" in result, false);
  assert.match(String(result.planPath), /\.claw[\\/]tasks[\\/]\d{4}-\d{2}-\d{2}[\\/]archived-task[\\/].*plan\.json$/);
  const planView = result.planView as JsonRecord;
  assert.equal(String(planView.collapsedSummary), "0/1 archived-task");
});

test("cli plan show --simple returns the exact minimal plan projection", () => {
  const root = createFixture("plan-show-simple");
  const env = { CODEX_THREAD_ID: "thread-plan-show-simple" };
  runClaw(["init", "--name", "Simple Show", "--planning", "false"], root, env);
  runClaw([
    "plan", "create",
    "--title", "simple-task",
    "--goal", "Show only recovery fields",
  ], root, env);
  runClaw(["plan", "edit", "--rule", "Keep the response compact"], root, env);
  runClaw(["task", "add", "--title", "Second task"], root, env);

  const result = runClaw(["plan", "show", "--simple"], root, env);

  assert.deepEqual(result, {
    status: "process.active",
    goal: { text: "Show only recovery fields" },
    tasks: [
      { title: "Show only recovery fields" },
      { title: "Second task" },
    ],
    rules: ["Keep the response compact"],
  });
});
