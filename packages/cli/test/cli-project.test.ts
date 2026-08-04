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


test("cli respects project override toggles for goal mode and final-only truth dispatch", () => {
  const root = createFixture("cli-project-override-toggles");
  runClaw(["init", "--name", "CLI Override Toggles", "--planning", "false"], root);

  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "cli-project-override-toggles",
        name: "CLI Override Toggles",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".claw", "project-override.json"),
    JSON.stringify(
      {
        goalMode: false,
        truthDispatch: "final_only",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const writeResult = runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Respect project override toggles"],
    root,
  );
  assert.equal("goalMode" in writeResult, false);

  runClaw(["task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "First task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  const activateResult = runClaw(["plan", "edit", "--task-name", "demo-task", "--status", "process.active"], root);
  assert.equal("goalMode" in activateResult, false);

  const taskDone = runClaw(
    ["task", "done", "--task-name", "demo-task", "--id", "1"],
    root,
  );
  assert.equal((taskDone.nextsteps as string[]).some((step) => step.includes("truth-writer")), false);

  const allDone = runClaw(
    ["task", "done", "--task-name", "demo-task", "--id", "2"],
    root,
  );
});

test("cli init writes maxTasksToKeep into project.json", () => {
  const root = createFixture("init-max-tasks");

  runClaw([
    "init",
    "--name",
    "Task Retention",
    "--max-tasks-to-keep",
    "12",
    "--external-writer-skill",
    "team-knowledge-writer",
  ], root);

  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;
  assert.equal(projectConfig.maxTasksToKeep, 12);
  assert.equal(projectConfig.autoUpdate, true);
  assert.equal(projectConfig.goalMode, true);
  assert.deepEqual(projectConfig.knowledgeWriter, {
    executionPolicy: "background",
    externalSkills: ["team-knowledge-writer"],
    model: null,
    reasoningEffort: "medium",
    datedSectionsToKeep: 6,
  });
  assert.equal("truthDispatch" in projectConfig, false);
  assert.equal((projectConfig.memory as JsonRecord).autoUpdate, true);
  assert.equal(
    ((projectConfig.memory as JsonRecord).embedding as JsonRecord).model,
    "jinaai/jina-embeddings-v2-base-zh",
  );
});

test("cli init writes default maxTasksToKeep into project.json", () => {
  const root = createFixture("init-default-max-tasks");

  runClaw(["init", "--name", "Default Retention"], root);

  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;
  assert.equal(projectConfig.maxTasksToKeep, 9);
  assert.equal(projectConfig.goalMode, true);
  assert.deepEqual(projectConfig.knowledgeWriter, {
    executionPolicy: "background",
    externalSkills: [],
    model: null,
    reasoningEffort: "medium",
    datedSectionsToKeep: 6,
  });
  assert.equal(
    ((projectConfig.memory as JsonRecord).embedding as JsonRecord).model,
    "jinaai/jina-embeddings-v2-base-zh",
  );
});

test("cli context returns only minimum healthy project context and optional search guidance", () => {
  const root = createFixture("context-check");
  runClaw(["init", "--name", "Context Check"], root);

  const result = runClaw(["context"], root);
  const project = result.project as JsonRecord;

  assert.deepEqual(Object.keys(result).sort(), ["project", "searchGuidance", "session"]);
  assert.deepEqual(Object.keys(project).sort(), ["clawDir", "projectId", "projectName", "projectRoot"]);
  assert.equal(project.projectRoot, root);
  assert.equal(project.projectName, "Context Check");
  assert.match(String(result.searchGuidance), /claw search/);
  assert.doesNotMatch(String(result.searchGuidance), /GitNexus/);
  assert.doesNotMatch(String(result.searchGuidance), /[\p{Script=Han}，：。；（）]/u);
  const session = result.session as JsonRecord;
  assert.equal(session.boundPlan, false);
  assert.match(String(session.note), /No plan is bound/);
});

test("cli context omits healthy matching version information", () => {
  const root = createFixture("context-version-already-aligned");
  runClaw(["init", "--name", "Context Version Already Aligned"], root);

  const result = runClaw(["context"], root);
  assert.equal("startupRecovery" in result, false);
  assert.equal("protocolCheck" in result, false);
  assert.equal("projectConfig" in (result.project as JsonRecord), false);
});

test("cli context runs the daily maintenance pass once for project and session runtime", () => {
  const root = createFixture("context-daily-maintenance");
  const sessionRuntime = path.join(root, "session-runtime");
  runClaw(["init", "--name", "Context Daily Maintenance"], root);
  const created = runClaw(["plan", "create", "Expired task"], root);
  const createdPlanPath = String(created.planPath);
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 2);
  const datedTaskDir = path.join(root, ".claw", "tasks", localDateDirectory(oldDate), "Expired-task");
  fs.mkdirSync(path.dirname(datedTaskDir), { recursive: true });
  fs.renameSync(path.dirname(createdPlanPath), datedTaskDir);
  fs.rmdirSync(path.dirname(path.dirname(createdPlanPath)));
  const planPath = path.join(datedTaskDir, "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  delete plan.completedAt;
  fs.writeFileSync(planPath, JSON.stringify(plan), "utf-8");
  const tmpFile = path.join(root, ".claw", "runtime", "tmp", "scratch.txt");
  fs.writeFileSync(tmpFile, "temporary", "utf-8");
  fs.utimesSync(tmpFile, oldDate, oldDate);
  const staleSession = path.join(sessionRuntime, "stale");
  fs.mkdirSync(staleSession, { recursive: true });
  fs.writeFileSync(path.join(staleSession, "session.json"), JSON.stringify({ version: 1, scope: "session", originCwd: root, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" }), "utf-8");

  runClaw(["context"], root, { CLAW_SESSION_RUNTIME_DIR: sessionRuntime });
  assert.equal(fs.existsSync(tmpFile), false);
  assert.equal(fs.existsSync(datedTaskDir), false);
  assert.equal(fs.existsSync(staleSession), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "maintenance.json")), true);
  assert.equal(fs.existsSync(path.join(sessionRuntime, ".maintenance.json")), true);
});

test("Codex context keeps a healthy SDK runtime out of the minimal output", () => {
  const root = createFixture("context-codex-runtime-healthy");
  runClaw(["init", "--name", "Context Codex Runtime Healthy"], root);

  const result = runClaw(["context", "--host", "codex"], root, {
    CLAW_CODEX_RUNTIME_MOCK: "healthy",
  });
  assert.equal("error" in result, false);
  assert.deepEqual(Object.keys(result).sort(), ["project", "searchGuidance", "session"]);
});

test("Codex context returns an English consent error without repairing a missing runtime", () => {
  const root = createFixture("context-codex-runtime-missing");
  runClaw(["init", "--name", "Context Codex Runtime Missing"], root);

  const result = runClaw(["context", "--host", "codex"], root, {
    CLAW_CODEX_RUNTIME_MOCK: "missing",
  });
  const error = result.error as JsonRecord;
  assert.equal(error.code, "CODEX_SDK_RUNTIME_MISSING");
  assert.equal(error.requiresUserConsent, true);
  assert.equal("repairCommand" in error, false);
  assert.match(String(error.prompt), /Tell the user.*Ask for permission.*Only after the user agrees.*choose a safe repair approach/is);
  assert.doesNotMatch(JSON.stringify(error), /[\p{Script=Han}，：。；（）]/u);
});

test("cli context generates search guidance from enabled embedding and GitNexus capabilities", () => {
  const cases = [
    { name: "embedding-only", memoryEnabled: true, gitnexus: false, clawSearch: true, gitNexus: false },
    { name: "gitnexus-only", memoryEnabled: false, gitnexus: true, clawSearch: false, gitNexus: true },
    { name: "both", memoryEnabled: true, gitnexus: true, clawSearch: true, gitNexus: true },
    { name: "neither", memoryEnabled: false, gitnexus: false, clawSearch: false, gitNexus: false },
  ];

  for (const testCase of cases) {
    const root = createFixture(`context-search-guidance-${testCase.name}`);
    runClaw(["init", "--name", `Context Search ${testCase.name}`], root);
    const projectJsonPath = path.join(root, ".claw", "project.json");
    const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
    (projectConfig.memory as JsonRecord).enabled = testCase.memoryEnabled;
    projectConfig.gitnexus = testCase.gitnexus;
    fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

    const result = runClaw(["context"], root);
    const guidance = typeof result.searchGuidance === "string" ? result.searchGuidance : "";
    assert.equal(guidance.includes("claw search"), testCase.clawSearch, testCase.name);
    assert.equal(guidance.includes("GitNexus"), testCase.gitNexus, testCase.name);
    assert.equal("searchGuidance" in result, testCase.clawSearch || testCase.gitNexus, testCase.name);
    if (guidance) {
      assert.match(guidance, /before.*\brg\b/i);
      assert.match(guidance, /exact files or symbols/i);
    }
  }
});

test("cli context auto-initializes when .claw is missing", () => {
  const root = createFixture("context-init");

  const result = runClaw(["context"], root);
  const startupRecovery = result.startupRecovery as JsonRecord;

  assert.equal(startupRecovery.initialized, true);
  assert.equal("corrected" in startupRecovery, false);
  assert.equal("protocolCheck" in result, false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "project.json")), true);
  assert.equal((result.project as JsonRecord).projectRoot, root);
  assert.equal("projectConfig" in (result.project as JsonRecord), false);
});

test("cli context auto-corrects malformed existing .claw state", () => {
  const root = createFixture("context-correct");
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({ id: "broken-project", name: "Broken Project" }, null, 2),
    "utf-8",
  );

  const result = runClaw(["context"], root);
  const startupRecovery = result.startupRecovery as JsonRecord;
  const projectConfig = JSON.parse(fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8")) as JsonRecord;

  assert.equal("initialized" in startupRecovery, false);
  assert.equal(startupRecovery.corrected, true);
  assert.ok(Array.isArray(startupRecovery.fixedPaths));
  assert.equal("protocolCheck" in result, false);
  assert.equal(projectConfig.version, cliPackageVersion);
  assert.equal(projectConfig.maxTasksToKeep, 9);
  assert.equal(projectConfig.autoUpdate, true);
  assert.deepEqual(projectConfig.memory, {
    enabled: true,
    autoUpdate: true,
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "jinaai/jina-embeddings-v2-base-zh",
    },
  });
  assert.equal(projectConfig.goalMode, true);
  assert.deepEqual(projectConfig.knowledgeWriter, {
    executionPolicy: "background",
    externalSkills: [],
    model: null,
    reasoningEffort: "medium",
    datedSectionsToKeep: 6,
  });
});

