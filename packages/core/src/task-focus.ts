import { ClawError } from "./errors.js";
import type { PlanDocument, PlanTask } from "./types.js";

/** Canonical single-focus selection. Pending tasks are ordered, not ambiguous.
 * Keep legacy reads deterministic even when old data contains multiple actives.
 * Writers enforce the invariant when activating a new task. */
export function activePlanTask(plan: Pick<PlanDocument, "tasks">): PlanTask | undefined {
  return plan.tasks.find((task) => task.status === "in_progress" || task.status === "subagent_running");
}

export function unfinishedPlanTask(plan: Pick<PlanDocument, "tasks">): PlanTask | undefined {
  return plan.tasks.find((task) => task.status !== "done");
}

export function currentPlanTask(plan: Pick<PlanDocument, "tasks">): PlanTask | undefined {
  return activePlanTask(plan) ?? unfinishedPlanTask(plan);
}

/** The canonical writer prevents new parallel focus; legacy rows stay readable
 * and unrelated edits are not blocked merely because old data needs repair. */
export function assertSingleTaskActivation(previous: Pick<PlanDocument, "tasks"> | undefined, next: Pick<PlanDocument, "tasks">): void {
  const active = next.tasks.filter((task) => task.status === "in_progress" || task.status === "subagent_running");
  if (active.length < 2) return;
  const existing = new Set(previous?.tasks.filter((task) => task.status === "in_progress" || task.status === "subagent_running").map((task) => task.id));
  if (active.every((task) => existing.has(task.id))) return;
  throw new ClawError("PLAN_TRANSITION_CONFLICT", "Complete or release the current task before activating another task.", { activeTaskIds: active.map((task) => task.id) });
}
