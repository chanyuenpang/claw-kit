import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const payload = await readStdinJson();
const sessionCwd = resolveSessionCwd(payload);
const logPath = resolveLogPath();

if (!sessionCwd) {
  writeDebugLog({
    timestamp: new Date().toISOString(),
    eventName: "SessionStart",
    cwd: null,
    matchedClawProject: false,
    contextCommandRan: false,
    contextCommandOk: false,
    emittedAdditionalContext: false,
    reason: "no session cwd",
  });
  process.exit(0);
}

if (!containsClawDir(sessionCwd)) {
  writeDebugLog({
    timestamp: new Date().toISOString(),
    eventName: "SessionStart",
    cwd: sessionCwd,
    matchedClawProject: false,
    contextCommandRan: false,
    contextCommandOk: false,
    emittedAdditionalContext: false,
    reason: "cwd is not inside a .claw project",
  });
  process.exit(0);
}

const contextResult = spawnSync("claw", ["context"], {
  cwd: sessionCwd,
  encoding: "utf-8",
  shell: process.platform === "win32",
  windowsHide: true,
});

if (contextResult.status !== 0) {
  writeDebugLog({
    timestamp: new Date().toISOString(),
    eventName: "SessionStart",
    cwd: sessionCwd,
    matchedClawProject: true,
    contextCommandRan: true,
    contextCommandOk: false,
    emittedAdditionalContext: false,
    reason: "claw context failed",
    contextExitCode: contextResult.status,
    stderr: contextResult.stderr ?? "",
  });
  process.exit(0);
}

let context;
try {
  context = JSON.parse(contextResult.stdout);
} catch {
  writeDebugLog({
    timestamp: new Date().toISOString(),
    eventName: "SessionStart",
    cwd: sessionCwd,
    matchedClawProject: true,
    contextCommandRan: true,
    contextCommandOk: false,
    emittedAdditionalContext: false,
    reason: "failed to parse claw context stdout",
    stdout: contextResult.stdout ?? "",
  });
  process.exit(0);
}

const additionalContext = buildAdditionalContext(context);
if (!additionalContext) {
  writeDebugLog({
    timestamp: new Date().toISOString(),
    eventName: "SessionStart",
    cwd: sessionCwd,
    matchedClawProject: true,
    contextCommandRan: true,
    contextCommandOk: true,
    emittedAdditionalContext: false,
    reason: "no additionalContext generated",
  });
  process.exit(0);
}

writeDebugLog({
  timestamp: new Date().toISOString(),
  eventName: "SessionStart",
  cwd: sessionCwd,
  matchedClawProject: true,
  contextCommandRan: true,
  contextCommandOk: true,
  emittedAdditionalContext: true,
  projectRoot: context?.project?.projectRoot ?? null,
  projectId: context?.project?.projectId ?? null,
  bootstrap: context?.bootstrap ?? null,
});

process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  })}\n`,
);

function buildAdditionalContext(context) {
  const project = context?.project;
  if (!project || typeof project !== "object") {
    return null;
  }

  const projectName = typeof project.projectName === "string" && project.projectName.trim()
    ? project.projectName.trim()
    : typeof project.projectId === "string" && project.projectId.trim()
      ? project.projectId.trim()
      : path.basename(String(project.projectRoot ?? sessionCwd ?? "project"));
  const projectRoot = typeof project.projectRoot === "string" ? project.projectRoot : sessionCwd;
  const projectId = typeof project.projectId === "string" ? project.projectId : projectName;
  const clawDir = typeof project.clawDir === "string" ? project.clawDir : path.join(projectRoot, ".claw");
  const protocolOk = context?.protocolCheck?.ok === true ? "ok" : "needs attention";

  return [
    `This session started inside a .claw project: ${projectName} (${projectId}).`,
    `Project root: ${projectRoot}`,
    `.claw directory: ${clawDir}`,
    `Project protocol check: ${protocolOk}.`,
    `For this session, use [@claw-kit](plugin://claw-kit@claw-kit-local) to drive planning, search, truth, and ADR workflows.`,
    "Start with the Claw Kit main workflow and treat returned claw workflowGuidance fields as the required next-step contract instead of inventing a parallel process.",
  ].join("\n");
}

function resolveSessionCwd(payload) {
  if (payload && typeof payload === "object" && typeof payload.cwd === "string" && payload.cwd.trim()) {
    return payload.cwd;
  }
  return process.cwd();
}

function resolveLogPath() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
  return path.join(home, ".codex", "claw-kit-session-start.jsonl");
}

function writeDebugLog(record) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
  } catch {
    // Keep hook execution non-fatal even if local logging fails.
  }
}

function containsClawDir(cwd) {
  try {
    let current = path.resolve(cwd);
    while (true) {
      if (fs.existsSync(path.join(current, ".claw"))) {
        return true;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return false;
      }
      current = parent;
    }
  } catch {
    return false;
  }
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  const raw = chunks.join("").trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
