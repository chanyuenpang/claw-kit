import { spawn, spawnSync } from "node:child_process";

const payload = await readStdin();
const capture = runClaw(["hook", "auto-doc", "--host", "codex"], payload, {
  CLAW_KNOWLEDGE_FINALIZER_DISABLE_LAUNCH: "1",
  CLAW_KNOWLEDGE_CAPTURE_RESULT: "1",
});
if (!capture.ok) {
  reportFailure("capture");
  process.exit(0);
}
if (!capture.stdout.trim()) process.exit(0);

let handoff;
try {
  handoff = JSON.parse(capture.stdout);
} catch {
  reportFailure("capture_protocol");
  process.exit(0);
}
if (!handoff?.jobPath) process.exit(0);

try {
  launchFinalizer(handoff.jobPath);
} catch {
  reportFailure("launch");
}

function reportFailure(stage) {
  process.stderr.write(`${JSON.stringify({
    source: "claw-kit",
    component: "codex-knowledge-finalizer",
    stage,
    outcome: "failed-open",
  })}\n`);
}

function launchFinalizer(jobPath) {
  const cwd = payload?.cwd || process.cwd();
  const env = {
    ...process.env,
    CLAW_KNOWLEDGE_FINALIZER: "1",
    CLAW_KNOWLEDGE_JOB: jobPath,
    CLAW_KNOWLEDGE_CWD: cwd,
  };
  delete env.CLAW_HOST;
  delete env.CLAW_SESSION_ID;
  delete env.CODEX_THREAD_ID;
  delete env.CODEX_SESSION_ID;
  if (process.platform === "win32") {
    const launcher = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Start-Process -FilePath 'claw.cmd' -ArgumentList @('internal-knowledge-finalize','--job',$env:CLAW_KNOWLEDGE_JOB) -WorkingDirectory $env:CLAW_KNOWLEDGE_CWD -WindowStyle Hidden",
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
  const child = spawn("claw", ["internal-knowledge-finalize", "--job", jobPath], {
    cwd,
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
}

function runClaw(args, input, extraEnv) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec || "cmd.exe") : "claw";
  const commandArgs = isWindows ? ["/d", "/s", "/c", "claw.cmd", ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: payload?.cwd || process.cwd(),
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
  });
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? "" };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  try { return JSON.parse(chunks.join("")); } catch { return {}; }
}
