import fs from "node:fs";
import path from "node:path";
import { buildCompletionHooks } from "./completion-hooks.js";
import { ensureTaskMeta, resolveProjectContext, resolveTaskContext, resolveTaskName, saveTaskMeta } from "./context.js";
import { ClawError } from "./errors.js";
import { readJsonFile, withFileLock, writeJsonFile } from "./io.js";
import { buildPlanEvent } from "./plan-events.js";
import {
  REQUIREMENTS_INSTRUCTION,
  REQUIREMENTS_NEXT_ACTION,
  isProcessStatus,
} from "./requirements-gate.js";
import { buildPlanViewModel } from "./plan-view.js";
import { ensureInsideDir, normalizePlanFile, slugFromFilePath } from "./paths.js";
import type {
  LegacyPlanStatus,
  PlanDocument,
  PlanEditInput,
  PlanEditResult,
  PlanShowInput,
  PlanShowResult,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  PlanWriteInput,
  PlanWriteResult,
  TaskContext,
} from "./types.js";
import type { PlanEvent } from "./plan-events.js";
import { buildPlanWorkflowGuidance } from "./workflow-guidance.js";

const PLAN_STATUSES: PlanStatus[] = [
  "prepare.requirements",
  "prepare.review",
  "process.active",
  "process.wait",
  "process.discussing",
  "end.completed",
  "end.closed",
  "end.leave",
];

const LEGACY_PLAN_STATUS_MAP: Record<LegacyPlanStatus, PlanStatus> = {
  requirements: "prepare.requirements",
  review: "prepare.review",
  active: "process.active",
  wait: "process.wait",
  discussing: "process.discussing",
  completed: "end.completed",
  closed: "end.closed",
  leave: "end.leave",
};

const PLAN_TASK_STATUSES: PlanTaskStatus[] = ["pending", "in_progress", "subagent_running", "done", "blocked"];

export async function writePlan(input: PlanWriteInput): Promise<PlanWriteResult & { events: PlanEvent[] }> {
  const project = resolveProjectContext(input.cwd);
  const taskName = deriveTaskName(input);
  const createdTask = !fs.existsSync(path.join(project.tasksDir, taskName, "meta.json"));
  const task = ensureTaskMeta(project, taskName, input.description);
  const planFile = derivePlanFile(task, input.filePath, input.parentTaskId);
  const planPath = requireInsideTask(task, planFile);
  const createdPlan = !fs.existsSync(planPath);
  const existing = createdPlan ? undefined : readJsonFile<PlanDocument>(planPath);
  const existingStatus = existing ? normalizePlanDocument(existing).status : undefined;
  const effectiveStatus = normalizePlanStatus(input.planStatus) ?? input.content?.status ?? existingStatus ?? "prepare.requirements";

  let plan = normalizePlanDocument(
    input.content ?? createSeedPlan(taskName, input.title, input.goalText, effectiveStatus),
    effectiveStatus,
  );

  let parentPlanPath: string | undefined;
  if (input.parentTaskId !== undefined) {
    const subplanContext = resolveSubplanContext(task, input.parentTaskId);
    parentPlanPath = subplanContext.parentPlanPath;
    plan = normalizePlanDocument({
      ...plan,
      parentPlan: subplanContext.parentPlanFile,
      parentTaskId: input.parentTaskId,
      rules: mergeStringLists(subplanContext.parentPlan.rules, plan.rules),
      references: mergeReferences(subplanContext.parentPlan.references, plan.references),
    });
    subplanContext.parentTask.execution = {
      ...subplanContext.parentTask.execution,
      type: "subplan",
      subplan: planFile,
      planPath: planFile,
    };
    if (subplanContext.parentTask.status === "pending") {
      subplanContext.parentTask.status = "in_progress";
    }
    withFileLock(subplanContext.parentPlanPath, () => {
      writeJsonFile(subplanContext.parentPlanPath, subplanContext.parentPlan);
    });
  }

  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  withFileLock(planPath, () => {
    writeJsonFile(planPath, plan);
  });

  task.meta.activePlan = planFile;
  task.meta.rules = plan.rules;
  task.meta.status = taskMetaStatusForPlanStatus(plan.status);
  if (plan.taskType) {
    task.meta.taskType = plan.taskType;
  }
  saveTaskMeta(task);

  const eventType = createdPlan ? "plan_created" : "plan_changed";
  const event = buildPlanEvent(eventType, {
    planPath,
    planTitle: plan.title,
    planStatus: plan.status,
    ...(existingStatus ? { previousStatus: existingStatus } : {}),
  });

  return {
    taskName,
    taskDir: task.taskDir,
    metaPath: task.metaPath,
    planPath,
    planFile,
    planStatus: plan.status,
    createdTask,
    createdPlan,
    eventType,
    ...(plan.parentPlan ? { parentPlan: plan.parentPlan } : {}),
    ...(plan.parentTaskId !== undefined ? { parentTaskId: plan.parentTaskId } : {}),
    ...(plan.status === "prepare.requirements"
      ? { nextAction: REQUIREMENTS_NEXT_ACTION, instruction: REQUIREMENTS_INSTRUCTION }
      : {}),
    workflowGuidance: buildPlanWorkflowGuidance({
      taskName,
      planFile,
      plan,
      projectConfig: project.projectConfig,
    }),
    planView: buildPlanViewModel({
      taskName,
      planFile,
      plan,
    }),
    events: [event],
  };
}

