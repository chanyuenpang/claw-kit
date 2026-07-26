import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./io.js";
import { listTaskDirectories } from "./context.js";
import { DEFAULT_MAX_TASKS_TO_KEEP } from "./project-defaults.js";
import type { ArchivedTaskRecord, PlanDocument, ProjectContext, TaskRetentionResult } from "./types.js";

export const COMPLETED_TASK_ARCHIVE_DELAY_MS = 60 * 60 * 1000;

export function enforceTaskRetention(
  project: ProjectContext,
  currentTaskName?: string,
  nowMs = Date.now(),
  options: { includeDatedTasks?: boolean; includeLegacyTasks?: boolean } = {},
): TaskRetentionResult {
  const maxTasksToKeep = project.projectConfig?.maxTasksToKeep ?? DEFAULT_MAX_TASKS_TO_KEEP;
  const archiveTasksRoot = path.join(project.clawDir, "archive", "tasks");
  const prunedArchivedTasks: ArchivedTaskRecord[] = [];
  const archivedTasks: ArchivedTaskRecord[] = [];
  let archivedCurrentTask: ArchivedTaskRecord | undefined;

  for (const task of listTaskDirectories(project)) {
    if (options.includeDatedTasks === false && /^\d{4}-\d{2}-\d{2}[\\/]/.test(task.relativePath)) {
      continue;
    }
    if (options.includeLegacyTasks === false && !/^\d{4}-\d{2}-\d{2}[\\/]/.test(task.relativePath)) {
      continue;
    }
    const archivedTask = archiveTaskDirectory(project, task, archiveTasksRoot, nowMs);
    if (archivedTask) archivedTasks.push(archivedTask);
    if (archivedTask && task.taskName === currentTaskName) {
      archivedCurrentTask = archivedTask;
    }
  }

  const retainedArchivedTasks = listArchivedTasks(archiveTasksRoot);
  if (retainedArchivedTasks.length > maxTasksToKeep) {
    const overflow = retainedArchivedTasks.length - maxTasksToKeep;
    const toPrune = retainedArchivedTasks
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
    archivedTasks,
    ...(archivedCurrentTask ? { archivedCurrentTask } : {}),
    prunedArchivedTasks,
  };
}

function archiveTaskDirectory(
  project: ProjectContext,
  task: { taskName: string; taskDir: string; relativePath: string },
  archiveTasksRoot: string,
  nowMs: number,
): ArchivedTaskRecord | undefined {
  const sourceTaskDir = task.taskDir;
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
  const archivedTaskDir = uniqueArchiveTaskDir(archiveTasksRoot, task.relativePath);
  renameDirectoryWithRetry(sourceTaskDir, archivedTaskDir);
  const archivedPlanPath = activePlanPath
    ? path.join(archivedTaskDir, path.relative(sourceTaskDir, activePlanPath))
    : undefined;

  return {
    taskName: task.taskName,
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

function listArchivedTasks(archiveTasksRoot: string): ArchivedTaskRecord[] {
  if (!fs.existsSync(archiveTasksRoot)) {
    return [];
  }

  const entries: ArchivedTaskRecord[] = [];
  const candidates = listTaskDirectories({ tasksDir: archiveTasksRoot } as ProjectContext);
  for (const child of candidates) {
    const archivedTaskDir = child.taskDir;
    const rootPlanPath = path.join(archivedTaskDir, "plan.json");
    let completedAt: string | undefined;
    let taskName = child.taskName;
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
        taskName = typeof meta.name === "string" && meta.name.trim() ? meta.name : child.taskName;
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

function uniqueArchiveTaskDir(archiveTasksRoot: string, relativePath: string): string {
  const candidate = path.join(archiveTasksRoot, relativePath);
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let attempt = 1;
  while (true) {
    const suffixed = path.join(path.dirname(candidate), `${path.basename(candidate)}--${stamp}-${attempt}`);
    if (!fs.existsSync(suffixed)) {
      return suffixed;
    }
    attempt += 1;
  }
}
