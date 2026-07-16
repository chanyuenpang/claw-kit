import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const cliPackageVersion = String(
  (JSON.parse(fs.readFileSync(path.resolve(thisDir, "..", "package.json"), "utf-8")) as { version: string }).version,
);

function createFixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-cli-${name}-`));
}

function createPlanLikeTemplate(params: {
  id: string;
  configOverride?: Record<string, unknown>;
  title?: string;
  status?: string;
  goalText?: string;
  tasks: Array<Record<string, unknown>>;
  references?: Array<{ path: string; why: string }>;
  rules?: string[];
  keyDecisions?: string[];
  retrospectiveSummary?: string;
}): Record<string, unknown> {
  return {
    id: params.id,
    ...(params.configOverride ? { configOverride: params.configOverride } : {}),
    ...(params.title ? { title: params.title } : {}),
    status: params.status ?? "process.discussing",
    goal: {
      text: params.goalText ?? "",
    },
    requirements: {
      summary: "",
      openQuestions: [],
      acceptanceCriteria: [],
    },
    tasks: params.tasks,
    references: params.references ?? [],
    rules: params.rules ?? [],
    keyDecisions: params.keyDecisions ?? [],
    retrospective: {
      summary: params.retrospectiveSummary ?? "",
    },
  };
}

// Host adapter hooks (e.g. the opencode plugin shell.env) can inject CLAW_HOST
// and CLAW_GUIDANCE_CONFIG into the test runner's environment. When these leak
// into spawned `claw` processes, they alter workflow guidance behavior (host
// gating, stale config) and pollute assertions. Strip them by default so tests
// exercise core's bundled defaults unless a test explicitly opts in via `env`.
const ISOLATED_ENV_KEYS = ["CLAW_HOST", "CLAW_GUIDANCE_CONFIG"] as const;

function buildSpawnEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ISOLATED_ENV_KEYS) {
    delete env[key];
  }
  return { ...env, ...extra };
}

function runClaw(args: string[], cwd: string, env?: NodeJS.ProcessEnv): JsonRecord {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`claw ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as JsonRecord;
}

function runClawExpectFailure(args: string[], cwd: string, env?: NodeJS.ProcessEnv): JsonRecord {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
  });

  if (result.status === 0) {
    throw new Error(`claw ${args.join(" ")} unexpectedly succeeded\nstdout:\n${result.stdout}`);
  }

  const match = result.stderr.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`claw ${args.join(" ")} failed without JSON stderr\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(match[0]) as JsonRecord;
}

function runClawRaw(args: string[], cwd: string, env?: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function waitForCompletionRefreshStatus(statusFile: string, timeoutMs = 15000): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(statusFile)) {
      const raw = fs.readFileSync(statusFile, "utf-8").trim();
      if (raw) {
        const payload = JSON.parse(raw) as JsonRecord;
        if ("finishedAt" in payload) {
          return payload;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for completion refresh status file: ${statusFile}`);
}

async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms.`);
}

function getLatestCompletionRefreshStatusFile(root: string): string | null {
  return getCompletionRefreshStatusFiles(root)[0] ?? null;
}

function getCompletionRefreshStatusFiles(root: string): string[] {
  const logDir = path.join(root, ".claw", "logs", "completion-refresh");
  if (!fs.existsSync(logDir)) {
    return [];
  }
  return fs
    .readdirSync(logDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(logDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

async function waitForLatestCompletionRefreshStatus(root: string, timeoutMs = 15000): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusFile = getLatestCompletionRefreshStatusFile(root);
    if (statusFile) {
      return waitForCompletionRefreshStatus(statusFile, Math.max(0, deadline - Date.now()));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for completion refresh status file under ${root}`);
}

function createGitnexusShim(mode: "fallback" | "primary" | "lock-once", delayMs = 0): { binDir: string; logPath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-gitnexus-bin-"));
  const logPath = path.join(binDir, "gitnexus.log");
  const cmdPath = path.join(binDir, "gitnexus.cmd");
const jsPath = path.join(binDir, "gitnexus-shim.js");
  const lockMarkerPath = path.join(binDir, "lock-once.marker");
  const script = `
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);

if (args[0] === "analyze" && ${JSON.stringify(delayMs)} > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${JSON.stringify(delayMs)});
}

if (args[0] === "analyze" && ${JSON.stringify(mode)} === "lock-once" && !fs.existsSync(${JSON.stringify(lockMarkerPath)})) {
  fs.writeFileSync(${JSON.stringify(lockMarkerPath)}, "locked once\\n", "utf8");
  process.stderr.write("database is locked\\n");
  process.exit(1);
}

if (args.includes("--no-ai-context") && ${JSON.stringify(mode)} === "fallback") {
  process.stderr.write("unknown option --no-ai-context\\n");
  process.exit(1);
}

if (args[0] === "analyze" && args.includes("--embeddings")) {
  const metaPath = path.join(process.cwd(), ".gitnexus", "meta.json");
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    } catch {
      meta = {};
    }
  }
  meta.analyzeOptions = {
    ...(meta.analyzeOptions || {}),
    embeddings: true,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\\n", "utf-8");
}
`;
  fs.writeFileSync(jsPath, script, "utf-8");
  fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`, "utf-8");
  return { binDir, logPath };
}

function createNpmShim(mode: "fail-install" | "pass"): { binDir: string; logPath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-npm-bin-"));
  const logPath = path.join(binDir, "npm.log");
  const cmdPath = path.join(binDir, "npm.cmd");
  const jsPath = path.join(binDir, "npm-shim.js");
  const script = `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);
if (args[0] === "install" && ${JSON.stringify(mode)} === "fail-install") {
  process.stderr.write("install failed\\n");
  process.exit(1);
}
if (args[0] === "root" && args[1] === "-g") {
  process.stdout.write("C:/fake-global-root\\n");
  process.exit(0);
}
process.exit(0);
`;
  fs.writeFileSync(jsPath, script, "utf-8");
  fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`, "utf-8");
  return { binDir, logPath };
}

