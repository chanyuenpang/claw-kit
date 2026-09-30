import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { buildMemoryIndex, ClawError, DEFAULT_MAX_TASKS_TO_KEEP, enforceTaskRetention, findTaskDirectory, resolveProjectContext, writeJsonFileAtomic, type ProjectConfig } from "@veewo/claw-core";
import { withoutInvocationHost } from "./invocation-host.js";

export type CompletionRefreshResult = {
  taskRetention: ReturnType<typeof enforceTaskRetention>;
  asyncRefresh: {
    queued: true;
    startedAt: string;
    statusFile: string;
    operations: CompletionRefreshOperation[];
    coalesced?: boolean;
    leaderStatusFile?: string;
    dirtyHash: string;
  };
};

type CompletionRefreshOperation = "task.retention" | "memory.reindex.project" | "gitnexus.refresh";

type CompletionRefreshStatus = ({
  ok: true;
  queued: true;
  startedAt: string;
  cwd: string;
  taskName: string;
  operations: CompletionRefreshOperation[];
} | {
  ok: true;
  coalesced: true;
  queued: true;
  startedAt: string;
  cwd: string;
  taskName: string;
  operations: CompletionRefreshOperation[];
  dirtyHash: string;
  leaderStatusFile: string;
} | {
  ok: true;
  running: true;
  startedAt: string;
  cwd: string;
  taskName: string;
  operations: CompletionRefreshOperation[];
} | {
  ok: true;
  startedAt: string;
  finishedAt: string;
  cwd: string;
  taskName: string;
  memory: {
    project: ReturnType<typeof buildMemoryIndex>;
  };
  taskRetention?: ReturnType<typeof enforceTaskRetention>;
  gitnexus?: GitNexusRefreshResult;
  dirtyHash?: string;
  refreshCycles?: number;
  coalescedCount?: number;
} | {
  ok: false;
  startedAt: string;
  finishedAt: string;
  cwd: string;
  taskName: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}) & { operations?: CompletionRefreshOperation[] };

type GitNexusRefreshResult = {
  enabled: true;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
} | {
  enabled: false;
  reason: string;
};

type CompletionRefreshFlightState = {
  schemaVersion: 1;
  queuedAt: string;
  leaderStatusFile: string;
  statusFiles: string[];
  requestedDirtyHash: string;
  operations: CompletionRefreshOperation[];
  pid?: number;
  startedAt?: string;
};

export function queueCompletionRefresh(input: {
  cwd: string;
  taskName: string;
  includeTaskRetention?: boolean;
  includeGitNexus?: boolean;
  statusLabel?: string;
  /** Stable durable status supplied by terminal-fact reconciliation. */
  statusFile?: string;
}): CompletionRefreshResult {
  const project = resolveProjectContext(input.cwd);
  const includeTaskRetention = input.includeTaskRetention ?? true;
  // Retention is deliberately a background effect. A locked old task must not
  // sit between the durable terminal mutation and its knowledge dispatch.
  const taskRetention = {
    enabled: includeTaskRetention,
    maxTasksToKeep: project.projectConfig?.maxTasksToKeep ?? DEFAULT_MAX_TASKS_TO_KEEP,
    archivedTasks: [],
    prunedArchivedTasks: [],
    failures: [],
  };
  const startedAt = new Date().toISOString();
  const logFile = createCompletionRefreshStatusFile(project.clawDir, input.statusLabel ?? input.taskName, startedAt);
  const statusFile = input.statusFile ?? logFile;
  const operations: CompletionRefreshResult["asyncRefresh"]["operations"] = ["memory.reindex.project"];
  if (includeTaskRetention) {
    operations.unshift("task.retention");
  }
  if (project.projectConfig?.gitnexus === true && input.includeGitNexus !== false) {
    operations.push("gitnexus.refresh");
  }
  const dirtyHash = computeCompletionDirtyHash(input.cwd, input.taskName, operations);

  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  writeCompletionStatusAtomic(statusFile, {
    ok: true, queued: true, startedAt, cwd: input.cwd, taskName: input.taskName, operations, dirtyHash,
  });
  if (logFile !== statusFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.copyFileSync(statusFile, logFile);
  }
  const flight = claimCompletionRefreshFlight({
    mirrorStatusFile: logFile !== statusFile ? logFile : undefined,
    clawDir: project.clawDir,
    statusFile,
    dirtyHash,
    operations,
    queuedAt: startedAt,
  });
  if (flight.leader) {
    launchCompletionRefreshWorker({
      cwd: input.cwd,
      taskName: input.taskName,
      statusFile,
    });
  }

  return {
    taskRetention,
    asyncRefresh: {
      queued: true,
      startedAt,
      statusFile,
      operations,
      dirtyHash,
      ...(!flight.leader ? { coalesced: true, leaderStatusFile: flight.leaderStatusFile } : {}),
    },
  };
}