test("cli context aligns project.json version upward to the current CLI version", () => {
  const root = createFixture("context-version-align");
  runClaw(["init", "--name", "Context Version Align"], root);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.version = "0.1.1";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["context"], root);
  const startupRecovery = result.startupRecovery as JsonRecord;
  const versionSync = startupRecovery.versionSync as JsonRecord;
  const nextProjectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;

  assert.equal(startupRecovery.corrected, true);
  assert.equal(versionSync.projectVersionAligned, true);
  assert.equal(versionSync.cliVersion, cliPackageVersion);
  assert.equal(nextProjectConfig.version, cliPackageVersion);
});

test("cli context reports lagging CLI info when project version is newer than both local CLI and npm latest", () => {
  const root = createFixture("context-version-lagging");
  const npmShim = createClawUpdateNpmShim({
    latestVersion: "0.9.9",
  });
  const env = {
    PATH: `${npmShim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "Context Version Lagging"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.version = "9.9.9";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["context"], root, env);
  const startupRecovery = result.startupRecovery as JsonRecord;
  const versionSync = startupRecovery.versionSync as JsonRecord;

  assert.equal(versionSync.projectVersionAligned, false);
  assert.equal(versionSync.cliVersionLagging, true);
  assert.equal(versionSync.updateAvailable, true);
  assert.equal(versionSync.autoUpdateEnabled, true);
  assert.equal(versionSync.updateSkill, "claw-kit:update");
  assert.equal(versionSync.latestPublishedVersion, "0.9.9");
  assert.match(String(versionSync.message), /npm latest is only 0.9.9/);
});

test("cli context reports update availability without auto-installing the CLI", () => {
  const root = createFixture("context-version-update-available");
  const npmShim = createClawUpdateNpmShim({
    latestVersion: "99.0.0",
  });
  const env = {
    PATH: `${npmShim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "Context Version Update Available"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.version = "9.9.9";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClaw(["context"], root, env);
  const versionSync = ((result.startupRecovery as JsonRecord).versionSync as JsonRecord);
  const npmLog = fs.readFileSync(npmShim.logPath, "utf-8");

  assert.equal(versionSync.cliVersionLagging, true);
  assert.equal(versionSync.updateAvailable, true);
  assert.equal(versionSync.autoUpdateEnabled, true);
  assert.equal(versionSync.latestPublishedVersion, "99.0.0");
  assert.match(String(versionSync.message), /Published claw-kit 99.0.0 is newer than local CLI/);
  assert.doesNotMatch(npmLog, /install -g @veewo\/claw@latest/);
});

test("cli hook surfaces lagging prompt note when autoUpdate is disabled and project version is newer than npm latest", () => {
  const root = createFixture("hook-version-lagging");
  const npmShim = createClawUpdateNpmShim({
    latestVersion: "0.9.9",
  });
  const env = {
    PATH: `${npmShim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "Hook Version Lagging"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.version = "9.9.9";
  projectConfig.autoUpdate = false;
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClawRaw(["hook", "SessionStart"], root, env);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as JsonRecord;
  const hookSpecificOutput = payload.hookSpecificOutput as JsonRecord;
  const additionalContext = String(hookSpecificOutput.additionalContext);
  assert.doesNotMatch(additionalContext, /First action: use claw-kit:update/i);
  assert.match(additionalContext, /Startup note: Project config version 9\.9\.9 is newer than CLI/i);
  assert.match(additionalContext, /npm latest is only 0\.9\.9/i);
});

test("cli hook asks for update confirmation when autoUpdate is enabled and a newer published version exists", () => {
  const root = createFixture("hook-version-auto-update");
  const npmShim = createClawUpdateNpmShim({
    latestVersion: "99.0.0",
  });
  const env = {
    PATH: `${npmShim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "Hook Version Auto Update"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.version = "9.9.9";
  projectConfig.autoUpdate = true;
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const result = runClawRaw(["hook", "SessionStart"], root, env);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as JsonRecord;
  const hookSpecificOutput = payload.hookSpecificOutput as JsonRecord;
  const additionalContext = String(hookSpecificOutput.additionalContext);
  const npmLog = fs.readFileSync(npmShim.logPath, "utf-8");
  assert.match(additionalContext, /A newer claw-kit version is available/i);
  assert.match(additionalContext, /Tell the user in their language that the current claw-kit installation is out of date and must be updated before they can continue using claw-kit/i);
  assert.match(additionalContext, /Ask whether they want to update now, then wait for their answer/i);
  assert.match(additionalContext, /After the user confirms, use claw-kit:update to update the claw-kit CLI and the current host plugin surface, then continue the original task\./i);
  assert.match(additionalContext, /When useful, use `claw search` to narrow the document search scope.*default search/i);
  assert.doesNotMatch(npmLog, /install -g @veewo\/claw@latest/);
});

test("context suppresses the node:sqlite ExperimentalWarning banner", () => {
  const root = createFixture("context-warning");

  runClaw(["init", "--name", "Context Warning"], root);

  const result = runClawRaw(["context"], root);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /ExperimentalWarning: SQLite is an experimental feature/);

  const payload = JSON.parse(result.stdout) as JsonRecord;
  assert.equal((payload.project as JsonRecord).projectName, "Context Warning");
});

test("cli check auto-corrects project.json into explicit protocol fields", () => {
  const root = createFixture("check-invalid-project");
  fs.mkdirSync(path.join(root, ".claw"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "broken-project",
        name: "Broken Project",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = runClaw(["check"], root);
  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;

  assert.equal(result.command, "check");
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.ok(Number(result.issueCountBefore) > 0);
  assert.ok((result.fixedPaths as unknown[]).includes("maxTasksToKeep"));
  assert.equal(projectConfig.version, cliPackageVersion);
  assert.equal(projectConfig.id, "broken-project");
  assert.equal(projectConfig.name, "Broken Project");
  assert.equal(projectConfig.maxTasksToKeep, 9);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.equal(projectConfig.goalMode, true);
  assert.deepEqual(projectConfig.knowledgeWriter, {
    executionPolicy: "background",
    externalSkills: [],
    model: null,
    reasoningEffort: "medium",
    datedSectionsToKeep: 6,
  });
  assert.deepEqual(projectConfig.memory, {
    enabled: true,
    autoUpdate: true,
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "jinaai/jina-embeddings-v2-base-zh",
    },
  });
  assert.equal(projectConfig.gitnexus, false);
});

test("claw context does not discover an unfinished plan without a session binding", () => {
  const root = createFixture("context-binding-only");
  runClaw(["init", "--name", "Binding Only", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "unbound-task", "--goal", "Stay unbound"], root);

  const context = runClaw(["context"], root, { CODEX_THREAD_ID: "different-thread" });

  assert.equal("activeWorkflow" in context, false);
  const session = context.session as JsonRecord;
  assert.equal(session.boundPlan, false);
  assert.match(String(session.note), /No plan is bound/);
});

test("cli init gitignore ignores project-override.json by default", () => {
  const root = createFixture("cli-init-project-override-gitignore");

  runClaw(["init", "--name", "CLI Override Gitignore"], root);

  assert.equal(
    fs.readFileSync(path.join(root, ".gitignore"), "utf-8"),
    "# claw-kit\n.claw/*\n!.claw/project.json\n!.claw/truth/\n!.claw/truth/**\n.claw/project-override.json\n",
  );
});

test("cli hook emits SessionStart additionalContext inside .claw projects", () => {
  const root = createFixture("hook");
  runClaw(["init", "--name", "Hook Project"], root);
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    USERPROFILE: home,
    HOME: home,
  };

  const result = runClawRaw(["hook", "auto-claw"], root, env);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as JsonRecord;
  const hookSpecificOutput = payload.hookSpecificOutput as JsonRecord;
  assert.equal(hookSpecificOutput.hookEventName, "SessionStart");
  const additionalContext = String(hookSpecificOutput.additionalContext);
  assert.match(additionalContext, /using-claw-kit/);
  assert.match(additionalContext, /Hook Project|hook-project/i);
  assert.match(additionalContext, /You can use goal mode in this thread when required by the claw workflow; don't ask me again/i);
  assert.match(additionalContext, /Load claw-kit:using-claw-kit as the main workflow skill for this session\./i);
  assert.match(additionalContext, /When useful, use `claw search` to narrow the document search scope.*default search/i);
});

test("Cindy auto-claw emits diagnostics without project identity or plan recovery", () => {
  const root = createFixture("hook-cindy-session-start");
  runClaw(["init", "--name", "Cindy Hook Project"], root);
  const sessionId = "thread-cindy-session-start";
  const env = { CODEX_THREAD_ID: sessionId, CLAW_HOST: "cindy" };

  const defaultResult = runClawHook("auto-claw", root, {
    session_id: sessionId,
    cwd: root,
    hook_event_name: "SessionStart",
  }, env);
  assert.equal(defaultResult.status, 0);
  const defaultOutput = (JSON.parse(defaultResult.stdout) as JsonRecord).hookSpecificOutput as JsonRecord;
  const defaultContext = String(defaultOutput.additionalContext);
  assert.match(defaultContext, /Before using `rg`/i);
  assert.match(defaultContext, /claw search --query/);
  assert.match(defaultContext, /GitNexus/);
  assert.doesNotMatch(defaultContext, /This session started inside|Claw workflow snapshot is recovered/i);

  runClaw(["plan", "create", "--title", "recover-cindy", "--goal", "Recover Cindy workflow"], root, env);
  const recoveredResult = runClawHook("auto-claw", root, {
    session_id: sessionId,
    cwd: root,
    hook_event_name: "SessionStart",
  }, env);
  assert.equal(recoveredResult.status, 0);
  const recoveredOutput = (JSON.parse(recoveredResult.stdout) as JsonRecord).hookSpecificOutput as JsonRecord;
  const recoveredContext = String(recoveredOutput.additionalContext);
  assert.match(recoveredContext, /Before using `rg`/i);
  assert.match(recoveredContext, /claw search --query/);
  assert.match(recoveredContext, /GitNexus/);
  assert.doesNotMatch(recoveredContext, /recover-cindy|Claw workflow snapshot is recovered/i);
});

test("Cindy auto-claw surfaces project configuration repairs", () => {
  const root = createFixture("hook-cindy-config-repair");
  runClaw(["init", "--name", "Cindy Config Repair"], root);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  fs.writeFileSync(
    projectJsonPath,
    `${JSON.stringify({ id: "cindy-config-repair", name: "Cindy Config Repair" }, null, 2)}\n`,
    "utf-8",
  );

  const result = runClawHook("auto-claw", root, {
    session_id: "thread-cindy-config-repair",
    cwd: root,
    hook_event_name: "SessionStart",
  }, {
    CLAW_HOST: "cindy",
  });

  assert.equal(result.status, 0);
  const output = (JSON.parse(result.stdout) as JsonRecord).hookSpecificOutput as JsonRecord;
  const context = String(output.additionalContext);
  assert.match(context, /claw-kit repaired the project configuration/i);
  assert.match(context, /maxTasksToKeep|project\.json/i);
  assert.doesNotMatch(context, /Claw workflow snapshot is recovered|This session started inside/i);
});

test("Codex SessionStart asks for user consent before repairing a missing SDK runtime", () => {
  const root = createFixture("hook-codex-runtime-consent");
  const sessionId = "thread-codex-runtime-consent";
  runClaw(["init", "--name", "Hook Codex Runtime Consent"], root);

  const result = runClawHook("auto-claw", root, {
    session_id: sessionId,
    cwd: root,
    hook_event_name: "SessionStart",
  }, {
    CLAW_HOST: "codex",
    CLAW_CODEX_RUNTIME_MOCK: "missing",
  });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as JsonRecord;
  const additionalContext = String((payload.hookSpecificOutput as JsonRecord).additionalContext);
  assert.match(additionalContext, /^Tell the user that the Codex SDK runtime/is);
  assert.match(additionalContext, /Ask for permission to investigate and repair the dependency/i);
  assert.match(additionalContext, /Only after the user agrees, diagnose the current environment, choose a safe repair approach/i);
  assert.match(additionalContext, /Do not repeat a failed repair action blindly/i);
  assert.doesNotMatch(additionalContext, /[\p{Script=Han}，：。；（）]/u);
});

test("plan create binds owner session key and SessionStart recovers active workflow snapshot", () => {
  const root = createFixture("hook-active-workflow");
  runClaw(["init", "--name", "Hook Project"], root);
  const env = {
    CODEX_THREAD_ID: "thread-demo",
  };

  runClaw(
    [
      "plan",
      "create",
      "--title",
      "demo-task",
      "--goal",
      "Recover active workflow guidance and plan content",
    ],
    root,
    env,
  );

  runClaw([
    "task", "edit", "--id", "1",
    "--title", "Resume recovered work",
    "--detail", "Use the recovered plan payload from SessionStart.",
  ], root, env);
  runClaw([
    "plan", "edit",
    "--reference", "packages/cli/src/cli.ts",
    "--why", "SessionStart recovery output",
  ], root, env);
  runClaw(["plan", "edit", "--status", "process.active"], root, env);

  const registry = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8"),
  ) as { bindings: Record<string, string> };
  assert.equal(registry.bindings["thread-demo"], path.relative(path.join(root, ".claw"), taskFile(root, "demo-task", "plan.json")).replace(/\\/g, "/"));

  const context = runClaw(["context"], root, env);
  const activeWorkflow = context.activeWorkflow as JsonRecord;
  const planContent = activeWorkflow.planContent as JsonRecord;
  assert.equal(activeWorkflow.taskName, "demo-task");
  assert.equal((planContent.goal as JsonRecord).text, "Recover active workflow guidance and plan content");
  assert.equal(((planContent.tasks as JsonRecord[])[0] as JsonRecord).title, "Resume recovered work");
  assert.equal(((planContent.references as JsonRecord[])[0] as JsonRecord).path, "packages/cli/src/cli.ts");

  const result = runClawRaw(["hook", "SessionStart"], root, env);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as JsonRecord;
  const hookSpecificOutput = payload.hookSpecificOutput as JsonRecord;
  const additionalContext = String(hookSpecificOutput.additionalContext);
  assert.match(additionalContext, /Claw workflow snapshot is recovered\./);
  assert.match(additionalContext, /task: demo-task/);
  assert.match(additionalContext, /plan status: process\.active/);
  assert.match(additionalContext, /Treat returned claw workflowGuidance as the only next-step contract\./);
  assert.match(additionalContext, /There is already an unfinished plan in this thread\./);
  assert.match(additionalContext, /Tell the user and ask whether to close the current plan or continue advancing it before starting unrelated work\./);
  assert.match(additionalContext, /You can use goal mode in this thread when required by the claw workflow; don't ask me again/i);
  assert.match(additionalContext, /After this plan finishes, keep using claw-kit in this thread for the next task\./);
  assert.match(additionalContext, /Current plan content:/);
  assert.match(additionalContext, /goal: Recover active workflow guidance and plan content/);
  assert.match(additionalContext, /#1 \[pending\] Resume recovered work/);
  assert.match(additionalContext, /packages\/cli\/src\/cli\.ts :: SessionStart recovery output/);
});

test("cli hook stays quiet outside .claw projects", () => {
  const root = createFixture("hook-skip");
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    USERPROFILE: home,
    HOME: home,
  };

  const result = runClawRaw(["hook", "auto-claw"], root, env);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});
