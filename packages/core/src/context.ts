import fs from "node:fs";
import path from "node:path";
import { ClawError } from "./errors.js";
import { readJsonFile, withFileLock } from "./io.js";
import { ensureInsideDir, findProjectRoot, isValidTaskName, normalizePlanFile, normalizeTaskName } from "./paths.js";
import type { MemoryEmbeddingConfig, ProjectConfig, ProjectContext, ResolvedContext, TaskContext, TaskMeta } from "./types.js";

export function resolveProjectContext(cwd: string): ProjectContext {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) {
    throw new ClawError("CLAW_DIR_NOT_FOUND", `No .claw directory was found from ${cwd}.`, { cwd });
  }

  const clawDir = path.join(projectRoot, ".claw");
  const projectJsonPath = path.join(clawDir, "project.json");
  const projectConfig = fs.existsSync(projectJsonPath) ? readProjectConfig(projectJsonPath) : null;
  const projectId = deriveProjectId(projectRoot, projectConfig);

  return {
    projectRoot,
    clawDir,
    projectJsonPath,
    truthDir: path.join(clawDir, "truth"),
    tasksDir: path.join(clawDir, "tasks"),
    projectId,
    ...(projectConfig?.name ? { projectName: projectConfig.name } : {}),
    projectConfig,
  };
}

export function resolveTaskContext(project: ProjectContext, taskName: string): TaskContext {
  const resolvedTaskName = resolveTaskName(taskName);
  const taskDir = path.join(project.tasksDir, resolvedTaskName);
  const metaPath = path.join(taskDir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new ClawError("TASK_NOT_FOUND", `Task "${resolvedTaskName}" does not exist.`, { taskName: resolvedTaskName });
  }

  const meta = readJsonFile<TaskMeta>(metaPath);
  if (!meta.rootPlan) {
    meta.rootPlan = "plan.json";
  }
  const activePlan = normalizePlanFile(typeof meta.activePlan === "string" ? meta.activePlan : "plan.json");
  const activePlanPath = ensureInsideDir(taskDir, activePlan);
  if (!activePlanPath) {
    throw new ClawError("ACTIVE_PLAN_INVALID", `Task "${resolvedTaskName}" has an invalid activePlan.`, {
      taskName: resolvedTaskName,
      activePlan,
    });
  }
  if (!fs.existsSync(activePlanPath)) {
    throw new ClawError("ACTIVE_PLAN_MISSING", `Task "${resolvedTaskName}" points to a missing active plan file.`, {
      taskName: resolvedTaskName,
      activePlan,
    });
  }

  return {
    project,
    taskName: resolvedTaskName,
    taskDir,
    metaPath,
    meta,
    activePlan,
    activePlanPath,
  };
}

export function resolveContext(cwd: string, taskName?: string): ResolvedContext {
  const project = resolveProjectContext(cwd);
  return {
    project,
    ...(taskName ? { task: resolveTaskContext(project, taskName) } : {}),
  };
}

export function ensureTaskMeta(
  project: ProjectContext,
  taskName: string,
  description?: string,
  ownerSessionKey?: string,
): TaskContext {
  const resolvedTaskName = resolveTaskName(taskName);
  const taskDir = path.join(project.tasksDir, resolvedTaskName);
  const metaPath = path.join(taskDir, "meta.json");
  const now = new Date().toISOString();
  let meta: TaskMeta;
  const createdTask = !fs.existsSync(metaPath);

  if (!createdTask) {
    meta = readJsonFile<TaskMeta>(metaPath);
    meta.updatedAt = now;
    if (description && !meta.description) {
      meta.description = description;
    }
    if (ownerSessionKey?.trim()) {
      const normalizedOwnerSessionKey = ownerSessionKey.trim();
      if (meta.ownerSessionKey !== normalizedOwnerSessionKey) {
        meta.ownerSessionKey = normalizedOwnerSessionKey;
        meta.boundAt = now;
      } else if (!meta.boundAt) {
        meta.boundAt = now;
      }
    }
  } else {
    meta = {
      name: resolvedTaskName,
      description: description ?? "",
      projectId: project.projectId,
      createdAt: now,
      updatedAt: now,
      subagents: [],
      status: "active",
      rootPlan: "plan.json",
      activePlan: "plan.json",
      ...(ownerSessionKey?.trim()
        ? {
            ownerSessionKey: ownerSessionKey.trim(),
            boundAt: now,
          }
        : {}),
    };
  }

  fs.mkdirSync(taskDir, { recursive: true });
  withFileLock(metaPath, () => {
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  });

  const task = {
    project,
    taskName: resolvedTaskName,
    taskDir,
    metaPath,
    meta,
    activePlan: normalizePlanFile(meta.activePlan),
    activePlanPath: path.join(taskDir, normalizePlanFile(meta.activePlan)),
  };

  if (createdTask) {
    task.meta.createdAt = now;
  }

  return task;
}

