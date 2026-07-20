import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { shouldRunKnowledgeHook } from "../dist/knowledge-hook-preflight.js";
import { opencodeKnowledgeFinalizerEnvironment, parseOpencodeRunOutput } from "../dist/opencode-runner.js";
import { resolveInvocationHost, withoutInvocationHost } from "../dist/invocation-host.js";
import { CODEX_SDK_VERSION } from "../dist/codex-runtime.js";

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
  scope?: "session";
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
    version: cliPackageVersion,
    ...(params.scope ? { scope: params.scope } : {}),
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
const ISOLATED_ENV_KEYS = [
  "CLAW_HOST",
  "CLAW_GUIDANCE_CONFIG",
  "CODEX_THREAD_ID",
  "CODEX_SESSION_ID",
] as const;

function buildSpawnEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAW_EMBEDDING_WARMUP_DISABLE_LAUNCH: "1",
  };
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

function runClawHook(
  eventName: string,
  cwd: string,
  payload: Record<string, unknown>,
  env?: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, "hook", eventName], {
    cwd,
    env: buildSpawnEnv(env),
    encoding: "utf-8",
    windowsHide: true,
    input: JSON.stringify(payload),
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

function createGitnexusShim(mode: "fallback" | "primary" | "lock-once" | "access-violation-once", delayMs = 0): { binDir: string; logPath: string } {
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

if (args[0] === "analyze" && ${JSON.stringify(mode)} === "access-violation-once" && !args.includes("--force")) {
  process.exit(0xc0000005);
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
          externalSkill: "external-knowledge-writer",
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
    ["task", "edit", "--task-name", "e2e-task", "--id", "1", "--status", "in_progress"],
    root,
    env,
  );
  assert.deepEqual(inProgressResult.nextsteps, ["Continue the current task."]);
  assert.equal("nextTask" in inProgressResult, false);
  assert.deepEqual(inProgressResult.recommendedCommands, [
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
  assert.deepEqual(taskDone.recommendedCommands, [
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
  assert.ok(memory.task as JsonRecord | undefined);
  assert.equal(gitnexus.enabled, false);
  assert.match(String(gitnexus.reason), /preflight/);
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
  assert.deepEqual(writeResult.nextsteps, [
    "1. Use claw-kit:planning to discuss and confirm the requirements and proposed solution with the user.",
    "2. If execution remains, record the task list with the recommended command. If planning resolves the request, complete task #1 and close the plan.",
  ]);
  assert.equal((writeResult.recommendedCommands as string[])[0], 'claw search --query "<topic>"');
  assert.equal(
    (writeResult.recommendedCommands as string[])[1],
    "claw plan start --requirements \"<summary>\" --acceptance \"<criterion>\" --add-task \"<title>\" --detail \"<detail>\"",
  );
  assert.equal("goalTool" in writeResult, false);
  assert.equal((writeResult.plan as JsonRecord).status, "process.discussing");
  const plan = writeResult.plan as JsonRecord;
  const tasks = plan.tasks as JsonRecord[];
  assert.equal(String((tasks[0] as JsonRecord).title), "Complete planning with the configured planning skill");
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
  assert.deepEqual(result.nextsteps, [
    "1. Use claw-kit:planning to discuss and confirm the requirements and proposed solution with the user.",
    "2. If execution remains, record the task list with the recommended command. If planning resolves the request, complete task #1 and close the plan.",
  ]);
  assert.equal((result.recommendedCommands as string[])[0], 'claw search --query "<topic>"');
  assert.equal("goalTool" in result, false);
  assert.equal(String((tasks[0] as JsonRecord).title), "Complete planning with the configured planning skill");
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

  const planPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
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

test("cli codex driver returns an executable versioned source envelope", async () => {
  const root = createFixture("codex-driver-envelope");
  const envelope = runClaw(["codex", "driver"], root);
  assert.equal(envelope.command, "codex.driver");
  assert.equal(envelope.driverVersion, 5);
  assert.equal(envelope.hostActionSchemaVersion, 1);
  assert.equal(envelope.cacheKey, "claw-kit:codex-driver:v5:s1");
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
    { command: "claw plan resume", workdir: root },
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
  });
  assert.equal("hostActions" in actual, false);
  assert.equal("command" in actual, false);
  assert.match(String((calls[0][1] as JsonRecord).command), /--host codex$/);
  assert.deepEqual(calls.map(([name]) => name), ["shell_command", "update_plan", "get_goal", "create_goal", "text"]);
  assert.equal("hostActions" in JSON.parse(String(calls.at(-1)?.[1])), false);
});

test("Codex driver reuses an active Goal on resume and skips closing an already closed Goal", async () => {
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
    hostActions: [{
      schemaVersion: 1,
      id: "resume:create_goal",
      tool: "create_goal",
      input: { objective: "resume work" },
    }],
  };
  let goalStatus = "active";
  const tools = {
    shell_command: async () => JSON.stringify(commandResult),
    update_plan: async () => calls.push("update_plan"),
    get_goal: async () => ({ goal: { status: goalStatus } }),
    create_goal: async () => calls.push("create_goal"),
    update_goal: async () => calls.push("update_goal"),
  };

  await runner({ command: "claw plan resume", workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, []);

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
  await runner({ command: "claw plan done --retrospective done", workdir: root }, { tools, text: () => {} });
  assert.deepEqual(calls, []);
});

test("Codex plan results keep only stage-relevant fields and hostActions", () => {
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
  assert.deepEqual((result.hostActions as JsonRecord[]).map((action) => action.tool), ["update_plan", "create_goal"]);
  assert.equal("nextsteps" in result, false);
  assert.equal("notes" in result, false);
  assert.ok(Array.isArray(result.recommendedCommands));
});

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
  assert.equal(fs.readdirSync(runtimeDir).length, 0);
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

test("session plan completion keeps Goal actions but queues no knowledge or project refresh work", () => {
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
  const activationActions = activated.hostActions as Array<JsonRecord>;
  assert.ok(activationActions.some((action) => action.tool === "create_goal"));

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
  const completionActions = completed.hostActions as Array<JsonRecord>;
  assert.ok(completionActions.some((action) => action.tool === "update_goal"));

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

test("Codex wait and resume results omit compatibility guidance already handled by hostActions", () => {
  const root = createFixture("codex-wait-resume-minimal-result");
  runClaw(["init", "--name", "Codex Wait Resume", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Pause and resume cleanly"], root);

  const waitResult = runClaw(["plan", "wait", "--task-name", "demo-task", "--host", "codex"], root);
  assert.equal(waitResult.command, "plan.wait");
  assert.equal(waitResult.planStatus, "process.wait");
  assert.equal(waitResult.stage, "paused");
  assert.equal("goalMode" in waitResult, false);
  assert.equal("goalTool" in waitResult, false);
  assert.equal("nextsteps" in waitResult, false);
  assert.deepEqual(waitResult.recommendedCommands, ["claw plan resume"]);
  assert.deepEqual((waitResult.hostActions as JsonRecord[]).map((action) => action.tool), ["update_plan", "update_goal"]);

  const resumeResult = runClaw(["plan", "resume", "--task-name", "demo-task", "--host", "codex"], root);
  assert.equal(resumeResult.command, "plan.resume");
  assert.equal(resumeResult.planStatus, "process.active");
  assert.equal(resumeResult.stage, "execution");
  assert.equal("goalMode" in resumeResult, false);
  assert.equal("goalTool" in resumeResult, false);
  assert.equal("nextsteps" in resumeResult, false);
  assert.deepEqual((resumeResult.hostActions as JsonRecord[]).map((action) => action.tool), ["update_plan", "create_goal"]);
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

  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
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
  const reducedPlan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
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
  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
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

  const beforeDone = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  const remainingIds = (beforeDone.tasks as JsonRecord[]).map((task) => Number(task.id));
  runClaw([
    "task", "done", "--task-name", "demo-task",
    ...remainingIds.flatMap((id) => ["--id", String(id)]),
  ], root);

  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
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
  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
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

  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
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
  const plan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  assert.equal((plan.tasks as JsonRecord[])[0].status, "pending");
});

test("cli routes host-neutral Goal guidance by paused and resumed plan status", () => {
  const root = createFixture("plan-edit-wait-and-resume-guidance");
  runClaw(["init", "--name", "Wait And Resume Guidance", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Pause and resume cleanly"], root);

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
  assert.equal(
    resumeResult.notes,
    "The plan is moving back from a paused status into active execution, so Goal Mode should be restored to the active state before work resumes.",
  );
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

test("cli leaves completed-task deposition to automatic turn reporting", () => {
  const root = createFixture("cli-truth-contract-before-done");
  runClaw(
    [
      "init",
      "--name",
      "CLI Truth Contract",
      "--planning",
      "false",
      "--external-writer-skill",
      "external-knowledge-writer",
    ],
    root,
  );
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.truthDispatch = "per_task";
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");

  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Verify task completion contract"], root);
  runClaw(["task", "edit", "--task-name", "demo-task", "--id", "1", "--title", "First task"], root);
  runClaw(["task", "add", "--task-name", "demo-task", "--title", "Second task"], root);
  runClaw(["plan", "edit", "--task-name", "demo-task", "--status", "process.active"], root);

  const taskDone = runClaw(
    ["task", "done", "--task-name", "demo-task", "--id", "1"],
    root,
  );

  assert.equal("stage" in taskDone, false);
  assert.equal("summary" in taskDone, false);
  assert.deepEqual(taskDone.nextsteps, [
    "1. Sync thread progress with `update_plan`.",
    "2. Continue with task #2.",
  ]);
  assert.equal(
    taskDone.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption.",
  );
  assert.deepEqual(taskDone.nextTask, {
    id: 2,
    title: "Second task",
    status: "pending",
  });
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
    (created.recommendedCommands as string[]).filter((command) => command.includes("claw task done")).length,
    1,
  );
  assert.equal(
    (created.recommendedCommands as string[]).includes("claw task done --id 1 --choice <choice>"),
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
    (result.recommendedCommands as string[]).includes("claw task done --id 1 --choice <choice>"),
    true,
  );
  assert.equal(
    (result.recommendedCommands as string[]).includes("claw task done --id <id>"),
    false,
  );

  const taskDone = runClaw(
    ["task", "done", "--task-name", "demo-task", "--id", "1", "--choice", "simple"],
    root,
  );
  assert.equal(taskDone.command, "task.done");

  const planPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
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

  const planPath = path.join(root, ".claw", "tasks", "demo-task", "plan.json");
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
  assert.deepEqual(result.recommendedCommands, [
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
    "After the parent goal is completed by this subplan handoff, start the subplan goal before doing target work: Follow the claw workflow guidance and finish your goal: Implement child work: Split the risky work into a subplan",
    "1. Use claw-kit:planning to discuss and confirm the requirements and proposed solution with the user.",
    "2. If execution remains, record the task list with the recommended command. If planning resolves the request, complete task #1 and close the plan.",
  ]);
  assert.equal((result.recommendedCommands as string[])[0], 'claw search --query "<topic>"');
  assert.equal(
    ((result.goalMode as JsonRecord).recommendedObjective),
    "Follow the claw workflow guidance and finish your goal: Implement child work: Split the risky work into a subplan",
  );
  assert.equal(((result.goalMode as JsonRecord).allowOverwrite), true);
  assert.match(String(result.notes), /completes the current parent goal first/i);
  assert.deepEqual(result.goalTool, {
    tool: "update_goal",
    status: "complete",
    reason: "Subplan creation must complete the active parent goal before the child plan creates its own goal.",
  });
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
  assert.equal(((actions[0]?.input as JsonRecord).status), "complete");
  assert.equal(actions.some((action) => action.tool === "create_goal"), false);
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
  assert.equal((rootPlan.tasks as unknown[]).length, 3);

  const childResult = runClaw(
    ["subplan", "create", "--parent", "template-parent", "--task-id", "1", "--template", "create-claw-skill"],
    root,
  );
  const childPlan = JSON.parse(fs.readFileSync(String(childResult.planPath), "utf-8")) as JsonRecord;
  assert.equal(childPlan.templateId, "create-claw-skill");
  assert.equal((childPlan.tasks as unknown[]).length, 3);

  const validation = runClaw(["template", "validate", "--template", "create-claw-skill"], root);
  assert.equal(validation.command, "template.validate");
  assert.equal(validation.ok, true);
  assert.equal(validation.templateId, "create-claw-skill");
  assert.equal(validation.version, cliPackageVersion);
  assert.equal(validation.taskCount, 3);
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

test("cli plan done on a subplan resumes the parent plan instead of archiving the whole task", () => {
  const root = createFixture("cli-subplan-done-resume-parent");
  const env = { CODEX_THREAD_ID: "thread-subplan-done" };
  runClaw(["init", "--name", "Subplan Done Resume Parent", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root, env);

  runClaw([
    "task", "edit", "--id", "1",
    "--title", "Implement child work", "--detail", "Split the risky work into a subplan",
  ], root, env);
  runClaw(["task", "add", "--title", "Resume parent work"], root, env);
  runClaw(["plan", "edit", "--status", "process.active"], root, env);
  runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root, env);

  runClaw([
    "plan", "start",
    "--requirements", "Child scope ready",
    "--add-task", "Finish child",
  ], root, env);
  runClaw(["task", "done", "--id", "2"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--retrospective", "Child complete."],
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
  assert.equal("achievement" in doneResult, false);
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
    externalSkill: "team-knowledge-writer",
    model: null,
    reasoningEffort: "medium",
    datedSectionsToKeep: 6,
  });
  assert.equal("truthDispatch" in projectConfig, false);
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
    externalSkill: null,
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
      assert.match(guidance, /default search/);
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
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "jinaai/jina-embeddings-v2-base-zh",
    },
  });
  assert.equal(projectConfig.goalMode, true);
  assert.deepEqual(projectConfig.knowledgeWriter, {
    externalSkill: null,
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
  assert.match(additionalContext, /First action: use claw-kit:update to update the claw-kit CLI and the current host plugin surface before continuing any other work\./i);
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
    externalSkill: null,
    model: null,
    reasoningEffort: "medium",
    datedSectionsToKeep: 6,
  });
  assert.deepEqual(projectConfig.memory, {
    enabled: true,
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "jinaai/jina-embeddings-v2-base-zh",
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
    ["plan", "done", "--retrospective", "Complete this task without immediate archival."],
    root,
    env,
  );

  assert.equal("completionRefresh" in doneResult, false);
  assert.match(String(doneResult.planPath), /\.claw[\\/]tasks[\\/]archive-task[\\/].*plan\.json$/);
  assert.equal("archivedPlanPath" in doneResult, false);
  assert.equal("hostActions" in doneResult, false);
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
  const session = context.session as JsonRecord;
  assert.equal(session.boundPlan, false);
  assert.match(String(session.note), /No plan is bound/);
});

test("cli plan show reads a completed task during the delayed archive window", () => {
  const root = createFixture("plan-show-archived");
  runClaw(["init", "--name", "Archived Show", "--max-tasks-to-keep", "99", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "archived-task", "--goal", "Show archived plan"], root);
  runClaw(["plan", "done", "--task-name", "archived-task", "--retrospective", "Archive this task."], root);

  const result = runClaw(["plan", "show", "--task-name", "archived-task"], root);

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
  runClaw(["plan", "done", "--task-name", "older-task", "--retrospective", "Older complete."], root, env);

  const olderPlanPath = path.join(root, ".claw", "tasks", "older-task", "plan.json");
  const olderPlan = JSON.parse(fs.readFileSync(olderPlanPath, "utf-8")) as JsonRecord;
  olderPlan.completedAt = "2020-01-01T00:00:00.000Z";
  fs.writeFileSync(olderPlanPath, `${JSON.stringify(olderPlan, null, 2)}\n`, "utf-8");

  runClaw(["plan", "create", "--title", "fresh-task", "--goal", "Fresh task"], root, env);
  runClaw(["plan", "done", "--task-name", "fresh-task", "--retrospective", "Fresh complete."], root, env);

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
  runClaw(["task", "edit", "--task-name", "disabled-task", "--id", "1", "--title", "Done task"], root, env);
  runClaw(["plan", "edit", "--task-name", "disabled-task", "--status", "process.active"], root, env);
  runClaw(["task", "done", "--task-name", "disabled-task", "--id", "1"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task-name", "disabled-task", "--retrospective", "No gitnexus refresh needed."],
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
  runClaw(["task", "edit", "--task-name", "install-task", "--id", "1", "--title", "Done task"], root, env);
  runClaw(["plan", "edit", "--task-name", "install-task", "--status", "process.active"], root, env);
  runClaw(["task", "done", "--task-name", "install-task", "--id", "1"], root, env);

  const failure = runClawExpectFailure(
    ["plan", "done", "--task-name", "install-task", "--retrospective", "Should fail before queuing refresh."],
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
        planning: false,
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
  runClaw(["task", "edit", "--task-name", "preflight-task", "--id", "1", "--title", "Done task"], root, env);
  runClaw(["plan", "edit", "--task-name", "preflight-task", "--status", "process.active"], root, env);
  runClaw(["task", "done", "--task-name", "preflight-task", "--id", "1"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task-name", "preflight-task", "--retrospective", "Enable embeddings before background refresh."],
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

test("cli direct queues completion refresh without main-agent deposition guidance", async () => {
  const root = createFixture("direct-no-plan");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
  };

  runClaw(
    [
      "init",
      "--name",
      "Direct No Plan",
      "--external-writer-skill",
      "external-knowledge-writer",
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
  assert.equal((result.nextsteps as string[]).some((step) => step.includes("truth-writer")), false);
  assert.equal((result.nextsteps as string[]).some((step) => step.includes("completion refresh")), true);


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

test("completion refresh rebuilds once after a Windows GitNexus access violation", { skip: process.platform !== "win32" }, async () => {
  const root = createFixture("direct-gitnexus-access-violation");
  const shim = createGitnexusShim("access-violation-once");
  const env = {
    CLAW_EMBEDDING_MOCK: "1",
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  runClaw(["init", "--name", "GitNexus Access Violation", "--gitnexus", "true"], root, env);
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "access violation recovery\n", "utf-8");

  const result = runClawRaw(["direct"], root, env);
  assert.equal(result.status, 0);
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  assert.equal(refreshStatus.ok, true);
  assert.equal((refreshStatus.gitnexus as JsonRecord).enabled, true);
  const analyzeCalls = fs.readFileSync(shim.logPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("analyze "));
  assert.deepEqual(analyzeCalls, [
    "analyze --no-ai-context",
    "analyze --force --no-ai-context",
  ]);
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
  assert.match(additionalContext, /You can use goal mode in this thread when required by the claw workflow; don't ask me again/i);
  assert.match(additionalContext, /After this plan finishes, keep using claw-kit in this thread for the next task\./);
  assert.match(additionalContext, /Current plan content:/);
  assert.match(additionalContext, /goal: Recover active workflow guidance and plan content/);
  assert.match(additionalContext, /#1 \[pending\] Resume recovered work/);
  assert.match(additionalContext, /packages\/cli\/src\/cli\.ts :: SessionStart recovery output/);
});

test("knowledge hook preflight depends only on a valid session knowledge target", () => {
  const root = createFixture("hook-knowledge-preflight");
  const sessionId = "thread-knowledge-preflight";
  runClaw(["init", "--name", "Hook Knowledge Preflight"], root);
  const rawInput = JSON.stringify({
    session_id: sessionId,
    turn_id: "turn-preflight",
    transcript_path: path.join(root, "missing-transcript.jsonl"),
    cwd: root,
  });

  assert.equal(shouldRunKnowledgeHook(rawInput, root, {}), false);

  const env = { CODEX_THREAD_ID: sessionId };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Exercise hook preflight"], root, env);
  assert.equal(shouldRunKnowledgeHook(rawInput, root, {}), true);

  const nestedCwd = path.join(root, "packages", "nested");
  fs.mkdirSync(nestedCwd, { recursive: true });
  assert.equal(shouldRunKnowledgeHook(JSON.stringify({
    session_id: sessionId,
    turn_id: "turn-nested-preflight",
    cwd: nestedCwd,
  }), nestedCwd, {}), false);

  const knowledgeSessionsDir = path.join(root, ".claw", "runtime", "knowledge-sessions");
  for (const entry of fs.readdirSync(knowledgeSessionsDir)) {
    fs.unlinkSync(path.join(knowledgeSessionsDir, entry));
  }
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "session-bindings.json")), true);
  assert.equal(shouldRunKnowledgeHook(rawInput, root, {}), false);
});

test("knowledge hook exits before reading stdin when cwd has no direct .claw directory", async () => {
  const root = createFixture("hook-preflight-no-claw");
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const child = spawn(process.execPath, [cliPath, "hook", "auto-doc", "--host", "codex"], {
    cwd: root,
    env: buildSpawnEnv(),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("knowledge hook waited for stdin without cwd/.claw"));
    }, 2_000);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0);
});

test("Stop hook captures the latest final assistant message into exactly one active plan report", () => {
  const root = createFixture("hook-stop-report");
  runClaw(["init", "--name", "Hook Stop Project"], root);
  const sessionId = "thread-stop-demo";
  const env = { CODEX_THREAD_ID: sessionId };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture turn report"], root, env);
  const transcriptPath = path.join(root, "thread.jsonl");
  fs.writeFileSync(
    transcriptPath,
    [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "commentary",
          content: [{ type: "output_text", text: "Working update" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: [{ type: "output_text", text: "Final report message" }],
        },
      }),
    ].join("\n"),
    "utf-8",
  );
  const payload = {
    session_id: sessionId,
    turn_id: "turn-1",
    transcript_path: transcriptPath,
    cwd: root,
    hook_event_name: "Stop",
  };
  const first = runClawHook("auto-doc", root, payload, env);
  assert.equal(first.status, 0);
  assert.equal(first.stdout.trim(), "");
  const reportPath = path.join(root, ".claw", "tasks", "demo-task", "plan.report");
  const firstEntries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/);
  assert.equal(firstEntries.length, 1);
  assert.equal((JSON.parse(firstEntries[0]!) as { message: string }).message, "Final report message");

  const duplicate = runClawHook("auto-doc", root, payload, env);
  assert.equal(duplicate.status, 0);
  const duplicateEntries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/);
  assert.equal(duplicateEntries.length, 1);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs")), false);
});

for (const endStatus of ["end.leave", "end.closed"] as const) {
  test(`${endStatus} Stop queues conclusion-based knowledge finalization`, () => {
    const root = createFixture(`hook-stop-${endStatus.replace(".", "-")}`);
    const sessionId = `thread-${endStatus}`;
    const env = {
      CODEX_THREAD_ID: sessionId,
      CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
    };
    runClaw(["init", "--name", `Hook ${endStatus}`, "--planning", "false"], root, env);
    runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture end-state conclusions"], root, env);
    runClaw(["plan", "edit", "--status", endStatus], root, env);

    const transcriptPath = path.join(root, `thread-${endStatus}.jsonl`);
    fs.writeFileSync(transcriptPath, JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "final_answer",
        content: [{ type: "output_text", text: `Conclusion recorded at ${endStatus}.` }],
      },
    }), "utf-8");
    const stop = runClawHook("auto-doc", root, {
      session_id: sessionId,
      turn_id: `turn-${endStatus}`,
      transcript_path: transcriptPath,
      cwd: root,
    }, env);

    assert.equal(stop.status, 0);
    const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
    const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
    assert.equal(jobFiles.length, 1);
    const queued = JSON.parse(fs.readFileSync(path.join(jobsDir, jobFiles[0]!), "utf-8")) as JsonRecord;
    assert.equal(queued.status, "queued");
    assert.equal(queued.planPath, path.join(root, ".claw", "tasks", "demo-task", "plan.json"));
  });
}

test("completed-plan Stop owns the final turn and queues a retryable SDK job", () => {
  const root = createFixture("hook-stop-closeout");
  const sessionId = "thread-stop-closeout";
  const env = {
    CODEX_THREAD_ID: sessionId,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  };
  runClaw(["init", "--name", "Hook Closeout", "--planning", "false"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.knowledgeWriter = {
    externalSkill: "custom-knowledge-writer",
    model: "gpt-test-writer",
    reasoningEffort: "high",
  };
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf-8");
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Close out automatically"], root, env);
  runClaw(["task", "done", "--id", "1"], root, env);
  runClaw(["plan", "done", "--retrospective", "Completed."], root, env);

  const transcriptPath = path.join(root, "thread-closeout.jsonl");
  fs.writeFileSync(transcriptPath, JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", text: "Root plan is complete." }],
    },
  }), "utf-8");
  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-closeout",
    transcript_path: transcriptPath,
    cwd: root,
  }, env);
  assert.equal(stop.status, 0);
  const reportPath = path.join(root, ".claw", "tasks", "demo-task", "plan.report");
  assert.equal((JSON.parse(fs.readFileSync(reportPath, "utf-8")) as { turnId: string }).turnId, "turn-closeout");
  const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const jobPath = path.join(jobsDir, jobFiles[0]!);
  const queued = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(queued.status, "queued");
  assert.equal(queued.attempts, 0);
  assert.deepEqual(queued.writer, {
    externalSkill: "custom-knowledge-writer",
    model: "gpt-test-writer",
    reasoningEffort: "high",
    datedSectionsToKeep: 6,
  });
  assert.equal(queued.planPath, path.join(root, ".claw", "tasks", "demo-task", "plan.json"));
  assert.equal(queued.reportPath, reportPath);

  delete queued.writer;
  fs.writeFileSync(jobPath, `${JSON.stringify(queued, null, 2)}\n`, "utf-8");

  const failed = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    ...env,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
    CLAW_CODEX_PATH_OVERRIDE: path.join(root, "missing-codex.exe"),
  });
  assert.equal(failed.status, 0);
  const failedJob = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(failedJob.status, "failed");
  assert.equal(failedJob.attempts, 1);
  assert.match(String((failedJob.error as JsonRecord).message), /missing-codex|ENOENT|spawn/i);
});

test("Stop hook skips knowledge finalizer child threads to prevent recursion", () => {
  const root = createFixture("hook-stop-recursion");
  runClaw(["init", "--name", "Hook Stop Project"], root);
  const sessionId = "thread-stop-finalizer";
  const env = { CODEX_THREAD_ID: sessionId, CLAW_KNOWLEDGE_FINALIZER: "1" };
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Skip recursive hook"], root, env);
  const transcriptPath = path.join(root, "thread.jsonl");
  fs.writeFileSync(transcriptPath, JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", text: "Do not capture" }],
    },
  }), "utf-8");
  const result = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-finalizer",
    transcript_path: transcriptPath,
    cwd: root,
  }, env);
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "demo-task", "plan.report")), false);

  const sessionStart = runClawHook("auto-claw", root, {
    session_id: sessionId,
    cwd: root,
    hook_event_name: "SessionStart",
  }, env);
  assert.equal(sessionStart.status, 0);
  assert.equal(sessionStart.stdout.trim(), "");
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

test("opencode finalizer environment drops the parent platform session identity", () => {
  const env = opencodeKnowledgeFinalizerEnvironment({
    CODEX_THREAD_ID: "parent-codex-thread",
    CODEX_SESSION_ID: "parent-opencode-session",
    PATH: "preserved",
  });
  assert.equal(env.CODEX_THREAD_ID, undefined);
  assert.equal(env.CODEX_SESSION_ID, undefined);
  assert.equal(env.CLAW_KNOWLEDGE_FINALIZER, "1");
  assert.equal(env.PATH, "preserved");
});

test("knowledge finalization honors a custom writer without applying built-in governance", () => {
  const root = createFixture("knowledge-writer-no-op");
  const home = path.join(root, "home");
  const taskDir = path.join(root, ".claw", "tasks", "no-op-task");
  runClaw(["init", "--name", "Knowledge Writer No-op"], root, { HOME: home, USERPROFILE: home });
  fs.mkdirSync(taskDir, { recursive: true });
  const planPath = path.join(taskDir, "plan.json");
  const reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "No-op", status: "end.completed" }), "utf-8");
  fs.writeFileSync(reportPath, "{}\n", "utf-8");

  const sdkRoot = path.join(
    home, ".claw-kit", "codex-runtime", CODEX_SDK_VERSION,
    "node_modules", "@openai", "codex-sdk",
  );
  fs.mkdirSync(path.join(sdkRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  const promptLog = path.join(root, "writer-prompts.log");
  const optionsLog = path.join(root, "writer-options.json");
  const sessionRuntimeDir = path.join(root, "session-runtime");
  const knowledgePath = path.join(root, ".claw", "truth", "features", "custom-writer.md");
  const customKnowledge = [
    "# Custom writer", "",
    "<!-- state: history -->", "## Evolution", "",
    "<!-- dated: 2026-07-20 -->", "### First", "", "First state.", "",
    "<!-- dated: 2026-07-20 -->", "### Second", "", "Second state.", "",
    "<!-- dated: 2026-07-20 -->", "### Third", "", "Third state.", "",
    "<!-- dated: 2026-07-20 -->", "### Fourth", "", "Fourth state.", "",
  ].join("\n");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `import fs from "node:fs";\nimport path from "node:path";\nimport { createHash } from "node:crypto";\nexport class Codex { startThread(options) { fs.writeFileSync(${JSON.stringify(optionsLog)}, JSON.stringify(options)); return { id: "thread-knowledge", run: async (prompt) => { fs.appendFileSync(${JSON.stringify(promptLog)}, prompt + "\\n---PASS---\\n"); fs.mkdirSync(path.dirname(${JSON.stringify(knowledgePath)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(knowledgePath)}, ${JSON.stringify(customKnowledge)}, "utf-8"); const digest = createHash("sha256").update("thread-knowledge").digest("hex"); const workflowDir = path.join(process.env.CLAW_SESSION_RUNTIME_DIR, digest); const taskDir = path.join(workflowDir, "tasks", "custom-writer-run"); fs.mkdirSync(taskDir, { recursive: true }); fs.writeFileSync(path.join(workflowDir, "session.json"), JSON.stringify({ version: 1, scope: "session", originCwd: ${JSON.stringify(root)}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })); fs.writeFileSync(path.join(taskDir, "plan.json"), JSON.stringify({ title: "custom writer", status: "end.completed", tasks: [{ id: 1, status: "done" }] })); return { finalResponse: "Custom knowledge updated." }; } }; } }\n`,
    "utf-8",
  );

  const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, "no-op.json");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "no-op",
    sessionId: "thread-no-op",
    projectRoot: root,
    taskName: "no-op-task",
    host: "codex",
    planPath,
    reportPath,
    writer: {
      externalSkill: "team:custom-knowledge-writer",
      model: null,
      reasoningEffort: "medium",
      datedSectionsToKeep: 2,
    },
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: sessionRuntimeDir,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
  });
  assert.equal(finalized.status, 0);
  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.status, "succeeded");
  assert.equal(job.sdkThreadId, "thread-knowledge");
  assert.equal(job.truthThreadId, undefined);
  assert.equal(job.adrThreadId, undefined);
  assert.equal(job.finalResponse, "Custom knowledge updated.");
  assert.equal(job.knowledgeGovernance, undefined);
  const knowledge = fs.readFileSync(knowledgePath, "utf-8");
  assert.match(knowledge, /First state/u);
  assert.match(knowledge, /Second state/u);
  assert.match(knowledge, /Third state/u);
  assert.match(knowledge, /Fourth state/u);
  const prompts = fs.readFileSync(promptLog, "utf-8").split("---PASS---").filter((item) => item.trim());
  assert.equal(prompts.length, 1);
  assert.match(prompts[0]!, /Use the team:custom-knowledge-writer skill and follow it exactly\./);
  assert.doesNotMatch(prompts[0]!, /Use the claw-kit:knowledge-writer skill/);
  assert.doesNotMatch(prompts[0]!, /one current owner|Evolution retention|dated:/i);
  assert.match(prompts[0]!, /interpret all supplied materials by their content/i);
  assert.doesNotMatch(prompts[0]!, /entryType|knowledge_finalization/);
  assert.doesNotMatch(prompts[0]!, /using-claw-kit/i);
  const writerOptions = JSON.parse(fs.readFileSync(optionsLog, "utf-8")) as JsonRecord;
  assert.equal(writerOptions.sandboxMode, process.platform === "win32" ? "danger-full-access" : "workspace-write");
  assert.equal(fs.existsSync(reportPath), true);
  const reportEntries = fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonRecord);
  assert.equal(reportEntries.length, 2);
  assert.deepEqual(reportEntries[1], {
    schemaVersion: 1,
    entryType: "knowledge_finalization",
    finalizeId: "no-op",
    taskName: "no-op-task",
    recordedAt: job.finishedAt,
    status: "succeeded",
    result: "Custom knowledge updated.",
    attempts: 1,
    host: "codex",
    threadId: "thread-knowledge",
    truthEncoding: job.truthEncoding,
  });
  const repeated = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: sessionRuntimeDir,
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
  });
  assert.equal(repeated.status, 0);
  assert.equal(fs.readFileSync(reportPath, "utf-8").trim().split(/\r?\n/).length, 2);
});