function createClawUpdateNpmShim(options: {
  latestVersion: string;
  failLatestInstall?: boolean;
}): { binDir: string; logPath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-claw-update-npm-"));
  const logPath = path.join(binDir, "npm.log");
  const cmdPath = path.join(binDir, "npm.cmd");
  const jsPath = path.join(binDir, "npm-shim.js");
  const script = `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);
if (args[0] === "view" && args[1] === "@veewo/claw" && args[2] === "version") {
  process.stdout.write(${JSON.stringify(options.latestVersion)} + "\\n");
  process.exit(0);
}
if (args[0] === "install" && args[1] === "-g" && args[2] === "@veewo/claw@latest") {
  if (${options.failLatestInstall === true ? "true" : "false"}) {
    process.stderr.write("latest install failed\\n");
    process.exit(1);
  }
  process.exit(0);
}
process.exit(0);
`;
  fs.writeFileSync(jsPath, script, "utf-8");
  fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" %*\r\n`, "utf-8");
  return { binDir, logPath };
}

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
      "--external-truth-skill",
      "external-truth-writer",
      "--external-adr-skill",
      "external-adr-writer",
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
        truthDispatch: "per_task",
        externalPlanningSkill: null,
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
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
  const createGoalMode = writeResult.goalMode as JsonRecord;
  const createGoalTool = writeResult.goalTool as JsonRecord;
  assert.match(String(createGoalMode.recommendedObjective), /Verify the CLI lifecycle/);
  assert.equal(createGoalMode.setWhen, "on_enter_process_active");
  assert.equal(createGoalTool.tool, "create_goal");
  assert.equal(createGoalTool.allowOverwrite, true);
  assert.equal("nextAction" in writeResult, false);
  assert.equal("instruction" in writeResult, false);
  assert.equal("askUser" in writeResult, false);
  assert.equal(
    writeResult.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption.",
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
    ["plan", "edit", "--task", "e2e-task", "--patch", inProgressPath],
    root,
    env,
  );
  assert.deepEqual(inProgressResult.nextsteps, ["Continue the current task."]);
  assert.equal("nextTask" in inProgressResult, false);
  assert.deepEqual(inProgressResult.recommendedCommands, [
    "claw plan edit --task e2e-task --task-id 3 --task-status done",
  ]);
  assert.equal("notes" in inProgressResult, false);

  const taskDone = runClaw(
    ["plan", "edit", "--task", "e2e-task", "--task-id", "3", "--task-status", "done"],
    root,
    env,
  );
  assert.equal("stage" in taskDone, false);
  const truthDelegate = ((taskDone.delegateSubagents as JsonRecord[])[0] ?? {});
  const adrDelegate = ((taskDone.delegateSubagents as JsonRecord[])[1] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "external-truth-writer");
  assert.equal(truthDelegate.dispatch, "when_reusable_truth_confirmed");
  assert.equal(truthDelegate.model, "gpt-5.4-mini");
  assert.equal(truthDelegate.fork_context, false);
  assert.equal(truthDelegate.waitForCompletion, false);
  assert.equal(truthDelegate.preferReuseSameTypeInThread, true);
  assert.equal(truthDelegate.closePolicy, "keep_open_for_reuse");
  assert.equal(
    truthDelegate.inputContract,
    "curated completed subtask report containing the reusable facts and evidence needed for deposition; canonical target routing belongs to the truth writer",
  );
  assert.equal(adrDelegate.name, "adr-writer");
  assert.equal(adrDelegate.dispatch, "required");
  assert.equal(adrDelegate.waitForCompletion, false);
  assert.equal(
    adrDelegate.inputContract,
    "updated active root plan.json path after retrospective and durable keyDecisions are persisted; plan done retains this path for at least one hour so the ADR writer can continue asynchronously; decision extraction and canonical target routing belong to the ADR writer",
  );
  assert.deepEqual(taskDone.nextsteps, [
    "1. Clear thread progress with `update_plan`.",
    "2. Read the returned `truth-writer` entry's `dispatch`. For `when_reusable_truth_confirmed`, the main agent must evaluate reusable truth and dispatch only after confirmation.",
    "3. First write both `retrospective` and `keyDecisions` back into the plan, then execute the `adr-writer` contract with `dispatch: required` using that updated active root `plan.json` path. Do not wait for the writer before running `claw plan done`; delayed archive keeps the path readable for at least one hour.",
  ]);
  assert.deepEqual(taskDone.recommendedCommands, [
    "claw plan edit --task e2e-task --patch <completed-plan.json>",
    "claw plan done --task e2e-task --summary \"<retrospective summary>\"",
  ]);
  assert.equal(
    taskDone.notes,
    "Truth dispatch requires the main agent's reusable-value confirmation; ADR dispatch is required but remains asynchronous for root-plan closeout. Root `claw plan done` records completedAt and keeps the plan path readable for at least one hour. Honor every field in a dispatched delegate contract.",
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
    ["plan", "done", "--task", "e2e-task", "--summary", "CLI flow completed."],
    root,
    env,
  );
  assert.equal("delegateSubagents" in doneResult, false);
  assert.equal("completionRefresh" in doneResult, false);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  const gitnexus = refreshStatus.gitnexus as JsonRecord;
  assert.equal(refreshStatus.ok, true);
  assert.ok(Number((memory.project as JsonRecord).indexedCount) > 0);
  assert.ok(memory.task as JsonRecord | undefined);
  assert.equal(gitnexus.enabled, false);
  assert.match(String(gitnexus.reason), /preflight/);
  assert.equal(doneResult.planSummary, "1/1 e2e-task");

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
  assert.equal(writeResult.planSummary, "0/2 这是一个任务标题");
  assert.equal(writeResult.goalMode, undefined);
  assert.deepEqual(writeResult.nextsteps, [
    "1. Run one project recall query.",
    "2. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.equal((writeResult.recommendedCommands as string[])[0], 'claw search --query "<topic>"');
  assert.equal(
    (writeResult.recommendedCommands as string[])[1],
    "claw plan start --task 这是一个任务标题 --patch <plan-patch.json> --append-tasks <tasks.json>",
  );
  assert.equal("goalTool" in writeResult, false);
  assert.equal((writeResult.plan as JsonRecord).status, "process.discussing");
  const plan = writeResult.plan as JsonRecord;
  const tasks = plan.tasks as JsonRecord[];
  assert.equal(String((tasks[0] as JsonRecord).title), "Use the planning skill to refine the request and append executable tasks");
  assert.equal(String((tasks[1] as JsonRecord).title), "Enter process.active");
});

