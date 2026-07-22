import fs from "node:fs";
import path from "node:path";
import { readJsonFile, withFileLock, writeJsonFile } from "./io.js";
import { listTaskDirectories } from "./context.js";
import { pruneStaleSessionBindings } from "./session-bindings.js";
import { pruneLegacyKnowledgeRuntime } from "./knowledge-sidecar.js";
import { sessionWorkflowBaseDir, sweepExpiredSessionWorkflows } from "./session-workflows.js";
import { enforceTaskRetention } from "./task-retention.js";
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
  legacyTmpRemoved: boolean;
  archivedTasks: number;
  prunedArchivedTasks: number;
  expiredSessionsRemoved: number;
  staleBindingsRemoved: number;
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
    clearDirectory(runtimeTmp);
    const legacyTmpRemoved = removeDirectory(legacyTmp);
    const cutoffDate = previousLocalDate(now);
    const archivedDatedTasks = archiveDatedTaskDirectoriesBefore(project, cutoffDate);
    const archivedLegacyTasks = archiveLegacyTaskDirectoriesBefore(project, cutoffDate);
    const retention = enforceTaskRetention(project, undefined, now.getTime(), { includeDatedTasks: false, includeLegacyTasks: false });
    const staleBindingsRemoved = pruneStaleSessionBindings(project).length;
    const legacyRuntime = pruneLegacyKnowledgeRuntime(project);
    return {
      tmpCleared: true,
      legacyTmpRemoved,
      archivedTasks: archivedDatedTasks + archivedLegacyTasks + retention.archivedTasks.length,
      prunedArchivedTasks: retention.prunedArchivedTasks.length,
      staleBindingsRemoved,
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
    legacyTmpRemoved: projectResult.value?.legacyTmpRemoved ?? false,
    archivedTasks: projectResult.value?.archivedTasks ?? 0,
    prunedArchivedTasks: projectResult.value?.prunedArchivedTasks ?? 0,
    expiredSessionsRemoved: sessionResult.value?.expiredSessionsRemoved ?? 0,
    staleBindingsRemoved: projectResult.value?.staleBindingsRemoved ?? 0,
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

function clearDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
  for (const child of fs.readdirSync(directory)) fs.rmSync(path.join(directory, child), { recursive: true, force: true });
}

function removeDirectory(directory: string): boolean {
  if (!fs.existsSync(directory)) return false;
  fs.rmSync(directory, { recursive: true, force: true });
  return true;
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function previousLocalDate(now: Date): string {
  const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return localDate(previous);
}

/**
 * Archive date-scoped task directories before the supplied local date. Moving the
 * date directory (rather than marking individual plans) also handles older tasks
 * that predate completedAt and leaves no empty date directories behind.
 */
function archiveDatedTaskDirectoriesBefore(project: ProjectContext, cutoffDate: string): number {
  if (!fs.existsSync(project.tasksDir)) return 0;
  const archiveRoot = path.join(project.clawDir, "archive", "tasks");
  let archivedTaskCount = 0;
  for (const entry of fs.readdirSync(project.tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name) || entry.name >= cutoffDate) continue;
    const sourceDateDir = path.join(project.tasksDir, entry.name);
    const taskCount = fs.readdirSync(sourceDateDir, { withFileTypes: true }).filter((child) => child.isDirectory()).length;
    moveDateDirectory(sourceDateDir, path.join(archiveRoot, entry.name));
    archivedTaskCount += taskCount;
  }
  return archivedTaskCount;
}

function moveDateDirectory(sourceDateDir: string, targetDateDir: string): void {
  fs.mkdirSync(path.dirname(targetDateDir), { recursive: true });
  if (!fs.existsSync(targetDateDir)) {
    fs.renameSync(sourceDateDir, targetDateDir);
    return;
  }
  for (const child of fs.readdirSync(sourceDateDir, { withFileTypes: true })) {
    const source = path.join(sourceDateDir, child.name);
    let target = path.join(targetDateDir, child.name);
    let suffix = 1;
    while (fs.existsSync(target)) {
      target = path.join(targetDateDir, `${child.name}--${suffix}`);
      suffix += 1;
    }
    fs.renameSync(source, target);
  }
  fs.rmdirSync(sourceDateDir);
}

function archiveLegacyTaskDirectoriesBefore(project: ProjectContext, cutoffDate: string): number {
  const archiveRoot = path.join(project.clawDir, "archive", "tasks");
  let archivedTaskCount = 0;
  for (const task of listTaskDirectories(project)) {
    if (/^\d{4}-\d{2}-\d{2}[\\/]/.test(task.relativePath)) continue;
    const planPath = path.join(task.taskDir, "plan.json");
    const updatedAt = readPlanUpdatedAt(planPath);
    if (!updatedAt || localDate(new Date(updatedAt)) >= cutoffDate) continue;
    moveDirectoryWithCollision(task.taskDir, path.join(archiveRoot, task.relativePath));
    archivedTaskCount += 1;
  }
  return archivedTaskCount;
}

function readPlanUpdatedAt(planPath: string): number | null {
  if (!fs.existsSync(planPath)) return null;
  try {
    const plan = readJsonFile<{ updatedAt?: string }>(planPath);
    const timestamp = typeof plan.updatedAt === "string" ? Date.parse(plan.updatedAt) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : fs.statSync(planPath).mtimeMs;
  } catch {
    return fs.statSync(planPath).mtimeMs;
  }
}

function moveDirectoryWithCollision(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  let target = targetDir;
  let suffix = 1;
  while (fs.existsSync(target)) {
    target = `${targetDir}--${suffix}`;
    suffix += 1;
  }
  fs.renameSync(sourceDir, target);
}