/** Resume only system work; never replay the plan/job command that requested it. */
export function resumeCompletionRefresh(statusFile: string): CompletionRefreshResult | undefined {
  const status = tryReadCompletionRefreshStatus(statusFile);
  if (!status || (status.ok && "finishedAt" in status)) return;
  const project = resolveProjectContext(status.cwd);
  const flight = readCompletionRefreshFlightState(getCompletionRefreshFlightDir(project.clawDir));
  if (flight && !isCompletionRefreshFlightStale(flight) && flight.statusFiles.includes(statusFile)) return;
  return queueCompletionRefresh({
    cwd: project.projectRoot, taskName: status.taskName, statusFile,
    includeTaskRetention: status.operations?.includes("task.retention") ?? false,
    includeGitNexus: status.operations?.includes("gitnexus.refresh") ?? false,
  });
}

function resolveCliEntryPath(): string {
  return fileURLToPath(new URL("./bin.js", import.meta.url));
}

function quoteWindowsArgument(value: string): string {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1") + '"';
}

function launchCompletionRefreshWorker(input: {
  cwd: string;
  taskName: string;
  statusFile: string;
}): void {
  if (process.platform === "win32") {
    const launcherScript = [
      "$node = $env:CLAW_COMPLETION_NODE",
      "$entry = $env:CLAW_COMPLETION_ENTRY",
      "$cwd = $env:CLAW_COMPLETION_CWD",
      "$task = $env:CLAW_COMPLETION_TASK",
      "$status = $env:CLAW_COMPLETION_STATUS",
      "Start-Process -FilePath $node -ArgumentList $env:CLAW_COMPLETION_ARGS -WorkingDirectory $cwd -WindowStyle Hidden -ErrorAction Stop",
    ].join("; ");
    const launcher = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", launcherScript],
      {
        cwd: input.cwd,
        stdio: "ignore",
        windowsHide: true,
        env: {
          ...withoutInvocationHost(),
          CLAW_COMPLETION_ARGS: [resolveCliEntryPath(), "internal-completion-refresh", "--cwd", input.cwd, "--task", input.taskName, "--status-file", input.statusFile].map(quoteWindowsArgument).join(" "),
          CLAW_COMPLETION_NODE: process.execPath,
          CLAW_COMPLETION_ENTRY: resolveCliEntryPath(),
          CLAW_COMPLETION_CWD: input.cwd,
          CLAW_COMPLETION_TASK: input.taskName,
          CLAW_COMPLETION_STATUS: input.statusFile,
        },
      },
    );
    if (launcher.error) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "Unable to launch background completion refresh.",
        {
          cwd: input.cwd,
          message: launcher.error.message,
        },
      );
    }
    if ((launcher.status ?? 0) !== 0) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "Background completion refresh launcher exited unexpectedly.",
        {
          cwd: input.cwd,
          exitCode: launcher.status ?? 0,
        },
      );
    }
    return;
  }

  const child = spawn(
    process.execPath,
    [
      resolveCliEntryPath(),
      "internal-completion-refresh",
      "--cwd",
      input.cwd,
      "--task",
      input.taskName,
      "--status-file",
      input.statusFile,
    ],
    {
      cwd: input.cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: withoutInvocationHost(),
    },
  );
  child.unref();
}

