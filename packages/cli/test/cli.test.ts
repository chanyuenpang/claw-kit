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

function getLatestCompletionRefreshStatusFile(root: string): string | null {
  const logDir = path.join(root, ".claw", "logs", "completion-refresh");
  if (!fs.existsSync(logDir)) {
    return null;
  }
  const entries = fs
    .readdirSync(logDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(logDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return entries[0] ?? null;
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

function createGitnexusShim(mode: "fallback" | "primary"): { binDir: string; logPath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-gitnexus-bin-"));
  const logPath = path.join(binDir, "gitnexus.log");
  const cmdPath = path.join(binDir, "gitnexus.cmd");
  const jsPath = path.join(binDir, "gitnexus-shim.js");
  const script = `
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, \`\${args.join(" ")}\\n\`);

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
        id: "cli-e2e",
        name: "CLI E2E",
        maxTasksToKeep: 99,
        planning: false,
        externalPlanningSkill: null,
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: true,
        },
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
  assert.equal(createGoalTool.ifNoActiveGoal, true);
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
        tasks: [{ id: 1, title: "Verify the CLI lifecycle", status: "in_progress" }],
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
    "claw plan edit --task e2e-task --task-id 1 --task-status done",
  ]);
  assert.equal("notes" in inProgressResult, false);

  const taskDone = runClaw(
    ["plan", "edit", "--task", "e2e-task", "--task-id", "1", "--task-status", "done"],
    root,
    env,
  );
  assert.equal("stage" in taskDone, false);
  const truthDelegate = ((taskDone.delegateSubagents as JsonRecord[])[0] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "external-truth-writer");
  assert.equal(truthDelegate.model, "gpt-5.4-mini");
  assert.equal(truthDelegate.fork_context, false);
  assert.equal(truthDelegate.waitForCompletion, false);
  assert.equal(truthDelegate.preferReuseSameTypeInThread, true);
  assert.equal(truthDelegate.closePolicy, "keep_open_for_reuse");
  assert.equal(
    truthDelegate.inputContract,
    "curated completed subtask report with valuable findings for truth deposition",
  );
  assert.deepEqual(taskDone.nextsteps, [
    "1. Clear thread progress.",
    "2. Read `delegateSubagents`, curate the valuable findings from the completed work into a completed subtask report, then execute the returned `truth-writer` dispatch contract field-by-field. Do not treat it as a suggestion.",
    "3. First write both `retrospective` and `keyDecisions` back into the plan, then read `delegateSubagents` again and execute the returned `adr-writer` dispatch contract field-by-field with that updated completed `plan.json`.",
  ]);
  assert.deepEqual(taskDone.recommendedCommands, [
    "claw plan edit --task e2e-task --patch <completed-plan.json>",
    "claw plan done --task e2e-task --summary \"<retrospective summary>\"",
  ]);
  assert.equal(
    taskDone.notes,
    "Truth doc and ADR doc generation are essential claw-kit features. When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.",
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
  assert.equal((memory.task as JsonRecord | undefined), undefined);
  assert.equal(gitnexus.command, "gitnexus analyze");
  assert.equal(gitnexus.enabled, true);
  assert.equal(doneResult.planSummary, "1/1 e2e-task");

  const gitnexusLog = fs.readFileSync(shim.logPath, "utf-8");
  assert.match(gitnexusLog, /analyze --embeddings --no-ai-context/);
  assert.match(gitnexusLog, /analyze --embeddings\r?\n?$/m);
  assert.match(gitnexusLog, /analyze --no-ai-context/);
  assert.match(gitnexusLog, /analyze\r?\n?$/m);
});

test("cli plan create accepts a positional title and seeds planning discussion by default", () => {
  const root = createFixture("positional-title");
  runClaw(["init", "--name", "Positional Title"], root);

  const writeResult = runClaw(["plan", "create", "这是一个任务标题"], root);
  assert.equal(writeResult.planSummary, "0/2 这是一个任务标题");
  assert.equal(writeResult.goalMode, undefined);
  assert.deepEqual(writeResult.nextsteps, [
    "1. Resolve the discussion, then resume through `process.active`.",
  ]);
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
    "1. Resolve the discussion, then resume through `process.active`.",
  ]);
  assert.equal("goalTool" in result, false);
  assert.equal(String((tasks[0] as JsonRecord).title), "Use the planning skill to refine the request and append executable tasks");
  assert.equal(String((tasks[1] as JsonRecord).title), "Enter process.active");
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
  assert.equal(waitResult.goalMode, undefined);

  const resumeResult = runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);
  const resumeGoalMode = resumeResult.goalMode as JsonRecord;
  const resumeGoalTool = resumeResult.goalTool as JsonRecord;
  assert.equal(resumeResult.planStatus, "process.active");
  assert.deepEqual(resumeResult.nextsteps, [
    "Sync the thread progress with our tasks.",
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
  assert.equal(resumeGoalTool.ifNoActiveGoal, true);
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
        id: "search-positional-query",
        name: "Search Positional Query",
        maxTasksToKeep: 99,
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
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
    JSON.stringify([{ title: "Auto numbered task", status: "pending" }], null, 2),
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
  }));
  assert.deepEqual(tasks, [
    { id: 1, title: "Verify auto ids" },
    { id: 3, title: "Existing numbered task" },
    { id: 4, title: "Auto numbered task" },
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

  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        tasks: [
          { id: 1, title: "First task", status: "pending" },
          { id: 2, title: "Second task", status: "pending" }
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
    ["plan", "edit", "--task", "demo-task", "--task-id", "1", "--task-status", "done"],
    root,
  );

  assert.equal("stage" in taskDone, false);
  assert.equal("summary" in taskDone, false);
  assert.deepEqual(taskDone.nextsteps, [
    "1. Sync the thread progress with our tasks.",
    "2. Read `delegateSubagents`, curate the valuable findings from the completed task into a completed subtask report, then execute the returned `truth-writer` dispatch contract field-by-field. Do not treat it as a suggestion.",
    "3. Continue with task #2.",
  ]);
  assert.equal(
    taskDone.notes,
    "In `process.active`, keep moving unless there is a real blocker or explicit user interruption. When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.",
  );
  assert.deepEqual(taskDone.nextTask, {
    id: 2,
    title: "Second task",
    status: "pending",
  });
  const truthDelegate = ((taskDone.delegateSubagents as JsonRecord[])[0] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.skill, "external-truth-writer");
  assert.equal(truthDelegate.fork_context, false);
  assert.equal(
    truthDelegate.inputContract,
    "curated completed subtask report with valuable findings for truth deposition",
  );
});

test("cli respects project override toggles for goal mode and final-only truth dispatch", () => {
  const root = createFixture("cli-project-override-toggles");
  runClaw(["init", "--name", "CLI Override Toggles", "--planning", "false"], root);

  fs.writeFileSync(
    path.join(root, ".claw", "project.json"),
    JSON.stringify(
      {
        id: "cli-project-override-toggles",
        name: "CLI Override Toggles",
        maxTasksToKeep: 99,
        externalTruthSkill: "external-truth-writer",
        externalAdrSkill: "external-adr-writer",
        contextPaths: [],
        workflow: {
          goalMode: {
            enabled: true,
          },
          truthDispatch: {
            mode: "per_task",
          },
        },
        memory: {
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            store: {
              vector: {
                enabled: true,
              },
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
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
        workflow: {
          goalMode: {
            enabled: false,
          },
          truthDispatch: {
            mode: "final_only",
          },
        },
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
          { id: 1, title: "First task", status: "pending" },
          { id: 2, title: "Second task", status: "pending" }
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
    ["plan", "edit", "--task", "demo-task", "--task-id", "1", "--task-status", "done"],
    root,
  );
  assert.equal("delegateSubagents" in taskDone, false);
  assert.equal((taskDone.nextsteps as string[]).some((step) => step.includes("truth-writer")), false);

  const allDone = runClaw(
    ["plan", "edit", "--task", "demo-task", "--task-id", "2", "--task-status", "done"],
    root,
  );
  const truthDelegate = ((allDone.delegateSubagents as JsonRecord[])[0] ?? {});
  const adrDelegate = ((allDone.delegateSubagents as JsonRecord[])[1] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(adrDelegate.name, "adr-writer");
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
  runClaw(["init", "--name", "Subplan Write", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root);

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
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", patchPath], root);

  const result = runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root);

  assert.match(String(result.planPath), /tasks[\\/]demo-task[\\/]plans[\\/]Implement-child-work\.json$/);
  const meta = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8")) as JsonRecord;
  const childPlan = JSON.parse(fs.readFileSync(String(result.planPath), "utf-8")) as JsonRecord;
  assert.equal(meta.rootPlan, "plan.json");
  assert.equal(meta.activePlan, "plans/Implement-child-work.json");
  assert.equal(childPlan.title, "Implement child work");
  assert.equal(childPlan.status, "process.discussing");
  assert.deepEqual(result.nextsteps, [
    "1. Resolve the discussion, then resume through `process.active`.",
  ]);
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

test("cli plan done on a subplan resumes the parent plan instead of archiving the whole task", () => {
  const root = createFixture("cli-subplan-done-resume-parent");
  runClaw(["init", "--name", "Subplan Done Resume Parent", "--max-tasks-to-keep", "99", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "demo-task", "--goal", "Parent goal"], root);

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
  runClaw(["plan", "edit", "--task", "demo-task", "--patch", rootPatchPath], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);
  runClaw(["subplan", "create", "--parent", "demo-task", "--task-id", "1"], root);

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
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "plans/Implement-child-work.json", "--patch", childPatchPath], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "plans/Implement-child-work.json", "--plan-status", "process.active"], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "plans/Implement-child-work.json", "--task-id", "1", "--task-status", "done"], root);

  const doneResult = runClaw(
    ["plan", "done", "--task", "demo-task", "--plan", "plans/Implement-child-work.json", "--summary", "Child complete."],
    root,
  );

  const meta = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8")) as JsonRecord;
  const parentPlan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  const childPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plans", "Implement-child-work.json"), "utf-8"),
  ) as JsonRecord;

  assert.equal(doneResult.planStatus, "process.active");
  assert.match(String(doneResult.planPath), /tasks[\\/]demo-task[\\/]plan\.json$/);
  assert.deepEqual(doneResult.nextsteps, [
    "Sync the thread progress with our tasks.",
    "Start with task #2.",
  ]);
  assert.deepEqual(doneResult.nextTask, {
    id: 2,
    title: "Resume parent work",
    status: "pending",
  });
  assert.equal((doneResult.goalMode as JsonRecord).setWhen, "on_enter_process_active");
  assert.equal("archivedPlanPath" in doneResult, false);
  assert.equal(meta.activePlan, "plan.json");
  assert.equal(meta.status, "active");
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
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "per_task");
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
  assert.equal(projectConfig.truthDispatch, "per_task");
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
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "per_task");
  assert.deepEqual(projectConfig.memory, {
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-m-v2.0",
    },
  });
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
  assert.equal(projectConfig.id, "broken-project");
  assert.equal(projectConfig.name, "Broken Project");
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.externalTruthSkill, null);
  assert.equal(projectConfig.externalAdrSkill, null);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.equal(projectConfig.goalMode, true);
  assert.equal(projectConfig.truthDispatch, "per_task");
  assert.deepEqual(projectConfig.memory, {
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-m-v2.0",
    },
  });
  assert.equal(projectConfig.gitnexus, false);
});

test("cli plan done always archives the current completed task", async () => {
  const root = createFixture("plan-done-archive");
  const env = { CLAW_EMBEDDING_MOCK: "1" };
  runClaw(["init", "--name", "Archive On Complete", "--max-tasks-to-keep", "99", "--planning", "false"], root, env);
  runClaw(["plan", "create", "--title", "archive-task", "--goal", "Archive after completion"], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task", "archive-task", "--summary", "Archive this completed task."],
    root,
    env,
  );

  assert.equal("completionRefresh" in doneResult, false);
  assert.match(String(doneResult.planPath), /archive[\\/]tasks[\\/]archive-task[\\/].*plan\.json$/);
  assert.equal(String(doneResult.archivedPlanPath), String(doneResult.planPath));
  const refreshStatus = await waitForLatestCompletionRefreshStatus(root);
  const memory = refreshStatus.memory as JsonRecord;
  assert.equal((memory.task as JsonRecord | undefined), undefined);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "archive-task")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "archive-task")), true);
});

test("cli plan show automatically reads archived tasks when the active task is archived away", () => {
  const root = createFixture("plan-show-archived");
  runClaw(["init", "--name", "Archived Show", "--max-tasks-to-keep", "99", "--planning", "false"], root);
  runClaw(["plan", "create", "--title", "archived-task", "--goal", "Show archived plan"], root);
  runClaw(["plan", "done", "--task", "archived-task", "--summary", "Archive this task."], root);

  const result = runClaw(["plan", "show", "--task", "archived-task"], root);

  assert.equal(result.archived, true);
  assert.match(String(result.planPath), /archive[\\/]tasks[\\/]archived-task[\\/].*plan\.json$/);
  const planView = result.planView as JsonRecord;
  assert.equal(String(planView.collapsedSummary), "0/1 archived-task");
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
        id: "gitnexus-embeddings-preflight",
        name: "Gitnexus Embeddings Preflight",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: [],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: true,
        },
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
  assert.equal(gitnexus.command, "gitnexus analyze --no-ai-context");

  const gitnexusLog = fs.readFileSync(shim.logPath, "utf-8");
  assert.match(gitnexusLog, /analyze --embeddings --no-ai-context/);
  assert.match(gitnexusLog, /analyze --no-ai-context/);
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
        id: "search-index-refresh",
        name: "Search Index Refresh",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: [],
          embedding: {
            provider: "openai",
            model: "text-embedding-3-small",
            remote: {
              apiKeyEnvVar: "OPENAI_API_KEY",
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "SUMMARY.md"), "shared beta truth\n", "utf-8");

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
        id: "search-index-refresh-local",
        name: "Search Index Refresh Local",
        maxTasksToKeep: 99,
        externalTruthSkill: null,
        externalAdrSkill: null,
        contextPaths: [],
        memory: {
          externalDocPaths: ["docs/"],
          embedding: {
            provider: "local",
            model: "Snowflake/snowflake-arctic-embed-xs",
            local: {
              modelCacheDir: path.join(root, ".model-cache"),
            },
          },
        },
        gitnexus: {
          enabled: false,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, ".claw", "memory.md"), "project alpha memory\n", "utf-8");
  fs.writeFileSync(path.join(root, ".claw", "truth", "SUMMARY.md"), "shared beta truth\n", "utf-8");
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
  assert.match(additionalContext, /already authorized this current thread to use goal mode and delegate the subagents required by the claw workflow/i);
  assert.match(additionalContext, /Do not block normal claw goal-mode entry, truth deposition, or ADR deposition for any permission-related excuse/i);
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

  const meta = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8"),
  ) as { ownerSessionKey?: string; boundAt?: string };
  assert.equal(meta.ownerSessionKey, "thread-demo");
  assert.ok(meta.boundAt);

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
  assert.match(additionalContext, /already authorized this thread to use goal mode and delegate the claw workflow's required subagents/i);
  assert.match(additionalContext, /Do not block on permission-related excuses or fresh authorization requests for goal mode, truth-writer, or adr-writer/i);
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
  assert.equal(commandResult.stderr, flagResult.stderr);
  assert.match(commandResult.stderr, /--refresh/);
});

test("cli search --help shows search query usage", () => {
  const root = createFixture("help-search-self");
  const result = runClawRaw(["search", "--help"], root);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /--query/);
  assert.match(result.stderr, /--limit/);
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
