import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { buildMemoryIndex, resolveProjectMemoryEmbeddingConfig, ClawError, DEFAULT_MAX_TASKS_TO_KEEP, enforceTaskRetention, resolveProjectContext, tryWithFileLock, writeJsonFileAtomic, serializeFailure, type ProjectConfig } from "@veewo/claw-core";
import { withoutInvocationHost } from "./invocation-host.js";

export type CompletionRefreshInput = {
  cwd: string;
  taskName: string;
  includeTaskRetention?: boolean;
  includeGitNexus?: boolean;
  statusLabel?: string;
};
type CompletionRefreshOperation = "task.retention" | "memory.reindex.project" | "gitnexus.refresh";
export type CompletionRefreshResult = {
  taskRetention: ReturnType<typeof enforceTaskRetention>;
  asyncRefresh: {
    queued: boolean;
    startedAt: string;
    statusFile: string;
    operations: CompletionRefreshOperation[];
    error?: ReturnType<typeof serializeFailure>;
  };
};
type GitNexusRefreshResult = {
  enabled: true; command: string; exitCode: number; stdout: string; stderr: string;
} | { enabled: false; reason: string };
export type CompletionRefreshAttempt = CompletionRefreshInput & {
  statusFile: string;
  operations: CompletionRefreshOperation[];
};

/** One current opportunity, not a durable intent. Logs are never read as work. */
export function queueCompletionRefresh(input: CompletionRefreshInput): CompletionRefreshResult {
  const startedAt = new Date().toISOString();
  const taskRetention: CompletionRefreshResult["taskRetention"] = {
    enabled: input.includeTaskRetention ?? true, maxTasksToKeep: DEFAULT_MAX_TASKS_TO_KEEP,
    archivedTasks: [], prunedArchivedTasks: [], failures: [],
  };
  const asyncRefresh: CompletionRefreshResult["asyncRefresh"] = {
    queued: false, startedAt, statusFile: "", operations: [],
  };
  try {
    const project = resolveProjectContext(input.cwd);
    taskRetention.maxTasksToKeep = project.projectConfig?.maxTasksToKeep ?? DEFAULT_MAX_TASKS_TO_KEEP;
    if (taskRetention.enabled) asyncRefresh.operations.push("task.retention");
    if (resolveProjectMemoryEmbeddingConfig(project)) asyncRefresh.operations.push("memory.reindex.project");
    if (project.projectConfig?.gitnexus === true && input.includeGitNexus !== false) asyncRefresh.operations.push("gitnexus.refresh");
    const label = (input.statusLabel ?? input.taskName).replace(/[^a-zA-Z0-9._-]+/g, "-");
    asyncRefresh.statusFile = path.join(project.clawDir, "logs", "completion-refresh",
      startedAt.replace(/[:.]/g, "-") + "-" + label + "-" + randomUUID() + ".json");
    const attempt = { ...input, cwd: project.projectRoot, statusFile: asyncRefresh.statusFile, operations: asyncRefresh.operations };
    writeAttemptStatus(attempt, { ok: true, queued: true, startedAt });
    launchCompletionRefreshWorker(attempt, startedAt);
    asyncRefresh.queued = true;
  } catch (error) {
    asyncRefresh.error = refreshError(error);
    process.stderr.write("Completion refresh skipped: " + JSON.stringify(asyncRefresh.error) + "\n");
  }
  return { taskRetention, asyncRefresh };
}

function refreshError(error: unknown): ReturnType<typeof serializeFailure> {
  return serializeFailure(error, { fallbackCode: "COMPLETION_REFRESH_FAILED", origin: "cli", operation: "completion.refresh" });
}

/** Diagnostic output is optional and cannot authorize or prevent maintenance. */
function writeAttemptStatus(input: CompletionRefreshAttempt, status: Record<string, unknown>): void {
  try {
    writeJsonFileAtomic(input.statusFile, { cwd: input.cwd, taskName: input.taskName, operations: input.operations, ...status });
  } catch (error) {
    process.stderr.write("Completion refresh diagnostic unavailable: " + refreshError(error).message + "\n");
  }
}

function quoteWindowsArgument(value: string): string {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1") + '"';
}