test("cli plan create accepts an explicit template flag", () => {
  const root = createFixture("template-flag");
  runClaw(["init", "--name", "Template Alias"], root);

  const result = runClaw(["plan", "create", "Templated task", "--template", "default"], root);
  const plan = result.plan as JsonRecord;
  const tasks = plan.tasks as JsonRecord[];

  assert.equal(result.command, "plan.create");
  assert.equal((plan.status as string), "process.discussing");
  assert.deepEqual(result.nextsteps, [
    "1. Run one project recall query.",
    "2. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.equal((result.recommendedCommands as string[])[0], 'claw search --query "<topic>"');
  assert.equal("goalTool" in result, false);
  assert.equal(String((tasks[0] as JsonRecord).title), "Use the planning skill to refine the request and append executable tasks");
  assert.equal(String((tasks[1] as JsonRecord).title), "Enter process.active");
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
      "--task",
      "demo-task",
      "--reference-path",
      "packages/cli/src/cli.ts",
      "--reference-why",
      "flag parsing entrypoint",
    ],
    root,
  );

  const planPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  assert.deepEqual(plan.references, [
    {
      path: "packages/cli/src/cli.ts",
      why: "flag parsing entrypoint",
    },
  ]);
});

test("cli plan start performs one atomic activation and returns idempotent host actions", () => {
  const root = createFixture("plan-start-atomic");
  runClaw(["init", "--name", "Atomic Start"], root);
  const created = runClaw(["plan", "create", "atomic-task", "--goal", "Start in one mutation"], root);
  const taskName = path.basename(path.dirname(String(created.planPath)));
  const patchPath = path.join(root, "plan-patch.json");
  const tasksPath = path.join(root, "tasks.json");
  fs.writeFileSync(patchPath, JSON.stringify({
    requirements: {
      summary: "Ready",
      openQuestions: [],
      acceptanceCriteria: ["Started"],
    },
  }), "utf8");
  fs.writeFileSync(tasksPath, JSON.stringify([
    { title: "Implement outcome", status: "pending" },
  ]), "utf8");

  const result = runClaw([
    "plan", "start", "--task", taskName, "--patch", patchPath, "--append-tasks", tasksPath,
  ], root);
  assert.equal(result.command, "plan.start");
  assert.equal(result.planStatus, "process.active");
  assert.deepEqual(result.changedTaskIds, [1, 2]);
  assert.deepEqual(result.appendedTaskIds, [3]);
  assert.deepEqual(result.emittedEvents, [
    "plan_changed",
    "plan_task_completed",
    "plan_task_completed",
    "plan_activated",
  ]);
  const events = result.events as JsonRecord[];
  assert.equal(new Set(events.map((event) => event.mutationId)).size, 1);
  assert.ok(events.every((event) => event.schemaVersion === 1));
  const hostActions = result.hostActions as JsonRecord[];
  assert.deepEqual(hostActions.map((action) => action.tool), ["update_plan", "create_goal"]);
  assert.ok(hostActions.every((action) => action.schemaVersion === 1));
  assert.equal(new Set(hostActions.map((action) => action.id)).size, hostActions.length);
  assert.ok(hostActions.every((action) => String(action.sourceEventId).length > 0));
  assert.deepEqual(Object.keys(hostActions[0].input as JsonRecord).sort(), ["explanation", "plan"]);
  assert.deepEqual(Object.keys(hostActions[1].input as JsonRecord), ["objective"]);
  assert.deepEqual(Object.keys(hostActions[1].meta as JsonRecord).sort(), ["allowOverwrite", "reason"]);
});

