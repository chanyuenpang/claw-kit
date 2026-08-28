import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Codex } from "@openai/codex-sdk";

let activePayload = {};

async function main() {
  const requestedJob = readJobArgument(process.argv.slice(2));
  if (requestedJob) return runNativeFinalizer(requestedJob);
  const payload = await readStdin();
  activePayload = payload;
  if (!payload.message && typeof payload.transcript_path === "string") payload.message = readLatestFinal(payload.transcript_path, payload.turn_id);
  registerCollector(payload);
  const capture = runClaw(["hook", "auto-doc", "--host", "codex"], payload, {
    CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
    CLAW_KNOWLEDGE_CAPTURE_RESULT: "1",
  });
  if (!capture.ok || !capture.stdout.trim()) {
    if (!capture.ok) reportFailure("capture");
    return;
  }
  let handoff;
  try { handoff = JSON.parse(capture.stdout); } catch { reportFailure("capture_protocol"); return; }
  if (!handoff?.jobPath) return;
  try { launchFinalizer(handoff.jobPath); } catch { reportFailure("launch"); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

function reportFailure(stage) {
  process.stderr.write(`${JSON.stringify({
    source: "claw-kit",
    component: "codex-knowledge-finalizer",
    stage,
    outcome: "failed-open",
  })}\n`);
}

function registerCollector(hookPayload) {
  const cwd = typeof hookPayload?.cwd === "string" && hookPayload.cwd.trim() ? hookPayload.cwd : process.cwd();
  const collectorVersion = JSON.parse(fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  )).version;
  runClaw([
    "internal-report-collector-register",
    "--project-root", cwd,
    "--collector-host", "codex",
    "--collector-version", collectorVersion,
    "--executable", process.execPath,
    "--arg", path.join(path.dirname(process.argv[1]), "report-collector.mjs"),
  ], undefined, {});
}

function readLatestFinal(transcriptPath, turnId) {
  try {
    const lines = fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const record = JSON.parse(lines[index]);
      const payload = record?.payload;
      if (record?.type !== "response_item" || payload?.type !== "message" || payload?.role !== "assistant" || payload?.phase !== "final_answer") continue;
      if (turnId && payload?.internal_chat_message_metadata_passthrough?.turn_id !== turnId) continue;
      const message = Array.isArray(payload.content) ? payload.content.filter((item) => typeof item?.text === "string").map((item) => item.text).join("\n").trim() : "";
      if (message) return message;
    }
  } catch { /* adapter failure remains fail-open */ }
  return undefined;
}

