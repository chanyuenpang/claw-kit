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
        const effectiveRaw = input.layer === "team" ? deepMerge(next, current.personal) : deepMerge(current.team, next);
        const issues = validateProjectConfig(effectiveRaw);
        if (issues.length > 0) throw invalidConfigError(targetPath, issues);
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
}

export function deepMergeProjectConfig(base: unknown, override: unknown): unknown {
  return deepMerge(base, override);
}

function configPaths(projectRoot: string): Record<ProjectConfigLayer, string> {
  const clawDir = path.join(path.resolve(projectRoot), ".claw");
  return { team: path.join(clawDir, "project.json"), personal: path.join(clawDir, "project-override.json") };
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
