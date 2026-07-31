import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { ClawError } from "./errors.js";

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf-8"))) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function serializeJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, serializeJsonFile(value), "utf-8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

export function readTextFile(filePath: string): string {
  return stripBom(fs.readFileSync(filePath, "utf-8"));
}

export function writeTextFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

export function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function withFileLock<T>(targetPath: string, action: () => T): T {
  const lockPath = `${targetPath}.lock`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let lockFd: number | undefined;
  try {
    lockFd = fs.openSync(lockPath, "wx");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "EEXIST") {
      throw new ClawError(
        "PLAN_WRITE_CONFLICT",
        `Concurrent write detected for "${targetPath}". Retry after the other plan operation completes.`,
        { targetPath, lockPath },
      );
    }
    throw error;
  }

  try {
    return action();
  } finally {
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
    }
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}

async function withFileLockRetry<T>(
  targetPath: string,
  action: () => T,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const pollMs = Math.max(10, options?.pollMs ?? 25);
  const timeoutMs = Math.max(pollMs, options?.timeoutMs ?? 30000);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      return withFileLock(targetPath, action);
    } catch (error) {
      if (!(error instanceof ClawError) || error.code !== "PLAN_WRITE_CONFLICT") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new ClawError(
          "PLAN_WRITE_CONFLICT",
          `Timed out waiting to acquire the file lock for "${targetPath}".`,
          {
            targetPath,
            timeoutMs,
          },
        );
      }
      await delay(pollMs);
    }
  }
}

type SerializedQueueOwner = {
  schemaVersion: 1;
  token: string;
  pid: number;
  acquiredAt: string;
};

export async function withSerializedAccess<T>(
  targetPath: string,
  action: () => Promise<T>,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  return withSerializedQueue(`${targetPath}.queue.json`, action, options);
}

export async function withSerializedQueue<T>(
  queuePath: string,
  action: () => Promise<T>,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const pollMs = Math.max(10, options?.pollMs ?? 25);
  const timeoutMs = Math.max(pollMs, options?.timeoutMs ?? 30000);
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (tryAcquireSerializedQueue(queuePath, token)) {
      break;
    }
    if (Date.now() >= deadline) {
      throw new ClawError(
        "PLAN_WRITE_CONFLICT",
        `Timed out waiting to serialize access for queue "${queuePath}".`,
        {
          queuePath,
          timeoutMs,
        },
      );
    }
    await delay(pollMs);
  }

  try {
    return await action();
  } finally {
    releaseSerializedQueue(queuePath, token);
  }
}

function tryAcquireSerializedQueue(queuePath: string, token: string): boolean {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(queuePath, "wx");
    const owner: SerializedQueueOwner = {
      schemaVersion: 1,
      token,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };
    fs.writeFileSync(descriptor, serializeJsonFile(owner), "utf-8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return true;
  } catch (error) {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "EEXIST") {
      throw error;
    }
  }

  const owner = readSerializedQueueOwner(queuePath);
  if (!owner) {
    // Another process may still be flushing the newly-created owner record.
    // Only treat an unreadable record as abandoned after a short grace period.
    try {
      if (Date.now() - fs.statSync(queuePath).mtimeMs < 1000) {
        return false;
      }
    } catch {
      return false;
    }
  } else if (isProcessAlive(owner.pid)) {
    return false;
  }

  const stalePath = `${queuePath}.stale.${owner?.token ?? "invalid"}.${randomUUID()}`;
  try {
    const current = readSerializedQueueOwner(queuePath);
    if (owner && current?.token !== owner.token) {
      return false;
    }
    fs.renameSync(queuePath, stalePath);
    fs.unlinkSync(stalePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "ENOENT" && code !== "EACCES" && code !== "EPERM") {
      throw error;
    }
  }
  return false;
}

function releaseSerializedQueue(queuePath: string, token: string): void {
  try {
    const owner = readSerializedQueueOwner(queuePath);
    if (owner?.token === token) {
      fs.unlinkSync(queuePath);
    }
  } catch {
    // A recovered or externally removed queue is already released.
  }
}

function readSerializedQueueOwner(queuePath: string): SerializedQueueOwner | null {
  try {
    const owner = readJsonFile<Partial<SerializedQueueOwner>>(queuePath);
    return owner.schemaVersion === 1
      && typeof owner.token === "string"
      && typeof owner.pid === "number"
      && typeof owner.acquiredAt === "string"
      ? owner as SerializedQueueOwner
      : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    return code === "EPERM";
  }
}
