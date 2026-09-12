// Hostless standard-flow probe (D3): drive the full claw workflow with NO host
// flag and NO host env, through the published CLI, verifying:
//   1. init/context/plan/task work without host (current gate behavior);
//   2. root plan done returns a knowledgeDispatch usable by the same agent;
//   3. a session-scope knowledge-writer plan can bind the same session key
//      right after the root plan reached terminal state;
//   4. sweep discovers retryable jobs (recovery path).
// Usage: node scripts/probe-hostless-e2e.mjs [--keep] [--claw <bin>]
//
// This is a mechanism probe, not a test suite: it records observed behavior so
// the standard-adapter implementation can rely on verified facts.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KEEP = process.argv.includes("--keep");
const clawBinIdx = process.argv.indexOf("--claw");
const CLAW_BIN = clawBinIdx >= 0 ? process.argv[clawBinIdx + 1] : "claw";
const WORKDIR = process.env.PROBE_WORKDIR ?? "D:\\Users\\chany\\Documents\\claw-kit\\.probe-hostless";
const SESSION_ID = `probe-hostless-${Date.now()}`;

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail: detail.slice(0, 400) });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? `  :: ${String(detail).slice(0, 300)}` : ""}\n`);
}

function runClaw(args, extraEnv = {}, input) {
  const env = {
    ...process.env,
    CLAW_SESSION_ID: SESSION_ID,
    // Deliberately NO CLAW_HOST, no --host: this is the hostless probe.
    ...extraEnv,
  };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  const res = spawnSync(process.execPath, [CLAW_BIN, ...args], { cwd: WORKDIR, env, encoding: "utf-8", windowsHide: true, ...(input !== undefined ? { input } : {}) });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    record(label, false, `non-JSON output: ${text.slice(0, 200)}`);
    return null;
  }
}

// --- setup ---
fs.rmSync(WORKDIR, { recursive: true, force: true });
fs.mkdirSync(WORKDIR, { recursive: true });
record("workdir ready", fs.existsSync(WORKDIR), WORKDIR);

// 1. init is hostless by contract
const init = runClaw(["init", "--name", "Hostless Probe", "--planning", "false"]);
record("init (no host)", init.status === 0, init.stderr.slice(-300));

// 2. context without host — observe gate behavior
const ctx = runClaw(["context"]);
record("context (no host) allowed", ctx.status === 0, ctx.status === 0 ? ctx.stdout.slice(0, 200) : ctx.stderr.slice(0, 300));

// 3. plan create without host — observe gate behavior
const planCreate = runClaw(["plan", "create", "--title", "hostless-probe", "--goal", "Verify the hostless standard flow end to end"]);
record("plan create (no host) allowed", planCreate.status === 0, planCreate.status === 0 ? planCreate.stdout.slice(0, 200) : planCreate.stderr.slice(0, 300));

if (planCreate.status === 0) {
  // 4. task list / done
  const taskDone = runClaw(["task", "done", "--id", "1"]);
  record("task done (no host)", taskDone.status === 0, taskDone.status === 0 ? taskDone.stdout.slice(0, 160) : taskDone.stderr.slice(0, 300));

  // 5. plan done — background policy: the dispatch is NOT on this result; it
  // comes from the inline capture -> internal-knowledge-dispatch chain.
  const planDone = runClaw(["plan", "done", "--retrospective", "Hostless probe complete: mechanism verified."]);
  const doneBody = planDone.status === 0 ? parseJson(planDone.stdout, "plan done json") : null;
  record("plan done (no host)", planDone.status === 0, planDone.status === 0 ? planDone.stdout.slice(0, 400) : planDone.stderr.slice(0, 300));
  if (doneBody) {
    record("plan done returns no inline dispatch (background policy)", doneBody.knowledgeDispatch === undefined, JSON.stringify(doneBody.knowledgeDispatch ?? null).slice(0, 120));
  }

  // 5b. inline capture creates the background job and points at dispatch
  const capture = runClaw(["internal-knowledge-capture"], {}, JSON.stringify({
    cwd: WORKDIR,
    session_id: SESSION_ID,
    turn_id: "turn-probe-final",
    message: "Hostless probe final answer: mechanism verified end to end.",
    task_conclusions: [],
  }));
  const captureBody = capture.status === 0 ? parseJson(capture.stdout, "capture json") : null;
  record("internal-knowledge-capture creates job", captureBody?.captured === true, capture.stdout.slice(0, 300) || capture.stderr.slice(0, 300));
  if (captureBody?.nextStep?.jobPath) {
    const dispatch = runClaw(["internal-knowledge-dispatch", "--job", captureBody.nextStep.jobPath]);
    const dispatchBody = dispatch.status === 0 ? parseJson(dispatch.stdout, "dispatch json") : null;
    record("internal-knowledge-dispatch returns writer prompt",
      dispatchBody?.dispatch?.policy === "background" && typeof dispatchBody?.dispatch?.prompt === "string",
      dispatch.stdout.slice(0, 300));
  }

  // 6. can a session-scope writer plan bind the same session key now?
  const writerCreate = runClaw([
    "plan", "create", "--scope", "session", "--title", "knowledge-writer",
    "--template", "default",
  ]);
  record("session-scope writer plan after root terminal", writerCreate.status === 0,
    writerCreate.status === 0 ? writerCreate.stdout.slice(0, 260) : writerCreate.stderr.slice(0, 400));

  // 7. knowledge list (hostless command) — observe queued jobs
  const kList = runClaw(["knowledge", "list", "--project-root", WORKDIR]);
  record("knowledge list", kList.status === 0, kList.status === 0 ? kList.stdout.slice(0, 300) : kList.stderr.slice(0, 200));
}

// 8. sweep (recovery path)
const sweep = runClaw(["internal-knowledge-sweep", "--cwd", WORKDIR]);
record("internal-knowledge-sweep", sweep.status === 0, sweep.status === 0 ? sweep.stdout.slice(0, 300) : sweep.stderr.slice(0, 300));

// --- teardown / summary ---
const failures = results.filter((r) => !r.ok);
process.stdout.write(`\n=== ${results.length - failures.length}/${results.length} steps passed ===\n`);
if (KEEP) {
  process.stdout.write(`workdir kept: ${WORKDIR}\n`);
} else {
  fs.rmSync(WORKDIR, { recursive: true, force: true });
}
process.exitCode = failures.some((f) => /no host\) allowed/.test(f.step)) ? 1 : 0;
