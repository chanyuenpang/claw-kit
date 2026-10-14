import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClawError } from "./errors.js";
import { findProjectRoot } from "./paths.js";

/** True when `dir` can be created and a new file can be written there.
 * A failed probe is false for every errno, including EROFS, EACCES, and ENOTDIR.
 */
export function canWriteDirectory(dir: string): boolean {
  const probe = path.join(
    dir,
    `.claw-write-probe-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );
  let fd: number | undefined;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fd = fs.openSync(probe, "wx", 0o600);
    fs.closeSync(fd);
    fd = undefined;
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* probe was not opened */ }
    }
    try { fs.rmSync(probe, { force: true }); } catch { /* probe was not created */ }
    return false;
  }
}

/** Project-local runtime directory. Temp-dir projects are not discovered by
 * findProjectRoot, so a missing project root stays at the given cwd.
 */
export function projectRuntimeDirectory(cwd: string, name: string): string {
  const resolved = path.resolve(cwd);
  const root = findProjectRoot(resolved) ?? resolved;
  return path.join(root, ".claw", "runtime", name);
}

export function resolveWritableRuntimeDirectory(options: {
  explicitPath?: string;
  explicitEnvName: string;
  candidates: string[];
  projectFallback?: string;
  purpose: string;
}): string {
  const explicit = options.explicitPath?.trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (canWriteDirectory(resolved)) return resolved;
    throw new ClawError(
      "RUNTIME_DIR_NOT_WRITABLE",
      `${options.purpose} directory is not writable. ${options.explicitEnvName} must point at a directory claw can create. Unset ${options.explicitEnvName} to use the project-local runtime directory.`,
      { env: options.explicitEnvName, purpose: options.purpose },
    );
  }
  for (const candidate of options.candidates) {
    if (candidate && canWriteDirectory(candidate)) return path.resolve(candidate);
  }
  if (options.projectFallback && canWriteDirectory(options.projectFallback)) {
    return path.resolve(options.projectFallback);
  }
  throw new ClawError(
    "RUNTIME_DIR_NOT_WRITABLE",
    `${options.purpose} directory is not writable. Set ${options.explicitEnvName} to a writable directory, or run claw from a writable project.`,
    { env: options.explicitEnvName, purpose: options.purpose },
  );
}

/** Username for daemon identity hashes. A missing passwd entry must not crash startup. */
export function safeRuntimeUser(): string {
  try {
    const username = os.userInfo().username;
    if (username) return username;
  } catch {
    // Containers and sandboxes may have no passwd entry for the uid.
  }
  return process.env.USER || process.env.LOGNAME || "unknown";
}
