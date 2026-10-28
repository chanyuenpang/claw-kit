import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCAL_EMBEDDING_MODEL,
} from "./embedding-defaults.js";
import { ClawError, withExecutionFailure } from "./errors.js";
import { previewProjectConfig, resolveProjectContext } from "./context.js";
import { withFileLock, writeJsonFileAtomic } from "./io.js";
import { findProjectRoot, normalizeTaskName } from "./paths.js";
import {
  DEFAULT_KNOWLEDGE_DATED_SECTIONS_TO_KEEP,
  DEFAULT_MAX_TASKS_TO_KEEP,
} from "./project-defaults.js";
import { markTaskLayoutMigrationComplete } from "./task-layout-migration.js";
import type { ProjectConfig } from "./types.js";

const CORE_VERSION = readCoreVersion();

export type InitProjectInput = {
  cwd: string;
  version?: string;
  projectId?: string;
  projectName?: string;
  maxTasksToKeep?: number;
  planning?: boolean;
  externalPlanningSkill?: string | null;
  externalWriterSkill?: string | null;
  contextPaths?: string[];
  externalDocPaths?: string[];
  gitnexusEnabled?: boolean;
  force?: boolean;
};

export type InitProjectResult = {
  projectRoot: string;
  clawDir: string;
  projectJsonPath: string;
  created: boolean;
  projectId: string;
  projectName: string;
  createdPaths: string[];
};

const CLAW_GITIGNORE_BLOCK = [
  "# claw-kit",
  ".claw/*",
  "!.claw/project.json",
  "!.claw/truth/",
  "!.claw/truth/**",
  ".claw/project-override.json",
].join("\n");

/** Default configuration has one owner for explicit init and automatic setup. */
export function buildDefaultProjectConfig(input: InitProjectInput): ProjectConfig & { id: string; name: string } {
  const projectRoot = path.resolve(input.cwd);
  const projectName = input.projectName?.trim() || path.basename(projectRoot);
  const projectId = normalizeProjectId(input.projectId ?? projectName, projectRoot);
  const maxTasksToKeep = input.maxTasksToKeep ?? DEFAULT_MAX_TASKS_TO_KEEP;
  const externalWriterSkill = normalizeOptionalSkill(input.externalWriterSkill);
  validateMaxTasksToKeep(maxTasksToKeep, projectRoot);
  return {
    version: normalizeVersion(input.version),
    id: projectId,
    name: projectName,
    maxTasksToKeep,
    planning: input.planning ?? true,
    autoUpdate: true,
    goalMode: true,
    knowledgeWriter: {
      externalSkills: externalWriterSkill ? [externalWriterSkill] : [],
      model: null,
      reasoningEffort: "medium",
      datedSectionsToKeep: DEFAULT_KNOWLEDGE_DATED_SECTIONS_TO_KEEP,
    },
    externalPlanningSkill: normalizeOptionalSkill(input.externalPlanningSkill),
    defaultPlanTemplate: null,
    contextPaths: [...(input.contextPaths ?? [])],
    memory: {
      enabled: true,
      autoUpdate: true,
      externalDocPaths: [...(input.externalDocPaths ?? [])],
      embedding: {
        enabled: false,
        provider: "local",
        model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      },
    },
    gitnexus: input.gitnexusEnabled ?? false,
  };
}

/** Complete only missing local project scaffolding. Call after request and
 * canonical-focus validation; this never installs tools or rewrites existing
 * project configuration, overrides, or Truth. */
export function ensureProjectEnvironment(cwd: string): InitProjectResult {
  const projectRoot = findProjectRoot(cwd) ?? path.resolve(cwd);
  const clawDir = path.join(projectRoot, ".claw");
  const projectJsonPath = path.join(clawDir, "project.json");
  const existed = fs.existsSync(clawDir);
  const defaults = buildDefaultProjectConfig({ cwd: projectRoot });
  // Validate existing configuration before any scaffolding/lock-file writes.
  try { previewProjectConfig(projectRoot, defaults); }
  catch (error) { throw withExecutionFailure(error, { phase: "prepare", outcome: "known", effect: "none" }); }
  const createdPaths: string[] = [];
  let entered = false;
  try {
    return withFileLock(projectJsonPath, () => {
      entered = true;
      const tasksDir = path.join(clawDir, "tasks");
      const hadTasks = fs.existsSync(tasksDir);
      if (!existed) createdPaths.push(clawDir);
      if (!fs.existsSync(projectJsonPath)) {
        writeJsonFileAtomic(projectJsonPath, defaults);
        createdPaths.push(projectJsonPath);
      }
      // Re-read under the same owner lock, including a concurrently created file.
      const project = resolveProjectContext(projectRoot);
      for (const dir of [project.truthDir, tasksDir, path.join(clawDir, "runtime", "tmp")]) {
        ensureDir(dir, createdPaths);
      }
      if (!hadTasks) createdPaths.push(markTaskLayoutMigrationComplete(clawDir));
      ensureClawGitignoreRules(path.join(projectRoot, ".gitignore"), createdPaths);
      return { projectRoot, clawDir, projectJsonPath, created: !existed,
        projectId: project.projectId, projectName: project.projectName ?? defaults.name, createdPaths };
    });
  } catch (error) {
    if (!entered && existed && error instanceof ClawError && error.code === "PLAN_WRITE_CONFLICT") {
      throw withExecutionFailure(error, { phase: "initialize", outcome: "known", effect: "none" });
    }
    const cause = error instanceof ClawError ? error : new ClawError("PROJECT_INITIALIZATION_FAILED",
      error instanceof Error ? error.message : String(error), { projectRoot, createdPaths });
    throw withExecutionFailure(cause, { phase: "initialize", outcome: "unknown", effect: "unknown" });
  }
}

