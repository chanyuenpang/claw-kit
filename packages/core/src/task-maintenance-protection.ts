import path from "node:path";
import { focusedTaskDirectories } from "./focus-transitions.js";
import { knowledgeRecoveryPaths } from "./knowledge-sidecar.js";
import type { ProjectContext } from "./types.js";

/** Deletion/move is irreversible. Existing focus ownership and unfinished
 * knowledge/lease recovery must settle first. This affects maintenance only,
 * never admission or execution of an unrelated workflow. */
export function taskMaintenanceProtection(project: ProjectContext): (directory: string) => boolean {
  const paths = [...focusedTaskDirectories(project), ...knowledgeRecoveryPaths(project)];
  return (directory) => paths.some((resource) => {
    const relative = path.relative(path.resolve(directory), path.resolve(resource));
    return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
  });
}