export function runCompletionRefresh(input: { cwd: string; taskName: string; statusFile: string }): void {
  const { cwd, taskName, statusFile } = input;
  const startedAt = new Date().toISOString();
  const queuedStatus = JSON.parse(fs.readFileSync(statusFile, "utf-8")) as CompletionRefreshStatus;
  const flightDir = getCompletionRefreshFlightDir(resolveProjectContext(cwd).clawDir);
  const initialFlight = readCompletionRefreshFlightState(flightDir);
  const operations: CompletionRefreshOperation[] = initialFlight?.operations ?? (
    "operations" in queuedStatus && Array.isArray(queuedStatus.operations)
      ? queuedStatus.operations as CompletionRefreshOperation[]
      : ["memory.reindex.project"]);
  // A delayed launcher or duplicate recovery must not become a second runner.
  let accepted = false;
  if (!initialFlight || initialFlight.leaderStatusFile !== statusFile) return;
  updateCompletionRefreshFlightState(flightDir, (state) => {
    if (state.leaderStatusFile !== statusFile || (state.pid && !isCompletionRefreshFlightStale(state))) return state;
    accepted = true;
    return { ...state, pid: process.pid, startedAt };
  });
  if (!accepted) return;

  try {
    writeCompletionStatusAtomic(statusFile, {
      ok: true, running: true, startedAt, cwd, taskName, operations,
    } satisfies CompletionRefreshStatus);
    let projectMemory: ReturnType<typeof buildMemoryIndex> | undefined;
    let gitnexus: GitNexusRefreshResult | undefined;
    let taskRetention: ReturnType<typeof enforceTaskRetention> | undefined;
    let refreshCycles = 0;
    let dirtyHash = "";
    let coveredStatusFiles: string[] = [];
    let coveredRequestHash: string | undefined;
    let stable = false;
    while (refreshCycles < 3) {
      refreshCycles += 1;
      const cycleFlight = readCompletionRefreshFlightState(flightDir);
      coveredStatusFiles = cycleFlight?.statusFiles ?? [statusFile];
      coveredRequestHash = cycleFlight?.requestedDirtyHash;
      for (const operation of cycleFlight?.operations ?? []) {
        if (!operations.includes(operation)) operations.push(operation);
      }
      if (!taskRetention && operations.includes("task.retention")) taskRetention = enforceTaskRetention(resolveProjectContext(cwd), taskName);
      dirtyHash = computeCompletionDirtyHash(cwd, taskName, operations);
      projectMemory = buildMemoryIndex({ cwd, scope: "project" });
      gitnexus = operations.includes("gitnexus.refresh")
        ? refreshGitNexusIfEnabled(cwd, resolveProjectContext(cwd).projectConfig)
        : {
            enabled: false,
            reason: "gitnexus is not enabled in .claw/project.json",
          };
      const latestFlight = readCompletionRefreshFlightState(flightDir);
      const latestDirtyHash = computeCompletionDirtyHash(cwd, taskName, latestFlight?.operations ?? operations);
      if (latestDirtyHash === dirtyHash && latestFlight?.requestedDirtyHash === cycleFlight?.requestedDirtyHash) {
        stable = true;
        break;
      }
      if (latestFlight?.operations) {
        for (const operation of latestFlight.operations) {
          if (!operations.includes(operation)) {
            operations.push(operation);
          }
        }
      }
    }
    if (!stable) throw new Error("Completion refresh inputs kept changing; pending work will resume on the next entry.");
    const finalFlight = readCompletionRefreshFlightState(flightDir);
    const status: CompletionRefreshStatus = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      cwd,
      taskName,
      operations,
      memory: {
        project: projectMemory!,
      },
      ...(taskRetention ? { taskRetention } : {}),
      gitnexus,
      dirtyHash,
      refreshCycles,
      coalescedCount: Math.max(0, (finalFlight?.statusFiles.length ?? 1) - 1),
    };
    writeCompletionRefreshFinalStatuses(flightDir, statusFile, status, coveredStatusFiles, coveredRequestHash);
  } catch (error) {
    const payload: CompletionRefreshStatus = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      cwd,
      taskName,
      operations,
      error: error instanceof ClawError
        ? {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          }
        : {
            code: "COMPLETION_REFRESH_FAILED",
            message: error instanceof Error ? error.message : "Unknown completion refresh failure.",
          },
    };
    writeCompletionRefreshFinalStatuses(flightDir, statusFile, payload);
    process.exitCode = 1;
  }
}

