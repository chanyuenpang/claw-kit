import fs from "node:fs";
import path from "node:path";
import { ClawError } from "./errors.js";
import { findProjectRoot, normalizeTaskName } from "./paths.js";
import type {
  ProjectConfig,
  ProjectProtocolCheckResult,
  ProjectProtocolEnsureResult,
  ProjectProtocolIssue,
} from "./types.js";

const DEFAULT_MAX_TASKS_TO_KEEP = 99;

export function checkProjectProtocol(cwd: string): ProjectProtocolCheckResult {
  const projectRoot = findRequiredProjectRoot(cwd);
  const projectJsonPath = path.join(projectRoot, ".claw", "project.json");
  const { raw, issues } = readRawProjectConfig(projectJsonPath);
  if (raw !== undefined) {
    validateProjectConfig(raw, issues);
  }

  return {
    ok: issues.length === 0,
    projectRoot,
    projectJsonPath,
    issues,
  };
}

export function ensureProjectProtocol(cwd: string): ProjectProtocolEnsureResult {
  const projectRoot = findRequiredProjectRoot(cwd);
  const projectJsonPath = path.join(projectRoot, ".claw", "project.json");
  const { raw, issues } = readRawProjectConfig(projectJsonPath);
  if (raw !== undefined) {
    validateProjectConfig(raw, issues);
  }

  const normalized = normalizeProjectConfig(raw, projectRoot);
  const normalizedText = `${JSON.stringify(normalized, null, 2)}\n`;
  const previousText = fs.existsSync(projectJsonPath) ? fs.readFileSync(projectJsonPath, "utf-8") : null;
  const changed = previousText !== normalizedText;

  if (changed) {
    fs.mkdirSync(path.dirname(projectJsonPath), { recursive: true });
    fs.writeFileSync(projectJsonPath, normalizedText, "utf-8");
  }

  return {
    ok: true,
    changed,
    projectRoot,
    projectJsonPath,
    issueCountBefore: issues.length,
    issueCountAfter: 0,
    fixedPaths: collectFixedPaths(issues, changed),
    issuesBefore: issues,
    issuesAfter: [],
    projectConfig: normalized,
  };
}

function findRequiredProjectRoot(cwd: string): string {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) {
    throw new ClawError("CLAW_DIR_NOT_FOUND", `No .claw directory was found from ${cwd}.`, { cwd });
  }
  return projectRoot;
}