export async function editPlan(input: PlanEditInput): Promise<PlanEditResult & { events: PlanEvent[] }> {
  const task = resolveTaskContext(resolveProjectContext(input.cwd), input.taskName);
  const planFile = normalizePlanFile(input.planFile ?? task.activePlan);
  const planPath = requireInsideTask(task, planFile);
  if (!fs.existsSync(planPath)) {
    throw new ClawError("PLAN_NOT_FOUND", `Plan "${planFile}" does not exist for task "${task.taskName}".`, {
      taskName: task.taskName,
      planFile,
    });
  }

  const previous = normalizePlanDocument(readJsonFile<PlanDocument>(planPath));
  const previousStatus = previous.status;
  const events: PlanEvent[] = [];
  const changedTaskIds: number[] = [];
  const next = structuredClone(previous);
  const requestedStatus = input.planStatus ? normalizePlanStatus(input.planStatus) : undefined;

  if (requestedStatus) {
    const validation = canSetPlanStatus(previousStatus, requestedStatus);
    if (!validation.ok) {
      throw new ClawError(validation.code, validation.error);
    }
    next.status = requestedStatus;
  }

  if (input.patch) {
    applyPlanPatch(next, input.patch);
  }

  if (input.appendTasks?.length) {
    if (isEnd(previous.status) && !requestedStatus && input.patch?.status === undefined) {
      next.status = "prepare.requirements";
    }
    const currentIds = new Set(next.tasks.map((taskItem) => taskItem.id));
    for (const taskItem of input.appendTasks) {
      if (currentIds.has(taskItem.id)) {
        throw new ClawError("PROJECT_CONFIG_INVALID", `Task id ${taskItem.id} already exists in plan.`);
      }
      validatePlanTask(taskItem);
      next.tasks.push(taskItem);
    }
  }

  if (input.taskId !== undefined || input.taskStatus !== undefined) {
    if (input.taskId === undefined || input.taskStatus === undefined) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "taskId and taskStatus must be provided together when updating a plan task status.",
      );
    }
    if (!isProcess(next.status)) {
      throw new ClawError(
        "TASK_STATUS_FORBIDDEN_IN_NON_ACTIVE_PLAN",
        "Task progress can only be updated while plan.status is process.*. If requirements are already confirmed, move the plan to process.active first.",
        {
          planStatus: next.status,
          suggestedCommand: `claw plan edit --task ${task.taskName}${planFile === "plan.json" ? "" : ` --plan ${planFile}`} --plan-status process.active`,
        },
      );
    }
    const planTask = next.tasks.find((item) => item.id === input.taskId);
    if (!planTask) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Task id ${input.taskId} was not found in this plan.`);
    }
    validatePlanTaskStatus(input.taskStatus);
    const previousTaskStatus = planTask.status;
    planTask.status = input.taskStatus;
    changedTaskIds.push(planTask.id);
    if (previousTaskStatus !== "done" && input.taskStatus === "done") {
      events.push(
        buildPlanEvent("plan_task_completed", {
          planPath,
          planTitle: next.title,
          planStatus: next.status,
          taskId: planTask.id,
          affectedPlanTaskIds: [planTask.id],
        }),
      );
    }
  }

  validatePlanDocument(next);
  if (next.status === "end.completed" && !next.retrospective?.summary?.trim()) {
    throw new ClawError(
      "RETROSPECTIVE_REQUIRED",
      "end.completed requires retrospective.summary before the plan can be completed.",
    );
  }

  withFileLock(planPath, () => {
    writeJsonFile(planPath, next);
  });
  task.meta.activePlan = planFile;
  task.meta.rules = next.rules;
  task.meta.status = taskMetaStatusForPlanStatus(next.status);
  if (next.taskType !== undefined) {
    task.meta.taskType = next.taskType;
  }
  saveTaskMeta(task);

  if (previousStatus !== next.status || input.patch || changedTaskIds.length > 0 || input.appendTasks?.length) {
    events.unshift(
      buildPlanEvent("plan_changed", {
        planPath,
        planTitle: next.title,
        planStatus: next.status,
        previousStatus,
        ...(changedTaskIds.length > 0 ? { affectedPlanTaskIds: changedTaskIds } : {}),
      }),
    );
  }

  const completionHooks =
    previousStatus !== "end.completed" && next.status === "end.completed"
      ? buildCompletionHooks({ task, planPath, plan: next })
      : undefined;
  if (completionHooks) {
    events.push(
      buildPlanEvent("plan_completed", {
        planPath,
        planTitle: next.title,
        planStatus: next.status,
        previousStatus,
      }),
    );
  }

  return {
    taskName: task.taskName,
    planPath,
    planFile,
    planStatus: next.status,
    previousPlanStatus: previousStatus,
    emittedEvents: events.map((event) => event.type),
    changedTaskIds,
    ...(next.status === "prepare.requirements"
      ? { nextAction: REQUIREMENTS_NEXT_ACTION, instruction: REQUIREMENTS_INSTRUCTION }
      : {}),
    ...(completionHooks ? { completionHooks } : {}),
    workflowGuidance: buildPlanWorkflowGuidance({
      taskName: task.taskName,
      planFile,
      plan: next,
      projectConfig: task.project.projectConfig,
      previousStatus,
      completionHooks,
      changedTaskIds,
    }),
    planView: buildPlanViewModel({
      taskName: task.taskName,
      planFile,
      plan: next,
    }),
    events,
  };
}

export function showPlan(input: PlanShowInput): PlanShowResult {
  const task = resolveTaskContext(resolveProjectContext(input.cwd), input.taskName);
  const planFile = normalizePlanFile(input.planFile ?? task.activePlan);
  const planPath = requireInsideTask(task, planFile);
  if (!fs.existsSync(planPath)) {
    throw new ClawError("PLAN_NOT_FOUND", `Plan "${planFile}" does not exist for task "${task.taskName}".`, {
      taskName: task.taskName,
      planFile,
    });
  }
  const plan = normalizePlanDocument(readJsonFile<PlanDocument>(planPath));
  return {
    taskName: task.taskName,
    planPath,
    planFile,
    plan,
    planView: buildPlanViewModel({
      taskName: task.taskName,
      planFile,
      plan,
    }),
  };
}

export function normalizePlanStatus(status: unknown): PlanStatus | null {
  if (typeof status !== "string") {
    return null;
  }
  if ((PLAN_STATUSES as string[]).includes(status)) {
    return status as PlanStatus;
  }
  if (Object.prototype.hasOwnProperty.call(LEGACY_PLAN_STATUS_MAP, status)) {
    return LEGACY_PLAN_STATUS_MAP[status as LegacyPlanStatus];
  }
  return null;
}

function normalizePlanDocument(plan: PlanDocument, fallbackStatus?: PlanStatus): PlanDocument {
  const effectiveStatus = normalizePlanStatus(plan.status) ?? fallbackStatus;
  if (!effectiveStatus) {
    throw new ClawError("PLAN_STATUS_INVALID", `Unsupported plan status "${String(plan.status)}".`);
  }
  const normalized: PlanDocument = {
    ...plan,
    status: effectiveStatus,
    goal: { text: plan.goal?.text ?? "" },
    tasks: Array.isArray(plan.tasks) ? plan.tasks.map((task) => normalizePlanTask(task)) : [],
  };
  validatePlanDocument(normalized);
  return normalized;
}

function normalizePlanTask(task: PlanTask): PlanTask {
  validatePlanTask(task);
  return task;
}

function validatePlanDocument(plan: PlanDocument): void {
  if (!plan.title?.trim()) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Plan title is required.");
  }
  if (!plan.goal?.text?.trim()) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Plan goal.text is required.");
  }
  for (const task of plan.tasks) {
    validatePlanTask(task);
  }
}

function validatePlanTask(task: PlanTask): void {
  if (!Number.isInteger(task.id)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Plan task id must be an integer.");
  }
  if (!task.title?.trim()) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Plan task ${task.id} is missing title.`);
  }
  validatePlanTaskStatus(task.status);
}