export function saveTaskMeta(task: TaskContext): void {
  task.meta.updatedAt = new Date().toISOString();
  withFileLock(task.metaPath, () => {
    fs.writeFileSync(task.metaPath, `${JSON.stringify(task.meta, null, 2)}\n`, "utf-8");
  });
}

export function resolveTaskName(taskName: string): string {
  const normalized = normalizeTaskName(taskName);
  if (!normalized || !isValidTaskName(normalized)) {
    throw new ClawError("TASK_NAME_INVALID", `Invalid task name "${taskName}".`, { taskName });
  }
  return normalized;
}

function readProjectConfig(projectJsonPath: string): ProjectConfig {
  try {
    return normalizeProjectConfig(readJsonFile<ProjectConfig>(projectJsonPath));
  } catch (error) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Failed to parse .claw/project.json.", {
      path: projectJsonPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeProjectConfig(projectConfig: ProjectConfig): ProjectConfig {
  const { autoAchieveTask: _autoAchieveTask, ...rest } = projectConfig as ProjectConfig & {
    autoAchieveTask?: unknown;
  };
  return {
    ...rest,
    maxTasksToKeep:
      Number.isInteger(projectConfig.maxTasksToKeep) && (projectConfig.maxTasksToKeep as number) >= 1
        ? projectConfig.maxTasksToKeep
        : 99,
    externalTruthSkill: normalizeOptionalSkill(projectConfig.externalTruthSkill),
    externalAdrSkill: normalizeOptionalSkill(projectConfig.externalAdrSkill),
    contextPaths: [...(projectConfig.contextPaths ?? [])],
    memory: {
      externalDocPaths: [...(projectConfig.memory?.externalDocPaths ?? [])],
      embedding: normalizeMemoryEmbeddingConfig(projectConfig.memory?.embedding),
    },
    gitnexus: {
      enabled: projectConfig.gitnexus?.enabled ?? false,
    },
  };
}

function deriveProjectId(projectRoot: string, projectConfig: ProjectConfig | null): string {
  const candidates = [projectConfig?.id, projectConfig?.name, path.basename(projectRoot)];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = normalizeTaskName(candidate);
    if (normalized) {
      return normalized;
    }
  }
  throw new ClawError("PROJECT_ROOT_NOT_FOUND", "Unable to derive a project id.", { projectRoot });
}

function normalizeOptionalSkill(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeMemoryEmbeddingConfig(value: MemoryEmbeddingConfig | null | undefined): MemoryEmbeddingConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const provider = value.provider === "local" ? "local" : "openai";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!model) {
    return null;
  }

  return {
    provider,
    model,
    ...(value.remote
      ? {
          remote: {
            ...(typeof value.remote.apiKeyEnvVar === "string" && value.remote.apiKeyEnvVar.trim()
              ? { apiKeyEnvVar: value.remote.apiKeyEnvVar.trim() }
              : {}),
            ...(typeof value.remote.baseUrl === "string" && value.remote.baseUrl.trim()
              ? { baseUrl: value.remote.baseUrl.trim() }
              : {}),
          },
        }
      : {}),
    ...(value.local
      ? {
          local: {
            ...(typeof value.local.modelPath === "string" && value.local.modelPath.trim()
              ? { modelPath: value.local.modelPath.trim() }
              : {}),
            ...(typeof value.local.modelCacheDir === "string" && value.local.modelCacheDir.trim()
              ? { modelCacheDir: value.local.modelCacheDir.trim() }
              : {}),
            ...((value.local.device === "dml" ||
              value.local.device === "cuda" ||
              value.local.device === "cpu" ||
              value.local.device === "wasm")
              ? { device: value.local.device }
              : {}),
          },
        }
      : {}),
    ...(Number.isInteger(value.outputDimensionality) && (value.outputDimensionality as number) > 0
      ? { outputDimensionality: value.outputDimensionality as number }
      : {}),
    store: {
      vector: {
        enabled: value.store?.vector?.enabled ?? true,
        ...(typeof value.store?.vector?.extensionPath === "string" && value.store.vector.extensionPath.trim()
          ? { extensionPath: value.store.vector.extensionPath.trim() }
          : {}),
      },
    },
  };
}