function launchCompletionRefreshWorker(input: CompletionRefreshAttempt, startedAt: string): void {
  const args = [fileURLToPath(new URL("./completion-refresh-entry.js", import.meta.url)),
    Buffer.from(JSON.stringify(input)).toString("base64")];
  const windows = process.platform === "win32";
  const env = withoutInvocationHost();
  // Windows needs an external launcher to preserve captured foreground stdout.
  // Reference startup only, with a bound; never wait for maintenance itself.
  const child = windows
    ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Start-Process -FilePath $env:CLAW_COMPLETION_NODE -ArgumentList $env:CLAW_COMPLETION_ARGS -WorkingDirectory $env:CLAW_COMPLETION_CWD -WindowStyle Hidden -ErrorAction Stop; [Console]::Out.WriteLine('CLAW_COMPLETION_STARTED')"],
      { cwd: input.cwd, env: { ...env, CLAW_COMPLETION_NODE: process.execPath,
        CLAW_COMPLETION_ARGS: args.map(quoteWindowsArgument).join(" "), CLAW_COMPLETION_CWD: input.cwd },
        stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
    : spawn(process.execPath, args, { cwd: input.cwd, env, detached: true, stdio: "ignore" });
  let startup: ReturnType<typeof setTimeout> | undefined;
  let started = !windows;
  const failed = (error: unknown) => {
    clearTimeout(startup);
    writeAttemptStatus(input, { ok: false, startedAt, finishedAt: new Date().toISOString(), error: refreshError(error) });
  };
  child.once("error", failed);
  if (!windows) { child.unref(); return; }
  startup = setTimeout(() => {
    child.stdout?.destroy(); child.kill();
    failed(new Error("Completion refresh launcher timed out; this attempt will not be retried."));
  }, 5_000);
  let output = "";
  child.stdout?.on("data", chunk => {
    output += String(chunk);
    if (!output.includes("CLAW_COMPLETION_STARTED")) return;
    started = true;
    clearTimeout(startup);
    child.stdout?.destroy(); child.unref();
  });
  child.once("exit", () => {
    clearTimeout(startup);
    if (!started) failed(new Error("Completion refresh launcher exited before acknowledging startup."));
  });
}

/** Run a fresh snapshot once. Busy work is skipped, not joined or retried. */
export function runCompletionRefresh(input: CompletionRefreshAttempt): void {
  const startedAt = new Date().toISOString();
  const finish = (status: Record<string, unknown>) => writeAttemptStatus(input, {
    startedAt, finishedAt: new Date().toISOString(), ...status,
  });
  try {
    const project = resolveProjectContext(input.cwd);
    // Mixed old/new refresh writers are unsafe. An old occupancy directory only
    // skips this optional attempt; it never blocks a business command or gets deleted.
    if (fs.existsSync(path.join(project.clawDir, "logs", "completion-refresh", "inflight.lock"))) {
      finish({ ok: true, skipped: "legacy_refresh" }); return;
    }
    const lock = path.join(project.clawDir, "runtime", "completion-refresh", "worker");
    const attempt = tryWithFileLock(lock, () => {
      writeAttemptStatus(input, { ok: true, running: true, startedAt });
      const result: Record<string, unknown> = { gitnexus: { enabled: false,
        reason: project.projectConfig?.gitnexus ? "gitnexus refresh was not requested for this attempt" : "gitnexus is not enabled in .claw/project.json" } };
      const failures: Array<{ operation: CompletionRefreshOperation; code: string; message: string }> = [];
      for (const operation of input.operations) {
        try {
          switch (operation) {
            case "task.retention": result.taskRetention = enforceTaskRetention(project, input.taskName); break;
            case "memory.reindex.project": result.memory = { project: buildMemoryIndex({ cwd: input.cwd, scope: "project" }) }; break;
            case "gitnexus.refresh": result.gitnexus = refreshGitNexusIfEnabled(input.cwd, resolveProjectContext(input.cwd).projectConfig); break;
          }
        } catch (error) { failures.push({ ...refreshError(error), operation }); }
      }
      finish({ ...result, ok: failures.length === 0,
        ...(failures.length ? { failures, error: failures[0] } : {}) });
    });
    if (!attempt.acquired) finish({ ok: true, skipped: "busy" });
  } catch (error) { finish({ ok: false, error: refreshError(error) }); }
}

function refreshGitNexusIfEnabled(
  cwd: string,
  projectConfig: ProjectConfig | null,
): GitNexusRefreshResult {
  const enabled = projectConfig?.gitnexus === true;

  if (!enabled) {
    return {
      enabled: false,
      reason: "gitnexus is not enabled in .claw/project.json",
    };
  }

  ensureGitNexusInstalled(cwd);
  seedGitNexusEmbeddingCache(cwd, projectConfig);
  return runGitNexusAnalyze(cwd, {
    embeddings: !readGitNexusEmbeddingsEnabled(cwd),
  });
}

function shouldFallbackToPlainAnalyze(result: {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
}): boolean {
  if (result.status === 0) {
    return false;
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return output.includes("--no-ai-context");
}

function isWindowsAccessViolation(result: { status: number | null }): boolean {
  return process.platform === "win32"
    && result.status !== null
    && (result.status >>> 0) === 0xc0000005;
}

function ensureGitNexusInstalled(cwd: string): void {
  if (isGitNexusAvailable(cwd)) {
    return;
  }

  const install = runCommand("npm", ["install", "-g", "@veewo/gitnexus"], cwd);
  if (commandFailed(install)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "GitNexus is enabled but automatic installation failed.", {
      cwd,
      command: "npm install -g @veewo/gitnexus",
      exitCode: install.status ?? 0,
      stdout: install.stdout ?? "",
      stderr: install.stderr ?? "",
      ...(install.error ? { message: install.error.message } : {}),
    });
  }

  const setup = runCommand("gitnexus", ["setup", "--cli-spec", "@veewo/gitnexus"], cwd);
  if (commandFailed(setup)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "GitNexus installed, but automatic setup failed.", {
      cwd,
      command: "gitnexus setup --cli-spec @veewo/gitnexus",
      exitCode: setup.status ?? 0,
      stdout: setup.stdout ?? "",
      stderr: setup.stderr ?? "",
      ...(setup.error ? { message: setup.error.message } : {}),
    });
  }

  if (!isGitNexusAvailable(cwd)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "GitNexus installation completed, but the CLI is still unavailable on PATH.", {
      cwd,
      command: "gitnexus",
    });
  }
}

