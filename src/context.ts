import fs from "node:fs";
import path from "node:path";
import { AttachError, type AttachResult } from "./types.js";
import { ensureInsideTaskDir, findProjectRoot, isValidTaskName, normalizeTaskName } from "./paths.js";

type ProjectConfig = {
  id?: string;
  name?: string;
};

type TaskMeta = {
  name: string;
  description: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  subagents: unknown[];
  status?: string;
  activePlan?: string;
  [key: string]: unknown;
};

export function resolveProjectContext(cwd: string): AttachResult {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) {
    throw new AttachError(
      "CLAW_DIR_NOT_FOUND",
      `No .claw directory was found from ${cwd}.`,
      { cwd },
    );
  }

  const clawDir = path.join(projectRoot, ".claw");
  const projectConfig = readProjectConfig(path.join(clawDir, "project.json"));
  const projectId = deriveProjectId(projectRoot, projectConfig);
  const projectName = projectConfig?.name;

  return {
    projectRoot,
    clawDir,
    projectId,
    ...(projectName ? { projectName } : {}),
  };
}

export function resolveTaskContext(projectContext: AttachResult, taskName: string): AttachResult {
  const resolvedTaskName = resolveTaskName(taskName);
  const taskDir = path.join(projectContext.clawDir, "tasks", resolvedTaskName);
  const metaPath = path.join(taskDir, "meta.json");

  if (!fs.existsSync(metaPath)) {
    throw new AttachError("TASK_NOT_FOUND", `Task "${resolvedTaskName}" does not exist.`, {
      taskName: resolvedTaskName,
    });
  }

  const meta = readTaskMeta(metaPath);
  const activePlan = typeof meta.activePlan === "string" && meta.activePlan.trim() ? meta.activePlan : "plan.json";
  const activePlanPath = ensureInsideTaskDir(taskDir, activePlan);

  if (!activePlanPath) {
    throw new AttachError("ACTIVE_PLAN_INVALID", `Task "${resolvedTaskName}" has an invalid activePlan.`, {
      taskName: resolvedTaskName,
      activePlan,
    });
  }

  if (!fs.existsSync(activePlanPath)) {
    throw new AttachError(
      "ACTIVE_PLAN_MISSING",
      `Task "${resolvedTaskName}" points to a missing active plan file.`,
      { taskName: resolvedTaskName, activePlan },
    );
  }

  return {
    ...projectContext,
    taskName: resolvedTaskName,
    taskDir,
    activePlan: path.relative(taskDir, activePlanPath).replace(/\\/g, "/"),
    activePlanPath,
    metaPath,
  };
}

function readProjectConfig(projectJsonPath: string): ProjectConfig | null {
  if (!fs.existsSync(projectJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(stripBom(fs.readFileSync(projectJsonPath, "utf-8"))) as ProjectConfig;
  } catch (error) {
    throw new AttachError("PROJECT_CONFIG_INVALID", "Failed to parse .claw/project.json.", {
      path: projectJsonPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function deriveProjectId(projectRoot: string, projectConfig: ProjectConfig | null): string {
  const candidates = [projectConfig?.id, projectConfig?.name, path.basename(projectRoot)];
  for (const candidate of candidates) {
    const normalized = candidate ? normalizeTaskName(candidate) : "";
    if (normalized) {
      return normalized;
    }
  }
  throw new AttachError("PROJECT_ROOT_NOT_FOUND", "Unable to derive a project id.", { projectRoot });
}

function resolveTaskName(taskName: string): string {
  const normalized = normalizeTaskName(taskName);
  if (!normalized || !isValidTaskName(normalized)) {
    throw new AttachError("TASK_NAME_INVALID", `Invalid task name "${taskName}".`, {
      taskName,
    });
  }
  return normalized;
}

function readTaskMeta(metaPath: string): TaskMeta {
  return JSON.parse(stripBom(fs.readFileSync(metaPath, "utf-8"))) as TaskMeta;
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
