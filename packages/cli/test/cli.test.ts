import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;
const thisDir = path.dirname(fileURLToPath(import.meta.url));

function createFixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-cli-${name}-`));
}

function runClaw(args: string[], cwd: string, env?: NodeJS.ProcessEnv): JsonRecord {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
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
    env: {
      ...process.env,
      ...env,
    },
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
    env: {
      ...process.env,
      ...env,
    },
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
  const script =
    mode === "fallback"
      ? `@echo off
setlocal
echo %*>>"${logPath}"
echo %* | findstr /C:"--no-ai-context" >nul
if %errorlevel%==0 (
  echo unknown option --no-ai-context 1>&2
  exit /b 1
)
exit /b 0
`
      : `@echo off
setlocal
echo %*>>"${logPath}"
exit /b 0
`;
  fs.writeFileSync(cmdPath, script, "utf-8");
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
    ["plan", "write", "--title", "e2e-task", "--goal", "Verify the CLI lifecycle"],
    root,
    env,
  );
  assert.equal("stage" in writeResult, false);
  assert.equal("summary" in writeResult, false);
  assert.equal("taskName" in writeResult, false);
  assert.equal("planFile" in writeResult, false);
  assert.equal(writeResult.planSummary, "e2e-task");
  assert.match(String((writeResult.goalMode as JsonRecord).recommendedObjective), /Verify the CLI lifecycle/);
  assert.equal((writeResult.goalMode as JsonRecord).setWhen, undefined);
  assert.equal("nextAction" in writeResult, false);
  assert.equal("instruction" in writeResult, false);
  assert.equal("askUser" in writeResult, false);
  assert.equal(
    writeResult.notes,
    "Fill only the fields still needed to execute, such as `requirements`, `tasks`, `references`, `rules`, and `keyDecisions`. If scope is still unclear, clarify it with the user before switching to `process.active`.",
  );
  assert.equal((writeResult.plan as JsonRecord).title, "e2e-task");
  assert.equal((writeResult.plan as JsonRecord).status, "prepare.requirements");

  const activateResult = runClaw(
    ["plan", "edit", "--task", "e2e-task", "--plan-status", "process.active"],
    root,
    env,
  );
  const activateGoalMode = activateResult.goalMode as JsonRecord;
  assert.match(String(activateGoalMode.recommendedObjective), /Verify the CLI lifecycle/);
  assert.equal(activateGoalMode.setWhen, "on_enter_process_active");

  const patchPath = path.join(root, "append-tasks.json");
  fs.writeFileSync(
    patchPath,
    JSON.stringify([{ id: 1, title: "Ship verification", status: "pending" }], null, 2),
    "utf-8",
  );
  const appendResult = runClaw(
    ["plan", "edit", "--task", "e2e-task", "--append-tasks", patchPath],
    root,
    env,
  );
  assert.equal(appendResult.planSummary, "0/1 e2e-task");
  assert.deepEqual(appendResult.nextTask, {
    id: 1,
    title: "Ship verification",
    status: "pending",
  });

  const inProgressPath = path.join(root, "mark-in-progress.json");
  fs.writeFileSync(
    inProgressPath,
    JSON.stringify(
      {
        tasks: [{ id: 1, title: "Ship verification", status: "in_progress" }],
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
    "2. Curate the valuable findings from the completed work into a completed subtask report, then dispatch `truth-writer` with that report.",
    "3. Write the retrospective summary, then dispatch `adr-writer` with the completed `plan.json`",
  ]);

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
  assert.match(gitnexusLog, /analyze --no-ai-context/);
  assert.match(gitnexusLog, /analyze\r?\n?$/m);
});

test("cli plan write accepts a positional title and blocks process.active without goal", () => {
  const root = createFixture("positional-title");
  runClaw(["init", "--name", "Positional Title"], root);

  const writeResult = runClaw(["plan", "write", "这是一个任务标题"], root);
  assert.equal(writeResult.planSummary, "这是一个任务标题");
  assert.equal(writeResult.goalMode, undefined);
  assert.equal(
    (writeResult.recommendedCommands as string[])[0],
    "claw plan edit --task 这是一个任务标题 --plan-status process.active",
  );
  assert.equal(
    (writeResult.recommendedCommands as string[])[1],
    `claw plan edit --task ${String(writeResult.planSummary)} --patch <updated-plan.json>`,
  );
  assert.equal(
    (writeResult.recommendedCommands as string[])[2],
    `claw plan edit --task ${String(writeResult.planSummary)} --reference-path <path> --reference-why <why>`,
  );
  assert.ok((writeResult.nextsteps as string[]).includes("1. Fill `goal.text`."));

  const failure = runClawExpectFailure(
    ["plan", "edit", "--task", "这是一个任务标题", "--plan-status", "process.active"],
    root,
  );
  const error = failure.error as JsonRecord;
  assert.match(String(error.message), /goal\.text is required before the plan can leave prepare\.requirements/);
});

test("cli plan edit accepts single-reference shortcut flags", () => {
  const root = createFixture("plan-edit-reference-flags");
  runClaw(["init", "--name", "Reference Flags"], root);
  runClaw(["plan", "write", "--title", "demo-task", "--goal", "Track one reference"], root);

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
  runClaw(["init", "--name", "Reference Flags Missing Half"], root);
  runClaw(["plan", "write", "--title", "demo-task", "--goal", "Track one reference"], root);

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
  runClaw(["init", "--name", "Append Auto Ids"], root);
  runClaw(
    ["plan", "write", "--title", "demo-task", "--goal", "Verify auto ids"],
    root,
  );
  runClaw(["plan", "edit", "--task", "demo-task", "--plan-status", "process.active"], root);

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

  assert.equal(result.planSummary, "0/2 demo-task");
  assert.deepEqual(result.nextTask, {
    id: 3,
    title: "Existing numbered task",
    status: "pending",
  });

  const planShow = runClaw(["plan", "show", "--task", "demo-task"], root);
  const planView = planShow.planView as JsonRecord;
  const tasks = ((planView.tasks as JsonRecord).items as JsonRecord[]).map((task) => ({
    id: Number(task.id),
    title: String(task.title),
  }));
  assert.deepEqual(tasks, [
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
  runClaw(["plan", "write", "--title", "demo-task", "--goal", "Verify task completion contract"], root);
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
    "2. Curate the valuable findings from the completed task into a completed subtask report, then dispatch `truth-writer` with that report.",
    "3. Continue with task #2.",
  ]);
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

test("cli task status changed back to pending does not return nextTask", () => {
  const root = createFixture("cli-pending-no-next-task");
  runClaw(["init", "--name", "Pending No NextTask"], root);

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
  runClaw(["plan", "write", "--title", "demo-task", "--goal", "Keep pending edits lightweight"], root);
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

test("cli subplan write keeps task rootPlan stable and derives goal from the parent task", () => {
  const root = createFixture("cli-subplan-write");
  runClaw(["init", "--name", "Subplan Write"], root);
  runClaw(["plan", "write", "--title", "demo-task", "--goal", "Parent goal"], root);

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

  const result = runClaw(
    ["subplan", "write", "--parent", "demo-task", "--task-id", "1", "--title", "child-plan"],
    root,
  );

  assert.match(String(result.planPath), /tasks[\\/]demo-task[\\/]plans[\\/]child-plan\.json$/);
  const meta = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8")) as JsonRecord;
  const childPlan = JSON.parse(fs.readFileSync(String(result.planPath), "utf-8")) as JsonRecord;
  assert.equal(meta.rootPlan, "plan.json");
  assert.equal(meta.activePlan, "plans/child-plan.json");
  assert.equal(((childPlan.goal as JsonRecord).text), "Implement child work: Split the risky work into a subplan");
});

test("cli plan done on a subplan resumes the parent plan instead of archiving the whole task", () => {
  const root = createFixture("cli-subplan-done-resume-parent");
  runClaw(["init", "--name", "Subplan Done Resume Parent", "--max-tasks-to-keep", "99"], root);
  runClaw(["plan", "write", "--title", "demo-task", "--goal", "Parent goal"], root);

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
  runClaw(["subplan", "write", "--parent", "demo-task", "--task-id", "1", "--title", "child-plan"], root);

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
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "plans/child-plan.json", "--patch", childPatchPath], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "plans/child-plan.json", "--plan-status", "process.active"], root);
  runClaw(["plan", "edit", "--task", "demo-task", "--plan", "plans/child-plan.json", "--task-id", "1", "--task-status", "done"], root);

  const doneResult = runClaw(
    ["plan", "done", "--task", "demo-task", "--plan", "plans/child-plan.json", "--summary", "Child complete."],
    root,
  );

  const meta = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "meta.json"), "utf-8")) as JsonRecord;
  const parentPlan = JSON.parse(fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plan.json"), "utf-8")) as JsonRecord;
  const childPlan = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "tasks", "demo-task", "plans", "child-plan.json"), "utf-8"),
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
  assert.deepEqual(projectConfig.memory, {
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-m-v2.0",
      local: {
        modelCacheDir: ".claw/models",
      },
      store: {
        vector: {
          enabled: true,
        },
      },
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
  assert.deepEqual(projectConfig.memory, {
    externalDocPaths: [],
    embedding: {
      provider: "local",
      model: "Snowflake/snowflake-arctic-embed-m-v2.0",
      local: {
        modelCacheDir: ".claw/models",
      },
      store: {
        vector: {
          enabled: true,
        },
      },
    },
  });
  assert.deepEqual(projectConfig.gitnexus, { enabled: false });
});

test("cli plan done always archives the current completed task", async () => {
  const root = createFixture("plan-done-archive");
  const env = { CLAW_EMBEDDING_MOCK: "1" };
  runClaw(["init", "--name", "Archive On Complete", "--max-tasks-to-keep", "99"], root, env);

  runClaw(
    [
      "plan",
      "write",
      "--title",
      "archive-task",
      "--goal",
      "Archive after completion",
    ],
    root,
    env,
  );
  runClaw(["plan", "edit", "--task", "archive-task", "--plan-status", "process.active"], root, env);

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
  runClaw(["init", "--name", "Archived Show", "--max-tasks-to-keep", "99"], root);
  runClaw(
    [
      "plan",
      "write",
      "--title",
      "archived-task",
      "--goal",
      "Show archived plan",
    ],
    root,
  );
  runClaw(["plan", "edit", "--task", "archived-task", "--plan-status", "process.active"], root);
  runClaw(["plan", "done", "--task", "archived-task", "--summary", "Archive this task."], root);

  const result = runClaw(["plan", "show", "--task", "archived-task"], root);

  assert.equal(result.archived, true);
  assert.match(String(result.planPath), /archive[\\/]tasks[\\/]archived-task[\\/].*plan\.json$/);
  const planView = result.planView as JsonRecord;
  assert.equal(String(planView.collapsedSummary), "archived-task");
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
  runClaw(["plan", "write", "--title", "disabled-task", "--goal", "Close without gitnexus"], root, env);
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
    store: {
      vector: {
        enabled: true,
      },
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
    store: {
      vector: {
        enabled: true,
      },
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
  assert.match(additionalContext, /explicitly authorized to use goal mode and delegate subagents/i);
  assert.match(additionalContext, /Do not treat missing user authorization as a reason to block normal claw goal-mode entry/i);
});

test("plan write binds owner session key and SessionStart recovers active workflow snapshot", () => {
  const root = createFixture("hook-active-workflow");
  runClaw(["init", "--name", "Hook Project"], root);
  const env = {
    CODEX_THREAD_ID: "thread-demo",
  };

  runClaw(
    [
      "plan",
      "write",
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
  assert.match(additionalContext, /already authorized to use goal mode and delegate the claw workflow's required subagents/i);
  assert.match(additionalContext, /Do not block on extra user authorization for goal mode, truth-writer, or adr-writer/i);
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
});
