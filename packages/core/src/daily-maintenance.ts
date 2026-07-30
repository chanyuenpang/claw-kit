import fs from "node:fs";
import path from "node:path";
import { readJsonFile, withFileLock, writeJsonFile } from "./io.js";
import { pruneStaleSessionBindings } from "./session-bindings.js";
import { pruneLegacyKnowledgeRuntime } from "./knowledge-sidecar.js";
import { sessionWorkflowBaseDir, sweepExpiredSessionWorkflows } from "./session-workflows.js";
import { runTaskLifecycleMaintenance } from "./task-lifecycle.js";
import type { ProjectContext } from "./types.js";

type MaintenanceStamp = {
  lastRunDate?: string;
  migrations?: {
    taskLayoutV2At?: string;
  };
};

export type DailyMaintenanceResult = {
  ran: boolean;
  tmpCleared: boolean;
  tmpEntriesRemoved: number;
  legacyTmpRemoved: boolean;
  archivedTasks: number;
  prunedArchivedTasks: number;
  emptyDatedDirectoriesRemoved: number;
  logsRemoved: number;
  expiredSessionsRemoved: number;
  staleBindingsRemoved: number;
  expiredTaskDirectoriesRemoved: number;
  legacyFinalizerJobsRemoved: number;
  knowledgeSessionsRemoved: number;
};

export function runDailyMaintenance(project: ProjectContext, options: {
  now?: Date;
  env?: NodeJS.ProcessEnv;
  excludeSessionKey?: string;
  includeProject?: boolean;
} = {}): DailyMaintenanceResult {
  const now = options.now ?? new Date();
  const date = localDate(now);
  const projectResult = options.includeProject === false ? { ran: false as const } : runOncePerDay(path.join(project.clawDir, "runtime", "maintenance.json"), date, () => {
    const runtimeTmp = path.join(project.clawDir, "runtime", "tmp");
    const legacyTmp = path.join(project.clawDir, "tmp");
    const tmpEntriesRemoved = cleanupTemporaryDirectory(runtimeTmp, now.getTime());
    const legacyTmpRemoved = removeDirectory(legacyTmp);
    const cutoffDate = previousLocalDate(now);
    const taskLifecycle = runTaskLifecycleMaintenance(project, now);
    const logsRemoved = pruneProjectLogs(project, cutoffDate);
    const staleBindingsRemoved = pruneStaleSessionBindings(project, now.getTime()).length;
    const legacyRuntime = pruneLegacyKnowledgeRuntime(project);
    return {
      tmpCleared: true,
      tmpEntriesRemoved,
      legacyTmpRemoved,
      archivedTasks: taskLifecycle.archivedTasks,
      prunedArchivedTasks: taskLifecycle.prunedArchivedTasks,
      emptyDatedDirectoriesRemoved: taskLifecycle.emptyDatedDirectoriesRemoved,
      logsRemoved,
      staleBindingsRemoved,
      expiredTaskDirectoriesRemoved: taskLifecycle.expiredTaskDirectoriesRemoved,
      legacyFinalizerJobsRemoved: legacyRuntime.jobsRemoved,
      knowledgeSessionsRemoved: legacyRuntime.sessionsRemoved,
    };
  });
  const sessionBase = sessionWorkflowBaseDir(options.env);
  const sessionResult = runOncePerDay(path.join(sessionBase, ".maintenance.json"), date, () => ({
    expiredSessionsRemoved: sweepExpiredSessionWorkflows({
      now: now.getTime(),
      excludeSessionKey: options.excludeSessionKey,
      env: options.env,
    }).length,
  }));
  return {
    ran: projectResult.ran || sessionResult.ran,
    tmpCleared: projectResult.value?.tmpCleared ?? false,
    tmpEntriesRemoved: projectResult.value?.tmpEntriesRemoved ?? 0,
    legacyTmpRemoved: projectResult.value?.legacyTmpRemoved ?? false,
    archivedTasks: projectResult.value?.archivedTasks ?? 0,
    prunedArchivedTasks: projectResult.value?.prunedArchivedTasks ?? 0,
    emptyDatedDirectoriesRemoved: projectResult.value?.emptyDatedDirectoriesRemoved ?? 0,
    logsRemoved: projectResult.value?.logsRemoved ?? 0,
    expiredSessionsRemoved: sessionResult.value?.expiredSessionsRemoved ?? 0,
    staleBindingsRemoved: projectResult.value?.staleBindingsRemoved ?? 0,
    expiredTaskDirectoriesRemoved: projectResult.value?.expiredTaskDirectoriesRemoved ?? 0,
    legacyFinalizerJobsRemoved: projectResult.value?.legacyFinalizerJobsRemoved ?? 0,
    knowledgeSessionsRemoved: projectResult.value?.knowledgeSessionsRemoved ?? 0,
  };
}

