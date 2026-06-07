import fs from "node:fs";
import path from "node:path";
import { ClawError } from "./errors.js";
import { normalizeTaskName } from "./paths.js";
import type { ProjectConfig } from "./types.js";

export type InitProjectInput = {
  cwd: string;
  projectId?: string;
  projectName?: string;
  maxTasksToKeep?: number;
  externalTruthSkill?: string | null;
  externalAdrSkill?: string | null;
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

export function initProject(input: InitProjectInput): InitProjectResult {
  const projectRoot = path.resolve(input.cwd);
  const clawDir = path.join(projectRoot, ".claw");
  const projectJsonPath = path.join(clawDir, "project.json");
  const memoryPath = path.join(clawDir, "memory.md");
  const truthSummaryPath = path.join(clawDir, "truth", "SUMMARY.md");
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
    id: projectId,
    name: projectName,
    maxTasksToKeep,
    externalTruthSkill: normalizeOptionalSkill(input.externalTruthSkill),
    externalAdrSkill: normalizeOptionalSkill(input.externalAdrSkill),
    contextPaths: [...(input.contextPaths ?? [])],
    memory: {
      externalDocPaths: [...(input.externalDocPaths ?? [])],
    },
    gitnexus: {
      enabled: input.gitnexusEnabled ?? false,
    },
  };

  ensureDir(clawDir, createdPaths);
  ensureDir(path.dirname(truthSummaryPath), createdPaths);
  ensureDir(tasksDir, createdPaths);
  ensureDir(knowledgeDir, createdPaths);

  writeFile(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, createdPaths);
  writeFile(
    memoryPath,
    `# Project Memory\n\n- Project initialized for claw-kit.\n- Use \`claw plan write\` to establish the first task scope.\n`,
    createdPaths,
  );
  writeFile(
    truthSummaryPath,
    `# ${projectName} Truth Summary\n\n- Project initialized for claw-kit.\n- No durable truth has been recorded yet.\n`,
    createdPaths,
  );

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
