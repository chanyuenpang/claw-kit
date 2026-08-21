import { spawnSync } from "node:child_process";

const payload = await readStdin();
const contextResult = runClawContext(payload);
if (!contextResult.ok || !contextResult.stdout.trim()) process.exit(0);

let context;
try {
  context = JSON.parse(contextResult.stdout);
} catch {
  process.exit(0);
}

const additionalContext = renderCodexSessionStart(context);
if (!additionalContext) process.exit(0);
process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
})}\n`);

function runClawContext(hookPayload) {
  const cwd = typeof hookPayload?.cwd === "string" && hookPayload.cwd.trim()
    ? hookPayload.cwd
    : process.cwd();
  const env = { ...process.env };
  // Hook input is Host-authenticated. Only use it as a fallback when the Host
  // did not already provide the canonical session identity in the environment.
  if (!env.CLAW_SESSION_ID && typeof hookPayload?.session_id === "string" && hookPayload.session_id.trim()) {
    env.CLAW_SESSION_ID = hookPayload.session_id;
  }
  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec || "cmd.exe") : "claw";
  const args = isWindows
    ? ["/d", "/s", "/c", "claw.cmd", "context", "--host", "codex"]
    : ["context", "--host", "codex"];
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true, env });
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? "" };
}

function renderCodexSessionStart(context) {
  const runtimePrompt = typeof context?.error?.prompt === "string" ? context.error.prompt.trim() : "";
  const workflow = context?.activeWorkflow;
  const version = context?.startupRecovery?.versionSync;
  const versionNote = renderVersionNote(version);
  if (workflow && typeof workflow === "object") {
    const sync = workflow.planStatus === "process.active"
      ? "\nBefore continuing, run `claw plan sync` once through the fixed Codex driver to restore focused-plan progress and reconcile the root-plan Goal."
      : "";
    return [runtimePrompt, versionNote, "Claw workflow snapshot is recovered. Treat `workflowGuidance` as the only next-step contract.", JSON.stringify(workflow), sync].filter(Boolean).join("\n\n");
  }
  const project = context?.project;
  if (!project || typeof project !== "object") return runtimePrompt || versionNote || null;
  return [
    runtimePrompt,
    `This session started inside claw project ${project.projectName || project.projectId || "project"}. Load claw-kit:using-claw-kit as the main workflow skill for this session.`,
    versionNote,
    context.searchGuidance,
  ].filter(Boolean).join("\n\n");
}

function renderVersionNote(version) {
  if (!version || typeof version !== "object" || version.cliVersionLagging !== true) return "";
  if (version.autoUpdateEnabled === true && version.updateAvailable === true && version.cliVersion && version.latestPublishedVersion) {
    return `A newer claw-kit version is available: installed CLI ${version.cliVersion}, published latest ${version.latestPublishedVersion}. Tell the user in their language that the current claw-kit installation is out of date and must be updated before they can continue using claw-kit. Ask whether they want to update now, then wait for their answer. After the user confirms, use ${version.updateSkill || "claw-kit:update"} to update the claw-kit CLI and the current host plugin surface, then continue the original task.`;
  }
  return typeof version.message === "string" ? `Startup note: ${version.message}` : "";
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  try { return JSON.parse(chunks.join("")); } catch { return {}; }
}
