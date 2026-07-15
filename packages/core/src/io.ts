import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ClawError } from "./errors.js";

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf-8"))) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
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

type SerializedAccessState = {
  nextTicket: number;
  serving: number;
};

function readSerializedAccessState(queuePath: string): SerializedAccessState {
  if (!fs.existsSync(queuePath)) {
    return { nextTicket: 1, serving: 1 };
  }
  return JSON.parse(stripBom(fs.readFileSync(queuePath, "utf-8"))) as SerializedAccessState;
}

function writeSerializedAccessState(queuePath: string, state: SerializedAccessState): void {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export async function withSerializedAccess<T>(
  targetPath: string,
  action: () => Promise<T>,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const queuePath = `${targetPath}.queue.json`;
  const pollMs = Math.max(10, options?.pollMs ?? 25);
  const timeoutMs = Math.max(pollMs, options?.timeoutMs ?? 30000);

  const ticket = await withFileLockRetry(queuePath, () => {
    const state = readSerializedAccessState(queuePath);
    const assignedTicket = state.nextTicket;
    state.nextTicket += 1;
    writeSerializedAccessState(queuePath, state);
    return assignedTicket;
  }, { pollMs, timeoutMs });

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const state = readSerializedAccessState(queuePath);
    if (state.serving === ticket) {
      break;
    }
    if (Date.now() >= deadline) {
      throw new ClawError(
        "PLAN_WRITE_CONFLICT",
        `Timed out waiting to serialize access for "${targetPath}".`,
        {
          targetPath,
          queuePath,
          ticket,
          timeoutMs,
        },
      );
    }
    await delay(pollMs);
  }

  try {
    return await action();
  } finally {
    await withFileLockRetry(queuePath, () => {
      const state = readSerializedAccessState(queuePath);
      state.serving = Math.max(state.serving, ticket + 1);
      if (state.serving >= state.nextTicket) {
        if (fs.existsSync(queuePath)) {
          fs.unlinkSync(queuePath);
        }
        return;
      }
      writeSerializedAccessState(queuePath, state);
    }, { pollMs, timeoutMs });
  }
}
