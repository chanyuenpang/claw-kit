import { ensureTaskMeta, resolveProjectContext, resolveTaskContext, saveTaskMeta } from "./context.js";
import type { InheritedFrom, LeaveState, SwitchTaskInput, SwitchTaskResult, TaskSourceSnapshot } from "./types.js";

export function switchTask(input: SwitchTaskInput): SwitchTaskResult {
  const project = resolveProjectContext(input.cwd);
  const source = resolveTaskContext(project, input.fromTask);
  const target = ensureTaskMeta(project, input.toTask);
  const now = new Date().toISOString();

  const sourceSnapshot: TaskSourceSnapshot = {
    projectId: project.projectId,
    task: source.taskName,
    status: source.meta.status,
    updatedAt: source.meta.updatedAt,
    activePlan: source.meta.activePlan,
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

  const inheritedFrom: InheritedFrom = {
    projectId: project.projectId,
    task: source.taskName,
    mode: input.mode ?? "prev_task",
    linkedAt: now,
    historyLimit: input.historyLimit ?? 5,
    sourceSnapshot,
    reason: leaveState.reason,
    sourceStatus: source.meta.status ?? "active",
    sourceUpdatedAt: source.meta.updatedAt,
    sourceLeaveStateUpdatedAt: leaveState.updatedAt ?? leaveState.leftAt,
    sourceLeaveState: leaveState,
  };

  source.meta.leaveState = leaveState;
  source.meta.updatedAt = now;
  target.meta.prevTask = source.taskName;
  target.meta.previousTask = {
    projectId: project.projectId,
    task: source.taskName,
    linkedAt: now,
    reason: leaveState.reason,
    leaveStateAt: leaveState.leftAt,
  };
  target.meta.inheritedFrom = inheritedFrom;
  target.meta.updatedAt = now;

  saveTaskMeta(source);
  saveTaskMeta(target);

  return {
    fromTask: source.taskName,
    toTask: target.taskName,
    sourceMetaPath: source.metaPath,
    targetMetaPath: target.metaPath,
    leaveState,
  };
}