function launchFinalizer(jobPath) {
  const cwd = activePayload?.cwd || process.cwd();
  const env = {
    ...process.env,
    CLAW_KNOWLEDGE_FINALIZER: "1",
    CLAW_KNOWLEDGE_JOB: jobPath,
    CLAW_KNOWLEDGE_CWD: cwd,
    CLAW_KNOWLEDGE_NODE: process.execPath,
    CLAW_KNOWLEDGE_SCRIPT: process.argv[1],
  };
  delete env.CLAW_HOST;
  delete env.CLAW_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  delete env.CODEX_SESSION_ID;
  if (process.platform === "win32") {
    const launcher = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Start-Process -FilePath $env:CLAW_KNOWLEDGE_NODE -ArgumentList @($env:CLAW_KNOWLEDGE_SCRIPT,'--run-job',$env:CLAW_KNOWLEDGE_JOB) -WorkingDirectory $env:CLAW_KNOWLEDGE_CWD -WindowStyle Hidden",
    ], {
      cwd,
      stdio: "ignore",
      windowsHide: true,
      env,
    });
    if (launcher.error || (launcher.status ?? 0) !== 0) {
      throw launcher.error ?? new Error(`Knowledge finalizer launcher exited with ${launcher.status ?? 1}.`);
    }
    return;
  }
  const child = spawn(process.execPath, [process.argv[1], "--run-job", jobPath], {
    cwd,
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
}

export async function runNativeFinalizer(jobPath, dependencies = {}) {
  const runClawCommand = dependencies.runClawCommand ?? runClaw;
  const CodexClass = dependencies.CodexClass ?? Codex;
  let claim;
  try {
    claim = readClawJson(runClawCommand(["knowledge", "claim", "--job", jobPath], undefined, {
      CLAW_KNOWLEDGE_FINALIZER: "1",
    }), "Knowledge claim is unavailable.");
    if (claim.claimed !== true || typeof claim.claimToken !== "string") return;
    const deadlineMs = typeof claim.expiresAt === "string" ? Date.parse(claim.expiresAt) : Number.NaN;
    if (Number.isFinite(deadlineMs) && deadlineMs <= Date.now()) {
      throw new Error("Knowledge finalization expired before the writer could start.");
    }

    const handoff = readClawJson(runClawCommand(["internal-knowledge-dispatch", "--job", jobPath], undefined, {
      CLAW_KNOWLEDGE_FINALIZER: "1",
    }), "Knowledge dispatch is unavailable.");
    if (typeof handoff?.dispatch?.prompt !== "string" || typeof handoff?.projectRoot !== "string") {
      throw new Error("Knowledge dispatch protocol is invalid.");
    }
    const writer = handoff.writer ?? {};
    const env = { ...process.env, CLAW_KNOWLEDGE_FINALIZER: "1" };
    delete env.CLAW_HOST;
    delete env.CLAW_SESSION_ID;
    delete env.CODEX_THREAD_ID;
    delete env.CODEX_SESSION_ID;
    const codex = new CodexClass({
      env,
      ...(process.env.CLAW_CODEX_PATH_OVERRIDE ? { codexPathOverride: process.env.CLAW_CODEX_PATH_OVERRIDE } : {}),
    });
    const thread = codex.startThread({
      workingDirectory: handoff.projectRoot,
      sandboxMode: process.platform === "win32" ? "danger-full-access" : "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      ...(writer.model ? { model: writer.model } : {}),
      ...(writer.reasoningEffort ? { modelReasoningEffort: writer.reasoningEffort } : {}),
    });
    const turn = await runBeforeDeadline(thread.run(handoff.dispatch.prompt), deadlineMs);
    if (!thread.id) throw new Error("Knowledge writer returned no host session id.");
    readClawJson(runClawCommand(["knowledge", "verify-session", "--session-id", thread.id], undefined, {
      CLAW_KNOWLEDGE_FINALIZER: "1",
    }), "Knowledge writer did not complete its required session workflow.");
    assertClawSuccess(runClawCommand([
      "knowledge", "done", "--job", jobPath, "--claim-token", claim.claimToken,
      "--status", "succeeded", "--result", String(turn?.finalResponse ?? ""),
    ], undefined, { CLAW_KNOWLEDGE_FINALIZER: "1" }), "Knowledge completion acknowledgement failed.");
  } catch (error) {
    if (typeof claim?.claimToken === "string") {
      runClawCommand([
        "knowledge", "done", "--job", jobPath, "--claim-token", claim.claimToken,
        "--status", "failed", "--error", error instanceof Error ? error.message : String(error),
      ], undefined, { CLAW_KNOWLEDGE_FINALIZER: "1" });
    }
    throw error;
  }
}

async function runBeforeDeadline(run, deadlineMs) {
  if (!Number.isFinite(deadlineMs)) return run;
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) throw new Error("Knowledge finalization expired before the writer could start.");
  let timer;
  try {
    return await Promise.race([
      run,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Knowledge finalization expired while the writer was running.")), remainingMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readClawJson(result, message) {
  if (!result.ok || !result.stdout.trim()) throw new Error(`${message} ${result.stderr.trim()}`.trim());
  try { return JSON.parse(result.stdout); } catch { throw new Error(message); }
}

function assertClawSuccess(result, message) {
  if (!result.ok) throw new Error(`${message} ${result.stderr.trim()}`.trim());
}

function readJobArgument(args) {
  return args[0] === "--run-job" && typeof args[1] === "string" && args[1].trim() ? args[1] : null;
}

function runClaw(args, input, extraEnv) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec || "cmd.exe") : "claw";
  const commandArgs = isWindows ? ["/d", "/s", "/c", "claw.cmd", ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: activePayload?.cwd || process.cwd(),
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
  });
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  try { return JSON.parse(chunks.join("")); } catch { return {}; }
}
