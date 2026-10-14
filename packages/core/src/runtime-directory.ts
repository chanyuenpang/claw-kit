import fs from "node:fs";
import path from "node:path";
import { ClawError, type ClawExecutionFailure } from "./errors.js";

const UNWRITABLE_FILESYSTEM_CODES = new Set(["EROFS", "EACCES"]);

export function filesystemErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Read-only mounts and permission denials. EPERM stays out: callers use it for lock contention. */
export function isUnwritableFilesystemError(error: unknown): boolean {
  const code = filesystemErrorCode(error);
  return code !== undefined && UNWRITABLE_FILESYSTEM_CODES.has(code);
}

function errorPath(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("path" in error)) return undefined;
  const value = (error as { path?: unknown }).path;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nearestExistingDirectory(start: string): string | undefined {
  let current = path.resolve(start);
  const root = path.parse(current).root;
  while (true) {
    try {
      if (fs.statSync(current).isDirectory()) return current;
    } catch (error) {
      if (filesystemErrorCode(error) !== "ENOENT") return undefined;
    }
    if (current === root) return undefined;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function probeCreateCode(directory: string): string | undefined {
  const probe = path.join(directory, `.claw-write-probe-${process.pid}-${Date.now().toString(36)}`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(probe, "wx", 0o600);
    return undefined;
  } catch (error) {
    return filesystemErrorCode(error);
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* The probe is disposable. */ }
    }
    try { fs.rmSync(probe, { force: true }); } catch { /* A rejected create leaves nothing behind. */ }
  }
}

/**
 * Node's recursive mkdir reports ENOENT when an existing ancestor is read-only.
 * Confirm with a create probe so a genuinely missing path still surfaces as ENOENT.
 */
export function blockedRuntimeWrite(error: unknown): { blocked: true; filesystemCode: string } | { blocked: false } {
  const code = filesystemErrorCode(error);
  if (code !== undefined && UNWRITABLE_FILESYSTEM_CODES.has(code)) return { blocked: true, filesystemCode: code };
  if (code !== "ENOENT") return { blocked: false };
  const target = errorPath(error);
  if (!target) return { blocked: false };
  const ancestor = nearestExistingDirectory(path.dirname(target));
  if (!ancestor) return { blocked: false };
  const probeCode = probeCreateCode(ancestor);
  if (probeCode === "EROFS" || probeCode === "EACCES") return { blocked: true, filesystemCode: probeCode };
  return { blocked: false };
}

export function runtimeDirectoryNotWritable(kind: string, error: unknown, hint: string, filesystemCode = filesystemErrorCode(error)): ClawError {
  const code = filesystemCode;
  const reason = code === "EROFS"
    ? `the filesystem is read-only (${code})`
    : code === "EACCES"
      ? `permission was denied (${code})`
      : `the write was rejected${code ? ` (${code})` : ""}`;
  const execution: ClawExecutionFailure = { phase: "prepare", outcome: "known", effect: "none" };
  return new ClawError(
    "RUNTIME_DIRECTORY_NOT_WRITABLE",
    `Claw cannot write its ${kind} because ${reason}. ${hint}`,
    { directoryKind: kind, ...(code ? { filesystemCode: code } : {}) },
    execution,
    error,
  );
}

const DAEMON_RUNTIME_HINT = "Set CLAW_SESSION_DAEMON_RUNTIME_DIR to a writable directory and retry.";

/** Create a private directory and prove this process can create a file in it. */
export function ensureWritableDirectory(
  directory: string,
  kind = "session daemon runtime directory",
  hint = DAEMON_RUNTIME_HINT,
): void {
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch (error) {
    const blocked = blockedRuntimeWrite(error);
    if (blocked.blocked) throw runtimeDirectoryNotWritable(kind, error, hint, blocked.filesystemCode);
    throw error;
  }
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    // Windows inherits the current user's ACL. A read-only mount fails the probe below.
  }
  const probe = path.join(directory, `.claw-write-probe-${process.pid}-${Date.now().toString(36)}`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(probe, "wx", 0o600);
  } catch (error) {
    if (isUnwritableFilesystemError(error)) throw runtimeDirectoryNotWritable(kind, error, hint);
    throw error;
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* The probe is disposable. */ }
    }
    try { fs.rmSync(probe, { force: true }); } catch { /* A read-only directory has nothing to remove. */ }
  }
}