test("cli plan edit rejects partial single-reference shortcut flags", () => {
  const root = createFixture("plan-edit-reference-flags-missing-half");
  runClaw(["init", "--name", "Reference Flags Missing Half", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Track one reference"], root);

  const result = runClawExpectFailure(
    [
      "plan",
      "edit",
      "--task",
      "demo-task",
      "--reference-path",
      "packages/cli/src/cli.ts",
    ],
    root,
  );

  const error = result.error as JsonRecord;
  assert.match(String(error.message), /--reference-path and --reference-why must be provided together/);
});

test("cli plan edit rejects combining patch.tasks with task status updates", () => {
  const root = createFixture("plan-edit-mixed-task-update");
  runClaw(["init", "--name", "Mixed Task Update", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Reject mixed task updates"], root);

  const patchPath = path.join(root, "replace-tasks.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify({ tasks: [{ id: 2, title: "Replacement task", status: "pending" }] }, null, 2),
    "utf-8",
  );

  const result = runClawExpectFailure(
    [
      "plan",
      "edit",
      "--task",
      "demo-task",
      "--patch",
      patchPath,
      "--task-id",
      "1",
      "--task-status",
      "done",
    ],
    root,
  );

  const error = result.error as JsonRecord;
  assert.match(String(error.message), /patch\.tasks cannot be combined with taskId\/taskStatus updates/);
});

test("cli plan edit patch follows merge-patch semantics for nested objects and null deletes", () => {
  const root = createFixture("cli-plan-edit-merge-patch");
  runClaw(["init", "--name", "CLI Merge Patch", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Keep patch expectations aligned"], root);

  const seedPatchPath = path.join(root, "seed-plan.json");
  fs.writeFileSync(
    seedPatchPath,
    JSON.stringify(
      {
        requirements: {
          summary: "Initial summary",
          openQuestions: ["Question A"],
          acceptanceCriteria: ["Criterion A"],
        },
        summary: "Detailed summary",
        references: [{ path: "docs/example.md", why: "carry context" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", seedPatchPath], root);

  const mergePatchPath = path.join(root, "merge-plan.json");
  fs.writeFileSync(
    mergePatchPath,
    JSON.stringify(
      {
        requirements: {
          summary: "Updated summary",
        },
        summary: null,
        references: null,
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", mergePatchPath], root);

  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.deepEqual(plan.requirements, {
    summary: "Updated summary",
    openQuestions: ["Question A"],
    acceptanceCriteria: ["Criterion A"],
  });
  assert.equal(plan.summary, undefined);
  assert.equal(plan.references, undefined);
});

test("cli plan edit wait and resume surfaces goal mode pause and restart guidance", () => {
  const root = createFixture("plan-edit-wait-and-resume-guidance");
  runClaw(["init", "--name", "Wait And Resume Guidance", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Pause and resume cleanly"], root);

  const patchPath = path.join(root, "wait-guidance-tasks.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify({ tasks: [{ id: 1, title: "Implement work", status: "in_progress" }] }, null, 2),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", patchPath], root);

  const waitResult = runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.wait"], root);
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
  const waitGoalAction = (waitResult.hostActions as JsonRecord[]).find((action) => action.tool === "update_goal") as JsonRecord;
  assert.equal(waitGoalAction.schemaVersion, 1);
  assert.deepEqual(waitGoalAction.input, { status: "blocked" });
  assert.deepEqual(Object.keys(waitGoalAction.meta as JsonRecord), ["reason"]);
  assert.equal(waitResult.goalMode, undefined);

  const resumeResult = runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);
  const resumeGoalMode = resumeResult.goalMode as JsonRecord;
  const resumeGoalTool = resumeResult.goalTool as JsonRecord;
  assert.equal(resumeResult.planStatus, "process.active");
  assert.deepEqual(resumeResult.nextsteps, [
    "Sync thread progress with `update_plan`.",
    "Restore Goal Mode to the active state.",
    "Resume with task #1.",
  ]);
  assert.equal(
    resumeResult.notes,
    "The plan is moving back from a paused status into active execution, so Goal Mode should be restored to the active state before work resumes.",
  );
  assert.equal(resumeGoalMode.setWhen, "on_resume_process_active");
  assert.match(String(resumeGoalMode.recommendedObjective), /Pause and resume cleanly/);
  assert.equal(resumeGoalTool.tool, "create_goal");
  assert.equal(resumeGoalTool.allowOverwrite, true);
});

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

test("cli plan edit append-tasks auto-assigns ids when omitted", () => {
  const root = createFixture("append-auto-task-ids");
  runClaw(["init", "--name", "Append Auto Ids", "--planning", "false"], root);
  runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Verify auto ids"],
    root,
  );

  const explicitPath = path.join(root, "append-explicit.json");
  fs.writeFileSync(
    explicitPath,
    JSON.stringify([{ id: 3, title: "Existing numbered task", status: "pending" }], null, 2),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--append-tasks", explicitPath], root);

  const autoPath = path.join(root, "append-auto.json");
  fs.writeFileSync(
    autoPath,
    JSON.stringify([{ title: "Auto numbered task" }], null, 2),
    "utf-8",
  );
  const result = runClaw(["plan", "edit", "--task", "demo-task", "--append-tasks", autoPath], root);

  assert.equal(result.planSummary, "0/3 demo-task");
  assert.deepEqual(result.nextTask, {
    id: 1,
    title: "Verify auto ids",
    status: "pending",
  });

  const planShow = runClaw(["plan", "show", "--task", "demo-task"], root);
  const planView = planShow.planView as JsonRecord;
  const tasks = ((planView.tasks as JsonRecord).items as JsonRecord[]).map((task) => ({
    id: Number(task.id),
    title: String(task.title),
    status: String(task.status),
  }));
  assert.deepEqual(tasks, [
    { id: 1, title: "Verify auto ids", status: "pending" },
    { id: 3, title: "Existing numbered task", status: "pending" },
    { id: 4, title: "Auto numbered task", status: "pending" },
  ]);
});

test("cli returns truth-writer contract on completed task before final plan completion", () => {
  const root = createFixture("cli-truth-contract-before-done");
  runClaw(
    [
      "init",
      "--name",
      "CLI Truth Contract",
      "--planning",
      "false",
      "--external-truth-skill",
      "external-truth-writer",
    ],
    root,
  );
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.truthDispatch = "per_task";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [
          { id: 3, title: "First task", status: "pending" },
          { id: 4, title: "Second task", status: "pending" }
        ]
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Verify task completion contract"], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", contentPath], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);

  const taskDone = runClaw(
    ["plan", "edit", "--task", "demo-task", "--task-id", "3", "--task-status", "done"],
    root,
  );

  assert.equal("stage" in taskDone, false);
  assert.equal("summary" in taskDone, false);
  assert.deepEqual(taskDone.nextsteps, [
    "1. Sync thread progress with `update_plan`.",
    "2. Read the returned `truth-writer` entry's `dispatch`. For `when_reusable_truth_confirmed`, the main agent must evaluate reusable truth and dispatch only after confirmation.",
    "3. Continue with task #4.",
  ]);
  assert.equal(
    taskDone.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption. Evaluate confirmed reusable truth before truth dispatch; when dispatching the writer, honor every field in its delegate contract.",
  );
  assert.deepEqual(taskDone.nextTask, {
    id: 4,
    title: "Second task",
    status: "pending",
  });
  const truthDelegate = ((taskDone.delegateSubagents as JsonRecord[])[0] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "external-truth-writer");
  assert.equal(truthDelegate.dispatch, "when_reusable_truth_confirmed");
  assert.equal(truthDelegate.fork_context, false);
  assert.equal(
    truthDelegate.inputContract,
    "curated completed subtask report containing the reusable facts and evidence needed for deposition; canonical target routing belongs to the truth writer",
  );
});

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

  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [
          { id: 3, title: "First task", status: "pending" },
          { id: 4, title: "Second task", status: "pending" }
        ]
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

  runClaw(["plan", "edit", "--task", "demo-task", "--patch", contentPath], root);
  const activateResult = runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);
  assert.equal("goalMode" in activateResult, false);

  const taskDone = runClaw(
    ["plan", "edit", "--task", "demo-task", "--task-id", "3", "--task-status", "done"],
    root,
  );
  assert.equal("delegateSubagents" in taskDone, false);
  assert.equal((taskDone.nextsteps as string[]).some((step) => step.includes("truth-writer")), false);

  const allDone = runClaw(
    ["plan", "edit", "--task", "demo-task", "--task-id", "4", "--task-status", "done"],
    root,
  );
  const truthDelegate = ((allDone.delegateSubagents as JsonRecord[])[0] ?? {});
  const adrDelegate = ((allDone.delegateSubagents as JsonRecord[])[1] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(adrDelegate.name, "adr-writer");
  assert.equal(truthDelegate.dispatch, "when_reusable_truth_confirmed");
  assert.equal(adrDelegate.dispatch, "required");
  assert.equal(adrDelegate.waitForCompletion, false);
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

  runClaw(
    ["plan", "create", "--title", "demo-task", "--goal", "Require an explicit route choice", "--template", "choice-required"],
    root,
  );

  const failure = runClawExpectFailure(["task", "done", "--task", "demo-task", "--id", "1"], root);
  const error = failure.error as JsonRecord;
  assert.match(String(error.message), /requires choiceId/i);
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

  const taskDone = runClaw(
    ["task", "done", "--task", "demo-task", "--id", "1", "--choice", "simple"],
    root,
  );
  assert.equal(taskDone.command, "task.done");

  const planPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  const tasks = (plan.tasks as JsonRecord[]) ?? [];
  assert.equal(String((tasks[0] as JsonRecord).choiceId), "simple");
});

test("cli plan edit forwards --task-choice for route-aware templates", () => {
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
    ["plan", "edit", "--task", "demo-task", "--task-id", "1", "--task-status", "done", "--task-choice", "branch_a"],
    root,
  );

  const planPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as JsonRecord;
  const tasks = (plan.tasks as JsonRecord[]) ?? [];
  assert.equal(String((tasks[0] as JsonRecord).choiceId), "branch_a");
});

test("cli task status changed back to pending does not return nextTask", () => {
  const root = createFixture("cli-pending-no-next-task");
  runClaw(["init", "--name", "Pending No NextTask", "--planning", "false"], root);

  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [
          { id: 1, title: "Current task", status: "in_progress" },
          { id: 2, title: "Later task", status: "pending" }
        ]
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Keep pending edits lightweight"], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", contentPath], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);

  const result = runClaw(
    ["plan", "edit", "--task", "demo-task", "--task-id", "1", "--task-status", "pending"],
    root,
  );

  assert.deepEqual(result.nextsteps, ["Continue with task #1."]);
  assert.equal("nextTask" in result, false);
  assert.deepEqual(result.recommendedCommands, [
    "claw plan edit --task demo-task --task-id <id> --task-status done",
  ]);
});

test("cli subplan create keeps task rootPlan stable and derives goal from the parent task", () => {
  const root = createFixture("cli-subplan-create");
  const env = { CODEX_THREAD_ID: "thread-subplan-create" };
  runClaw(["init", "--name", "Subplan Write", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root, env);

  const patchPath = path.join(root, "root-tasks.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Implement child work", detail: "Split the risky work into a subplan", status: "pending" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", patchPath], root, env);

  const result = runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root, env);

  assert.match(String(result.planPath), /tasks[\\/]demo-task[\\/]Implement-child-work\.json$/);
  const registry = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8"),
  ) as { bindings: Record<string, string> };
  const childPlan = JSON.parse(fs.readFileSync(String(result.planPath), "utf-8")) as JsonRecord;
  assert.equal(registry.bindings["thread-subplan-create"], "tasks/demo-task/Implement-child-work.json");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json")), false);
  assert.equal(childPlan.title, "Implement child work");
  assert.equal(childPlan.status, "process.discussing");
  assert.deepEqual(result.nextsteps, [
    "Set or overwrite Goal Mode to this subplan objective before doing target work: Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：Implement child work: Split the risky work into a subplan",
    "1. Run one project recall query.",
    "2. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.equal((result.recommendedCommands as string[])[0], 'claw search --query "<topic>"');
  assert.equal(
    ((result.goalMode as JsonRecord).recommendedObjective),
    "Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：Implement child work: Split the risky work into a subplan",
  );
  assert.equal(((result.goalMode as JsonRecord).allowOverwrite), true);
  assert.match(String(result.notes), /parent\/root plan as paused/i);
  assert.equal("goalTool" in result, false);
  assert.equal(((childPlan.goal as JsonRecord).text), "Implement child work: Split the risky work into a subplan");
});

test("cli subplan create accepts an explicit template flag", () => {
  const root = createFixture("cli-subplan-create-template-goal");
  runClaw(["init", "--name", "Subplan Create Template Goal"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root);

  const patchPath = path.join(root, "root-tasks.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Implement child work", status: "pending" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", patchPath], root);

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
  assert.equal(((childPlan.goal as JsonRecord).text), "Implement child work");
  assert.equal((childPlan.tasks as unknown[]).length, 2);
});

test("cli plan, subplan, and template validate share the skill-local template resolver", () => {
  const root = createFixture("cli-shared-template-resolver");
  const skillDir = path.join(root, "packages", "test-adapter", "skills", "update");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(
    path.resolve(thisDir, "..", "..", "..", "shared", "skills", "update", "TEMPLATE.json"),
    path.join(skillDir, "TEMPLATE.json"),
  );
  runClaw(["init", "--name", "Shared Template Resolver"], root);

  const rootResult = runClaw(
    ["plan", "create", "--title", "template-parent", "--goal", "Run root update", "--template", "update"],
    root,
  );
  const rootPlan = JSON.parse(fs.readFileSync(String(rootResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(rootPlan.templateId, "update");
  assert.equal((rootPlan.tasks as unknown[]).length, 3);

  const childResult = runClaw(
    ["subplan", "create", "--parent", "template-parent", "--task-id", "1", "--template", "update"],
    root,
  );
  const childPlan = JSON.parse(fs.readFileSync(String(childResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(childPlan.templateId, "update");
  assert.equal((childPlan.tasks as unknown[]).length, 3);

  const validation = runClaw(["template", "validate", "--template", "update"], root);
  assert.equal(validation.command, "template.validate");
  assert.equal(validation.ok, true);
  assert.equal(validation.templateId, "update");
  assert.equal(validation.taskCount, 3);
  assert.deepEqual(validation.choiceRequiredTasks, [{
    taskId: 1,
    choiceIds: ["codex", "opencode", "conservative"],
  }]);
});

test("cli plan done on a subplan resumes the parent plan instead of archiving the whole task", () => {
  const root = createFixture("cli-subplan-done-resume-parent");
  const env = { CODEX_THREAD_ID: "thread-subplan-done" };
  runClaw(["init", "--name", "Subplan Done Resume Parent", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root, env);

  const rootPatchPath = path.join(root, "root-tasks.json");
  fs.writeFileSync(
    rootPatchPath,
    JSON.stringify(
      {
        tasks: [
          { id: 1, title: "Implement child work", detail: "Split the risky work into a subplan", status: "pending" },
          { id: 2, title: "Resume parent work", status: "pending" },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", rootPatchPath], root, env);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root, env);
  runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root, env);

  const childPatchPath = path.join(root, "child-plan.json");
  fs.writeFileSync(
    childPatchPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Finish child", status: "pending" }],
        retrospective: { summary: "Child complete." },
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "Implement-child-work.json", "--patch", childPatchPath], root, env);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "Implement-child-work.json", "--plan-status", "process.active"], root, env);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "Implement-child-work.json", "--task-id", "1", "--task-status", "done"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task", "demo-task", "--plan", "Implement-child-work.json", "--summary", "Child complete."],
    root,
    env,
  );

  const registry = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8"),
  ) as { bindings: Record<string, string> };
  const parentPlan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  const childPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "Implement-child-work.json"), "utf-8"),
  ) as JsonRecord;

  assert.equal(doneResult.planStatus, "process.active");
  assert.match(String(doneResult.planPath), /tasks[\\/]demo-task[\\/]plan\.json$/);
  assert.deepEqual(doneResult.nextsteps, [
    "Sync thread progress with `update_plan`.",
    "Start with task #2.",
  ]);
  assert.deepEqual(doneResult.nextTask, {
    id: 2,
    title: "Resume parent work",
    status: "pending",
  });
  assert.equal((doneResult.goalMode as JsonRecord).setWhen, "on_enter_process_active");
  assert.equal("archivedPlanPath" in doneResult, false);
  assert.equal(registry.bindings["thread-subplan-done"], "tasks/demo-task/plan.json");
  assert.equal(((parentPlan.tasks as JsonRecord[])[0] as JsonRecord).status, "done");
  assert.equal(((parentPlan.tasks as JsonRecord[])[1] as JsonRecord).status, "pending");
  assert.equal(childPlan.status, "end.completed");
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "demo-task")), false);
});

test("cli init writes maxTasksToKeep into project.json", () => {
  const root = createFixture("init-max-tasks");

  runClaw(["init", "--name", "Task Retention", "--max-tasks-to-keep", "12"], root);

  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;
  assert.equal(projectConfig.maxTasksToKeep, 12);
  assert.equal(projectConfig.autoUpdate, true);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "final_only");
  assert.equal(
    ((projectConfig.memory as JsonRecord).embedding as JsonRecord).model,
    "Snowflake/snowflake-arctic-embed-m-v2.0",
  );
});

test("cli init writes default maxTasksToKeep into project.json", () => {
  const root = createFixture("init-default-max-tasks");

  runClaw(["init", "--name", "Default Retention"], root);

  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "final_only");
  assert.equal(
    ((projectConfig.memory as JsonRecord).embedding as JsonRecord).model,
    "Snowflake/snowflake-arctic-embed-m-v2.0",
  );
});

test("cli context includes protocolCheck for existing .claw projects", () => {
  const root = createFixture("context-check");
  runClaw(["init", "--name", "Context Check"], root);

  const result = runClaw(["context"], root);
  const protocolCheck = result.protocolCheck as JsonRecord;
  const startupRecovery = result.startupRecovery as JsonRecord;

  assert.equal(protocolCheck.ok, true);
  assert.equal(protocolCheck.issues instanceof Array, true);
  assert.equal(result.project !== undefined, true);
  assert.equal(startupRecovery.initialized, false);
  assert.equal(startupRecovery.corrected, false);
  assert.equal((((result.project as JsonRecord).projectConfig as JsonRecord).version), cliPackageVersion);
  assert.equal(
    ((((result.project as JsonRecord).projectConfig as JsonRecord).memory as JsonRecord).embedding as JsonRecord).model,
    "Snowflake/snowflake-arctic-embed-m-v2.0",
  );
});

test("cli context auto-initializes when .claw is missing", () => {
  const root = createFixture("context-init");

  const result = runClaw(["context"], root);
  const startupRecovery = result.startupRecovery as JsonRecord;
  const protocolCheck = result.protocolCheck as JsonRecord;

  assert.equal(startupRecovery.initialized, true);
  assert.equal(startupRecovery.corrected, false);
  assert.equal(protocolCheck.ok, true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "project.json")), true);
  assert.equal((result.project as JsonRecord).projectRoot, root);
  assert.equal((((result.project as JsonRecord).projectConfig as JsonRecord).version), cliPackageVersion);
  assert.equal(
    ((((result.project as JsonRecord).projectConfig as JsonRecord).memory as JsonRecord).embedding as JsonRecord).model,
    "Snowflake/snowflake-arctic-embed-m-v2.0",
  );
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
  const protocolCheck = result.protocolCheck as JsonRecord;
  const projectConfig = JSON.parse(fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8")) as JsonRecord;

  assert.equal(startupRecovery.initialized, false);
  assert.equal(startupRecovery.corrected, true);
  assert.ok(Array.isArray(startupRecovery.fixedPaths));
  assert.equal(protocolCheck.ok, true);
  assert.equal(projectConfig.version, cliPackageVersion);
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.autoUpdate, true);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.deepEqual(projectConfig.memory, {
    enabled: true,
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-m-v2.0",
    },
  });
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "final_only");
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

test("cli hook promotes update skill first when autoUpdate is enabled and a newer published version exists", () => {
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
  assert.match(additionalContext, /Before anything else, a newer claw-kit version was detected/i);
  assert.match(additionalContext, /First action: use claw-kit:update to update the claw-kit CLI and the current host plugin surface/i);
  assert.match(additionalContext, /First action: use claw-kit:update to update the claw-kit CLI and the current host plugin surface before continuing any other work\.\s*$/i);
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
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "final_only");
  assert.deepEqual(projectConfig.memory, {
    enabled: true,
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-m-v2.0",
    },
  });
  assert.equal(projectConfig.gitnexus, false);
});

test("cli plan done records completedAt and retains the current task path", async () => {
  const root = createFixture("plan-done-archive");
  const env = { CLAW_EMBEDDING_MOCK: "1", CODEX_THREAD_ID: "thread-root-done" };
  runClaw(["init", "--name", "Archive On Complete", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "archive-task", "--goal", "Archive after completion"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task", "archive-task", "--summary", "Complete this task without immediate archival."],
    root,
    env,
  );

  assert.equal("completionRefresh" in doneResult, false);
  assert.match(String(doneResult.planPath), /\.claw[\\/]tasks[\\/]archive-task[\\/].*plan\.json$/);
  assert.equal("archivedPlanPath" in doneResult, false);
  const completedPlan = JSON.parse(fs.readFileSync(String(doneResult.planPath), "utf-8")) as JsonRecord;
  assert.match(String(completedPlan.completedAt), /^\d{4}-\d{2}-\d{2}T/);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.ok(memory.task as JsonRecord | undefined);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "archive-task")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "archive-task")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "session-bindings.json")), false);
  assert.equal("activeWorkflow" in runClaw(["context"], root, env), false);
});

