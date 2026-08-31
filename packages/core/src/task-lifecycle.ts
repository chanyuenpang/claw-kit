import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./io.js";
import { listTaskDirectories } from "./context.js";
import { enforceTaskRetention, moveTaskDirectoryWithCollisionAndRetry } from "./task-retention.js";
import type { PlanDocument, ProjectContext } from "./types.js";

const WORKFLOW_TASK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type TaskLifecycleMaintenanceResult = {
  archivedTasks: number;
  prunedArchivedTasks: number;
  expiredTaskDirectoriesRemoved: number;
  emptyDatedDirectoriesRemoved: number;
};

/**
 * Coordinates the task lifecycle without merging the policies themselves:
 * archive eligibility, archive retention, and inactivity TTL are evaluated in
 * that order so archived work gets a recovery window before final deletion.
 */
export function runTaskLifecycleMaintenance(project: ProjectContext, now: Date): TaskLifecycleMaintenanceResult {
  const cutoffDate = previousLocalDate(now);
  const archivedDatedTasks = archiveDatedTaskDirectoriesBefore(project, cutoffDate);
  const archivedLegacyTasks = archiveLegacyTaskDirectoriesBefore(project, cutoffDate);
  const retention = enforceTaskRetention(project, undefined, now.getTime(), {
    includeDatedTasks: false,
    includeLegacyTasks: false,
  });
  const expiredTaskDirectoriesRemoved = pruneExpiredTaskDirectories(project, now.getTime());
  const emptyDatedDirectoriesRemoved = removeEmptyDatedTaskDirectories(project);
  return {
    archivedTasks: archivedDatedTasks + archivedLegacyTasks + retention.archivedTasks.length,
    prunedArchivedTasks: retention.prunedArchivedTasks.length,
    expiredTaskDirectoriesRemoved,
    emptyDatedDirectoriesRemoved,
  };
}

function pruneExpiredTaskDirectories(project: ProjectContext, nowMs: number): number {
  let removed = 0;
  for (const root of [project.tasksDir, path.join(project.clawDir, "archive", "tasks")]) {
    for (const task of listTaskDirectories({ tasksDir: root } as ProjectContext)) {
      const updatedAt = readPlanUpdatedAt(path.join(task.taskDir, "plan.json"));
      if (updatedAt === null || nowMs - updatedAt < WORKFLOW_TASK_TTL_MS) continue;
      try {
        fs.rmSync(task.taskDir, { recursive: true, force: true });
        removed += 1;
      } catch {
        // A locked or concurrently updated task is retried by the next pass.
      }
    }
  }
  return removed;
}

function removeEmptyDatedTaskDirectories(project: ProjectContext): number {
  return [project.tasksDir, path.join(project.clawDir, "archive", "tasks")]
    .reduce((removed, root) => removed + removeEmptyDatedDirectories(root), 0);
}

function removeEmptyDatedDirectories(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const directory = path.join(root, entry.name);
    if (fs.readdirSync(directory).length > 0) continue;
    fs.rmdirSync(directory);
    removed += 1;
  }
  return removed;
}

function archiveDatedTaskDirectoriesBefore(project: ProjectContext, cutoffDate: string): number {
  if (!fs.existsSync(project.tasksDir)) return 0;
  const archiveRoot = path.join(project.clawDir, "archive", "tasks");
  let archivedTaskCount = 0;
  for (const entry of fs.readdirSync(project.tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name) || entry.name >= cutoffDate) continue;
    const sourceDateDir = path.join(project.tasksDir, entry.name);
    for (const child of fs.readdirSync(sourceDateDir, { withFileTypes: true })) {
      if (!child.isDirectory() || !isTerminalTask(path.join(sourceDateDir, child.name))) continue;
      try {
        moveTaskDirectoryWithCollisionAndRetry(path.join(sourceDateDir, child.name), path.join(archiveRoot, entry.name, child.name));
        archivedTaskCount += 1;
      } catch {
        // Maintenance is best-effort: a persistent host lock must not block the
        // workflow or prevent unrelated expired tasks from being maintained.
      }
    }
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
    const updatedAt = readPlanUpdatedAt(path.join(task.taskDir, "plan.json"));
    if (!updatedAt || localDate(new Date(updatedAt)) >= cutoffDate || !isTerminalTask(task.taskDir)) continue;
    try {
      moveTaskDirectoryWithCollisionAndRetry(task.taskDir, path.join(archiveRoot, task.relativePath));
      archivedTaskCount += 1;
    } catch {
      // Retry this task on a later maintenance pass without failing this one.
    }
  }
  return archivedTaskCount;
}

function isTerminalTask(taskDir: string): boolean {
  try {
    return readJsonFile<Pick<PlanDocument, "status">>(path.join(taskDir, "plan.json")).status.startsWith("end.");
  } catch {
    return false;
  }
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

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function previousLocalDate(now: Date): string {
  const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return localDate(previous);
}