test("knowledge finalization deterministically trims excess dated evolution written by the writer", () => {
  const root = createFixture("knowledge-writer-retention");
  const home = path.join(root, "home");
  const taskDir = path.join(root, ".claw", "tasks", "retention-task");
  runClaw(["init", "--name", "Knowledge Writer Retention"], root, { HOME: home, USERPROFILE: home });
  fs.mkdirSync(taskDir, { recursive: true });
  const planPath = path.join(taskDir, "plan.json");
  const reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "Retention", status: "end.completed" }), "utf-8");
  fs.writeFileSync(reportPath, "{}\n", "utf-8");

  const sdkRoot = path.join(
    home, ".claw-kit", "codex-runtime", CODEX_SDK_VERSION,
    "node_modules", "@openai", "codex-sdk",
  );
  fs.mkdirSync(path.join(sdkRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  const knowledgePath = path.join(root, ".claw", "truth", "features", "evolving.md");
  const writtenKnowledge = [
    "# Evolving", "",
    "<!-- state: current -->", "## Current", "", "Current behavior remains intact.", "",
    "<!-- state: history -->", "## Evolution", "",
    "<!-- dated: 2026-07-20 -->", "### First", "", "First historical state.", "",
    "<!-- dated: 2026-07-20 -->", "### Second", "", "Second historical state.", "",
    "<!-- dated: 2026-07-20 -->", "### Third", "", "Third historical state.", "",
    "<!-- dated: 2026-07-20 -->", "### Fourth", "", "Fourth historical state.", "",
  ].join("\n");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `import fs from "node:fs";\nimport path from "node:path";\nimport { createHash } from "node:crypto";\nexport class Codex { startThread() { return { id: "thread-retention", run: async () => { fs.mkdirSync(path.dirname(${JSON.stringify(knowledgePath)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(knowledgePath)}, ${JSON.stringify(writtenKnowledge)}, "utf-8"); const digest = createHash("sha256").update("thread-retention").digest("hex"); const workflowDir = path.join(process.env.CLAW_SESSION_RUNTIME_DIR, digest); const workflowTaskDir = path.join(workflowDir, "tasks", "knowledge-writer"); fs.mkdirSync(workflowTaskDir, { recursive: true }); fs.writeFileSync(path.join(workflowDir, "session.json"), JSON.stringify({ version: 1, scope: "session", originCwd: ${JSON.stringify(root)}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })); fs.writeFileSync(path.join(workflowTaskDir, "plan.json"), JSON.stringify({ title: "knowledge-writer", templateId: "knowledge-writer", status: "end.completed", tasks: [{ id: 1, status: "done" }] })); return { finalResponse: "Knowledge updated." }; } }; } }\n`,
    "utf-8",
  );

  const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, "retention.json");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "retention",
    sessionId: "thread-retention-owner",
    projectRoot: root,
    taskName: "retention-task",
    host: "codex",
    planPath,
    reportPath,
    writer: { datedSectionsToKeep: 2 },
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: path.join(root, "session-runtime"),
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
  });
  assert.equal(finalized.status, 0);
  const content = fs.readFileSync(knowledgePath, "utf-8");
  assert.match(content, /Current behavior remains intact/u);
  assert.doesNotMatch(content, /First historical state/u);
  assert.doesNotMatch(content, /Second historical state/u);
  assert.match(content, /Third historical state/u);
  assert.match(content, /Fourth historical state/u);

  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.deepEqual(job.knowledgeGovernance, {
    changedFiles: 1,
    compactedFiles: 1,
    removedSections: 2,
    files: [{
      path: "features/evolving.md",
      datedSectionCountBefore: 4,
      datedSectionCountAfter: 2,
      removedSections: [
        { date: "2026-07-20", heading: "### First" },
        { date: "2026-07-20", heading: "### Second" },
      ],
    }],
  });
});