test("claw context does not discover an unfinished plan without a session binding", () => {
  const root = createFixture("context-binding-only");
  runClaw(["init", "--name", "Binding Only", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "unbound-task", "--goal", "Stay unbound"], root);

  const context = runClaw(["context"], root, { CODEX_THREAD_ID: "different-thread" });

  assert.equal("activeWorkflow" in context, false);
});

test("cli plan show reads a completed task during the delayed archive window", () => {
  const root = createFixture("plan-show-archived");
  runClaw(["init", "--name", "Archived Show", "--max-tasks-to-keep", "99", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "archived-task", "--goal", "Show archived plan"], root);
  runClaw(["plan", "done", "--task", "archived-task", "--summary", "Archive this task."], root);

  const result = runClaw(["plan", "show", "--task", "archived-task"], root);

  assert.equal("archived" in result, false);
  assert.match(String(result.planPath), /\.claw[\\/]tasks[\\/]archived-task[\\/].*plan\.json$/);
  const planView = result.planView as JsonRecord;
  assert.equal(String(planView.collapsedSummary), "0/1 archived-task");
});

test("cli plan done sweeps another task only when completedAt is older than one hour", () => {
  const root = createFixture("plan-done-delayed-archive-sweep");
  const env = { CLAW_EMBEDDING_MOCK: "1" };
  runClaw(["init", "--name", "Delayed Archive Sweep", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "older-task", "--goal", "Older task"], root, env);
  runClaw(["plan", "done", "--task", "older-task", "--summary", "Older complete."], root, env);

  const olderPlanPath = path.join(root, ".claw", "tasks", "older-task", "plan.json");
  const olderPlan = JSON.parse(fs.readFileSync(olderPlanPath, "utf-8")) as JsonRecord;
  olderPlan.completedAt = "2020-01-01T00:00:00.000Z";
  fs.writeFileSync(olderPlanPath, `${JSON.stringify(olderPlan, null, 2)}\n`, "utf-8");

  runClaw(["plan", "create", "--title", "fresh-task", "--goal", "Fresh task"], root, env);
  runClaw(["plan", "done", "--task", "fresh-task", "--summary", "Fresh complete."], root, env);

  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "older-task")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "older-task")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "fresh-task")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "fresh-task")), false);
});

