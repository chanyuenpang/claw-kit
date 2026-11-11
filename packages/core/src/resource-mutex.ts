import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ClawError } from "./errors.js";

export type ResourceMutexAttempt =
  | { acquired: true; release: () => void }
  | { acquired: false; reason: "busy" | "legacy-lock" };

/**
 * Core's local-filesystem mutex. The stable database is NOT an occupancy marker:
 * SQLite owns the OS lock and releases it on close or process death. Never unlink
 * or replace the database while writers may exist (that would split the lock).
 * Legacy writers must be stopped together before upgrading; old occupancy files
 * are preserved, not guessed stale from age/PID or silently converted.
 */
export function tryAcquireResourceMutex(resourcePath: string, legacyPath: string): ResourceMutexAttempt {
  fs.mkdirSync(path.dirname(resourcePath), { recursive: true });
  // Resolve directory aliases before constructing the sidecar identity. The
  // resource itself can be absent or atomically replaced during the action.
  const canonicalResource = path.join(fs.realpathSync(path.dirname(resourcePath)), path.basename(resourcePath));
  const mutexPath = `${canonicalResource}.mutex.sqlite`;
  if (legacyLockExists(legacyPath)) return { acquired: false, reason: "legacy-lock" };
  // SQLite needs the extended Windows spelling beyond MAX_PATH; the canonical
  // pathname identity stays unchanged (toNamespacedPath is a no-op on POSIX).
  const database = new DatabaseSync(path.toNamespacedPath(mutexPath));
  let acquired = false;
  try {
    // A synchronous busy timeout would deadlock an async holder on this same
    // event loop. Only the async caller may yield and retry acquisition.
    database.exec("PRAGMA busy_timeout = 0;");
    try {
      database.exec("BEGIN IMMEDIATE;");
    } catch (error) {
      const sqliteCode = error && typeof error === "object" && "errcode" in error ? Number(error.errcode) : NaN;
      if ((sqliteCode & 0xff) === 5 || (sqliteCode & 0xff) === 6) return { acquired: false, reason: "busy" };
      throw error;
    }
    if (legacyLockExists(legacyPath)) return { acquired: false, reason: "legacy-lock" };
    acquired = true;
    // No application data is stored here. Closing rolls back the reservation;
    // action writes/journals retain their own commit and recovery semantics.
    return { acquired: true, release: () => database.close() };
  } finally {
    if (!acquired) database.close();
  }
}

function legacyLockExists(legacyPath: string): boolean {
  try {
    fs.lstatSync(legacyPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error; // Permission/IO errors are not evidence that an old writer is absent.
  }
}

export function resourceMutexConflict(
  resourcePath: string,
  legacyPath: string,
  reason: "busy" | "legacy-lock",
  timeoutMs?: number,
): ClawError {
  return new ClawError(
    "PLAN_WRITE_CONFLICT",
    reason === "legacy-lock"
      ? `${legacyPath} is a legacy lock. Stop all writers sharing this resource, back up this exact lock, then retry with all writers upgraded. It was not removed automatically.`
      : `${timeoutMs === undefined ? "Concurrent write detected" : "Timed out waiting for resource mutex"} for "${resourcePath}".`,
    { targetPath: resourcePath, lockPath: legacyPath, phase: "acquire", reason, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
  );
}