export function initProject(input: InitProjectInput): InitProjectResult {
  const projectRoot = path.resolve(input.cwd);
  const clawDir = path.join(projectRoot, ".claw");
  const projectJsonPath = path.join(clawDir, "project.json");
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const truthDir = path.join(clawDir, "truth");
  const tasksDir = path.join(clawDir, "tasks");
  const runtimeTmpDir = path.join(clawDir, "runtime", "tmp");

  const createdPaths: string[] = [];
  const exists = fs.existsSync(clawDir);
  if (exists && !input.force) {
    throw new ClawError("PROJECT_ALREADY_INITIALIZED", `Project already contains .claw at ${clawDir}.`, {
      clawDir,
    });
  }

  const projectConfig = buildDefaultProjectConfig(input);
  const { id: projectId, name: projectName } = projectConfig;

  ensureDir(clawDir, createdPaths);
  ensureDir(truthDir, createdPaths);
  ensureDir(tasksDir, createdPaths);
  ensureDir(runtimeTmpDir, createdPaths);
  const taskLayoutMaintenancePath = markTaskLayoutMigrationComplete(clawDir);
  createdPaths.push(taskLayoutMaintenancePath);

  writeFile(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, createdPaths);
  ensureClawGitignoreRules(gitignorePath, createdPaths);

  return {
    projectRoot,
    clawDir,
    projectJsonPath,
    created: !exists,
    projectId,
    projectName,
    createdPaths,
  };
}

function normalizeProjectId(candidate: string, projectRoot: string): string {
  const normalized = normalizeTaskName(candidate).toLowerCase();
  if (!normalized) {
    throw new ClawError("PROJECT_ROOT_NOT_FOUND", "Unable to derive a project id for claw init.", {
      projectRoot,
      candidate,
    });
  }
  return normalized;
}

function validateMaxTasksToKeep(value: number, projectRoot: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "maxTasksToKeep must be an integer greater than or equal to 1.", {
      projectRoot,
      value,
    });
  }
}

function normalizeOptionalSkill(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeVersion(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return CORE_VERSION;
  }
  const trimmed = value.trim();
  return trimmed || CORE_VERSION;
}

function readCoreVersion(): string {
  const packageJsonPath = new URL("../../package.json", import.meta.url);
  const raw = fs.readFileSync(packageJsonPath, "utf-8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
    throw new Error("packages/core/package.json is missing a valid version string.");
  }
  return parsed.version.trim();
}

function ensureDir(dirPath: string, createdPaths: string[]): void {
  if (fs.existsSync(dirPath)) {
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  createdPaths.push(dirPath);
}

function writeFile(filePath: string, content: string, createdPaths: string[]): void {
  fs.writeFileSync(filePath, content, "utf-8");
  createdPaths.push(filePath);
}

function ensureClawGitignoreRules(gitignorePath: string, createdPaths: string[]): void {
  const existed = fs.existsSync(gitignorePath);
  const existing = existed ? fs.readFileSync(gitignorePath, "utf-8") : "";
  if (existing.includes(CLAW_GITIGNORE_BLOCK)) {
    return;
  }

  const nextContent = existing.trim().length > 0
    ? `${existing.replace(/\s*$/, "")}\n\n${CLAW_GITIGNORE_BLOCK}\n`
    : `${CLAW_GITIGNORE_BLOCK}\n`;
  fs.writeFileSync(gitignorePath, nextContent, "utf-8");
  if (!existed || !createdPaths.includes(gitignorePath)) {
    createdPaths.push(gitignorePath);
  }
}