function runOncePerDay<T>(stampPath: string, date: string, action: () => T): { ran: boolean; value?: T } {
  return withFileLock(stampPath, () => {
    const stamp = readStamp(stampPath);
    if (stamp?.lastRunDate === date) return { ran: false };
    const value = action();
    writeJsonFile(stampPath, { ...stamp, lastRunDate: date } satisfies MaintenanceStamp);
    return { ran: true, value };
  });
}

function readStamp(stampPath: string): MaintenanceStamp | null {
  try {
    const value = readJsonFile<MaintenanceStamp>(stampPath);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const TEMPORARY_TTL_MS = 24 * 60 * 60 * 1000;
function cleanupTemporaryDirectory(directory: string, nowMs: number): number {
  fs.mkdirSync(directory, { recursive: true });
  return cleanupTemporaryEntries(directory, nowMs);
}

function cleanupTemporaryEntries(directory: string, nowMs: number): number {
  let removed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removed += cleanupTemporaryEntries(target, nowMs);
      if (fs.readdirSync(target).length === 0) {
        fs.rmdirSync(target);
      }
      continue;
    }
    if (!entry.isFile() || !isExpiredTemporaryEntry(target, nowMs)) continue;
    try {
      fs.unlinkSync(target);
      removed += 1;
    } catch {
      // A concurrent writer or host lock must not make maintenance blocking.
    }
  }
  return removed;
}

function isExpiredTemporaryEntry(filePath: string, nowMs: number): boolean {
  try {
    const stat = fs.statSync(filePath);
    const envelope = readTemporaryEnvelope(filePath);
    if (envelope?.expiresAt) {
      const expiresAt = Date.parse(envelope.expiresAt);
      if (Number.isFinite(expiresAt)) return expiresAt <= nowMs;
    }
    return nowMs - stat.mtimeMs >= TEMPORARY_TTL_MS;
  } catch {
    return false;
  }
}

function readTemporaryEnvelope(filePath: string): { expiresAt?: string } | null {
  if (!/\.json$/i.test(filePath)) return null;
  try {
    const value = readJsonFile<unknown>(filePath);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
    return typeof expiresAt === "string" ? { expiresAt } : {};
  } catch {
    return null;
  }
}

function removeDirectory(directory: string): boolean {
  if (!fs.existsSync(directory)) return false;
  fs.rmSync(directory, { recursive: true, force: true });
  return true;
}

function pruneProjectLogs(project: ProjectContext, cutoffDate: string): number {
  return pruneLogDirectory(path.join(project.clawDir, "logs"), cutoffDate, true);
}

function pruneLogDirectory(directory: string, cutoffDate: string, isRoot = false): number {
  if (!fs.existsSync(directory)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "inflight.lock") continue;
      removed += pruneLogDirectory(child, cutoffDate);
      continue;
    }
    if (localDate(fs.statSync(child).mtime) >= cutoffDate) continue;
    fs.unlinkSync(child);
    removed += 1;
  }
  if (!isRoot && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
  }
  return removed;
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function previousLocalDate(now: Date): string {
  const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return localDate(previous);
}
