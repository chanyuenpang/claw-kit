import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./io.js";
import { DEFAULT_MAX_TASKS_TO_KEEP } from "./project-defaults.js";
import type { ArchivedTaskRecord, PlanDocument, ProjectContext, TaskRetentionResult } from "./types.js";

export const COMPLETED_TASK_ARCHIVE_DELAY_MS = 60 * 60 * 1000;

export function enforceTaskRetention(
  project: ProjectContext,
  currentTaskName?: string,
  nowMs = Date.now(),
): TaskRetentionResult {
  const maxTasksToKeep = project.projectConfig?.maxTasksToKeep ?? DEFAULT_MAX_TASKS_TO_KEEP;
  const archiveTasksRoot = path.join(project.clawDir, "archive", "tasks");
  const prunedArchivedTasks: ArchivedTaskRecord[] = [];
  let archivedCurrentTask: ArchivedTaskRecord | undefined;

  for (const taskName of listActiveTaskNames(project)) {
    const archivedTask = archiveTaskDirectory(project, taskName, archiveTasksRoot, nowMs);
    if (archivedTask && taskName === currentTaskName) {
      archivedCurrentTask = archivedTask;
    }
  }

  const archivedTasks = listArchivedTasks(archiveTasksRoot);
  if (archivedTasks.length > maxTasksToKeep) {
    const overflow = archivedTasks.length - maxTasksToKeep;
    const toPrune = archivedTasks
      .sort(compareArchivedTasksByCompletedAt)
      .slice(0, overflow);

    for (const archivedTask of toPrune) {
      removeDirectoryTreeSync(archivedTask.archivedTaskDir);
      prunedArchivedTasks.push(archivedTask);
    }
  }

  return {
    enabled: true,
    maxTasksToKeep,
    ...(archivedCurrentTask ? { archivedCurrentTask } : {}),
    prunedArchivedTasks,
  };
}

function archiveTaskDirectory(
  project: ProjectContext,
  taskName: string,
  archiveTasksRoot: string,
  nowMs: number,
): ArchivedTaskRecord | undefined {
  const sourceTaskDir = path.join(project.tasksDir, taskName);
  if (!fs.existsSync(sourceTaskDir) || !fs.statSync(sourceTaskDir).isDirectory()) {
    return undefined;
  }

  const rootPlanPath = path.join(sourceTaskDir, "plan.json");
  const legacyMetaPath = path.join(sourceTaskDir, "meta.json");
  const legacyMeta = fs.existsSync(legacyMetaPath) ? readJsonFile<{ activePlan?: string }>(legacyMetaPath) : undefined;
  const activePlanPath = fs.existsSync(rootPlanPath)
    ? rootPlanPath
    : typeof legacyMeta?.activePlan === "string"
      ? path.join(sourceTaskDir, legacyMeta.activePlan)
      : undefined;
  if (!activePlanPath || !fs.existsSync(activePlanPath)) {
    return undefined;
  }
  const completedAt = readJsonFile<PlanDocument>(activePlanPath).completedAt;
  const completedAtMs = typeof completedAt === "string" ? Date.parse(completedAt) : Number.NaN;
  if (!Number.isFinite(completedAtMs) || nowMs - completedAtMs < COMPLETED_TASK_ARCHIVE_DELAY_MS) {
    return undefined;
  }

  fs.mkdirSync(archiveTasksRoot, { recursive: true });
  const archivedTaskDir = uniqueArchiveTaskDir(archiveTasksRoot, taskName);
  renameDirectoryWithRetry(sourceTaskDir, archivedTaskDir);
  const archivedPlanPath = activePlanPath
    ? path.join(archivedTaskDir, path.relative(sourceTaskDir, activePlanPath))
    : undefined;

  return {
    taskName,
    sourceTaskDir,
    archivedTaskDir,
    ...(archivedPlanPath ? { archivedPlanPath } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

function renameDirectoryWithRetry(sourceDir: string, targetDir: string): void {
  const retryDelaysMs = [0, 50, 150, 300];
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    try {
      fs.renameSync(sourceDir, targetDir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!retryable || attempt === retryDelaysMs.length - 1) {
        throw error;
      }
      const delayMs = retryDelaysMs[attempt + 1];
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

function listActiveTaskNames(project: ProjectContext): string[] {
  if (!fs.existsSync(project.tasksDir)) {
    return [];
  }
  return fs
    .readdirSync(project.tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listArchivedTasks(archiveTasksRoot: string): ArchivedTaskRecord[] {
  if (!fs.existsSync(archiveTasksRoot)) {
    return [];
  }

  const entries: ArchivedTaskRecord[] = [];
  for (const child of fs.readdirSync(archiveTasksRoot, { withFileTypes: true })) {
    if (!child.isDirectory()) {
      continue;
    }
    const archivedTaskDir = path.join(archiveTasksRoot, child.name);
    const rootPlanPath = path.join(archivedTaskDir, "plan.json");
    let completedAt: string | undefined;
    let taskName = child.name;
    let archivedPlanPath: string | undefined;
    if (fs.existsSync(rootPlanPath)) {
      const plan = readJsonFile<PlanDocument>(rootPlanPath);
      completedAt = plan.completedAt;
      archivedPlanPath = rootPlanPath;
    } else {
      const metaPath = path.join(archivedTaskDir, "meta.json");
      if (fs.existsSync(metaPath)) {
        const meta = readJsonFile<{ name?: string; activePlan?: string; updatedAt?: string }>(metaPath);
        completedAt = meta.updatedAt;
        taskName = typeof meta.name === "string" && meta.name.trim() ? meta.name : child.name;
        if (typeof meta.activePlan === "string" && meta.activePlan.trim()) {
          archivedPlanPath = path.join(archivedTaskDir, meta.activePlan);
        }
      }
    }
    entries.push({
      taskName,
      sourceTaskDir: "",
      archivedTaskDir,
      ...(archivedPlanPath ? { archivedPlanPath } : {}),
      ...(completedAt ? { completedAt } : {}),
    });
  }
  return entries;
}

function compareArchivedTasksByCompletedAt(left: ArchivedTaskRecord, right: ArchivedTaskRecord): number {
  const leftTime = left.completedAt ? Date.parse(left.completedAt) : Number.NEGATIVE_INFINITY;
  const rightTime = right.completedAt ? Date.parse(right.completedAt) : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.taskName.localeCompare(right.taskName);
}

function removeDirectoryTreeSync(targetDir: string): void {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const stat = fs.lstatSync(targetDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fs.unlinkSync(targetDir);
    return;
  }

  for (const child of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const childPath = path.join(targetDir, child.name);
    if (child.isDirectory() && !child.isSymbolicLink()) {
      removeDirectoryTreeSync(childPath);
    } else {
      fs.unlinkSync(childPath);
    }
  }
  fs.rmdirSync(targetDir);
}

function uniqueArchiveTaskDir(archiveTasksRoot: string, taskName: string): string {
  const candidate = path.join(archiveTasksRoot, taskName);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let attempt = 1;
  while (true) {
    const suffixed = path.join(archiveTasksRoot, `${taskName}--${stamp}-${attempt}`);
    if (!fs.existsSync(suffixed)) {
      return suffixed;
    }
    attempt += 1;
  }
}
