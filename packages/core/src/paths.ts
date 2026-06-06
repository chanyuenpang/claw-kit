import fs from "node:fs";
import path from "node:path";

const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
]);

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
  const compact = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  const lower = compact.toLowerCase();
  return WINDOWS_RESERVED_NAMES.has(lower) ? `${compact}-task` : compact;
}

export function isValidTaskName(input: string): boolean {
  return input.length > 0 && normalizeTaskName(input) === input;
}

export function ensureInsideDir(rootDir: string, relativePath: string): string | null {
  const resolved = path.resolve(rootDir, relativePath);
  const absoluteRoot = path.resolve(rootDir);
  if (resolved === absoluteRoot || resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
    return resolved;
  }
  return null;
}

export function normalizePlanFile(relativePath?: string): string {
  if (!relativePath?.trim()) {
    return "plan.json";
  }
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.endsWith(".json") ? normalized : `${normalized}.json`;
}

export function slugFromFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const baseName = path.posix.basename(normalized, path.posix.extname(normalized));
  return normalizeTaskName(baseName);
}
