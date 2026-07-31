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


test("cli search accepts a positional query for project recall", () => {
  const root = createFixture("search-positional-query");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(
    [
      "init",
      "--name",
      "Search Positional Query",
      "--ext-path",
      "docs/",
    ],
    root,
    env,
  );
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "external alpha doc\n", "utf-8");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "search-positional-query",
        name: "Search Positional Query",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
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
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["search", "index", "--refresh"], root, env);

  const searchResult = runClaw(["search", "alpha"], root, env);
  assert.equal(searchResult.command, "search");
  assert.equal(searchResult.scope, "project");
  assert.ok(Array.isArray(searchResult.results));
});

test("cli search --dir temporarily searches another project without changing cwd", () => {
  const sourceRoot = createFixture("search-dir-source");
  const targetRoot = createFixture("search-dir-target");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(["init", "--name", "Search Dir Source", "--planning", "false"], sourceRoot, env);
  runClaw(["init", "--name", "Search Dir Target", "--ext-path", "docs/"], targetRoot, env);
  fs.mkdirSync(path.join(targetRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, "docs", "guide.md"), "cross-domain recall marker\n", "utf-8");
  runClaw(["search", "index", "--refresh"], targetRoot, env);

  const searchResult = runClaw(
    ["search", "cross-domain", "--dir", targetRoot],
    sourceRoot,
    env,
  );

  assert.equal(searchResult.command, "search");
  assert.equal(searchResult.scope, "project");
  assert.equal(
    path.resolve(String(searchResult.storePath)),
    path.resolve(targetRoot, ".claw", "memory.sqlite"),
  );
  assert.ok((searchResult.results as JsonRecord[]).some(
    (entry) => String(entry.sourcePath).endsWith(path.join("docs", "guide.md")),
  ));
});

test("cli search without a query returns a directly executable command hint", () => {
  const root = createFixture("search-missing-query-guidance");
  const result = runClawExpectFailure(["search"], root);
  const payload = result.error as JsonRecord;
  const details = payload.details as JsonRecord;

  assert.equal(payload.code, "PROJECT_CONFIG_INVALID");
  assert.match(String(payload.message), /claw search --query "<topic>"/);
  assert.equal(details.recommendedCommand, 'claw search --query "<topic>"');
});

test("cli search reuses one persistent embedding session across commands", { concurrency: false }, async () => {
  const root = createFixture("search-persistent-worker");
  const runtimeDir = path.join(root, "daemon-runtime");
  const eventLog = path.join(runtimeDir, "events.jsonl");
  const env = {
    CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: runtimeDir,
    CLAW_EMBEDDING_DAEMON_TEST_MOCK: "1",
    CLAW_EMBEDDING_DAEMON_IDLE_TTL_MS: "1000",
    CLAW_EMBEDDING_DAEMON_EVENT_LOG: eventLog,
  };
  runClaw(["init", "--name", "Search Persistent Worker", "--ext-path", "docs/"], root, env);
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "persistent worker reference document\n", "utf-8");
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify({
      version: cliPackageVersion,
      id: "search-persistent-worker",
      name: "Search Persistent Worker",
      maxTasksToKeep: 99,
      goalMode: true,
      truthDispatch: "per_task",
      contextPaths: [],
      memory: {
        enabled: true,
        externalDocPaths: ["docs/"],
        embedding: {
          provider: "local",
          model: "Snowflake/snowflake-arctic-embed-xs",
          local: { modelCacheDir: path.join(root, ".model-cache"), device: "cpu" },
        },
      },
      gitnexus: false,
    }, null, 2),
    "utf-8",
  );

  runClaw(["search", "index", "--refresh"], root, env);
  const first = runClaw(["search", "--query", "first unrelated semantic lookup"], root, env);
  const second = runClaw(["search", "--query", "second distinct semantic lookup"], root, env);
  assert.ok(Array.isArray(first.results));
  assert.ok(Array.isArray(second.results));
  assert.equal((first.telemetry as JsonRecord).embeddingRuntime, "persistent_daemon");
  assert.equal((second.telemetry as JsonRecord).embeddingRuntime, "persistent_daemon");
  assert.equal((first.telemetry as JsonRecord).queryEmbedding, "generated");

  const statePath = path.join(runtimeDir, "state.json");
  await waitForCondition(() => !fs.existsSync(statePath), 4000);
  const events = fs.readFileSync(eventLog, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { event: string; pid: number });
  assert.equal(events.filter((event) => event.event === "daemon.started").length, 1);
  assert.equal(events.filter((event) => event.event === "session.created").length, 1);
  assert.equal(events.filter((event) => event.event === "request.completed").length, 3);
  assert.equal(new Set(events.map((event) => event.pid)).size, 1);
});