test("cli plan done skips gitnexus refresh when project config disables it", async () => {
  const root = createFixture("gitnexus-disabled");
  const env = {
    PATH: process.env.PATH ?? "",
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(["init", "--name", "No Gitnexus"], root, env);
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "create", "--title", "disabled-task", "--goal", "Close without gitnexus"], root, env);
  runClaw(["plan", "edit", "--task", "disabled-task", "--patch", contentPath], root, env);
  runClaw(["plan", "edit", "--task", "disabled-task", "--plan-status", "process.active"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task", "disabled-task", "--summary", "No gitnexus refresh needed."],
    root,
    env,
  );
  assert.equal("completionRefresh" in doneResult, false);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const gitnexus = (refreshStatus.gitnexus as JsonRecord);
  assert.equal(gitnexus.enabled, false);
  assert.match(String(gitnexus.reason), /not enabled/);
});

test("cli plan done fails before completion refresh when gitnexus auto-install fails", () => {
  const root = createFixture("gitnexus-install-fails");
  const npmShim = createNpmShim("fail-install");
  const env = {
    PATH: npmShim.binDir,
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(["init", "--name", "Gitnexus Install Fail", "--gitnexus", "true"], root, env);
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "create", "--title", "install-task", "--goal", "Catch install failure"], root, env);
  runClaw(["plan", "edit", "--task", "install-task", "--patch", contentPath], root, env);
  runClaw(["plan", "edit", "--task", "install-task", "--plan-status", "process.active"], root, env);

  const failure = runClawExpectFailure(
    ["plan", "done", "--task", "install-task", "--summary", "Should fail before queuing refresh."],
    root,
    env,
  );

  const error = failure.error as JsonRecord;
  assert.match(String(error.message), /automatic installation failed/i);
  assert.equal(getLatestCompletionRefreshStatusFile(root), null);
  const npmLog = fs.readFileSync(npmShim.logPath, "utf-8");
  assert.match(npmLog, /install -g @veewo\/gitnexus/);
});