test("knowledge finalization fails and retains its report when the SDK writer does not complete a session workflow", () => {
  const root = createFixture("knowledge-writer-incomplete-session");
  const home = path.join(root, "home");
  const taskDir = path.join(root, ".claw", "tasks", "incomplete-session-task");
  runClaw(["init", "--name", "Knowledge Writer Incomplete Session"], root, { HOME: home, USERPROFILE: home });
  fs.mkdirSync(taskDir, { recursive: true });
  const planPath = path.join(taskDir, "plan.json");
  const reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "Incomplete session", status: "end.completed" }), "utf-8");
  fs.writeFileSync(reportPath, "{}\n", "utf-8");

  const sdkRoot = path.join(
    home, ".claw-kit", "codex-runtime", CODEX_SDK_VERSION,
    "node_modules", "@openai", "codex-sdk",
  );
  fs.mkdirSync(path.join(sdkRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  fs.writeFileSync(
    path.join(sdkRoot, "dist", "index.js"),
    `export class Codex { startThread() { return { id: "thread-incomplete", run: async () => ({ finalResponse: "Could not read the inputs." }) }; } }\n`,
    "utf-8",
  );

  const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobPath = path.join(jobsDir, "incomplete-session.json");
  fs.writeFileSync(jobPath, JSON.stringify({
    schemaVersion: 1,
    finalizeId: "incomplete-session",
    sessionId: "thread-incomplete-owner",
    projectRoot: root,
    taskName: "incomplete-session-task",
    host: "codex",
    planPath,
    reportPath,
    status: "queued",
    attempts: 0,
    queuedAt: new Date().toISOString(),
  }), "utf-8");

  const finalized = runClawRaw(["internal-knowledge-finalize", "--job", jobPath], root, {
    HOME: home,
    USERPROFILE: home,
    CLAW_SESSION_RUNTIME_DIR: path.join(root, "session-runtime"),
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_RETRY: "1",
  });
  assert.equal(finalized.status, 0);
  const job = JSON.parse(fs.readFileSync(jobPath, "utf-8")) as JsonRecord;
  assert.equal(job.status, "failed");
  assert.match(String((job.error as JsonRecord).message), /did not create its required session workflow/i);
  assert.equal(fs.existsSync(reportPath), true);
});

