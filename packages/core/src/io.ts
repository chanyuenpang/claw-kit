import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { resourceMutexConflict, tryAcquireResourceMutex } from "./resource-mutex.js";

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf-8"))) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
  const content = serializeJsonFile(value);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
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
  const attempt = tryAcquireResourceMutex(targetPath, lockPath);
  if (!attempt.acquired) throw resourceMutexConflict(targetPath, lockPath, attempt.reason);
  try {
    return action();
  } finally {
    attempt.release();
  }
}

export type TryFileLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

/** Skip acquisition contention only; action failures retain their exact outcome. */
export function tryWithFileLock<T>(targetPath: string, action: () => T): TryFileLockResult<T> {
  const attempt = tryAcquireResourceMutex(targetPath, `${targetPath}.lock`);
  if (!attempt.acquired) return { acquired: false };
  try {
    return { acquired: true, value: action() };
  } finally {
    attempt.release();
  }
}

export async function withSerializedAccess<T>(
  targetPath: string,
  action: () => Promise<T>,
  options?: { pollMs?: number; timeoutMs?: number },
): Promise<T> {
  return withSerializedQueue(`${targetPath}.queue.json`, action, options);
}

export async function withSerializedQueue<T>(
  queuePath: string,
  action: () => Promise<T>,
  options?: { pollMs?: number; timeoutMs?: number },
): Promise<T> {
  const pollMs = Math.max(10, options?.pollMs ?? 25);
  const timeoutMs = Math.max(pollMs, options?.timeoutMs ?? 30000);
  const deadline = performance.now() + timeoutMs;
  while (true) {
    const attempt = tryAcquireResourceMutex(queuePath, queuePath);
    if (attempt.acquired) {
      try {
        return await action();
      } finally {
        attempt.release();
      }
    }
    // Retry only acquisition, never the action (including its own conflicts).
    if (attempt.reason === "legacy-lock" || performance.now() >= deadline) {
      throw resourceMutexConflict(queuePath, queuePath, attempt.reason, timeoutMs);
    }
    await delay(Math.min(pollMs, Math.max(0, deadline - performance.now())));
    if (performance.now() >= deadline) {
      throw resourceMutexConflict(queuePath, queuePath, "busy", timeoutMs);
    }
  }
}
