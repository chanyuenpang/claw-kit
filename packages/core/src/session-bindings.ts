import fs from "node:fs";
import path from "node:path";
import { readJsonFile, withFileLock, writeJsonFile } from "./io.js";
import { ensureInsideDir } from "./paths.js";
import type { ProjectContext } from "./types.js";

type SessionBindingRegistry = {
  version: 1;
  bindings: Record<string, string>;
};

const SESSION_SCOPE_BINDING_KEY = "$session";

export function sessionBindingRegistryPath(project: ProjectContext): string {
  return path.join(project.clawDir, "runtime", "session-bindings.json");
}

export function bindSessionToPlan(project: ProjectContext, sessionKey: string | undefined, planPath: string): void {
  const normalizedKey = bindingKey(project, sessionKey);
  if (!normalizedKey) {
    return;
  }
  const relativePath = toBoundPlanPath(project, planPath);
  updateRegistry(project, (registry) => {
    registry.bindings[normalizedKey] = relativePath;
  });
}

export function unbindSession(project: ProjectContext, sessionKey: string | undefined): void {
  const normalizedKey = bindingKey(project, sessionKey);
  if (!normalizedKey) {
    return;
  }
  updateRegistry(project, (registry) => {
    delete registry.bindings[normalizedKey];
  });
}

export function resolveSessionBoundPlan(project: ProjectContext, sessionKey: string | undefined): string | null {
  const normalizedKey = bindingKey(project, sessionKey);
  if (!normalizedKey) {
    return null;
  }
  const registry = readRegistry(project);
  const relativePath = registry.bindings[normalizedKey];
  if (!relativePath) {
    return null;
  }
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  const taskRelativePath = normalizedRelative.startsWith("tasks/") ? normalizedRelative.slice("tasks/".length) : "";
  const planPath = taskRelativePath ? ensureInsideDir(project.tasksDir, taskRelativePath) : null;
  if (!planPath || !fs.existsSync(planPath)) {
    unbindSession(project, normalizedKey);
    return null;
  }
  return planPath;
}

function bindingKey(project: ProjectContext, sessionKey: string | undefined): string | undefined {
  if (project.scope === "session") {
    return sessionKey?.trim() ? SESSION_SCOPE_BINDING_KEY : undefined;
  }
  return sessionKey?.trim() || undefined;
}

function toBoundPlanPath(project: ProjectContext, planPath: string): string {
  const absolutePlanPath = path.resolve(planPath);
  const relativeToTasks = path.relative(project.tasksDir, absolutePlanPath);
  const checkedPath = ensureInsideDir(project.tasksDir, relativeToTasks);
  if (!checkedPath || checkedPath !== absolutePlanPath || relativeToTasks.startsWith("..") || path.isAbsolute(relativeToTasks)) {
    throw new Error(`Session binding plan path must stay inside ${project.tasksDir}: ${planPath}`);
  }
  return path.posix.join("tasks", relativeToTasks.replace(/\\/g, "/"));
}

function updateRegistry(project: ProjectContext, update: (registry: SessionBindingRegistry) => void): void {
  const registryPath = sessionBindingRegistryPath(project);
  withFileLock(registryPath, () => {
    const registry = readRegistry(project);
    update(registry);
    if (Object.keys(registry.bindings).length === 0) {
      if (fs.existsSync(registryPath)) {
        fs.unlinkSync(registryPath);
      }
      return;
    }
    writeJsonFile(registryPath, registry);
  });
}

function readRegistry(project: ProjectContext): SessionBindingRegistry {
  const registryPath = sessionBindingRegistryPath(project);
  if (!fs.existsSync(registryPath)) {
    return { version: 1, bindings: {} };
  }
  try {
    const registry = readJsonFile<Partial<SessionBindingRegistry>>(registryPath);
    return {
      version: 1,
      bindings: registry.bindings && typeof registry.bindings === "object" ? registry.bindings : {},
    };
  } catch {
    return { version: 1, bindings: {} };
  }
}
