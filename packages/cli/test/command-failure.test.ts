import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ClawError, initProject, withExecutionFailure } from "@veewo/claw-core";
import { serializeCommandFailure } from "../dist/command-failure.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";

test("one-shot and daemon serialize authoritative rejection identically", () => {
  const error = withExecutionFailure(new ClawError("TASK_NOT_FOUND", "session connection task missing"),
    { phase: "prepare", outcome: "known", effect: "none" });
  const expected = { code: "TASK_NOT_FOUND", message: error.message, retryable: false,
    phase: "prepare", outcome: "known", effect: "none" };
  assert.deepEqual(serializeCommandFailure(error, "unknown"), expected);
  assert.deepEqual(serializeCommandFailure(error, "known"), expected);
  assert.equal(serializeCommandFailure(new Error("no response"), "unknown").outcome, "unknown");
});

test("busy errors after a write cannot authorize replay", () => {
  const error = new ClawError("PLAN_TRANSITION_CONFLICT", "busy", { code: "SESSION_BUSY" },
    { phase: "commit", outcome: "known", effect: "partial" });
  assert.equal(serializeCommandFailure(error, "known").retryable, false);
});

test("nested rejection cannot erase a previously committed outer mutation", () => {
  const nested = withExecutionFailure(new ClawError("PLAN_NOT_FOUND", "post-commit lookup failed"),
    { phase: "prepare", outcome: "known", effect: "none" });
  const outer = withExecutionFailure(nested, { phase: "post-commit", outcome: "known", effect: "committed" });
  assert.equal(serializeCommandFailure(outer, "unknown").effect, "committed");
});

test("real one-shot parent rejection remains known and leaves the parent unchanged", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-error-phase-"));
  initProject({ cwd, projectName: "Phase", planning: false });
  const runtime = path.join(cwd, "daemon-runtime");
  const identity = { agentSessionId: path.basename(cwd), workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } };
  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtime));
  const root = await executor.execute(identity, { operation: "plan.create", input: {
    taskName: "real-parent", goalText: "Do work", knowledgeCapture: false,
  } });
  const planPath = (root.output as { planPath: string }).planPath;
  const before = fs.readFileSync(planPath, "utf8");
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/bin.js", import.meta.url)), "internal-command"], {
    cwd, env: { ...process.env, CLAW_SESSION_ID: identity.agentSessionId, CLAW_SESSION_DAEMON_RUNTIME_DIR: runtime },
    input: JSON.stringify({ operation: "subplan.create", input: { parentTaskName: "f".repeat(64) } }) + "\n",
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 1, result.stderr);
  const failure = JSON.parse(result.stdout).error;
  assert.equal(failure.code, "PLAN_FOCUS_CHANGED");
  assert.equal(failure.phase, "prepare");
  assert.equal(failure.outcome, "known");
  assert.equal(failure.effect, "none");
  assert.equal(fs.readFileSync(planPath, "utf8"), before);
});
