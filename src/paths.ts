import path from "node:path";
import fs from "node:fs";

export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, ".claw"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function normalizeTaskName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

export function isValidTaskName(input: string): boolean {
  return normalizeTaskName(input) === input && input.length > 0;
}

export function ensureInsideTaskDir(taskDir: string, relativePath: string): string | null {
  const resolved = path.resolve(taskDir, relativePath);
  const taskRoot = path.resolve(taskDir);
  if (resolved === taskRoot || resolved.startsWith(`${taskRoot}${path.sep}`)) {
    return resolved;
  }
  return null;
}
