import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./io.js";
import type { ArchivedTaskRecord, PlanDocument, ProjectContext, TaskMeta, TaskRetentionResult } from "./types.js";

export function enforceTaskRetention(project: ProjectContext, currentTaskName?: string): TaskRetentionResult {
  const maxTasksToKeep = project.projectConfig?.maxTasksToKeep ?? 99;
  const archiveTasksRoot = path.join(project.clawDir, "archive", "tasks");
  const prunedArchivedTasks: ArchivedTaskRecord[] = [];
  let archivedCurrentTask: ArchivedTaskRecord | undefined;

  for (const taskName of listActiveTaskNames(project)) {
    const archivedTask = archiveTaskDirectory(project, taskName, archiveTasksRoot);
    if (archivedTask && taskName === currentTaskName) {
      archivedCurrentTask = archivedTask;
    }
  }

  const archivedTasks = listArchivedTasks(archiveTasksRoot);
  if (archivedTasks.length > maxTasksToKeep) {
    const overflow = archivedTasks.length - maxTasksToKeep;
    const toPrune = archivedTasks
      .sort(compareArchivedTasksByUpdatedAt)
      .slice(0, overflow);

    for (const archivedTask of toPrune) {
      fs.rmSync(archivedTask.archivedTaskDir, { recursive: true, force: true });
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
): ArchivedTaskRecord | undefined {
  const sourceTaskDir = path.join(project.tasksDir, taskName);
  if (!fs.existsSync(sourceTaskDir) || !fs.statSync(sourceTaskDir).isDirectory()) {
    return undefined;
  }

  const metaPath = path.join(sourceTaskDir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    return undefined;
  }
  const meta = readJsonFile<TaskMeta>(metaPath);
  const activePlanPath = typeof meta.activePlan === "string" ? path.join(sourceTaskDir, meta.activePlan) : undefined;
  const planStatus = activePlanPath && fs.existsSync(activePlanPath)
    ? readJsonFile<PlanDocument>(activePlanPath).status
    : undefined;

  if (meta.status !== "completed" && planStatus !== "end.completed") {
    return undefined;
  }

  fs.mkdirSync(archiveTasksRoot, { recursive: true });
  const archivedTaskDir = uniqueArchiveTaskDir(archiveTasksRoot, taskName);
  fs.renameSync(sourceTaskDir, archivedTaskDir);
  const archivedPlanPath =
    typeof meta.activePlan === "string" ? path.join(archivedTaskDir, meta.activePlan) : undefined;

  return {
    taskName,
    sourceTaskDir,
    archivedTaskDir,
    ...(archivedPlanPath ? { archivedPlanPath } : {}),
    ...(meta.updatedAt ? { updatedAt: meta.updatedAt } : {}),
  };
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
    const metaPath = path.join(archivedTaskDir, "meta.json");
    let updatedAt: string | undefined;
    let taskName = child.name;
    let archivedPlanPath: string | undefined;
    if (fs.existsSync(metaPath)) {
      const meta = readJsonFile<TaskMeta>(metaPath);
      updatedAt = meta.updatedAt;
      taskName = typeof meta.name === "string" && meta.name.trim() ? meta.name : child.name;
      if (typeof meta.activePlan === "string" && meta.activePlan.trim()) {
        archivedPlanPath = path.join(archivedTaskDir, meta.activePlan);
      }
    }
    entries.push({
      taskName,
      sourceTaskDir: "",
      archivedTaskDir,
      ...(archivedPlanPath ? { archivedPlanPath } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    });
  }
  return entries;
}

function compareArchivedTasksByUpdatedAt(left: ArchivedTaskRecord, right: ArchivedTaskRecord): number {
  const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : Number.NEGATIVE_INFINITY;
  const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.taskName.localeCompare(right.taskName);
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
