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


test("session scope runs outside a project, recovers across cwd, and cleans without project side effects", () => {
  const firstCwd = createFixture("session-scope-first");
  const secondCwd = createFixture("session-scope-second");
  const runtimeDir = createFixture("session-scope-runtime");
  const env = {
    CODEX_THREAD_ID: "thread-session-scope",
    CLAW_SESSION_RUNTIME_DIR: runtimeDir,
  };

  const created = runClaw(["plan", "create", "Session harness", "--scope", "session"], firstCwd, env);
  assert.equal(created.ok, true);
  assert.match(String(created.planPath), new RegExp(runtimeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(fs.existsSync(path.join(firstCwd, ".claw")), false);

  const context = runClaw(["context"], secondCwd, env);
  assert.equal((context.project as JsonRecord).scope, "session");
  assert.equal((context.activeWorkflow as JsonRecord).planPath, created.planPath);
  assert.equal(fs.existsSync(path.join(secondCwd, ".claw")), false);

  const shown = runClaw(["plan", "show"], secondCwd, env);
  assert.equal(shown.planPath, created.planPath);
  const sessionStart = runClawHook("SessionStart", secondCwd, {
    cwd: secondCwd,
    session_id: env.CODEX_THREAD_ID,
  }, env);
  assert.equal(sessionStart.status, 0);
  assert.match(sessionStart.stdout, /Session harness/);
  const sessionRoot = path.dirname(path.dirname(path.dirname(String(created.planPath))));
  assert.equal(fs.existsSync(path.join(sessionRoot, "runtime", "knowledge-sessions")), false);
  assert.equal(fs.existsSync(path.join(sessionRoot, "truth")), false);

  const cleaned = runClaw(["session", "clean"], secondCwd, env);
  assert.equal(cleaned.removed, true);
  assert.equal(fs.existsSync(sessionRoot), false);
  assert.equal(fs.existsSync(path.join(secondCwd, ".claw")), false);
});

test("CLAW_SESSION_ID restores a Cindy session-scoped workflow", () => {
  const firstCwd = createFixture("cindy-session-scope-first");
  const secondCwd = createFixture("cindy-session-scope-second");
  const runtimeDir = createFixture("cindy-session-scope-runtime");
  const env = {
    CLAW_SESSION_ID: "cindy-session-scope",
    CLAW_SESSION_RUNTIME_DIR: runtimeDir,
  };

  const created = runClaw(["plan", "create", "Cindy session", "--scope", "session"], firstCwd, env);
  const context = runClaw(["context"], secondCwd, env);

  assert.equal(created.ok, true);
  assert.equal((context.project as JsonRecord).scope, "session");
  assert.equal((context.activeWorkflow as JsonRecord).planPath, created.planPath);
});

test("an explicit template selects session storage automatically outside a claw project", () => {
  const cwd = createFixture("template-auto-session-cwd");
  const homeRoot = createFixture("template-auto-session-home");
  const runtimeDir = createFixture("template-auto-session-runtime");
  const skillDir = path.join(homeRoot, ".codex", "skills", "session-harness");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "TEMPLATE.json"), `${JSON.stringify(createPlanLikeTemplate({
    id: "session-harness",
    status: "process.active",
    tasks: [{ id: 1, title: "Run session work", status: "pending" }],
  }), null, 2)}\n`, "utf-8");

  const env = {
    HOME: homeRoot,
    USERPROFILE: homeRoot,
    CODEX_THREAD_ID: "thread-template-session-scope",
    CLAW_SESSION_RUNTIME_DIR: runtimeDir,
  };
  const created = runClaw(["plan", "create", "Session template harness", "--template", "session-harness"], cwd, env);
  const context = runClaw(["context"], cwd, env);
  const createdPlan = JSON.parse(fs.readFileSync(String(created.planPath), "utf-8")) as JsonRecord;

  assert.equal((context.project as JsonRecord).scope, "session");
  assert.equal(createdPlan.templateId, "session-harness");
  assert.match(String(created.planPath), new RegExp(runtimeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(fs.existsSync(path.join(cwd, ".claw")), false);
});

test("explicit session scope overrides an initialized project and remains isolated by session id", () => {
  const root = createFixture("session-scope-project-override");
  const runtimeDir = createFixture("session-scope-project-runtime");
  runClaw(["init", "--name", "Project scope"], root);
  const projectTasksBefore = fs.readdirSync(path.join(root, ".claw", "tasks"));
  const env = { CODEX_THREAD_ID: "thread-session-project", CLAW_SESSION_RUNTIME_DIR: runtimeDir };

  const created = runClaw(["plan", "create", "Ephemeral override", "--scope", "session"], root, env);
  assert.match(String(created.planPath), new RegExp(runtimeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual(fs.readdirSync(path.join(root, ".claw", "tasks")), projectTasksBefore);

  const otherSession = runClawExpectFailure(
    ["plan", "show"],
    root,
    { CODEX_THREAD_ID: "thread-session-other", CLAW_SESSION_RUNTIME_DIR: runtimeDir },
  );
  assert.equal((otherSession.error as JsonRecord).code, "PROJECT_CONFIG_INVALID");

  runClaw(["session", "clean"], root, env);
});

test("lightweight session plan completion skips Goal actions and queues no project refresh work", () => {
  const root = createFixture("session-scope-completion");
  const runtimeDir = createFixture("session-scope-completion-runtime");
  const env = { CODEX_THREAD_ID: "thread-session-completion", CLAW_SESSION_RUNTIME_DIR: runtimeDir };
  const created = runClaw(
    ["plan", "create", "Session completion", "--scope", "session", "--host", "codex"],
    root,
    env,
  );
  const planPath = String(created.planPath);
  const activated = runClaw(["plan", "edit", "--status", "process.active", "--host", "codex"], root, env);
  assert.equal("hostActions" in activated, false);

  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as { tasks: Array<{ id: number }> };
  for (const task of plan.tasks) {
    runClaw(["task", "done", "--id", String(task.id), "--host", "codex"], root, env);
  }
  const completed = runClaw(
    ["plan", "done", "--retrospective", "Session workflow completed.", "--host", "codex"],
    root,
    env,
  );
  assert.equal(completed.planStatus, "end.completed");
  assert.equal(completed.planPath, planPath);
  assert.equal((completed.achievement as JsonRecord).status, "end.completed");
  assert.equal((completed.nextsteps as string[]).some((step) => step.includes("using-claw-kit")), true);
  assert.equal((completed.nextsteps as string[]).some((step) => step.includes("update_goal")), true);
  assert.equal("hostActions" in completed, false);

  const sessionRoot = path.dirname(path.dirname(path.dirname(planPath)));
  assert.equal(fs.existsSync(path.join(sessionRoot, "runtime", "knowledge-sessions")), false);
  assert.equal(fs.existsSync(path.join(sessionRoot, "runtime", "completion-refresh")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw")), false);
  assert.equal(fs.existsSync(planPath), true);
  runClaw(["session", "clean"], root, env);
});

test("session scope supports subplans and expired-state cleanup", () => {
  const root = createFixture("session-scope-subplan");
  const otherCwd = createFixture("session-scope-subplan-other");
  const runtimeDir = createFixture("session-scope-subplan-runtime");
  const env = { CODEX_THREAD_ID: "thread-session-subplan", CLAW_SESSION_RUNTIME_DIR: runtimeDir };
  const created = runClaw(["plan", "create", "Session subplan", "--scope", "session"], root, env);
  const planPath = String(created.planPath);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as { tasks: Array<{ id: number }> };
  const taskName = path.basename(path.dirname(planPath));
  const subplan = runClaw(
    ["subplan", "create", "--parent", taskName, "--task-id", String(plan.tasks[0]!.id)],
    otherCwd,
    env,
  );
  assert.equal(subplan.ok, true);
  assert.equal(path.dirname(String(subplan.planPath)), path.dirname(planPath));
  assert.equal(fs.existsSync(path.join(otherCwd, ".claw")), false);
  runClaw(["session", "clean"], otherCwd, env);

  const staleDir = path.join(runtimeDir, "stale-session");
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, "session.json"), JSON.stringify({
    version: 1,
    scope: "session",
    originCwd: root,
    createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z",
  }));
  const swept = runClaw(["session", "clean", "--expired"], root, { CLAW_SESSION_RUNTIME_DIR: runtimeDir });
  assert.equal(swept.removedCount, 1);
  assert.equal(fs.existsSync(staleDir), false);
});

test("cli plan create with an exact template file auto-selects session scope outside a claw project", () => {
  const root = createFixture("cli-template-file-session-scope");
  const templatePath = path.join(root, "example-skill", "TEMPLATE.json");
  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  fs.writeFileSync(
    templatePath,
    `${JSON.stringify(createPlanLikeTemplate({
      id: "example-session-template",
      tasks: [{ id: 1, title: "Run session work", status: "pending" }],
    }), null, 2)}\n`,
    "utf-8",
  );

  const result = runClaw(
    ["plan", "create", "--title", "session-template", "--template-file", templatePath],
    root,
    { CODEX_THREAD_ID: "thread-template-file-session" },
  );

  assert.equal(result.command, "plan.create");
  assert.equal(fs.existsSync(path.join(root, ".claw")), false);
  assert.match(String(result.planPath), /\.claw[\\/]runtime[\\/]sessions[\\/]/);
});