function validatePlanTaskStatus(status: string): void {
  if (!(PLAN_TASK_STATUSES as string[]).includes(status)) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `Unsupported plan task status "${status}". Canonical values are pending, in_progress, subagent_running, done, blocked.`,
    );
  }
}

function applyPlanPatch(target: PlanDocument, patch: Partial<PlanDocument>): void {
  if (patch.title !== undefined) {
    target.title = patch.title;
  }
  if (patch.goal !== undefined) {
    target.goal = { text: patch.goal.text };
  }
  if (patch.summary !== undefined) {
    target.summary = patch.summary;
  }
  if (patch.taskType !== undefined) {
    target.taskType = patch.taskType;
  }
  if (patch.leaveReason !== undefined) {
    target.leaveReason = patch.leaveReason;
  }
  if (patch.parentPlan !== undefined) {
    target.parentPlan = patch.parentPlan;
  }
  if (patch.parentTaskId !== undefined) {
    target.parentTaskId = patch.parentTaskId;
  }
  if (patch.references !== undefined) {
    target.references = patch.references;
  }
  if (patch.rules !== undefined) {
    target.rules = patch.rules;
  }
  if (patch.retrospective !== undefined) {
    target.retrospective = patch.retrospective;
  }
  if (patch.keyDecisions !== undefined) {
    target.keyDecisions = patch.keyDecisions;
  }
  if (patch.tasks !== undefined) {
    target.tasks = patch.tasks.map((task) => normalizePlanTask(task));
  }
  if (patch.status !== undefined) {
    const normalized = normalizePlanStatus(patch.status);
    if (!normalized) {
      throw new ClawError("PLAN_STATUS_INVALID", `Unsupported plan status "${String(patch.status)}".`);
    }
    target.status = normalized;
  }
}

