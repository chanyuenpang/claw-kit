import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCAL_EMBEDDING_CACHE_DIR,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
} from "./embedding-defaults.js";
import { ClawError } from "./errors.js";
import { findProjectRoot, normalizeTaskName } from "./paths.js";
import type {
  MemoryEmbeddingConfig,
  ProjectConfig,
  ProjectProtocolCheckResult,
  ProjectProtocolEnsureResult,
  ProjectProtocolIssue,
} from "./types.js";

const DEFAULT_MAX_TASKS_TO_KEEP = 99;
const CORE_VERSION = readCoreVersion();
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
  const {
    version: _version,
    id: _id,
    name: _name,
    maxTasksToKeep: _maxTasksToKeep,
    planning: _planning,
    externalPlanningSkill: _externalPlanningSkill,
    externalTruthSkill: _externalTruthSkill,
    externalAdrSkill: _externalAdrSkill,
    defaultPlanTemplate: _defaultPlanTemplate,
    contextPaths: _contextPaths,
    memory: _memory
  } = source ?? {};
  const sourceMemory = asObject(source?.memory);
  const maxTasksToKeep = source?.maxTasksToKeep;

  return {
    version: readNonEmptyString(source?.version) ?? CORE_VERSION,
    id: deriveProjectId(source, projectRoot),
    name: deriveProjectName(source, projectRoot),
    maxTasksToKeep:
      Number.isInteger(maxTasksToKeep) && (maxTasksToKeep as number) >= 1
        ? (maxTasksToKeep as number)
        : DEFAULT_MAX_TASKS_TO_KEEP,
    planning: typeof source?.planning === "boolean" ? source.planning : true,
    goalMode: readBooleanConfig(source?.goalMode, true),
    truthDispatch: readTruthDispatchConfig(source?.truthDispatch, "per_task"),
    externalPlanningSkill: normalizeOptionalSkill(source?.externalPlanningSkill),
    externalTruthSkill: normalizeOptionalSkill(source?.externalTruthSkill),
    externalAdrSkill: normalizeOptionalSkill(source?.externalAdrSkill),
    defaultPlanTemplate: normalizeOptionalTemplateName(source?.defaultPlanTemplate),
    contextPaths: normalizeStringArray(source?.contextPaths),
    memory: {
      enabled: typeof sourceMemory?.enabled === "boolean" ? sourceMemory.enabled : true,
      externalDocPaths: normalizeStringArray(sourceMemory?.externalDocPaths),
      embedding: normalizeMemoryEmbeddingConfig(sourceMemory?.embedding),
    },
    gitnexus: readBooleanConfig(source?.gitnexus, false),
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
  requireString(config, "version", issues);
  requireString(config, "id", issues);
  requireString(config, "name", issues);
  requireIntegerAtLeast(config, "maxTasksToKeep", 1, issues);
  requireBoolean(config, "planning", issues);
  requireBoolean(config, "goalMode", issues);
  requireTruthDispatchString(config, "truthDispatch", issues);
  requireNullableString(config, "externalPlanningSkill", issues);
  requireNullableString(config, "externalTruthSkill", issues);
  requireNullableString(config, "externalAdrSkill", issues);
  requireNullableString(config, "defaultPlanTemplate", issues);
  requireStringArray(config, "contextPaths", issues);
  requireBoolean(config, "gitnexus", issues);

  const memory = requireObject(config, "memory", issues);
  if (memory) {
    requireBoolean(memory, "enabled", issues, "memory.enabled");
    requireStringArray(memory, "externalDocPaths", issues, "memory.externalDocPaths");
    requireNullableEmbeddingConfig(memory, "embedding", issues, "memory.embedding");
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

function requireTruthDispatchString(
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
  if (value !== "per_task" && value !== "final_only") {
    issues.push({ path: label, message: 'Field must be "per_task" or "final_only".' });
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

function normalizeOptionalTemplateName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBooleanConfig(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readTruthDispatchConfig(
  value: unknown,
  fallback: "per_task" | "final_only",
): "per_task" | "final_only" {
  if (value === "per_task" || value === "final_only") {
    return value;
  }
  return fallback;
}

function normalizeMemoryEmbeddingConfig(value: unknown): MemoryEmbeddingConfig | null {
  const embedding = asObject(value);
  if (!embedding) {
    return {
      provider: "local",
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
    };
  }

  const remote = asObject(embedding.remote);
  const local = asObject(embedding.local);
  const provider = embedding.provider === "local" ? "local" : "openai";
  const model = readNonEmptyString(embedding.model);
  if (!model) {
    return {
      provider: "local",
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
    };
  }

  return {
    provider,
    model,
    ...(remote
      ? {
          remote: {
            ...(readNonEmptyString(remote.apiKeyEnvVar) ? { apiKeyEnvVar: readNonEmptyString(remote.apiKeyEnvVar) } : {}),
            ...(readNonEmptyString(remote.baseUrl) ? { baseUrl: readNonEmptyString(remote.baseUrl) } : {}),
          },
        }
      : {}),
    ...(local
      ? {
          local: normalizeLocalEmbeddingConfig(local),
        }
      : {}),
    ...(Number.isInteger(embedding.outputDimensionality) && (embedding.outputDimensionality as number) > 0
      ? { outputDimensionality: embedding.outputDimensionality as number }
      : {}),
  };
}

function normalizeLocalEmbeddingConfig(local: Record<string, unknown>): Record<string, unknown> | undefined {
  const normalized: Record<string, unknown> = {};
  const modelPath = readNonEmptyString(local.modelPath);
  const modelCacheDir = readNonEmptyString(local.modelCacheDir);

  if (modelPath) {
    normalized.modelPath = modelPath;
  }
  if (modelCacheDir && modelCacheDir !== DEFAULT_LOCAL_EMBEDDING_CACHE_DIR) {
    normalized.modelCacheDir = modelCacheDir;
  }
  if (local.device === "dml" || local.device === "cuda" || local.device === "cpu" || local.device === "wasm") {
    normalized.device = local.device;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function requireNullableEmbeddingConfig(
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
  if (value === null) {
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ path: label, message: "Field must be an object or null." });
    return;
  }

  const embedding = value as Record<string, unknown>;
  const provider = embedding.provider;
  if (provider !== "openai" && provider !== "local") {
    issues.push({ path: `${label}.provider`, message: 'Field must be "openai" or "local".' });
  }
  if (typeof embedding.model !== "string" || !String(embedding.model).trim()) {
    issues.push({ path: `${label}.model`, message: "Field must be a non-empty string." });
  }

  const remote = embedding.remote;
  if (remote !== undefined) {
    if (!remote || typeof remote !== "object" || Array.isArray(remote)) {
      issues.push({ path: `${label}.remote`, message: "Field must be an object when present." });
    } else {
      const remoteObject = remote as Record<string, unknown>;
      if ("apiKeyEnvVar" in remoteObject && typeof remoteObject.apiKeyEnvVar !== "string") {
        issues.push({ path: `${label}.remote.apiKeyEnvVar`, message: "Field must be a string when present." });
      }
      if ("baseUrl" in remoteObject && typeof remoteObject.baseUrl !== "string") {
        issues.push({ path: `${label}.remote.baseUrl`, message: "Field must be a string when present." });
      }
    }
  }

  const local = embedding.local;
  if (local !== undefined) {
    if (!local || typeof local !== "object" || Array.isArray(local)) {
      issues.push({ path: `${label}.local`, message: "Field must be an object when present." });
    } else {
      const localObject = local as Record<string, unknown>;
      if ("modelPath" in localObject && typeof localObject.modelPath !== "string") {
        issues.push({ path: `${label}.local.modelPath`, message: "Field must be a string when present." });
      }
      if ("modelCacheDir" in localObject && typeof localObject.modelCacheDir !== "string") {
        issues.push({ path: `${label}.local.modelCacheDir`, message: "Field must be a string when present." });
      }
      if (
        "device" in localObject &&
        localObject.device !== "dml" &&
        localObject.device !== "cuda" &&
        localObject.device !== "cpu" &&
        localObject.device !== "wasm"
      ) {
        issues.push({
          path: `${label}.local.device`,
          message: 'Field must be "dml", "cuda", "cpu", or "wasm" when present.',
        });
      }
    }
  }

  if ("outputDimensionality" in embedding) {
    const value = embedding.outputDimensionality;
    if (!Number.isInteger(value) || (value as number) < 1) {
      issues.push({ path: `${label}.outputDimensionality`, message: "Field must be a positive integer when present." });
    }
  }

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
