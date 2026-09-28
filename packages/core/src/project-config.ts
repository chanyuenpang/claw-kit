import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ClawError } from "./errors.js";
import { readJsonFile, withFileLock, writeJsonFileAtomic } from "./io.js";
import { validateProjectConfig } from "./project-check.js";
import type { ProjectConfig, ProjectProtocolIssue } from "./types.js";

export type ProjectConfigLayer = "team" | "personal";
type JsonObject = Record<string, unknown>;

export type ProjectConfigSnapshot = {
  projectRoot: string;
  team: JsonObject;
  personal?: JsonObject;
  effective: ProjectConfig;
  revisions: Record<ProjectConfigLayer, string>;
};

export type WriteProjectConfigInput = {
  projectRoot: string;
  layer: ProjectConfigLayer;
  value: unknown;
  expectedRevision: string;
};

export type ProjectConfigKeySnapshot = {
  layer: ProjectConfigLayer;
  path: string;
  present: boolean;
  value?: unknown;
  revision: string;
  effectivePresent: boolean;
  effectiveValue?: unknown;
};

export type SetProjectConfigKeyInput = {
  projectRoot: string;
  layer: ProjectConfigLayer;
  path: string;
  value: unknown;
  expectedRevision: string;
};

export type UnsetProjectConfigKeyInput = Omit<SetProjectConfigKeyInput, "value">;

const TOP_LEVEL_LEAVES = new Set([
  "version", "id", "name", "maxTasksToKeep", "planning", "autoUpdate", "goalMode",
  "externalPlanningSkill", "defaultPlanTemplate", "contextPaths", "gitnexus",
]);
const WRITER_LEAVES = new Set(["executionPolicy", "externalSkills", "model", "reasoningEffort", "datedSectionsToKeep"]);
const HOSTS = new Set(["codex", "dsh", "cindy", "opencode", "openclaw"]);
const MEMORY_LEAVES = new Set(["enabled", "autoUpdate", "externalDocPaths", "embedding"]);

/** The sole mutable boundary for the two project configuration layers. */
export class ProjectConfigRepository {
  read(projectRoot: string): ProjectConfigSnapshot {
    const paths = configPaths(projectRoot);
    const team = readObject(paths.team, "team");
    const personal = fs.existsSync(paths.personal) ? readObject(paths.personal, "personal") : undefined;
    const effectiveRaw = deepMerge(team, personal);
    const issues = validateProjectConfig(effectiveRaw);
    if (issues.length > 0) throw invalidConfigError(paths.team, issues);
    return {
      projectRoot: path.resolve(projectRoot),
      team,
      ...(personal === undefined ? {} : { personal }),
      effective: effectiveRaw as ProjectConfig,
      revisions: { team: revision(team), personal: revision(personal ?? {}) },
    };
  }

  write(input: WriteProjectConfigInput): ProjectConfigSnapshot {
    if (input.layer !== "team" && input.layer !== "personal") {
      throw new ClawError("PROJECT_CONFIG_LAYER_INVALID", `Unknown project configuration layer "${String(input.layer)}".`);
    }
    const next = asObject(input.value, `${input.layer} configuration`);
    const targetPath = configPaths(input.projectRoot)[input.layer];
    try {
      return withFileLock(targetPath, () => {
        // Re-read under the target-layer lock so revision checks cover the atomic rename.
        const current = this.read(input.projectRoot);
        if (current.revisions[input.layer] !== input.expectedRevision) {
          throw new ClawError("PROJECT_CONFIG_CONFLICT", `The ${input.layer} configuration changed before it could be saved.`, {
            layer: input.layer, expectedRevision: input.expectedRevision, actualRevision: current.revisions[input.layer],
          });
        }
        validateLayerWrite(input.layer, targetPath, next, current);
        writeJsonFileAtomic(targetPath, next);
        return this.read(input.projectRoot);
      });
    } catch (error) {
      if (error instanceof ClawError && error.code === "PLAN_WRITE_CONFLICT") {
        throw new ClawError("PROJECT_CONFIG_CONFLICT", `The ${input.layer} configuration is being edited by another process.`, { layer: input.layer, targetPath });
      }
      throw error;
    }
  }