test("cli plan done auto-enables gitnexus embeddings and seeds the matching model cache", async () => {
  const root = createFixture("gitnexus-embeddings-preflight");
  const shim = createGitnexusShim("primary");
  const fakePackageRoot = path.join(root, "fake-global", "@veewo", "gitnexus");
  const targetCacheDir = path.join(
    fakePackageRoot,
    "node_modules",
    "@huggingface",
    "transformers",
    ".cache",
    "Snowflake",
    "snowflake-arctic-embed-xs",
  );
  const sourceCacheDir = path.join(root, ".model-cache", "Snowflake", "snowflake-arctic-embed-xs");
  fs.mkdirSync(path.join(fakePackageRoot, "node_modules", "@huggingface", "transformers"), { recursive: true });
  fs.mkdirSync(sourceCacheDir, { recursive: true });
  fs.writeFileSync(path.join(sourceCacheDir, "config.json"), "{\"model\":\"xs\"}\n", "utf-8");
  fs.writeFileSync(path.join(sourceCacheDir, "tokenizer.json"), "{\"ok\":true}\n", "utf-8");

  const env = {
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    CLAW_EMBEDDING_MOCK: "1",
    CLAW_TEST_GITNEXUS_PACKAGE_ROOT: fakePackageRoot,
  };

  runClaw(["init", "--name", "Gitnexus Embeddings Preflight", "--gitnexus", "true"], root, env);
  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        version: cliPackageVersion,
        id: "gitnexus-embeddings-preflight",
        name: "Gitnexus Embeddings Preflight",
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
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );

  runClaw(["plan", "create", "--title", "preflight-task", "--goal", "Enable GitNexus embeddings"], root, env);
  runClaw(["plan", "edit", "--task", "preflight-task", "--patch", contentPath], root, env);
  runClaw(["plan", "edit", "--task", "preflight-task", "--plan-status", "process.active"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task", "preflight-task", "--summary", "Enable embeddings before background refresh."],
    root,
    env,
  );

  assert.equal(doneResult.planSummary, "1/1 preflight-task");
  const meta = JSON.parse(fs.readFileSync(path.join(root, ".gitnexus", "meta.json"), "utf-8")) as {
    analyzeOptions?: { embeddings?: boolean };
  };
  assert.equal(meta.analyzeOptions?.embeddings, true);
  assert.equal(fs.existsSync(path.join(targetCacheDir, "config.json")), true);

  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const gitnexus = refreshStatus.gitnexus as JsonRecord;
  assert.equal(gitnexus.enabled, false);
  assert.match(String(gitnexus.reason), /preflight/);

  const gitnexusLog = fs.readFileSync(shim.logPath, "utf-8");
  assert.match(gitnexusLog, /analyze --embeddings --no-ai-context/);
  assert.doesNotMatch(gitnexusLog, /^analyze --no-ai-context\r?$/m);
});

