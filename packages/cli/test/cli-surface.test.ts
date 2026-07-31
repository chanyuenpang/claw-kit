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


test("cli --help exits successfully", () => {
  const root = createFixture("help");
  const result = runClawRaw(["--help"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Usage: bin\.js <command> \[options\]/);
  assert.doesNotMatch(result.stderr, /\bdirect\b/);
});

test("cli --version exits successfully", () => {
  const root = createFixture("version-long");
  const result = runClawRaw(["--version"], root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), cliPackageVersion);
  assert.equal(result.stderr.trim(), "");
});

test("cli -v exits successfully", () => {
  const root = createFixture("version-short");
  const result = runClawRaw(["-v"], root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), cliPackageVersion);
  assert.equal(result.stderr.trim(), "");
});

test("cli help prints top-level usage to stderr", () => {
  const root = createFixture("help-command-top-level");
  const result = runClawRaw(["help"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Usage: bin\.js <command> \[options\]/);
  assert.doesNotMatch(result.stderr, /\bdirect\b/);
  assert.match(result.stderr, /truth ingest/);
  assert.equal(result.stdout, "");
});

test("cli help <command> prints command-specific help", () => {
  const root = createFixture("help-command-init");
  const result = runClawRaw(["help", "init"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Usage:\s+bin\.js init \[options\]/);
  assert.match(result.stderr, /--max-tasks-to-keep/);
});

test("cli <command> --help matches cli help <command>", () => {
  const root = createFixture("help-flag-vs-command");
  const flagResult = runClawRaw(["init", "--help"], root);
  const commandResult = runClawRaw(["help", "init"], root);
  assert.equal(flagResult.status, 0);
  assert.equal(commandResult.status, 0);
  assert.equal(flagResult.stderr, commandResult.stderr);
});

test("cli help plan prints subcommand group", () => {
  const root = createFixture("help-plan-group");
  const result = runClawRaw(["help", "plan"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /plan create/);
  assert.match(result.stderr, /plan edit/);
  assert.match(result.stderr, /plan wait/);
  assert.match(result.stderr, /plan resume/);
  assert.match(result.stderr, /plan show/);
  assert.match(result.stderr, /plan done/);
});

test("cli help plan wait and resume expose the intuitive lifecycle aliases", () => {
  const root = createFixture("help-plan-wait-resume");
  const waitResult = runClawRaw(["help", "plan", "wait"], root);
  const resumeResult = runClawRaw(["help", "plan", "resume"], root);
  assert.equal(waitResult.status, 0);
  assert.equal(resumeResult.status, 0);
  assert.match(waitResult.stderr, /plan wait/);
  assert.match(resumeResult.stderr, /plan resume/);
});

test("cli help codex driver documents the bootstrap source command", () => {
  const root = createFixture("help-codex-driver");
  const result = runClawRaw(["help", "codex", "driver"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /codex driver/);
  assert.match(result.stderr, /versioned JavaScript driver source/i);
});

test("cli help plan create and plan create --help are consistent", () => {
  const root = createFixture("help-plan-create-consistency");
  const commandResult = runClawRaw(["help", "plan", "create"], root);
  const flagResult = runClawRaw(["plan", "create", "--help"], root);
  assert.equal(commandResult.status, 0);
  assert.equal(flagResult.status, 0);
  assert.equal(commandResult.stderr, flagResult.stderr);
  assert.match(commandResult.stderr, /--goal/);
});

test("cli help search index and search index --help are consistent", () => {
  const root = createFixture("help-search-index-consistency");
  const commandResult = runClawRaw(["help", "search", "index"], root);
  const flagResult = runClawRaw(["search", "index", "--help"], root);
  assert.equal(commandResult.status, 0);
  assert.equal(flagResult.status, 0);
  assert.equal(commandResult.stdout, flagResult.stdout);
  assert.equal(commandResult.stderr, "");
  assert.equal(flagResult.stderr, "");
  assert.match(commandResult.stdout, /--refresh/);
});

test("cli search --help shows search query usage", () => {
  const root = createFixture("help-search-self");
  const result = runClawRaw(["search", "--help"], root);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /--query/);
  assert.match(result.stdout, /--dir/);
  assert.match(result.stdout, /--limit/);
});

test("cli help search and search --help return the same stdout usage", () => {
  const root = createFixture("help-search-consistency");
  const commandResult = runClawRaw(["help", "search"], root);
  const flagResult = runClawRaw(["search", "--help"], root);
  assert.equal(commandResult.status, 0);
  assert.equal(flagResult.status, 0);
  assert.equal(commandResult.stderr, "");
  assert.equal(flagResult.stderr, "");
  assert.equal(commandResult.stdout, flagResult.stdout);
});

test("cli search help is a non-mutating alias for search --help", () => {
  const root = createFixture("help-search-positional-alias");
  const aliasResult = runClawRaw(["search", "help"], root);
  const flagResult = runClawRaw(["search", "--help"], root);
  assert.equal(aliasResult.status, 0);
  assert.equal(aliasResult.stderr, "");
  assert.equal(aliasResult.stdout, flagResult.stdout);
  assert.equal(fs.existsSync(path.join(root, ".claw")), false);
});

test("cli plan create --help does not create a task", () => {
  const root = createFixture("help-plan-create-no-mutation");
  const result = runClawRaw(["plan", "create", "--help"], root);
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks")), false);
});

test("cli help <unknown> exits non-zero with a hint", () => {
  const root = createFixture("help-unknown-topic");
  const result = runClawRaw(["help", "garbage"], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown help topic/);
  assert.match(result.stderr, /Usage: bin\.js <command> \[options\]/);
});

test("cli -h aliases to --help", () => {
  const root = createFixture("help-short-flag");
  const shortResult = runClawRaw(["-h"], root);
  const longResult = runClawRaw(["--help"], root);
  assert.equal(shortResult.status, 0);
  assert.equal(longResult.status, 0);
  assert.equal(shortResult.stderr, longResult.stderr);
});

test("cli help plan edit documents --summary and not the mismatched --change-summary", () => {
  const root = createFixture("help-plan-edit-summary");
  const result = runClawRaw(["help", "plan", "edit"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /--summary/);
  assert.doesNotMatch(result.stderr, /--change-summary/);
});

test("cli help <command> <unknown-subcommand> exits non-zero with a hint", () => {
  const root = createFixture("help-unknown-subcommand");
  const result = runClawRaw(["help", "plan", "garbage"], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown plan subcommand: garbage/);
  assert.match(result.stderr, /plan create/);
});