function getCompletionRefreshFlightDir(clawDir: string): string {
  return path.join(clawDir, "logs", "completion-refresh", "inflight.lock");
}

function claimCompletionRefreshFlight(input: {
  mirrorStatusFile?: string;
  clawDir: string;
  statusFile: string;
  dirtyHash: string;
  operations: CompletionRefreshOperation[];
  queuedAt: string;
}, staleRetries = 0): { leader: boolean; leaderStatusFile: string } {
  const flightDir = getCompletionRefreshFlightDir(input.clawDir);
  try {
    fs.mkdirSync(flightDir);
    const state: CompletionRefreshFlightState = {
      schemaVersion: 1,
      queuedAt: input.queuedAt,
      leaderStatusFile: input.statusFile,
      statusFiles: [input.statusFile, ...(input.mirrorStatusFile ? [input.mirrorStatusFile] : [])],
      requestedDirtyHash: input.dirtyHash,
      operations: input.operations,
    };
    writeCompletionRefreshFlightState(flightDir, state);
    return { leader: true, leaderStatusFile: input.statusFile };
  } catch (error) {
    if (!isFileAlreadyExistsError(error)) {
      throw error;
    }
  }

  const existing = readCompletionRefreshFlightState(flightDir);
  if (!existing || isCompletionRefreshFlightStale(existing)) {
    fs.rmSync(flightDir, { recursive: true, force: true });
    if (staleRetries >= 1) {
      // Windows can retain a stale directory briefly when its old lock file was
      // opened by a dead worker. Reclaim the directory in place rather than
      // recursively retrying until the JavaScript stack overflows.
      fs.rmSync(path.join(flightDir, "state.write.lock"), { force: true });
      const reclaimed: CompletionRefreshFlightState = {
        schemaVersion: 1,
        queuedAt: input.queuedAt,
        leaderStatusFile: input.statusFile,
        statusFiles: [input.statusFile, ...(input.mirrorStatusFile ? [input.mirrorStatusFile] : [])],
        requestedDirtyHash: input.dirtyHash,
        operations: input.operations,
      };
      writeCompletionRefreshFlightState(flightDir, reclaimed);
      return { leader: true, leaderStatusFile: input.statusFile };
    }
    return claimCompletionRefreshFlight(input, staleRetries + 1);
  }
  const updated = updateCompletionRefreshFlightState(flightDir, (state) => ({
    ...state,
    statusFiles: Array.from(new Set([...state.statusFiles, input.statusFile, ...(input.mirrorStatusFile ? [input.mirrorStatusFile] : [])])),
    requestedDirtyHash: input.dirtyHash,
    operations: Array.from(new Set([...state.operations, ...input.operations])),
  }));
  return { leader: false, leaderStatusFile: updated.leaderStatusFile };
}

function readCompletionRefreshFlightState(flightDir: string): CompletionRefreshFlightState | null {
  const statePath = path.join(flightDir, "state.json");
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as CompletionRefreshFlightState;
  } catch {
    return null;
  }
}

/** Windows readers can briefly deny replacement of a durable status file. */
function writeCompletionStatusAtomic(statusFile: string, status: unknown): void {
  for (let attempt = 0; ; attempt += 1) {
    try { writeJsonFileAtomic(statusFile, status); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 19) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 + attempt * 2);
    }
  }
}

export function tryReadCompletionRefreshStatus(statusFile: string): CompletionRefreshStatus | null {
  if (!fs.existsSync(statusFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statusFile, "utf-8")) as CompletionRefreshStatus;
  } catch {
    return null;
  }
}

function writeCompletionRefreshFlightState(flightDir: string, state: CompletionRefreshFlightState): void {
  const statePath = path.join(flightDir, "state.json");
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, statePath);
}