test("cli search rejects task-local scope flags", () => {
  const root = createFixture("search-project-only");
  runClaw(["init", "--name", "Search Project Only"], root);

  const error = runClawExpectFailure(["search", "--query", "alpha", "--task", "demo-task"], root);
  const payload = error.error as JsonRecord;
  assert.equal(payload.code, "PROJECT_CONFIG_INVALID");
  assert.match(String(payload.message), /project-scoped only/i);
});

test("cli search rejects project queries when no vector index is available", () => {
  const root = createFixture("search-requires-vectors");
  runClaw(["init", "--name", "Search Requires Vectors"], root);

  const error = runClawExpectFailure(["search", "--query", "alpha"], root);
  const payload = error.error as JsonRecord;
  assert.equal(payload.code, "MEMORY_VECTOR_INDEX_REQUIRED");
  assert.match(String(payload.message), /vector index|memory\.embedding/i);
});

test("cli search index refresh returns project index metadata and embedding config", () => {
  const root = createFixture("search-index-refresh");
  fs.mkdirSync(path.join(root, ".claw", "truth"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "search-index-refresh",
        name: "Search Index Refresh",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          enabled: true,
          externalDocPaths: [],
          embedding: {
            provider: "openai",
            model: "text-embedding-3-small",
            remote: {
              apiKeyEnvVar: "OPENAI_API_KEY",
            },
          },
        },
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");

  const result = runClaw(["search", "index", "--refresh"], root);

  assert.equal(result.command, "search.index.refresh");
  assert.equal(result.scope, "project");
  assert.ok(Number(result.indexedCount) >= 2);
  assert.deepEqual(result.embedding, {
    provider: "openai",
    model: "text-embedding-3-small",
    remote: {
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  });
});

test("cli search index refresh returns local vector index metadata and only indexes markdown memory paths", () => {
  const root = createFixture("search-index-refresh-local");
  fs.mkdirSync(path.join(root, ".claw", "truth"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "search-index-refresh-local",
        name: "Search Index Refresh Local",
        maxTasksToKeep: 99,
        goalMode: true,
        truthDispatch: "per_task",
        externalTruthSkill: null,
        externalAdrSkill: null,
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
        gitnexus: false,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "shared.md"), "shared beta truth\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "gamma markdown doc\n", "utf-8");
  fs.writeFileSync(path.join(root, "docs", "notes.txt"), "should stay unindexed\n", "utf-8");

  const result = runClaw(["search", "index", "--refresh"], root, {
    CLAW_EMBEDDING_MOCK: "1",
  });

  assert.equal(result.command, "search.index.refresh");
  assert.equal(result.scope, "project");
  assert.deepEqual(result.embedding, {
    provider: "local",
    model: "Snowflake/snowflake-arctic-embed-xs",
    local: {
      modelCacheDir: path.join(root, ".model-cache"),
    },
  });
  assert.deepEqual(result.vectorIndex, {
    enabled: true,
    provider: "local",
    model: "Snowflake/snowflake-arctic-embed-xs",
    dimensions: 384,
    chunkCount: 3,
  });
  assert.equal((result.sources as string[]).some((item) => item.endsWith(path.join("docs", "notes.txt"))), false);
});