function createSeedPlan(taskName: string, title?: string, goalText?: string, status: PlanStatus = "prepare.requirements"): PlanDocument {
  return {
    title: title ?? taskName,
    status,
    goal: {
      text: goalText ?? "",
    },
    tasks: [],
  };
}

function deriveTaskName(input: PlanWriteInput): string {
  if (input.taskName?.trim()) {
    return resolveTaskName(input.taskName);
  }
  if (input.filePath?.trim()) {
    const derived = slugFromFilePath(input.filePath);
    if (derived) {
      return derived;
    }
  }
  throw new ClawError("TASK_NAME_INVALID", "plan write requires --task or a filePath that can derive a task name.");
}

function derivePlanFile(task: TaskContext, filePath?: string, parentTaskId?: number): string {
  const normalized = normalizePlanFile(filePath);
  if (parentTaskId !== undefined) {
    const baseName = path.posix.basename(normalized);
    return normalizePlanFile(`plans/${baseName}`);
  }
  if (normalized === "plan.json") {
    return normalized;
  }
  const inside = ensureInsideDir(task.taskDir, normalized);
  if (!inside) {
    throw new ClawError("ACTIVE_PLAN_INVALID", `Plan file "${normalized}" escapes the task directory.`);
  }
  return normalized;
}

function requireInsideTask(task: TaskContext, relativePlan: string): string {
  const resolved = ensureInsideDir(task.taskDir, relativePlan);
  if (!resolved) {
    throw new ClawError("ACTIVE_PLAN_INVALID", `Plan file "${relativePlan}" escapes the task directory.`);
  }
  return resolved;
}