function updateCompletionRefreshFlightState(
  flightDir: string,
  update: (state: CompletionRefreshFlightState) => CompletionRefreshFlightState,
): CompletionRefreshFlightState {
  const lockPath = path.join(flightDir, "state.write.lock");
  let lockFd: number | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      lockFd = fs.openSync(lockPath, "wx");
      break;
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (lockFd === undefined) {
    // A crashed worker can leave this zero-byte lock indefinitely on Windows.
    // Reclaim only a lock that has remained unchanged beyond the full bounded
    // wait; an active writer keeps its fresh mtime and remains protected.
    try {
      const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (ageMs >= 500) {
        fs.rmSync(lockPath, { force: true });
        lockFd = fs.openSync(lockPath, "wx");
      }
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) throw error;
    }
  }
  if (lockFd === undefined) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "Completion refresh single-flight state is busy; system recovery will retry on a later entry.",
      { lockPath },
    );
  }
  try {
    const current = readCompletionRefreshFlightState(flightDir);
    if (!current) {
      throw new ClawError("PROJECT_CONFIG_INVALID", "Completion refresh single-flight state is missing.");
    }
    const next = update(current);
    writeCompletionRefreshFlightState(flightDir, next);
    return next;
  } finally {
    fs.closeSync(lockFd);
    fs.rmSync(lockPath, { force: true });
  }
}

function writeCompletionRefreshFinalStatuses(
  flightDir: string,
  leaderStatusFile: string,
  status: CompletionRefreshStatus,
  coveredStatusFiles?: string[],
  coveredRequestHash?: string,
): void {
  const flight = readCompletionRefreshFlightState(flightDir);
  const statusFiles = flight?.statusFiles ?? [leaderStatusFile];
  for (const target of statusFiles) {
    // A request arriving after the last indexing snapshot is still pending,
    // not a successful refresh merely because it joined the leader envelope.
    if (coveredStatusFiles && !coveredStatusFiles.includes(target) && flight?.requestedDirtyHash !== coveredRequestHash) continue;
    const payload = target === leaderStatusFile
      ? status
      : { ...status, coalesced: true, leaderStatusFile };
    writeCompletionStatusAtomic(target, { ...payload, taskName: tryReadCompletionRefreshStatus(target)?.taskName ?? payload.taskName });
  }
  fs.rmSync(flightDir, { recursive: true, force: true });
}

function isCompletionRefreshFlightStale(state: CompletionRefreshFlightState): boolean {
  if (state.pid) {
    try {
      process.kill(state.pid, 0);
      return false;
    } catch {
      return true;
    }
  }
  return Date.now() - Date.parse(state.queuedAt) > 60_000;
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}

function computeCompletionDirtyHash(
  cwd: string,
  taskName: string,
  operations: CompletionRefreshOperation[],
): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify([...operations].sort()));
  const project = resolveProjectContext(cwd);
  const roots = [
    path.join(project.clawDir, "memory.md"),
    path.join(project.clawDir, "truth"),
    findTaskDirectory(project, taskName) ?? path.join(project.tasksDir, taskName),
  ];
  const files = roots.flatMap((root) => listCompletionFingerprintFiles(root)).sort();
  for (const filePath of files) {
    hash.update(path.relative(cwd, filePath));
    hash.update(fs.readFileSync(filePath));
  }
  const gitStatus = runCommand("git", ["status", "--porcelain=v1", "--untracked-files=no"], cwd);
  if (!commandFailed(gitStatus)) {
    hash.update(gitStatus.stdout ?? "");
    const gitDiff = runCommand("git", ["diff", "--no-ext-diff", "--binary"], cwd);
    if (!commandFailed(gitDiff)) {
      hash.update(gitDiff.stdout ?? "");
    }
  }
  return hash.digest("hex");
}

function listCompletionFingerprintFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return /\.(?:md|json)$/i.test(root) ? [root] : [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "logs" || entry.name.endsWith(".sqlite")) {
      continue;
    }
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCompletionFingerprintFiles(child));
    } else if (/\.(?:md|json)$/i.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}

function createCompletionRefreshStatusFile(clawDir: string, taskName: string, startedAt: string): string {
  const stamp = startedAt.replace(/[:.]/g, "-");
  const safeTaskName = taskName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return path.join(clawDir, "logs", "completion-refresh", `${stamp}-${safeTaskName}.json`);
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
