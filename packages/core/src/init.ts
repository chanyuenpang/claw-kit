import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCAL_EMBEDDING_MODEL,
} from "./embedding-defaults.js";
import { ClawError } from "./errors.js";
import { normalizeTaskName } from "./paths.js";
import { ensureUtf8Bom } from "./text-encoding.js";
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

export function initProject(input: InitProjectInput): InitProjectResult {
  const projectRoot = path.resolve(input.cwd);
  const clawDir = path.join(projectRoot, ".claw");
  const projectJsonPath = path.join(clawDir, "project.json");
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const memoryPath = path.join(clawDir, "memory.md");
  const truthDir = path.join(clawDir, "truth");
  const tasksDir = path.join(clawDir, "tasks");
  const knowledgeDir = path.join(clawDir, ".knowledge");

  const createdPaths: string[] = [];
  const exists = fs.existsSync(clawDir);
  if (exists && !input.force) {
    throw new ClawError("PROJECT_ALREADY_INITIALIZED", `Project already contains .claw at ${clawDir}.`, {
      clawDir,
    });
  }

  const projectName = input.projectName?.trim() || path.basename(projectRoot);
  const projectId = normalizeProjectId(input.projectId ?? projectName, projectRoot);
  const maxTasksToKeep = input.maxTasksToKeep ?? 99;
  validateMaxTasksToKeep(maxTasksToKeep, projectRoot);
  const projectConfig: ProjectConfig = {
    version: normalizeVersion(input.version),
    id: projectId,
    name: projectName,
    maxTasksToKeep,
    planning: input.planning ?? true,
    autoUpdate: true,
    goalMode: true,
    knowledgeWriter: {
      externalSkill: normalizeOptionalSkill(input.externalWriterSkill),
      model: null,
      reasoningEffort: "medium",
    },
    externalPlanningSkill: normalizeOptionalSkill(input.externalPlanningSkill),
    defaultPlanTemplate: null,
    contextPaths: [...(input.contextPaths ?? [])],
    memory: {
      enabled: true,
      externalDocPaths: [...(input.externalDocPaths ?? [])],
      embedding: {
        provider: "local",
        model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      },
    },
    gitnexus: input.gitnexusEnabled ?? false,
  };

  ensureDir(clawDir, createdPaths);
  ensureDir(truthDir, createdPaths);
  ensureDir(tasksDir, createdPaths);
  ensureDir(knowledgeDir, createdPaths);
  const taskLayoutMarkerPath = markTaskLayoutMigrationComplete(clawDir);
  createdPaths.push(taskLayoutMarkerPath);

  writeFile(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, createdPaths);
  writeFile(
    memoryPath,
    `# Project Memory\n\n- Project initialized for claw-kit.\n- Use \`claw plan create\` to establish the first task scope.\n`,
    createdPaths,
  );
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
  const nextContent = /\.md$/i.test(filePath) ? ensureUtf8Bom(content) : content;
  fs.writeFileSync(filePath, nextContent, "utf-8");
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