function readGitNexusEmbeddingsEnabled(cwd: string): boolean {
  const metaPath = path.join(cwd, ".gitnexus", "meta.json");
  if (!fs.existsSync(metaPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
      analyzeOptions?: { embeddings?: boolean };
    };
    return parsed.analyzeOptions?.embeddings === true;
  } catch {
    return false;
  }
}

function runGitNexusAnalyze(
  cwd: string,
  options: {
    embeddings?: boolean;
  } = {},
): GitNexusRefreshResult {
  let primaryArgs = ["analyze", ...(options.embeddings ? ["--embeddings"] : []), "--no-ai-context"];
  let primary = runCommandWithLockRetry("gitnexus", primaryArgs, cwd);
  if (isWindowsAccessViolation(primary)) {
    primaryArgs = ["analyze", "--force", ...(options.embeddings ? ["--embeddings"] : []), "--no-ai-context"];
    primary = runCommandWithLockRetry("gitnexus", primaryArgs, cwd);
  }
  if (primary.error) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze failed.", {
      cwd,
      command: `gitnexus ${primaryArgs.join(" ")}`,
      message: primary.error.message,
    });
  }

  if (!commandFailed(primary)) {
    return {
      enabled: true,
      command: `gitnexus ${primaryArgs.join(" ")}`,
      exitCode: primary.status ?? 0,
      stdout: primary.stdout ?? "",
      stderr: primary.stderr ?? "",
    };
  }

  if (!shouldFallbackToPlainAnalyze(primary)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze failed.", {
      cwd,
      command: `gitnexus ${primaryArgs.join(" ")}`,
      exitCode: primary.status ?? 0,
      stdout: primary.stdout ?? "",
      stderr: primary.stderr ?? "",
    });
  }

  const fallbackArgs = [
    "analyze",
    ...(primaryArgs.includes("--force") ? ["--force"] : []),
    ...(options.embeddings ? ["--embeddings"] : []),
  ];
  const fallback = runCommandWithLockRetry("gitnexus", fallbackArgs, cwd);
  if (commandFailed(fallback)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "gitnexus analyze fallback failed.", {
      cwd,
      command: `gitnexus ${fallbackArgs.join(" ")}`,
      exitCode: fallback.status ?? 0,
      stdout: fallback.stdout ?? "",
      stderr: fallback.stderr ?? "",
      ...(fallback.error ? { message: fallback.error.message } : {}),
    });
  }
  return {
    enabled: true,
    command: `gitnexus ${fallbackArgs.join(" ")}`,
    exitCode: fallback.status ?? 0,
    stdout: fallback.stdout ?? "",
    stderr: fallback.stderr ?? "",
  };
}

