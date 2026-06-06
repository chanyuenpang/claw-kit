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
  const cliPath = path.resolve(thisDir, "..", "dist", "cli.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(`claw ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as JsonRecord;
}

function runClawExpectFailure(args: string[], cwd: string, env?: NodeJS.ProcessEnv): JsonRecord {
  const cliPath = path.resolve(thisDir, "..", "dist", "cli.js");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf-8",
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

test("cli lifecycle e2e covers plan, truth, goalMode, memory refresh, and gitnexus fallback refresh", () => {
  const root = createFixture("e2e");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "external alpha doc\n", "utf-8");
  const shim = createGitnexusShim("fallback");
  const env = {
    PATH: `${shim.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };

  const initResult = runClaw(
    ["init", "--name", "CLI E2E", "--gitnexus", "true", "--auto-achieve-task", "false", "--ext-path", "docs/"],
    root,
    env,
  );
  assert.equal(initResult.projectId, "cli-e2e");

  const writeResult = runClaw(
    ["plan", "write", "--task", "e2e-task", "--title", "E2E task", "--goal", "Verify the CLI lifecycle"],
    root,
    env,
  );
  assert.equal(writeResult.stage, "requirements");
  assert.equal(writeResult.planSummary, "0/0 E2E task");

  const activateResult = runClaw(
    ["plan", "edit", "--task", "e2e-task", "--plan-status", "process.active"],
    root,
    env,
  );
  const goalMode = activateResult.goalMode as JsonRecord;
  assert.equal(goalMode.recommendedObjective, "Verify the CLI lifecycle");

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
  assert.equal(appendResult.planSummary, "0/1 E2E task");

  const taskDone = runClaw(
    ["plan", "edit", "--task", "e2e-task", "--task-id", "1", "--task-status", "done"],
    root,
    env,
  );
  assert.equal(taskDone.stage, "done");
  const truthDelegate = ((taskDone.delegateSubagents as JsonRecord[])[0] ?? {});
  assert.equal(truthDelegate.name, "truth-writer");
  assert.equal(truthDelegate.waitForCompletion, false);
  assert.equal(truthDelegate.preferReuseSameTypeInThread, true);
  assert.equal(truthDelegate.closePolicy, "keep_open_for_reuse");

  const truthInputPath = path.join(root, "truth-report.md");
  fs.writeFileSync(truthInputPath, "# Finding\n\nDurable truth.\n", "utf-8");
  const truthResult = runClaw(
    ["truth", "ingest", "--target", "features/e2e.md", "--input", truthInputPath],
    root,
    env,
  );
  assert.match(String(truthResult.targetPath), /\\.claw[\\/]+truth[\\/]+features[\\/]+e2e\.md$/);

  const searchResult = runClaw(["search", "--query", "alpha"], root, env);
  assert.equal(searchResult.command, "search");
  assert.equal(searchResult.scope, "project");
  assert.ok(Array.isArray(searchResult.results));

  const doneResult = runClaw(
    ["plan", "done", "--task", "e2e-task", "--summary", "CLI flow completed."],
    root,
    env,
  );
  const completionRefresh = doneResult.completionRefresh as JsonRecord;
  const memory = completionRefresh.memory as JsonRecord;
  const gitnexus = completionRefresh.gitnexus as JsonRecord;
  const adrDelegate = ((doneResult.delegateSubagents as JsonRecord[])[0] ?? {});
  assert.equal(adrDelegate.name, "adr-writer");
  assert.equal(adrDelegate.waitForCompletion, false);
  assert.equal(adrDelegate.preferReuseSameTypeInThread, true);
  assert.equal(adrDelegate.closePolicy, "keep_open_for_reuse");
  assert.ok(Number(memory.projectIndexed) > 0);
  assert.ok(Number(memory.taskIndexed) > 0);
  assert.equal(gitnexus.command, "gitnexus analyze");
  assert.equal(gitnexus.refreshed, true);
  assert.equal(doneResult.planSummary, "1/1 E2E task");

  const gitnexusLog = fs.readFileSync(shim.logPath, "utf-8");
  assert.match(gitnexusLog, /analyze --no-ai-context/);
  assert.match(gitnexusLog, /analyze\r?\n?$/m);
});

test("cli init writes maxTasksToKeep into project.json", () => {
  const root = createFixture("init-max-tasks");

  runClaw(
    ["init", "--name", "Task Retention", "--auto-achieve-task", "false", "--max-tasks-to-keep", "12"],
    root,
  );

  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;
  assert.equal(projectConfig.maxTasksToKeep, 12);
  assert.equal(projectConfig.autoAchieveTask, false);
});

test("cli init writes default maxTasksToKeep into project.json", () => {
  const root = createFixture("init-default-max-tasks");

  runClaw(["init", "--name", "Default Retention"], root);

  const projectConfig = JSON.parse(
    fs.readFileSync(path.join(root, ".claw", "project.json"), "utf-8"),
  ) as JsonRecord;
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.equal(projectConfig.autoAchieveTask, true);
});

test("cli context includes protocolCheck for existing .claw projects", () => {
  const root = createFixture("context-check");
  runClaw(["init", "--name", "Context Check"], root);

  const result = runClaw(["context"], root);
  const protocolCheck = result.protocolCheck as JsonRecord;

  assert.equal(protocolCheck.ok, true);
  assert.equal(protocolCheck.issues instanceof Array, true);
  assert.equal(result.project !== undefined, true);
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
  assert.ok((result.fixedPaths as unknown[]).includes("autoAchieveTask"));
  assert.ok((result.fixedPaths as unknown[]).includes("maxTasksToKeep"));
  assert.equal(projectConfig.id, "broken-project");
  assert.equal(projectConfig.name, "Broken Project");
  assert.equal(projectConfig.autoAchieveTask, true);
  assert.equal(projectConfig.maxTasksToKeep, 99);
  assert.deepEqual(projectConfig.contextPaths, []);
  assert.deepEqual(projectConfig.memory, { externalDocPaths: [] });
  assert.deepEqual(projectConfig.gitnexus, { enabled: false });
});

test("cli plan done archives current task when autoAchieveTask is enabled", () => {
  const root = createFixture("plan-done-archive");
  runClaw(["init", "--name", "Archive On Complete", "--auto-achieve-task", "true", "--max-tasks-to-keep", "99"], root);

  runClaw(
    [
      "plan",
      "write",
      "--task",
      "archive-task",
      "--title",
      "Archive task",
      "--goal",
      "Archive after completion",
    ],
    root,
  );
  runClaw(["plan", "edit", "--task", "archive-task", "--plan-status", "process.active"], root);

  const doneResult = runClaw(
    ["plan", "done", "--task", "archive-task", "--summary", "Archive this completed task."],
    root,
  );

  const completionRefresh = doneResult.completionRefresh as JsonRecord;
  const taskRetention = completionRefresh.taskRetention as JsonRecord;
  const archivedCurrentTask = taskRetention.archivedCurrentTask as JsonRecord;
  const memory = completionRefresh.memory as JsonRecord;

  assert.equal(taskRetention.autoAchieveTask, true);
  assert.equal(archivedCurrentTask.taskName, "archive-task");
  assert.match(String(archivedCurrentTask.archivedTaskDir), /archive[\\/]tasks[\\/]archive-task$/);
  assert.match(String(doneResult.planPath), /archive[\\/]tasks[\\/]archive-task[\\/].*plan\.json$/);
  assert.equal(memory.taskIndexed, 0);
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks", "archive-task")), false);
  assert.equal(fs.existsSync(path.join(root, ".claw", "archive", "tasks", "archive-task")), true);
});

test("cli plan done skips gitnexus refresh when project config disables it", () => {
  const root = createFixture("gitnexus-disabled");
  const env = {
    PATH: process.env.PATH ?? "",
  };

  runClaw(["init", "--name", "No Gitnexus"], root, env);
  const contentPath = path.join(root, "plan.json");
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        title: "No Gitnexus",
        status: "process.active",
        goal: { text: "Close without gitnexus" },
        tasks: [{ id: 1, title: "Done task", status: "done" }],
      },
      null,
      2,
    ),
    "utf-8",
  );
  runClaw(["plan", "write", "--task", "disabled-task", "--content", contentPath], root, env);

  const doneResult = runClaw(
    ["plan", "done", "--task", "disabled-task", "--summary", "No gitnexus refresh needed."],
    root,
    env,
  );
  const gitnexus = ((doneResult.completionRefresh as JsonRecord).gitnexus as JsonRecord);
  assert.equal(gitnexus.refreshed, false);
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

test("cli hook records a compact hook event", () => {
  const root = createFixture("hook");
  runClaw(["init", "--name", "Hook Project"], root);
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    USERPROFILE: home,
    HOME: home,
  };

  const result = runClaw(["hook", "SessionStart"], root, env);
  assert.equal(result.ok, true);
  assert.equal(result.command, "hook");
  assert.equal(result.eventName, "SessionStart");
  assert.equal(result.skipped, false);
  assert.equal(result.projectRoot, root);

  const logPath = path.join(home, ".codex", "claw-kit-hook.log");
  const records = fs.readFileSync(logPath, "utf-8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonRecord);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.eventName, "SessionStart");
  assert.equal(records[0]?.cwd, root);
  assert.equal(records[0]?.projectRoot, root);
  assert.match(String(records[0]?.clawDir), /\\.claw$/);
});

test("cli hook skips outside .claw projects without writing a log", () => {
  const root = createFixture("hook-skip");
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    USERPROFILE: home,
    HOME: home,
  };

  const result = runClaw(["hook", "SessionStart"], root, env);
  assert.equal(result.ok, true);
  assert.equal(result.command, "hook");
  assert.equal(result.eventName, "SessionStart");
  assert.equal(result.skipped, true);
  assert.match(String(result.reason), /not inside a \.claw project/);
  assert.equal(fs.existsSync(path.join(home, ".codex", "claw-kit-hook.log")), false);
});