  readKey(projectRoot: string, layer: ProjectConfigLayer, keyPath: string): ProjectConfigKeySnapshot {
    assertLayer(layer);
    const keys = parseKeyPath(keyPath);
    const current = this.read(projectRoot);
    const source = layer === "team" ? current.team : current.personal;
    const found = getAtPath(source, keys);
    const effective = getAtPath(current.effective as unknown as JsonObject, keys);
    return {
      layer, path: keyPath, present: found.present, ...(found.present ? { value: clone(found.value) } : {}),
      effectivePresent: effective.present, ...(effective.present ? { effectiveValue: clone(effective.value) } : {}),
      revision: current.revisions[layer],
    };
  }

  setKey(input: SetProjectConfigKeyInput): ProjectConfigSnapshot {
    assertLayer(input.layer);
    const keys = parseKeyPath(input.path);
    assertJsonValue(input.value);
    return this.mutateKey(input, (next) => setAtPath(next, keys, clone(input.value)));
  }

  unsetKey(input: UnsetProjectConfigKeyInput): ProjectConfigSnapshot {
    assertLayer(input.layer);
    const keys = parseKeyPath(input.path);
    return this.mutateKey(input, (next) => unsetAtPath(next, keys));
  }

  private mutateKey(input: UnsetProjectConfigKeyInput, mutate: (next: JsonObject) => void): ProjectConfigSnapshot {
    const targetPath = configPaths(input.projectRoot)[input.layer];
    try {
      return withFileLock(targetPath, () => {
        const current = this.read(input.projectRoot);
        assertRevision(current, input.layer, input.expectedRevision);
        const next = clone(input.layer === "team" ? current.team : current.personal ?? {}) as JsonObject;
        mutate(next);
        validateLayerWrite(input.layer, targetPath, next, current);
        writeJsonFileAtomic(targetPath, next);
        return this.read(input.projectRoot);
      });
    } catch (error) {
      throw normalizeLockError(error, input.layer, targetPath);
    }
  }
}

export function deepMergeProjectConfig(base: unknown, override: unknown): unknown {
  return deepMerge(base, override);
}

function configPaths(projectRoot: string): Record<ProjectConfigLayer, string> {
  const clawDir = path.join(path.resolve(projectRoot), ".claw");
  return { team: path.join(clawDir, "project.json"), personal: path.join(clawDir, "project-override.json") };
}

function assertLayer(layer: unknown): asserts layer is ProjectConfigLayer {
  if (layer !== "team" && layer !== "personal") throw new ClawError("PROJECT_CONFIG_LAYER_INVALID", "Unknown project configuration layer \"" + String(layer) + "\".");
}

function parseKeyPath(keyPath: string): string[] {
  const keys = keyPath.split(".");
  const approved =
    (keys.length === 1 && TOP_LEVEL_LEAVES.has(keys[0]!)) ||
    (keys.length === 2 && keys[0] === "knowledgeWriter" && WRITER_LEAVES.has(keys[1]!)) ||
    (keys.length === 3 && keys[0] === "knowledgeWriterByHost" && HOSTS.has(keys[1]!) && WRITER_LEAVES.has(keys[2]!)) ||
    (keys.length === 2 && keys[0] === "memory" && MEMORY_LEAVES.has(keys[1]!)) ||
    (keys.length === 2 && keys[0] === "var" && keys[1]!.length > 0);
  if (!approved) throw new ClawError("PROJECT_CONFIG_KEY_INVALID", "Unsupported project configuration key path \"" + keyPath + "\".", { path: keyPath });
  return keys;
}