function seedGitNexusEmbeddingCache(cwd: string, projectConfig: ProjectConfig | null): void {
  const packageRoot = resolveGitNexusPackageRoot(cwd);
  if (!packageRoot) {
    return;
  }

  const modelId = process.env.CLAW_TEST_GITNEXUS_EMBEDDING_MODEL_ID?.trim() || "Snowflake/snowflake-arctic-embed-xs";
  const sourceRoot = resolveClawEmbeddingCacheRoot(cwd, projectConfig);
  const sourceModelDir = path.join(sourceRoot, ...modelId.split("/"));
  if (!fs.existsSync(sourceModelDir)) {
    return;
  }

  const targetModelDir = path.join(
    packageRoot,
    "node_modules",
    "@huggingface",
    "transformers",
    ".cache",
    ...modelId.split("/"),
  );

  if (fs.existsSync(targetModelDir)) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(targetModelDir), { recursive: true });
    fs.cpSync(sourceModelDir, targetModelDir, { recursive: true });
  } catch {
    // Best-effort cache seeding only.
  }
}

function resolveClawEmbeddingCacheRoot(cwd: string, projectConfig: ProjectConfig | null): string {
  const configured = projectConfig?.memory?.embedding?.local?.modelCacheDir?.trim();
  if (configured) {
    return path.resolve(cwd, configured);
  }
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (process.platform === "win32") {
    return localAppData
      ? path.join(localAppData, "claw", "models")
      : path.join(os.homedir(), "AppData", "Local", "claw", "models");
  }
  return path.join(os.homedir(), ".cache", "claw", "models");
}

function resolveGitNexusPackageRoot(cwd: string): string | null {
  const overridden = process.env.CLAW_TEST_GITNEXUS_PACKAGE_ROOT?.trim();
  if (overridden) {
    return path.resolve(overridden);
  }

  const commandPath = resolveCommandOnPath("gitnexus");
  if (commandPath) {
    const siblingPackageRoot = path.join(path.dirname(commandPath), "node_modules", "@veewo", "gitnexus");
    if (fs.existsSync(siblingPackageRoot)) {
      return siblingPackageRoot;
    }
  }

  const npmRoot = runCommand("npm", ["root", "-g"], cwd);
  if (commandFailed(npmRoot)) {
    return null;
  }
  const rootPath = (npmRoot.stdout ?? "").trim();
  if (!rootPath) {
    return null;
  }
  const packageRoot = path.join(rootPath, "@veewo", "gitnexus");
  return fs.existsSync(packageRoot) ? packageRoot : null;
}

function isGitNexusAvailable(cwd: string): boolean {
  if (!resolveCommandOnPath("gitnexus")) {
    return false;
  }
  const result = runCommand("gitnexus", ["--help"], cwd);
  if (result.error) {
    return false;
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/not recognized as an internal or external command/i.test(output)) {
    return false;
  }
  if (/command not found/i.test(output)) {
    return false;
  }
  return true;
}

function resolveCommandOnPath(command: string): string | null {
  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [".COM", ".EXE", ".BAT", ".CMD"])
    : [""];

  for (const entry of pathEntries) {
    if (process.platform === "win32") {
      for (const extension of extensions) {
        const candidate = path.join(entry, `${command}${extension.toLowerCase()}`);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
        const upperCandidate = path.join(entry, `${command}${extension.toUpperCase()}`);
        if (fs.existsSync(upperCandidate)) {
          return upperCandidate;
        }
      }
      const bareCandidate = path.join(entry, command);
      if (fs.existsSync(bareCandidate)) {
        return bareCandidate;
      }
      continue;
    }

    const candidate = path.join(entry, command);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function runCommand(command: string, args: string[], cwd: string) {
  const resolvedCommand = resolveCommandOnPath(command) ?? command;
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolvedCommand)) {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", resolvedCommand, ...args], {
      cwd,
      encoding: "utf-8",
      windowsHide: true,
    });
  }
  return spawnSync(resolvedCommand, args, {
    cwd,
    encoding: "utf-8",
    windowsHide: true,
  });
}

function runCommandWithLockRetry(command: string, args: string[], cwd: string) {
  let result = runCommand(command, args, cwd);
  for (const delayMs of [100, 250]) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (!commandFailed(result) || !/(?:database|index|graph)?.{0,20}(?:busy|locked)|(?:busy|locked).{0,20}(?:database|index|graph)?/i.test(output)) {
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    result = runCommand(command, args, cwd);
  }
  return result;
}


export function commandFailed(result: {
  status: number | null;
  error?: Error;
}): boolean {
  if (result.error) {
    return true;
  }
  return (result.status ?? 0) !== 0;
}
