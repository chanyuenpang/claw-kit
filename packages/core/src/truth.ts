import { resolveProjectContext } from "./context.js";
import { ClawError } from "./errors.js";
import { readTextFile, writeTextFile } from "./io.js";
import { ensureInsideDir } from "./paths.js";
import type { TruthIngestInput, TruthIngestResult } from "./types.js";

export function ingestTruth(input: TruthIngestInput): TruthIngestResult {
  const project = resolveProjectContext(input.cwd);
  const targetPath = ensureInsideDir(project.truthDir, input.target.replace(/\\/g, "/"));
  if (!targetPath) {
    throw new ClawError("TRUTH_TARGET_INVALID", `Truth target "${input.target}" escapes .claw/truth/.`, {
      target: input.target,
    });
  }

  const nextContent = input.append && exists(targetPath)
    ? `${readTextFile(targetPath)}${input.content}`
    : input.content;
  writeTextFile(targetPath, nextContent);

  return {
    truthRoot: project.truthDir,
    targetPath,
    bytesWritten: Buffer.byteLength(nextContent, "utf-8"),
    mode: input.append ? "append" : "replace",
  };
}

function exists(filePath: string): boolean {
  try {
    readTextFile(filePath);
    return true;
  } catch {
    return false;
  }
}