function readRawProjectConfig(projectJsonPath: string): {
  raw: unknown | undefined;
  issues: ProjectProtocolIssue[];
} {
  if (!fs.existsSync(projectJsonPath)) {
    return {
      raw: undefined,
      issues: [{ path: "project.json", message: "Missing .claw/project.json." }],
    };
  }

  try {
    return {
      raw: JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")),
      issues: [],
    };
  } catch (error) {
    return {
      raw: undefined,
      issues: [
        {
          path: "project.json",
          message: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

function normalizeProjectConfig(raw: unknown, projectRoot: string): ProjectConfig {
  const source = asObject(raw);
  const { autoAchieveTask: _autoAchieveTask, ...sourceWithoutLegacyAutoAchieve } = source ?? {};
  const sourceMemory = asObject(source?.memory);
  const sourceGitnexus = asObject(source?.gitnexus);
  const maxTasksToKeep = source?.maxTasksToKeep;

  return {
    ...sourceWithoutLegacyAutoAchieve,
    id: deriveProjectId(source, projectRoot),
    name: deriveProjectName(source, projectRoot),
    maxTasksToKeep:
      Number.isInteger(maxTasksToKeep) && (maxTasksToKeep as number) >= 1
        ? (maxTasksToKeep as number)
        : DEFAULT_MAX_TASKS_TO_KEEP,
    externalTruthSkill: normalizeOptionalSkill(source?.externalTruthSkill),
    externalAdrSkill: normalizeOptionalSkill(source?.externalAdrSkill),
    contextPaths: normalizeStringArray(source?.contextPaths),
    memory: {
      ...sourceMemory,
      externalDocPaths: normalizeStringArray(sourceMemory?.externalDocPaths),
    },
    gitnexus: {
      ...sourceGitnexus,
      enabled: typeof sourceGitnexus?.enabled === "boolean" ? sourceGitnexus.enabled : false,
    },
  };
}

function deriveProjectId(source: Record<string, unknown> | null, projectRoot: string): string {
  const id = source ? readNonEmptyString(source.id) : undefined;
  const name = source ? readNonEmptyString(source.name) : undefined;
  const candidates = [id, name, path.basename(projectRoot)];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = normalizeTaskName(candidate).toLowerCase();
    if (normalized) {
      return normalized;
    }
  }
  throw new ClawError("PROJECT_ROOT_NOT_FOUND", "Unable to derive a project id.", { projectRoot });
}

function deriveProjectName(source: Record<string, unknown> | null, projectRoot: string): string {
  return (source ? readNonEmptyString(source.name) : undefined) ?? path.basename(projectRoot);
}

function collectFixedPaths(issues: ProjectProtocolIssue[], changed: boolean): string[] {
  const paths = new Set(issues.map((issue) => issue.path));
  if (changed && paths.size === 0) {
    paths.add("project.json");
  }
  return [...paths];
}

function validateProjectConfig(raw: unknown, issues: ProjectProtocolIssue[]): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({ path: "project.json", message: "project.json must contain a JSON object." });
    return;
  }

  const config = raw as Record<string, unknown>;
  requireString(config, "id", issues);
  requireString(config, "name", issues);
  requireIntegerAtLeast(config, "maxTasksToKeep", 1, issues);
  requireNullableString(config, "externalTruthSkill", issues);
  requireNullableString(config, "externalAdrSkill", issues);
  requireStringArray(config, "contextPaths", issues);

  const memory = requireObject(config, "memory", issues);
  if (memory) {
    requireStringArray(memory, "externalDocPaths", issues, "memory.externalDocPaths");
  }

  const gitnexus = requireObject(config, "gitnexus", issues);
  if (gitnexus) {
    requireBoolean(gitnexus, "enabled", issues, "gitnexus.enabled");
  }
}

function requireString(
  source: Record<string, unknown>,
  key: string,
  issues: ProjectProtocolIssue[],
  label = key,
): void {
  if (!(key in source)) {
    issues.push({ path: label, message: "Field is required and must be explicitly present." });
    return;
  }
  if (typeof source[key] !== "string" || !String(source[key]).trim()) {
    issues.push({ path: label, message: "Field must be a non-empty string." });
  }
}

function requireNullableString(
  source: Record<string, unknown>,
  key: string,
  issues: ProjectProtocolIssue[],
  label = key,
): void {
  if (!(key in source)) {
    issues.push({ path: label, message: "Field is required and must be explicitly present." });
    return;
  }
  const value = source[key];
  if (value !== null && typeof value !== "string") {
    issues.push({ path: label, message: "Field must be a string or null." });
  }
}

function requireBoolean(
  source: Record<string, unknown>,
  key: string,
  issues: ProjectProtocolIssue[],
  label = key,
): void {
  if (!(key in source)) {
    issues.push({ path: label, message: "Field is required and must be explicitly present." });
    return;
  }
  if (typeof source[key] !== "boolean") {
    issues.push({ path: label, message: "Field must be a boolean." });
  }
}

function requireIntegerAtLeast(
  source: Record<string, unknown>,
  key: string,
  minimum: number,
  issues: ProjectProtocolIssue[],
  label = key,
): void {
  if (!(key in source)) {
    issues.push({ path: label, message: "Field is required and must be explicitly present." });
    return;
  }
  const value = source[key];
  if (!Number.isInteger(value) || (value as number) < minimum) {
    issues.push({ path: label, message: `Field must be an integer greater than or equal to ${minimum}.` });
  }
}

function requireStringArray(
  source: Record<string, unknown>,
  key: string,
  issues: ProjectProtocolIssue[],
  label = key,
): void {
  if (!(key in source)) {
    issues.push({ path: label, message: "Field is required and must be explicitly present." });
    return;
  }
  const value = source[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    issues.push({ path: label, message: "Field must be an array of strings." });
  }
}

function requireObject(
  source: Record<string, unknown>,
  key: string,
  issues: ProjectProtocolIssue[],
  label = key,
): Record<string, unknown> | null {
  if (!(key in source)) {
    issues.push({ path: label, message: "Field is required and must be explicitly present." });
    return null;
  }
  const value = source[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ path: label, message: "Field must be an object." });
    return null;
  }
  return value as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalSkill(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
