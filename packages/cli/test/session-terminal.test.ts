import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { initProject } from "@veewo/claw-core";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-terminal-${name}-`));
}

function runPersistentTerminal(
  projectRoot: string,
  runtimeRoot: string,
  input: string,
): Array<Record<string, unknown>> {
  const cliPath = path.resolve(thisDir, "..", "dist", "bin.js");
  const result = spawnSync(
    process.execPath,
    [cliPath, "session", "open", projectRoot, "terminal-agent"],
    {
      cwd: path.dirname(projectRoot),
      env: {
        ...process.env,
        CLAW_SESSION_DAEMON_RUNTIME_DIR: runtimeRoot,
        CLAW_SESSION_RUNTIME_DIR: path.join(runtimeRoot, "workflow"),
        CLAW_SESSION_DAEMON_IDLE_TTL_MS: "2000",
      },
      input,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 20_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(`persistent terminal failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  );
}

test("claw session open keeps one terminal session and conditionally restores simple currentPlan", async () => {
  const runtimeRoot = fixture("runtime");
  const projectRoot = fixture("project");
  initProject({ cwd: projectRoot, projectName: "Persistent Terminal", planning: false });

  const first = runPersistentTerminal(
    projectRoot,
    runtimeRoot,
    [
      'plan create "Terminal plan" --goal "Stay resident"',
      "plan show --simple",
      "session status",
      "session close",
      "",
    ].join("\n"),
  );

  assert.equal(first[0]?.command, "session.open");
  assert.equal("currentPlan" in first[0]!, false);
  assert.equal((first[0]?.telemetry as Record<string, unknown>).open, "cold");
  assert.equal(first[1]?.command, "plan.create");
  assert.deepEqual(first[2]?.output, {
    status: "process.active",
    goal: { text: "Stay resident" },
    tasks: [{ title: "Stay resident" }],
    rules: [],
  });
  assert.equal(first[3]?.command, "session.status");
  assert.equal(first[4]?.command, "session.close");

  const reopened = runPersistentTerminal(
    projectRoot,
    runtimeRoot,
    "session close\n",
  );

  assert.equal(reopened[0]?.command, "session.open");
  assert.deepEqual(reopened[0]?.currentPlan, {
    status: "process.active",
    goal: { text: "Stay resident" },
    tasks: [{ title: "Stay resident" }],
    rules: [],
  });
  assert.equal((reopened[0]?.telemetry as Record<string, unknown>).open, "warm");
  assert.equal(reopened[1]?.command, "session.close");

  const statePath = path.join(runtimeRoot, "daemon", "state.json");
  const deadline = Date.now() + 5000;
  while (fs.existsSync(statePath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(fs.existsSync(statePath), false);
});

test("persistent terminal implicitly targets current plan for normal plan and task commands", () => {
  const runtimeRoot = fixture("commands-runtime");
  const projectRoot = fixture("commands-project");
  initProject({ cwd: projectRoot, projectName: "Persistent Commands", planning: false });

  const output = runPersistentTerminal(
    projectRoot,
    runtimeRoot,
    [
      'plan create "Command plan" --goal "Exercise implicit targeting"',
      'task edit --id 1 --title "First command task" --status in_progress',
      "task done --id 1",
      'task add --title "Second command task" --detail "No plan id"',
      'plan edit --rule "Stay scoped"',
      "plan wait",
      "plan resume",
      'plan done --retrospective "All session commands passed"',
      "session close",
      "",
    ].join("\n"),
  );

  assert.deepEqual(
    output.slice(1, -1).map((entry) => entry.command),
    ["plan.create", "task.edit", "task.done", "task.add", "plan.edit", "plan.wait", "plan.resume", "plan.done"],
  );
  const done = output.at(-2)?.output as { planStatus?: string };
  assert.equal(done.planStatus, "end.completed");
});
