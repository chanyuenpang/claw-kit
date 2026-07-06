import fs from "node:fs";
import path from "node:path";
import { buildCompletionHooks } from "./completion-hooks.js";
import { ensureTaskMeta, resolveProjectContext, resolveTaskContext, resolveTaskName, saveTaskMeta } from "./context.js";
import { resolvePlanEffectiveConfig } from "./effective-config.js";
import { ClawError } from "./errors.js";
import { readJsonFile, withFileLock, writeJsonFile } from "./io.js";
import { buildPlanEvent } from "./plan-events.js";
import {
  isProcessStatus,
} from "./requirements-gate.js";
import { buildPlanViewModel } from "./plan-view.js";
import { getTemplateTaskDoneChoices, renderSeedTemplateText, resolveSeedPlanTemplate } from "./plan-templates.js";
import { ensureInsideDir, normalizePlanFile, slugFromFilePath } from "./paths.js";
import type {
  LegacyPlanStatus,
  PlanDocument,
  PlanEditInput,
  PlanEditResult,
  PlanRequirements,
  PlanShowInput,
  PlanShowResult,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  SubplanWriteInput,
  PlanWriteInput,
  PlanWriteResult,
  TaskContext,
} from "./types.js";
import type { PlanEvent } from "./plan-events.js";
import { buildGoalModeObjective, buildPlanWorkflowGuidance } from "./workflow-guidance.js";

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
  const task = ensureTaskMeta(project, taskName, input.description, input.ownerSessionKey);
  const planFile = derivePlanFile(task, input.filePath, input.parentTaskId);
  const planPath = requireInsideTask(task, planFile);
  const createdPlan = !fs.existsSync(planPath);
  const existing = createdPlan ? undefined : readJsonFile<PlanDocument>(planPath);
  const existingStatus = existing ? normalizePlanDocument(existing).status : undefined;
  const effectiveStatus = normalizePlanStatus(input.planStatus) ?? input.content?.status ?? existingStatus ?? "prepare.requirements";

  let plan = normalizePlanDocument(
    input.content ?? await createSeedPlan(
      project.projectRoot,
      project.projectConfig,
      input.templateName,
      taskName,
      input.title,
      input.goalText,
      effectiveStatus,
      input.forcePlanning,
      input.host,
    ),
    effectiveStatus,
  );

  let parentPlanPath: string | undefined;
  if (input.parentTaskId !== undefined) {
    const subplanContext = resolveSubplanContext(task, input.parentTaskId, input.parentPlanFile);
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
  task.meta.rootPlan = task.meta.rootPlan ?? "plan.json";
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
    workflowGuidance: await buildPlanWorkflowGuidance({
      taskName,
      planFile,
      plan,
      commandSource: input.parentTaskId !== undefined ? "subplan.create" : "plan.create",
      projectRoot: project.projectRoot,
      projectConfig: resolvePlanEffectiveConfig(project.projectConfig, plan),
      host: input.host,
    }),
    plan,
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
  const appendedTaskIds: number[] = [];
  const completedTaskIds: number[] = [];
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
    const appendedTasks = normalizePlanTasks(input.appendTasks, nextAvailableTaskId(next.tasks));
    for (const taskItem of appendedTasks) {
      if (currentIds.has(taskItem.id)) {
        throw new ClawError("PROJECT_CONFIG_INVALID", `Task id ${taskItem.id} already exists in plan.`);
      }
      validatePlanTask(taskItem);
      next.tasks.push(taskItem);
      currentIds.add(taskItem.id);
      appendedTaskIds.push(taskItem.id);
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
    if (input.taskChoiceId !== undefined) {
      planTask.choiceId = input.taskChoiceId;
    } else if (input.taskStatus !== "done") {
      delete planTask.choiceId;
    }
    changedTaskIds.push(planTask.id);
    if (previousTaskStatus !== "done" && input.taskStatus === "done") {
      completedTaskIds.push(planTask.id);
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

  await validateDoneTransitions({
    projectRoot: task.project.projectRoot,
    previousPlan: previous,
    nextPlan: next,
  });

  validatePlanDocument(next);
  if (next.status === "end.completed" && !next.retrospective?.summary?.trim()) {
    throw new ClawError(
      "RETROSPECTIVE_REQUIRED",
      "end.completed requires retrospective.summary before the plan can be completed.",
    );
  }

  withFileLock(planPath, () => {
    const current = normalizePlanDocument(readJsonFile<PlanDocument>(planPath));
    if (!plansMatch(current, previous)) {
      throw new ClawError(
        "PLAN_STALE_EDIT",
        `Plan "${planFile}" changed after this edit command read it. Re-run the edit after inspecting the latest plan state.`,
        {
          taskName: task.taskName,
          planFile,
          planPath,
          suggestedCommand: `claw plan show --task ${task.taskName}${planFile === "plan.json" ? "" : ` --plan ${planFile}`}`,
        },
      );
    }
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

  let resultPlanFile = planFile;
  let resultPlanPath = planPath;
  let resultPlan = next;

  if (completionHooks?.subplanClosureCandidate) {
    const resumedParent = completeSubplanAndResumeParent({
      task,
      closure: completionHooks.subplanClosureCandidate,
    });
    resultPlanFile = resumedParent.planFile;
    resultPlanPath = resumedParent.planPath;
    resultPlan = resumedParent.plan;
    task.meta.activePlan = resumedParent.planFile;
    task.meta.rules = resumedParent.plan.rules;
    task.meta.status = taskMetaStatusForPlanStatus(resumedParent.plan.status);
    if (resumedParent.plan.taskType !== undefined) {
      task.meta.taskType = resumedParent.plan.taskType;
    } else {
      delete task.meta.taskType;
    }
    saveTaskMeta(task);
  }

  return {
    taskName: task.taskName,
    planPath: resultPlanPath,
    planFile: resultPlanFile,
    planStatus: resultPlan.status,
    previousPlanStatus: previousStatus,
    emittedEvents: events.map((event) => event.type),
    changedTaskIds,
    appendedTaskIds,
    ...(completionHooks ? { completionHooks } : {}),
    workflowGuidance: await buildPlanWorkflowGuidance({
      taskName: task.taskName,
      planFile: resultPlanFile,
      plan: resultPlan,
      commandSource: "plan.edit",
      projectRoot: task.project.projectRoot,
      projectConfig: resolvePlanEffectiveConfig(task.project.projectConfig, resultPlan),
      host: input.host,
      ...(completionHooks?.subplanClosureCandidate
        ? {}
        : {
            previousStatus,
            completionHooks,
            changedTaskIds,
            completedTaskIds,
          }),
    }),
    planView: buildPlanViewModel({
      taskName: task.taskName,
      planFile: resultPlanFile,
      plan: resultPlan,
    }),
    events,
  };
}

export function showPlan(input: PlanShowInput): PlanShowResult {
  const resolved = resolveShowPlanTarget(input);
  const plan = normalizePlanDocument(readJsonFile<PlanDocument>(resolved.planPath));
  return {
    taskName: resolved.taskName,
    planPath: resolved.planPath,
    planFile: resolved.planFile,
    ...(resolved.archived ? { archived: true as const } : {}),
    plan,
    planView: buildPlanViewModel({
      taskName: resolved.taskName,
      planFile: resolved.planFile,
      plan,
    }),
  };
}

export async function createSubplan(input: SubplanWriteInput): Promise<PlanWriteResult & { events: PlanEvent[] }> {
  const parentTask = resolveTaskContext(resolveProjectContext(input.cwd), input.parentTaskName);
  const parentPlanFile = normalizePlanFile(parentTask.meta.rootPlan ?? "plan.json");
  const parentPlanPath = requireInsideTask(parentTask, parentPlanFile);
  const parentPlan = normalizePlanDocument(readJsonFile<PlanDocument>(parentPlanPath));
  const parentPlanTask = parentPlan.tasks.find((task) => task.id === input.parentTaskId);
  if (!parentPlanTask) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `Parent task id ${input.parentTaskId} does not exist in ${parentPlanFile}.`,
      {
        taskName: parentTask.taskName,
        planFile: parentPlanFile,
        parentTaskId: input.parentTaskId,
      },
    );
  }

  const subplanTitle = parentPlanTask.title;
  const derivedPlanFile = normalizePlanFile(`plans/${slugFromFilePath(subplanTitle)}.json`);
  const derivedGoalText = parentPlanTask.detail?.trim()
    ? `${parentPlanTask.title}: ${parentPlanTask.detail}`
    : parentPlanTask.title;

  return writePlan({
    cwd: input.cwd,
    taskName: parentTask.taskName,
    filePath: derivedPlanFile,
    title: subplanTitle,
    goalText: derivedGoalText,
    templateName: input.templateName,
    forcePlanning: true,
    parentTaskId: input.parentTaskId,
    parentPlanFile,
    ownerSessionKey: input.ownerSessionKey,
  });
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
  const rawTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const normalized: PlanDocument = {
    ...plan,
    status: effectiveStatus,
    goal: { text: plan.goal?.text ?? "" },
    requirements: normalizePlanRequirements(plan.requirements),
    tasks: normalizePlanTasks(rawTasks),
  };
  validatePlanDocument(normalized);
  return normalized;
}

function normalizePlanRequirements(requirements: PlanDocument["requirements"]): PlanRequirements {
  return {
    summary: requirements?.summary ?? "",
    openQuestions: Array.isArray(requirements?.openQuestions) ? requirements.openQuestions : [],
    acceptanceCriteria: Array.isArray(requirements?.acceptanceCriteria) ? requirements.acceptanceCriteria : [],
  };
}

function plansMatch(left: PlanDocument, right: PlanDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizePlanTasks(tasks: PlanTask[], startId = 1): PlanTask[] {
  const explicitIds = tasks
    .map((task) => task.id)
    .filter((id): id is number => Number.isInteger(id));
  const usedIds = new Set<number>(explicitIds);
  let nextId = explicitIds.length > 0 ? Math.max(startId, Math.max(...explicitIds) + 1) : startId;

  return tasks.map((task) => {
    const normalizedId = Number.isInteger(task.id) ? task.id : reserveNextTaskId(usedIds, nextId);
    usedIds.add(normalizedId);
    nextId = normalizedId + 1;
    return normalizePlanTask(task, normalizedId);
  });
}

function reserveNextTaskId(usedIds: Set<number>, candidate: number): number {
  let next = candidate;
  while (usedIds.has(next)) {
    next += 1;
  }
  return next;
}

function nextAvailableTaskId(tasks: PlanTask[]): number {
  const explicitIds = tasks
    .map((task) => task.id)
    .filter((id): id is number => Number.isInteger(id));
  return explicitIds.length > 0 ? Math.max(...explicitIds) + 1 : 1;
}

function normalizePlanTask(task: PlanTask, fallbackId?: number): PlanTask {
  const normalizedTask: PlanTask = {
    ...task,
    id: Number.isInteger(task.id) ? task.id : fallbackId ?? task.id,
    status: task.status ?? "pending",
  };
  validatePlanTask(normalizedTask);
  return normalizedTask;
}

function validatePlanDocument(plan: PlanDocument): void {
  if (!plan.title?.trim()) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Plan title is required.");
  }
  const goalText = typeof plan.goal?.text === "string" ? plan.goal.text.trim() : "";
  if (!goalText && plan.status !== "prepare.requirements") {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Plan goal.text is required before the plan can leave prepare.requirements.");
  }
  if (plan.requirements) {
    if (!Array.isArray(plan.requirements.openQuestions) || !Array.isArray(plan.requirements.acceptanceCriteria)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", "Plan requirements must use string arrays for openQuestions and acceptanceCriteria.");
    }
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
  if (task.choiceId !== undefined) {
    if (typeof task.choiceId !== "string" || !task.choiceId.trim()) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Plan task ${task.id} has an invalid choiceId.`);
    }
    if (task.status !== "done") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Plan task ${task.id} can only use choiceId when status is done.`);
    }
  }
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
  if (patch.requirements !== undefined) {
    target.requirements = normalizePlanRequirements(patch.requirements);
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
    target.tasks = normalizePlanTasks(patch.tasks as PlanTask[]);
  }
  if (patch.status !== undefined) {
    const normalized = normalizePlanStatus(patch.status);
    if (!normalized) {
      throw new ClawError("PLAN_STATUS_INVALID", `Unsupported plan status "${String(patch.status)}".`);
    }
    target.status = normalized;
  }
}

async function createSeedPlan(
  projectRoot: string,
  projectConfig: TaskContext["project"]["projectConfig"] | null,
  templateName: string | undefined,
  taskName: string,
  title?: string,
  goalText?: string,
  status: PlanStatus = "prepare.requirements",
  forcePlanning = false,
  host?: string,
): Promise<PlanDocument> {
  const effectiveTemplateName = templateName?.trim() || projectConfig?.defaultPlanTemplate?.trim() || defaultPlanTemplateName();
  const template = await resolveSeedPlanTemplate({
    projectRoot,
    templateName: effectiveTemplateName,
  });
  const effectiveConfig = resolvePlanEffectiveConfig(projectConfig, {
    configOverride: template.configOverride,
  });
  const planningEnabled = forcePlanning || effectiveConfig?.planning !== false;
  const planningSkill = effectiveConfig?.externalPlanningSkill?.trim() || "the built-in planning skill";
  if (!planningEnabled) {
    return {
      title: title ?? taskName,
      templateId: template.id,
      ...(template.configOverride ? { configOverride: template.configOverride } : {}),
      status: "process.active",
      goal: {
        text: goalText ?? title ?? taskName,
      },
      requirements: {
        summary: "",
        openQuestions: [],
        acceptanceCriteria: [],
      },
      tasks: [
        {
          id: 1,
          title: goalText ?? title ?? taskName,
          status: "pending",
        },
      ],
      references: [],
      rules: [],
      keyDecisions: [],
      retrospective: {
        summary: "",
      },
    };
  }

  const effectiveTitle = title ?? template.title ?? taskName;
  const effectiveGoalText = goalText ?? (template.goal?.text?.trim() || effectiveTitle);
  const compiledTasks = template.tasks.map((taskItem) => ({
    id: taskItem.id,
    title: taskItem.title,
    ...(taskItem.detail || taskItem.goalModeDetail
      ? {
          detail: buildCompiledTaskDetail({
            baseDetail: taskItem.detail,
            goalModeDetail: taskItem.goalModeDetail,
            host,
            goalModeEnabled: effectiveConfig?.goalMode !== false,
            planGoal: effectiveGoalText,
            planningSkill,
          }),
        }
      : {}),
    status: taskItem.status,
    ...(taskItem.execution ? { execution: taskItem.execution } : {}),
    ...(taskItem.sessionKey ? { sessionKey: taskItem.sessionKey } : {}),
  }));

  return {
    title: effectiveTitle,
    templateId: template.id,
    ...(template.configOverride ? { configOverride: template.configOverride } : {}),
    status: template.status ?? status,
    goal: {
      text: effectiveGoalText,
    },
    requirements: template.requirements ?? {
      summary: "",
      openQuestions: [],
      acceptanceCriteria: [],
    },
    tasks: compiledTasks,
    references: template.references ?? [],
    rules: template.rules ?? [],
    keyDecisions: template.keyDecisions ?? [],
    retrospective: template.retrospective ?? {
      summary: "",
    },
  };
}

async function validateDoneTransitions(params: {
  projectRoot: string;
  previousPlan: PlanDocument;
  nextPlan: PlanDocument;
}): Promise<void> {
  const { projectRoot, previousPlan, nextPlan } = params;
  if (!nextPlan.templateId?.trim()) {
    return;
  }

  const template = await resolveSeedPlanTemplate({
    projectRoot,
    templateName: nextPlan.templateId,
  });
  const previousTasks = new Map(previousPlan.tasks.map((task) => [task.id, task]));

  for (const task of nextPlan.tasks) {
    const previousTask = previousTasks.get(task.id);
    const choices = getTemplateTaskDoneChoices(template, task.id);
    const availableChoices = choices ? Object.keys(choices) : [];
    const isDoneTransition = previousTask?.status !== "done" && task.status === "done";

    if (isDoneTransition && choices && !task.choiceId) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        `Task ${task.id} requires choiceId because this template defines onDone choices. Provide one of: ${availableChoices.join(", ")}.`,
        {
          taskId: task.id,
          availableChoices,
        },
      );
    }
    if (task.choiceId && !choices) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Task ${task.id} does not define onDone choices, so choiceId is not allowed.`, {
        taskId: task.id,
      });
    }
    if (task.choiceId && choices && !Object.prototype.hasOwnProperty.call(choices, task.choiceId)) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        `Task ${task.id} has an invalid choiceId "${task.choiceId}". Expected one of: ${availableChoices.join(", ")}.`,
        {
          taskId: task.id,
          choiceId: task.choiceId,
          availableChoices,
        },
      );
    }
  }
}

function defaultPlanTemplateName(): string {
  return "default";
}

function buildActivationTaskDetail(params: {
  baseDetail: string;
  goalModeDetail: string;
  host?: string;
  goalModeEnabled: boolean;
  planGoal: string;
}): string {
  const { baseDetail, goalModeDetail, host, goalModeEnabled, planGoal } = params;
  if (!goalModeEnabled) {
    return baseDetail;
  }
  if (host === "opencode") {
    return `${baseDetail} ${goalModeDetail}`;
  }
  const normalizedGoalModeDetail = goalModeDetail.endsWith(".")
    ? goalModeDetail.slice(0, -1)
    : goalModeDetail;
  return `${baseDetail} ${normalizedGoalModeDetail} and use \`${buildGoalModeObjective(planGoal)}\` as the goal objective.`;
}