function canSetPlanStatus(
  from: PlanStatus | undefined,
  to: PlanStatus,
): { ok: true } | { ok: false; code: "PLAN_STATUS_NOT_SETTABLE" | "PLAN_STATUS_TRANSITION_FORBIDDEN" | "PLAN_STATUS_REOPEN_REQUIRED"; error: string } {
  if (to === "prepare.review") {
    return {
      ok: false,
      code: "PLAN_STATUS_NOT_SETTABLE",
      error:
        "planStatus=prepare.review is an internal review gate and cannot be set directly. Revise the plan content, then set process.active/process.wait/process.discussing, or reopen an ended plan with prepare.requirements.",
    };
  }
  if (!from) {
    return { ok: true };
  }
  if (isPrepare(from) && isEnd(to)) {
    return { ok: true };
  }
  if (isPrepare(from) && isProcess(to)) {
    return { ok: true };
  }
  if (isPrepare(from) && isPrepare(to)) {
    return { ok: true };
  }
  if (isProcess(from) && isProcess(to)) {
    return { ok: true };
  }
  if (isProcess(from) && isEnd(to)) {
    return { ok: true };
  }
  if (isProcess(from) && isPrepare(to)) {
    return {
      ok: false,
      code: "PLAN_STATUS_TRANSITION_FORBIDDEN",
      error:
        "Cannot move from process.* back to prepare.* with plan_edit. Keep editing the plan content or move to an end.* status if execution should stop.",
    };
  }
  if (isEnd(from) && to === "prepare.requirements") {
    return { ok: true };
  }
  if (isEnd(from) && isProcess(to)) {
    return {
      ok: false,
      code: "PLAN_STATUS_REOPEN_REQUIRED",
      error:
        "Cannot move directly from end.* to process.*. First reopen with planStatus=prepare.requirements, update the plan, then set process.active/process.wait/process.discussing.",
    };
  }
  if (isEnd(from) && isEnd(to)) {
    return { ok: true };
  }
  return { ok: true };
}

function isPrepare(status: PlanStatus): boolean {
  return status.startsWith("prepare.");
}

function isProcess(status: PlanStatus): boolean {
  return isProcessStatus(status);
}

function isEnd(status: PlanStatus): boolean {
  return status.startsWith("end.");
}

function taskMetaStatusForPlanStatus(status: PlanStatus): "active" | "completed" | "paused" {
  if (status === "end.completed") {
    return "completed";
  }
  if (status === "process.wait" || status === "process.discussing" || status === "end.closed" || status === "end.leave") {
    return "paused";
  }
  return "active";
}

function mergeStringLists(parentItems?: string[], childItems?: string[]): string[] | undefined {
  if (!parentItems?.length && !childItems?.length) {
    return undefined;
  }
  return [...new Set([...(parentItems ?? []), ...(childItems ?? [])])];
}

function mergeReferences(parentReferences?: PlanDocument["references"], childReferences?: PlanDocument["references"]) {
  if (!parentReferences?.length && !childReferences?.length) {
    return undefined;
  }
  const merged = new Map<string, { why: string; path: string }>();
  for (const reference of [...(parentReferences ?? []), ...(childReferences ?? [])]) {
    merged.set(`${reference.path}::${reference.why}`, reference);
  }
  return [...merged.values()];
}

function resolveSubplanContext(task: TaskContext, parentTaskId: number): {
  parentPlanFile: string;
  parentPlanPath: string;
  parentPlan: PlanDocument;
  parentTask: PlanTask;
} {
  const parentPlanFile = task.activePlan;
  const parentPlanPath = task.activePlanPath;
  const parentPlan = normalizePlanDocument(readJsonFile<PlanDocument>(parentPlanPath));
  const parentTask = parentPlan.tasks.find((item) => item.id === parentTaskId);
  if (!parentTask) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `subplan_parent_task_not_found: parent PlanTask ${parentTaskId} does not exist in the active plan.`,
    );
  }
  return {
    parentPlanFile,
    parentPlanPath,
    parentPlan,
    parentTask,
  };
}