test("cli direct returns truth-writer guidance and queues completion refresh for low-complexity no-plan work", async () => {
  const root = createFixture("direct-no-plan");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(
    [
      "init",
      "--name",
      "Direct No Plan",
      "--external-truth-skill",
      "external-truth-writer",
    ],
    root,
    env,
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "direct flow memory\n", "utf-8");

  const result = runClaw(["direct"], root, env);

  assert.equal(result.command, "direct");
  assert.equal("planStatus" in result, false);
  assert.equal("planSummary" in result, false);
  assert.equal("completionRefresh" in result, false);
  assert.match(String(result.summary), /lean path|without extra decomposition/i);
  assert.match(String(result.notes), /compatibility surface/i);
  assert.match(String(result.notes), /claw plan create/i);
  assert.ok(Array.isArray(result.nextsteps));
  assert.equal((result.nextsteps as string[]).some((step) => step.includes("truth-writer")), true);
  assert.equal((result.nextsteps as string[]).some((step) => step.includes("completion refresh")), true);

  const truthDelegate = ((result.delegateSubagents as JsonRecord[])[0] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "external-truth-writer");
  assert.equal(truthDelegate.model, "gpt-5.4-mini");
  assert.equal(truthDelegate.fork_context, false);
  assert.equal(truthDelegate.waitForCompletion, false);
  assert.equal(truthDelegate.preferReuseSameTypeInThread, true);
  assert.equal(truthDelegate.closePolicy, "keep_open_for_reuse");

  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal(refreshStatus.ok, true);
  assert.ok(Number((memory.project as JsonRecord).indexedCount) >= 1);
  assert.equal((memory.task as JsonRecord | undefined), undefined);
});

test("overlapping direct closeouts coalesce into one completion refresh", async () => {
  const root = createFixture("direct-single-flight");
  const shim = createGitnexusShim("primary", 750);
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "Direct Single Flight", "--gitnexus", "true"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "single-flight memory\n", "utf-8");

  runClaw(["direct"], root, env);
  await waitForCondition(() => getCompletionRefreshStatusFiles(root).length >= 1, 5000);
  runClaw(["direct"], root, env);
  await waitForCondition(() => getCompletionRefreshStatusFiles(root).length >= 2, 5000);

  const statuses = await Promise.all(
    getCompletionRefreshStatusFiles(root).map((statusFile) => waitForCompletionRefreshStatus(statusFile)),
  );
  assert.equal(statuses.every((status) => status.ok === true), true);
  assert.equal(statuses.some((status) => status.coalesced === true), true);
  assert.equal(Math.max(...statuses.map((status) => Number(status.coalescedCount ?? 0))), 1);
  const analyzeCalls = fs.readFileSync(shim.logPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line === "analyze --no-ai-context");
  assert.equal(analyzeCalls.length, 1);
});

test("completion refresh retries one transient GitNexus lock without shell warnings", async () => {
  const root = createFixture("direct-gitnexus-lock-retry");
  const shim = createGitnexusShim("lock-once");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "GitNexus Lock Retry", "--gitnexus", "true"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "lock retry memory\n", "utf-8");

  const result = runClawRaw(["direct"], root, env);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /DEP0190/);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  assert.equal(refreshStatus.ok, true);
  assert.equal((refreshStatus.gitnexus as JsonRecord).enabled, true);
  const analyzeCalls = fs.readFileSync(shim.logPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line === "analyze --no-ai-context");
  assert.equal(analyzeCalls.length, 2);
});

test("cli init gitignore ignores project-override.json by default", () => {
  const root = createFixture("cli-init-project-override-gitignore");

  runClaw(["init", "--name", "CLI Override Gitignore"], root);

  assert.equal(
    fs.readFileSync(path.join(root, ".gitignore"), "utf-8"),
    "# claw-kit\n.claw/*\n!.claw/project.json\n!.claw/truth/\n!.claw/truth/**\n.claw/project-override.json\n",
  );
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

test("cli hook emits SessionStart additionalContext inside .claw projects", () => {
  const root = createFixture("hook");
  runClaw(["init", "--name", "Hook Project"], root);
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    USERPROFILE: home,
    HOME: home,
  };

  const result = runClawRaw(["hook", "SessionStart"], root, env);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as JsonRecord;
  const hookSpecificOutput = payload.hookSpecificOutput as JsonRecord;
  assert.equal(hookSpecificOutput.hookEventName, "SessionStart");
  const additionalContext = String(hookSpecificOutput.additionalContext);
  assert.match(additionalContext, /using-claw-kit/);
  assert.match(additionalContext, /Hook Project|hook-project/i);
  assert.match(additionalContext, /You can use goal mode in this thread and delegate the subagents required by the claw workflow, don't ask me again/i);
  assert.match(additionalContext, /Load claw-kit:using-claw-kit as the main workflow skill for this session\.\s*$/i);
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

  const patchPath = path.join(root, "updated-plan.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify({
      tasks: [
        {
          id: 1,
          title: "Resume recovered work",
          detail: "Use the recovered plan payload from SessionStart.",
          status: "pending",
        },
      ],
      references: [
        {
          path: "packages/cli/src/cli.ts",
          why: "SessionStart recovery output",
        },
      ],
    }),
    "utf-8",
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", "updated-plan.json"], root, env);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root, env);

  const registry = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "runtime", "session-bindings.json"), "utf-8"),
  ) as { bindings: Record<string, string> };
  assert.equal(registry.bindings["thread-demo"], "tasks/demo-task/plan.json");

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
  assert.match(additionalContext, /You can use goal mode in this thread and delegate the claw workflow's required subagents, don't ask me again/i);
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

  const result = runClawRaw(["hook", "SessionStart"], root, env);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

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
  assert.match(result.stderr, /plan show/);
  assert.match(result.stderr, /plan done/);
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