function buildCompiledTaskDetail(params: {
  baseDetail?: string;
  goalModeDetail?: string;
  host?: string;
  goalModeEnabled: boolean;
  planGoal: string;
  planningSkill: string;
}): string | undefined {
  const renderedBase = params.baseDetail ? renderSeedTemplateText(params.baseDetail, { planningSkill: params.planningSkill }) : "";
  if (!params.goalModeDetail) {
    return renderedBase || undefined;
  }
  return buildActivationTaskDetail({
    baseDetail: renderedBase,
    goalModeDetail: params.goalModeDetail,
    host: params.host,
    goalModeEnabled: params.goalModeEnabled,
    planGoal: params.planGoal,
  });
}

function deriveTaskName(input: PlanWriteInput): string {
  if (input.taskName?.trim()) {
    return resolveTaskName(input.taskName);
  }
  if (input.title?.trim()) {
    return resolveTaskName(input.title);
  }
  if (input.filePath?.trim()) {
    const derived = slugFromFilePath(input.filePath);
    if (derived) {
      return derived;
    }
  }
  throw new ClawError("TASK_NAME_INVALID", "plan create requires a title or a filePath that can derive a task name.");
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

function resolveShowPlanTarget(input: PlanShowInput): {
  taskName: string;
  planFile: string;
  planPath: string;
  archived: boolean;
} {
  const project = resolveProjectContext(input.cwd);
  try {
    const task = resolveTaskContext(project, input.taskName);
    const planFile = normalizePlanFile(input.planFile ?? task.activePlan);
    const planPath = requireInsideTask(task, planFile);
    if (!fs.existsSync(planPath)) {
      throw new ClawError("PLAN_NOT_FOUND", `Plan "${planFile}" does not exist for task "${task.taskName}".`, {
        taskName: task.taskName,
        planFile,
      });
    }
    return {
      taskName: task.taskName,
      planFile,
      planPath,
      archived: false,
    };
  } catch (error) {
    if (!(error instanceof ClawError) || error.code !== "TASK_NOT_FOUND") {
      throw error;
    }
  }

  const archivedTaskDir = path.join(project.clawDir, "archive", "tasks", input.taskName);
  const archivedMetaPath = path.join(archivedTaskDir, "meta.json");
  if (!fs.existsSync(archivedMetaPath)) {
    throw new ClawError("TASK_NOT_FOUND", `Task "${input.taskName}" does not exist.`, { taskName: input.taskName });
  }

  const archivedMeta = readJsonFile<TaskContext["meta"]>(archivedMetaPath);
  const planFile = normalizePlanFile(input.planFile ?? archivedMeta.activePlan ?? "plan.json");
  const planPath = ensureInsideDir(archivedTaskDir, planFile);
  if (!planPath) {
    throw new ClawError("ACTIVE_PLAN_INVALID", `Plan file "${planFile}" escapes the archived task directory.`, {
      taskName: input.taskName,
      planFile,
    });
  }
  if (!fs.existsSync(planPath)) {
    throw new ClawError("PLAN_NOT_FOUND", `Plan "${planFile}" does not exist for archived task "${input.taskName}".`, {
      taskName: input.taskName,
      planFile,
    });
  }

  return {
    taskName: input.taskName,
    planFile,
    planPath,
    archived: true,
  };
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

function resolveSubplanContext(task: TaskContext, parentTaskId: number, parentPlanFile?: string): {
  parentPlanFile: string;
  parentPlanPath: string;
  parentPlan: PlanDocument;
  parentTask: PlanTask;
} {
  const resolvedParentPlanFile = normalizePlanFile(parentPlanFile ?? task.activePlan);
  const parentPlanPath = requireInsideTask(task, resolvedParentPlanFile);
  const parentPlan = normalizePlanDocument(readJsonFile<PlanDocument>(parentPlanPath));
  const parentTask = parentPlan.tasks.find((item) => item.id === parentTaskId);
  if (!parentTask) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `subplan_parent_task_not_found: parent PlanTask ${parentTaskId} does not exist in the active plan.`,
    );
  }
  return {
    parentPlanFile: resolvedParentPlanFile,
    parentPlanPath,
    parentPlan,
    parentTask,
  };
}

function completeSubplanAndResumeParent(params: {
  task: TaskContext;
  closure: {
    parentPlan: string;
    parentTaskId: number;
  };
}): {
  planFile: string;
  planPath: string;
  plan: PlanDocument;
} {
  const parentPlanFile = normalizePlanFile(params.closure.parentPlan);
  const parentPlanPath = requireInsideTask(params.task, parentPlanFile);
  const parentPlan = normalizePlanDocument(readJsonFile<PlanDocument>(parentPlanPath));
  const parentTask = parentPlan.tasks.find((item) => item.id === params.closure.parentTaskId);
  if (!parentTask) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `subplan_parent_task_not_found: parent PlanTask ${params.closure.parentTaskId} does not exist in ${parentPlanFile}.`,
    );
  }

  parentTask.status = "done";
  if (parentTask.execution?.type === "subplan" && parentTask.execution?.subplan) {
    parentTask.execution = {
      ...parentTask.execution,
      planPath: parentTask.execution.planPath ?? parentTask.execution.subplan,
    };
  }

  withFileLock(parentPlanPath, () => {
    writeJsonFile(parentPlanPath, parentPlan);
  });

  return {
    planFile: parentPlanFile,
    planPath: parentPlanPath,
    plan: parentPlan,
  };
}
