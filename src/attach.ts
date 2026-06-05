import type { AttachOptions, AttachResult } from "./types.js";
import { resolveProjectContext, resolveTaskContext } from "./context.js";

export function attachToProject(options: AttachOptions): AttachResult {
  const result = resolveProjectContext(options.cwd);

  if (!options.taskName?.trim()) {
    return result;
  }

  return resolveTaskContext(result, options.taskName);
}
