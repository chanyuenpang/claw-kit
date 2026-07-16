import fs from "node:fs";
import path from "node:path";
import { ensureTaskContext, resolveProjectContext, resolveTaskContext } from "./context.js";
import { readJsonFile } from "./io.js";
import type { PlanDocument } from "./types.js";
import type { LeaveState, SwitchTaskInput, SwitchTaskResult, TaskSourceSnapshot } from "./types.js";

export function switchTask(input: SwitchTaskInput): SwitchTaskResult {
  const project = resolveProjectContext(input.cwd);
  const source = resolveTaskContext(project, input.fromTask);
  const target = ensureTaskContext(project, input.toTask);
  const now = new Date().toISOString();
  const sourcePlan = readJsonFile<PlanDocument>(source.activePlanPath);

  const sourceSnapshot: TaskSourceSnapshot = {
    projectId: project.projectId,
    task: source.taskName,
    status: sourcePlan.status === "end.completed" ? "completed" : sourcePlan.status.startsWith("end.") ? "paused" : "active",
    updatedAt: sourcePlan.completedAt,
    activePlan: source.activePlan,
    planPath: source.activePlanPath,
  };

  const leaveState: LeaveState = {
    leftAt: now,
    updatedAt: now,
    reason: input.reason ?? "user_switch",
    fromTask: source.taskName,
    toTask: target.taskName,
    nextTask: target.taskName,
    continueNeeded: input.reason !== "completed" && input.reason !== "abandoned",
    sourceSnapshot,
  };

  return {
    fromTask: source.taskName,
    toTask: target.taskName,
    sourcePlanPath: source.activePlanPath,
    ...(fs.existsSync(path.join(target.taskDir, "plan.json")) ? { targetPlanPath: path.join(target.taskDir, "plan.json") } : {}),
    leaveState,
  };
}