function getAtPath(source: JsonObject | undefined, keys: string[]): { present: boolean; value?: unknown } {
  let cursor: unknown = source;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor) || !Object.prototype.hasOwnProperty.call(cursor, key)) return { present: false };
    cursor = (cursor as JsonObject)[key];
  }
  return { present: true, value: cursor };
}

function setAtPath(target: JsonObject, keys: string[], value: unknown): void {
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) cursor[key] = {};
    cursor = cursor[key] as JsonObject;
  }
  cursor[keys[keys.length - 1]!] = value;
}

function unsetAtPath(target: JsonObject, keys: string[]): void {
  const ancestors: JsonObject[] = [target];
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) return;
    cursor = existing as JsonObject;
    ancestors.push(cursor);
  }
  delete cursor[keys[keys.length - 1]!];
  for (let index = ancestors.length - 1; index > 0; index -= 1) {
    if (Object.keys(ancestors[index]!).length === 0) delete ancestors[index - 1]![keys[index - 1]!];
  }
}

function assertJsonValue(value: unknown): void {
  try {
    if (value === undefined || JSON.stringify(value) === undefined) throw new Error("not JSON");
  } catch {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Project configuration values must be JSON values.");
  }
}

function assertRevision(current: ProjectConfigSnapshot, layer: ProjectConfigLayer, expectedRevision: string): void {
  if (current.revisions[layer] !== expectedRevision) {
    throw new ClawError("PROJECT_CONFIG_CONFLICT", "The " + layer + " configuration changed before it could be saved.", { layer, expectedRevision, actualRevision: current.revisions[layer] });
  }
}

function validateLayerWrite(layer: ProjectConfigLayer, targetPath: string, next: JsonObject, current: ProjectConfigSnapshot): void {
  if (layer === "team") {
    const teamIssues = validateProjectConfig(next);
    if (teamIssues.length > 0) throw invalidConfigError(targetPath, teamIssues);
  }
  const effectiveRaw = layer === "team" ? deepMerge(next, current.personal) : deepMerge(current.team, next);
  const effectiveIssues = validateProjectConfig(effectiveRaw);
  if (effectiveIssues.length > 0) throw invalidConfigError(targetPath, effectiveIssues);
}

function normalizeLockError(error: unknown, layer: ProjectConfigLayer, targetPath: string): never {
  if (error instanceof ClawError && error.code === "PLAN_WRITE_CONFLICT") {
    throw new ClawError("PROJECT_CONFIG_CONFLICT", "The " + layer + " configuration is being edited by another process.", { layer, targetPath });
  }
  throw error;
}

function readObject(filePath: string, layer: ProjectConfigLayer): JsonObject {
  if (!fs.existsSync(filePath)) {
    throw new ClawError("PROJECT_CONFIG_MISSING", `Missing ${layer} project configuration at ${filePath}.`, { filePath, layer });
  }
  try {
    return asObject(readJsonFile<unknown>(filePath), `${layer} configuration`);
  } catch (error) {
    if (error instanceof ClawError) throw error;
    throw new ClawError("PROJECT_CONFIG_INVALID", `Failed to parse ${layer} project configuration.`, {
      filePath, cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `${label} must be a JSON object.`);
  }
  return value as JsonObject;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined) return clone(base);
  if (override === null || typeof override !== "object" || Array.isArray(override)) return clone(override);
  if (!base || typeof base !== "object" || Array.isArray(base)) return clone(override);
  const result: JsonObject = { ...(base as JsonObject) };
  for (const [key, value] of Object.entries(override as JsonObject)) result[key] = deepMerge((base as JsonObject)[key], value);
  return result;
}

function clone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as JsonObject).map(([key, item]) => [key, clone(item)]));
  return value;
}

function revision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function invalidConfigError(filePath: string, issues: ProjectProtocolIssue[]): ClawError {
  return new ClawError("PROJECT_CONFIG_INVALID", "Project configuration did not pass the canonical schema.", { filePath, issues });
}
