import fs from "node:fs";
import path from "node:path";
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
