import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ClawError } from "./errors.js";
import { blockedRuntimeWrite, isUnwritableFilesystemError, runtimeDirectoryNotWritable } from "./runtime-directory.js";
import { readJsonFile, writeJsonFile } from "./io.js";
import { resolveProjectContext } from "./context.js";
import type { ProjectContext } from "./types.js";

type SessionWorkflowManifest = {
  version: 1;
  scope: "session";
  originCwd: string;
  createdAt: string;
  updatedAt: string;
};

const MANIFEST_FILE = "session.json";
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionWorkflowBaseDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir(),
): string {
  const explicit = env.CLAW_SESSION_RUNTIME_DIR?.trim();
  return explicit ? path.resolve(explicit) : path.join(homeDir, ".claw", "runtime", "sessions");
}

export function sessionWorkflowDir(sessionKey: string, env: NodeJS.ProcessEnv = process.env): string {
  const normalizedKey = requireSessionKey(sessionKey);
  const digest = createHash("sha256").update(normalizedKey).digest("hex");
  return path.join(sessionWorkflowBaseDir(env), digest);
}

export function createSessionWorkflowContext(cwd: string, sessionKey: string): ProjectContext {
  sweepExpiredSessionWorkflows({ excludeSessionKey: sessionKey });
  const workflowDir = sessionWorkflowDir(sessionKey);
  const manifestPath = path.join(workflowDir, MANIFEST_FILE);
  const now = new Date().toISOString();
  const existing = fs.existsSync(manifestPath) ? readManifest(manifestPath) : null;
  const originCwd = existing?.originCwd ?? path.resolve(cwd);
  const manifest: SessionWorkflowManifest = {
    version: 1,
    scope: "session",
    originCwd,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    fs.mkdirSync(workflowDir, { recursive: true });
    writeJsonFile(manifestPath, manifest);
  } catch (error) {
    const blocked = blockedRuntimeWrite(error);
    if (!blocked.blocked) throw error;
    throw runtimeDirectoryNotWritable(
      "session runtime directory",
      error,
      "Set CLAW_SESSION_RUNTIME_DIR to a writable directory and retry.",
      blocked.filesystemCode,
    );
  }
  return buildSessionContext(workflowDir, originCwd);
}

export function resolveSessionWorkflowContext(sessionKey: string | undefined, options: { readOnly?: boolean } = {}): ProjectContext | null {
  const normalizedKey = sessionKey?.trim();
  if (!normalizedKey) {
    return null;
  }
  const workflowDir = sessionWorkflowDir(normalizedKey);
  const manifestPath = path.join(workflowDir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = readManifest(manifestPath);
  if (!manifest) {
    return null;
  }
  if (!options.readOnly) {
    try {
      writeJsonFile(manifestPath, { ...manifest, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (!isUnwritableFilesystemError(error)) throw error;
    }
  }
  return buildSessionContext(workflowDir, manifest.originCwd);
}

export function resolveWorkflowProjectContext(
  cwd: string,
  ownerSessionKey?: string,
  requestedScope?: "project" | "session",
): ProjectContext {
  if (requestedScope === "session") {
    return createSessionWorkflowContext(cwd, requireSessionKey(ownerSessionKey));
  }
  if (requestedScope !== "project") {
    const session = resolveSessionWorkflowContext(ownerSessionKey);
    if (session) {
      return session;
    }
  }
  return resolveProjectContext(cwd);
}

export function deleteSessionWorkflow(sessionKey: string): boolean {
  const workflowDir = sessionWorkflowDir(sessionKey);
  if (!fs.existsSync(workflowDir)) {
    return false;
  }
  fs.rmSync(workflowDir, { recursive: true, force: true });
  return true;
}

export function sweepExpiredSessionWorkflows(options: {
  now?: number;
  ttlMs?: number;
  excludeSessionKey?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string[] {
  const baseDir = sessionWorkflowBaseDir(options.env);
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const excludedDir = options.excludeSessionKey ? sessionWorkflowDir(options.excludeSessionKey, options.env) : null;
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const removed: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (error) {
    if (isUnwritableFilesystemError(error)) return [];
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const workflowDir = path.join(baseDir, entry.name);
    if (excludedDir && path.resolve(workflowDir) === path.resolve(excludedDir)) {
      continue;
    }
    const manifest = readManifest(path.join(workflowDir, MANIFEST_FILE));
    const updatedAt = manifest ? Date.parse(manifest.updatedAt) : Number.NaN;
    if (!Number.isFinite(updatedAt) || now - updatedAt > ttlMs) {
      try {
        fs.rmSync(workflowDir, { recursive: true, force: true });
      } catch (error) {
        if (isUnwritableFilesystemError(error)) break;
        throw error;
      }
      removed.push(workflowDir);
    }
  }
  return removed;
}

function buildSessionContext(workflowDir: string, originCwd: string): ProjectContext {
  const id = path.basename(workflowDir).slice(0, 12);
  return {
    scope: "session",
    projectRoot: originCwd,
    clawDir: workflowDir,
    projectJsonPath: path.join(workflowDir, "project.json"),
    truthDir: path.join(workflowDir, "truth"),
    tasksDir: path.join(workflowDir, "tasks"),
    projectId: `session-${id}`,
    projectName: "Session workflow",
    projectConfig: null,
  };
}

function readManifest(manifestPath: string): SessionWorkflowManifest | null {
  try {
    const manifest = readJsonFile<Partial<SessionWorkflowManifest>>(manifestPath);
    if (manifest.version !== 1 || manifest.scope !== "session" || typeof manifest.originCwd !== "string") {
      return null;
    }
    return {
      version: 1,
      scope: "session",
      originCwd: path.resolve(manifest.originCwd),
      createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : new Date().toISOString(),
      updatedAt: typeof manifest.updatedAt === "string" ? manifest.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function requireSessionKey(sessionKey: string | undefined): string {
  const normalizedKey = sessionKey?.trim();
  if (!normalizedKey) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "Session scope requires a platform session id. Run it from a supported host session.",
    );
  }
  return normalizedKey;
}
