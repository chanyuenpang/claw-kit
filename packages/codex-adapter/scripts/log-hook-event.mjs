import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const eventName = process.argv[2] ?? "unknown";
const pluginRoot = path.resolve(import.meta.dirname, "..");
const primaryLogDir = path.join(pluginRoot, ".hook-lab");
const fallbackLogDir = path.join(os.homedir(), ".codex", "claw-kit-hook-debug");

const payload = await readStdinJson();
const environment = captureEnvironment(process.env);
const record = {
  timestamp: new Date().toISOString(),
  eventName,
  argv: process.argv.slice(2),
  execPath: process.execPath,
  cwd: process.cwd(),
  platform: process.platform,
  pid: process.pid,
  hostname: os.hostname(),
  pluginRoot,
  fallbackLogDir,
  environment,
  extractedFields: extractKnownFields(payload),
  stdinPayload: payload,
};

writeJsonl(path.join(primaryLogDir, "events.jsonl"), record);
writeJsonl(path.join(fallbackLogDir, "events.jsonl"), record);
writeText(path.join(fallbackLogDir, "latest.txt"), JSON.stringify(record, null, 2));
writeText(
  path.join(fallbackLogDir, "summary.log"),
  `[${record.timestamp}] ${eventName} pid=${record.pid} cwd=${record.cwd}${os.EOL}`,
  { append: true },
);

function captureEnvironment(env) {
  const keys = [
    "PLUGIN_ROOT",
    "PLUGIN_DATA",
    "CODEX_HOME",
    "CLAUDE_PLUGIN_ROOT",
    "CLAUDE_PLUGIN_DATA",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
    "PWD",
  ];

  return Object.fromEntries(
    keys
      .filter((key) => typeof env[key] === "string" && env[key].length > 0)
      .map((key) => [key, env[key]]),
  );
}

function extractKnownFields(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const keys = [
    "session_id",
    "transcript_path",
    "cwd",
    "hook_event_name",
    "model",
    "turn_id",
    "permission_mode",
    "source",
    "tool_name",
    "tool_use_id",
    "tool_input",
    "prompt",
    "agent_id",
    "agent_type",
    "agent_transcript_path",
    "stop_hook_active",
    "last_assistant_message",
    "trigger",
  ];

  return Object.fromEntries(keys.filter((key) => key in payload).map((key) => [key, payload[key]]));
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
    return { raw };
  }
}

function writeJsonl(filePath, value) {
  writeText(filePath, `${JSON.stringify(value)}\n`, { append: true });
}

function writeText(filePath, content, options = {}) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (options.append) {
      fs.appendFileSync(filePath, content, "utf8");
      return;
    }

    fs.writeFileSync(filePath, content, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    const emergencyPath = path.join(os.homedir(), ".codex", "claw-kit-hook-debug", "logger-errors.log");
    try {
      fs.mkdirSync(path.dirname(emergencyPath), { recursive: true });
      fs.appendFileSync(
        emergencyPath,
        `[${new Date().toISOString()}] failed writing ${filePath}${os.EOL}${message}${os.EOL}`,
        "utf8",
      );
    } catch {
      // Swallow final fallback errors so the hook process can still exit cleanly.
    }
  }
}