test("opencode Stop hook captures inline message payload and writes host to job", () => {
  const root = createFixture("hook-stop-opencode-message");
  const sessionId = "thread-opencode-message";
  const env = { CLAW_HOST: "opencode", CODEX_THREAD_ID: sessionId, CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1" };
  runClaw(["init", "--name", "OpenCode Message", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Capture inline message"], root, env);
  const registriesDir = path.join(root, ".claw", "runtime", "knowledge-sessions");
  const registryFiles = fs.readdirSync(registriesDir).filter((name) => name.endsWith(".json"));
  assert.equal(registryFiles.length, 1);
  const registry = JSON.parse(fs.readFileSync(path.join(registriesDir, registryFiles[0]!), "utf-8")) as JsonRecord;
  assert.equal("host" in registry, false);
  runClaw(["task", "done", "--id", "1"], root, env);
  runClaw(["plan", "done", "--retrospective", "Done."], root, env);

  const stop = runClawHook("auto-doc", root, {
    session_id: sessionId,
    turn_id: "turn-opencode-message",
    message: "Inline opencode turn report message.",
    cwd: root,
  }, env);
  assert.equal(stop.status, 0);
  assert.equal(stop.stdout.trim(), "");
  const reportPath = path.join(root, ".claw", "tasks", "demo-task", "plan.report");
  const entry = JSON.parse(fs.readFileSync(reportPath, "utf-8").trim()) as { message: string; turnId: string };
  assert.equal(entry.message, "Inline opencode turn report message.");
  assert.equal(entry.turnId, "turn-opencode-message");

  const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
  const jobFiles = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json"));
  assert.equal(jobFiles.length, 1);
  const job = JSON.parse(fs.readFileSync(path.join(jobsDir, jobFiles[0]!), "utf-8")) as JsonRecord;
  assert.equal(job.host, "opencode");
  assert.equal(job.status, "queued");
});

test("opencode host finalization routes through opencode runner, not Codex SDK", () => {
  const root = createFixture("hook-stop-opencode-routing");
  const sessionId = "thread-opencode-routing";
  const env = { CLAW_HOST: "opencode", CODEX_THREAD_ID: sessionId, CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1" };
  runClaw(["init", "--name", "OpenCode Routing", "--planning", "false"], root, env);
  const projectJsonPath = path.join(root, ".claw", "project.json");
  const projectConfig = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as JsonRecord;
  projectConfig.knowledgeWriter = {
    externalSkill: "custom-knowledge-writer",
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
  const jobsDir = path.join(root, ".claw", "runtime", "knowledge-finalization", "jobs");
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
