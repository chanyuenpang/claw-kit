import { readFileSync } from "node:fs";
import path from "node:path";
import { ClawError } from "./errors.js";
import {
  getTemplateTaskDoneChoices,
  getTemplateTaskDoneGuidanceRoute,
  getTemplateTaskPlanStartGuidance,
  resolveSeedPlanTemplate,
} from "./plan-templates.js";
import workflowGuidanceConfigJson from "./workflow-guidance.config.json" with { type: "json" };
import type {
  PlanCompletionHooks,
  PlanDocument,
  ProjectConfig,
  PlanTask,
  PlanStatus,
  WorkflowGuidance,
  WorkflowGuidanceGoalTool,
  WorkflowGuidanceOption,
} from "./types.js";

type GoalModeTemplate = {
  allowOverwrite: true;
  setWhen?: "on_enter_process_active" | "on_resume_process_active";
};

type GoalToolTemplate =
  | {
      tool: "create_goal";
      allowOverwrite: true;
      reason: string;
    }
  | {
      tool: "update_goal";
      status: "complete" | "blocked";
      reason: string;
    };

type GuidanceStateTemplate = {
  stage: WorkflowGuidance["stage"] | "{{processStage}}";
  summary: string;
  nextsteps: string[];
  notes?: string;
  commandHints?: string[];
  goalMode?: GoalModeTemplate;
  goalTool?: GoalToolTemplate;
  askUser?: {
    reason: string;
    useCodexOptions: true;
    options: WorkflowGuidanceOption[];
  };
};

type SessionStartDefaultTemplate = {
  lines: string[];
};

type SessionStartRecoveredSnapshotFields = {
  task: string;
  plan: string;
  planStatus: string;
  planSummary: string;
  nextSteps?: string;
  commandHints?: string;
  notes?: string;
  askUser?: string;
  goalMode?: string;
};

type SessionStartRecoveredTemplate = {
  header: string[];
  snapshotHeader: string;
  snapshotFields: SessionStartRecoveredSnapshotFields;
  planContentHeader: string;
};

type SessionStartTemplate = {
  default: SessionStartDefaultTemplate;
  recovered: SessionStartRecoveredTemplate;
};

type GuidanceConfig = {
  goalModeObjective: {
    withGoal: string;
    withoutGoal: string;
  };
  planCreateRecall?: {
    recommendedCommand: string;
  };
  states: Record<string, GuidanceStateTemplate>;
  sessionStart?: SessionStartTemplate;
};

type TemplateVars = Record<string, string>;

function loadGuidanceConfig(): GuidanceConfig {
  const externalPath = process.env.CLAW_GUIDANCE_CONFIG;
  if (externalPath) {
    try {
      const content = readFileSync(externalPath, "utf8");
      return JSON.parse(content) as GuidanceConfig;
    } catch {
      // If external config fails to load, fall back to bundled config
    }
  }
  return workflowGuidanceConfigJson as GuidanceConfig;
}

const workflowGuidanceConfig = loadGuidanceConfig();

function buildGoalMode(planGoal: string, template: GoalModeTemplate): NonNullable<WorkflowGuidance["goalMode"]> {
  return {
    recommendedObjective: buildGoalModeObjective(planGoal),
    allowOverwrite: template.allowOverwrite,
    ...(template.setWhen ? { setWhen: template.setWhen } : {}),
  };
}

function buildGoalTool(planGoal: string, template: GoalToolTemplate): WorkflowGuidanceGoalTool {
  if (template.tool === "create_goal") {
    return {
      tool: "create_goal",
      objective: buildGoalModeObjective(planGoal),
      allowOverwrite: true,
      reason: template.reason,
    };
  }
  return {
    tool: "update_goal",
    status: template.status,
    reason: template.reason,
  };
}

function applyCreateGuidance(params: {
  commandSource?: "plan.create" | "subplan.create" | "plan.edit" | "plan.start" | "plan.done";
  plan: PlanDocument;
  planFile: string;
  goalModeEnabled: boolean;
  suppressGoalFields: boolean;
  guidance: WorkflowGuidance;
}): WorkflowGuidance {
  const recall = workflowGuidanceConfig.planCreateRecall ?? {
    recommendedCommand: 'claw search --query "<topic>"',
  };
  const guidance = params.commandSource === "plan.create" || params.commandSource === "subplan.create"
      ? {
        ...params.guidance,
        commandHints: mergeUniqueStrings(
          [recall.recommendedCommand],
          params.guidance.commandHints ?? [],
        ),
      }
    : params.guidance;

  if (
    params.commandSource !== "subplan.create" ||
    !params.plan.parentPlan ||
    !params.goalModeEnabled ||
    params.suppressGoalFields
  ) {
    return guidance;
  }

  const subplanObjective = buildGoalModeObjective(params.plan.goal.text);
  const subplanNextstep = `After the parent goal is completed by this subplan handoff, start the subplan goal before doing target work: ${subplanObjective}`;
  const subplanNote =
    `Subplan "${params.planFile}" is now the active plan under parent plan "${params.plan.parentPlan}" task #${params.plan.parentTaskId}. ` +
    "The handoff completes the current parent goal first; treat the parent/root plan as paused until the subplan completes.";

  return {
    ...guidance,
    nextsteps: guidance.nextsteps.includes(subplanNextstep)
      ? guidance.nextsteps
      : [subplanNextstep, ...guidance.nextsteps],
    notes: guidance.notes ? `${subplanNote} ${guidance.notes}` : subplanNote,
    goalTool: {
      tool: "update_goal",
      status: "complete",
      reason: "Subplan creation must complete the active parent goal before the child plan creates its own goal.",
    },
    goalMode: {
      ...guidance.goalMode,
      recommendedObjective: subplanObjective,
      allowOverwrite: true,
    },
  };
}

export function buildGoalModeObjective(planGoal: string): string {
  const trimmedGoal = planGoal.trim();
  const template = trimmedGoal
    ? workflowGuidanceConfig.goalModeObjective.withGoal
    : workflowGuidanceConfig.goalModeObjective.withoutGoal;
  return renderTemplateString(template, { planGoal: trimmedGoal });
}

/**
 * Keep lightweight default plans out of host-level Goal and progress synchronization.
 * Template-backed skills and subplans own lifecycle handoffs and always keep it enabled.
 */
export function shouldUsePlanHostIntegration(plan: Pick<PlanDocument, "tasks" | "templateFile" | "templateId" | "parentPlan">): boolean {
  return Boolean(plan.parentPlan)
    || (plan.templateId !== "default" && Boolean(plan.templateFile))
    || plan.tasks.length > 2;
}

function nextUnfinishedTask(plan: PlanDocument): PlanTask | undefined {
  return plan.tasks.find((task) => task.status !== "done");
}

function currentActiveTask(plan: PlanDocument): PlanTask | undefined {
  return plan.tasks.find((task) => task.status === "in_progress" || task.status === "subagent_running");
}

function formatTaskRef(task: PlanTask): string {
  return `task #${task.id}`;
}

function renderTemplateString(template: string, vars: TemplateVars): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown workflow guidance placeholder: ${key}`, {
        placeholder: key,
      });
    }
    return vars[key];
  });
}

function buildProjectConfigTemplateVars(projectConfig: ProjectConfig | null): TemplateVars {
  const vars: TemplateVars = {};
  const visit = (value: unknown, keyPath: string): void => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      vars[keyPath] = String(value);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      visit(nestedValue, keyPath ? `${keyPath}.${key}` : key);
    }
  };
  if (projectConfig) {
    visit(projectConfig, "");
  }
  return vars;
}

function buildWorkflowTemplateVars(projectConfig: ProjectConfig | null): TemplateVars {
  return {
    ...buildProjectConfigTemplateVars(projectConfig),
    planningSkill: projectConfig?.externalPlanningSkill?.trim() || "claw-kit:planning",
  };
}

function renderTemplateValue<T>(value: T, vars: TemplateVars): T {
  if (typeof value === "string") {
    return renderTemplateString(value, vars) as T;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => renderTemplateValue(item, vars))
      .filter((item) => !(typeof item === "string" && item.trim().length === 0)) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entryValue]) => [key, renderTemplateValue(entryValue, vars)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

function renderStateTemplate(key: string, vars: TemplateVars): GuidanceStateTemplate {
  const template = workflowGuidanceConfig.states[key];
  if (!template) {
    throw new Error(`Unknown workflow guidance template: ${key}`);
  }
  return renderTemplateValue(template, vars);
}

function isGoalModeEnabled(projectConfig: ProjectConfig | null): boolean {
  return projectConfig?.goalMode !== false;
}

export function buildDirectWorkflowGuidance(params: {
  projectConfig?: ProjectConfig | null;
  host?: string;
} = {}): WorkflowGuidance {
  return {
    stage: "done",
    summary: "This task completed through a lean path without extra decomposition.",
    nextsteps: [
      "Let the asynchronously queued completion refresh finish. This reuses the same refresh flow as `claw plan done`.",
    ],
    notes:
      "Use this lean completion path only as a compatibility surface. Normal workflow guidance should stay on `claw plan create`, then let the planning task decide whether more decomposition is needed.",
  };
}

export async function buildPlanWorkflowGuidance(params: {
  taskName: string;
  planFile: string;
  plan: PlanDocument;
  commandSource?: "plan.create" | "subplan.create" | "plan.edit" | "plan.start" | "plan.done";
  projectRoot?: string;
  projectConfig?: ProjectConfig | null;
  previousStatus?: PlanStatus;
  completionHooks?: PlanCompletionHooks;
  changedTaskIds?: number[];
  appendedTaskIds?: number[];
  completedTaskIds?: number[];
  host?: string;
  recoveryResync?: boolean;
}): Promise<WorkflowGuidance> {
  const {
    taskName,
    planFile,
    plan,
    commandSource,
    projectRoot,
    projectConfig = null,
    previousStatus,
    completionHooks,
    changedTaskIds,
    appendedTaskIds,
    completedTaskIds,
  } = params;
  const editBase = "claw plan edit";
  const startBase = "claw plan start";
  const resumeBase = "claw plan resume";
  const doneBase = "claw plan done";
  const hasTasks = plan.tasks.length > 0;
  const allTasksDone = hasTasks && plan.tasks.every((task) => task.status === "done");
  const justEnteredProcess = plan.status.startsWith("process.") && (!previousStatus || previousStatus.startsWith("prepare."));
  const resumedIntoActive = plan.status === "process.active"
    && (params.recoveryResync || previousStatus === "process.wait" || previousStatus === "process.discussing");
  const hasChangedTasks = (changedTaskIds?.length ?? 0) > 0;
  const hasAppendedTasks = (appendedTaskIds?.length ?? 0) > 0;
  const hasCompletedTasks = (completedTaskIds?.length ?? 0) > 0;
  const goalModeEnabled = isGoalModeEnabled(projectConfig) && shouldUsePlanHostIntegration(plan);
  const suppressGoalFields = params.host === "opencode";
  const startedGoalModeThisRound = goalModeEnabled && previousStatus === "process.active";
  const nextTask = nextUnfinishedTask(plan);
  const activeTask = currentActiveTask(plan);
  const shouldReturnNextTask = hasCompletedTasks || hasAppendedTasks || justEnteredProcess || (!hasChangedTasks && !activeTask);
  const hasGoal = typeof plan.goal.text === "string" && plan.goal.text.trim().length > 0;
  const nextTaskRef = nextTask ? formatTaskRef(nextTask) : "the next task";
  const processStage = plan.status === "process.discussing" ? "discussion" : "execution";
  const taskDoneCommand = activeTask && !hasCompletedTasks && !justEnteredProcess
    ? `claw task done --id ${activeTask.id}`
    : "claw task done --id <id>";
  const suggestedTruthTargetsNote = completionHooks?.truthCandidate.suggestedTruthPaths.length
    ? `Suggested truth targets: ${completionHooks.truthCandidate.suggestedTruthPaths.join(", ")}`
    : "";
  const vars: TemplateVars = {
    ...buildWorkflowTemplateVars(projectConfig),
    editBase,
    startBase,
    resumeBase,
    doneBase,
    nextTaskRef,
    processStage,
    taskDoneCommand,
    suggestedTruthTargetsNote,
  };

  switch (plan.status) {
    case "prepare.requirements": {
      const templateKey = hasGoal
        ? (goalModeEnabled ? "prepare.requirements.withGoal" : "prepare.requirements.withGoal.noGoalMode")
        : (goalModeEnabled ? "prepare.requirements.withoutGoal" : "prepare.requirements.withoutGoal.noGoalMode");
      const template = renderStateTemplate(templateKey, vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.notes ? { notes: template.notes } : {}),
        ...(template.commandHints ? { commandHints: template.commandHints } : {}),
      };
    }
    case "prepare.review": {
      const template = renderStateTemplate("prepare.review", vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.notes ? { notes: template.notes } : {}),
        ...(template.commandHints ? { commandHints: template.commandHints } : {}),
        ...(template.askUser ? { askUser: template.askUser } : {}),
      };
    }
    case "process.wait":
    case "process.discussing": {
      if (plan.status === "process.discussing" && allTasksDone) {
        const template = renderStateTemplate("process.allTasksDone", vars);
        return applyCreateGuidance({
          commandSource,
          plan,
          planFile,
          goalModeEnabled,
          suppressGoalFields,
          guidance: {
            stage: template.stage as WorkflowGuidance["stage"],
            summary: template.summary,
            nextsteps: template.nextsteps,
            ...(template.notes ? { notes: template.notes } : {}),
            ...(template.commandHints ? { commandHints: template.commandHints } : {}),
          },
        });
      }
      const isInitialDiscussion = plan.status === "process.discussing"
        && (commandSource === "plan.create" || commandSource === "subplan.create");
      const recommendsPlanStart = isInitialDiscussion
        ? await currentTemplateTaskRecommendsPlanStart({ projectRoot, plan })
        : false;
      const templateKey = isInitialDiscussion
        ? recommendsPlanStart
          ? "process.discussing.initial"
          : "process.discussing.initial.noPlanStart"
        : startedGoalModeThisRound
          ? plan.status
          : `${plan.status}.noGoalMode`;
      const template = renderStateTemplate(templateKey, vars);
      const shouldEmitBlockedGoalTool = startedGoalModeThisRound;
      return applyCreateGuidance({
        commandSource,
        plan,
        planFile,
        goalModeEnabled,
        suppressGoalFields,
        guidance: {
          stage: template.stage as WorkflowGuidance["stage"],
          summary: template.summary,
          nextsteps: template.nextsteps,
          ...(template.notes ? { notes: template.notes } : {}),
          ...(template.commandHints ? { commandHints: template.commandHints } : {}),
          ...(template.goalTool && shouldEmitBlockedGoalTool && goalModeEnabled && hasGoal && !suppressGoalFields
            ? { goalTool: buildGoalTool(plan.goal.text, template.goalTool) }
            : {}),
        },
      });
    }
    case "process.active": {
      if (allTasksDone) {
        const template = renderStateTemplate("process.allTasksDone", vars);
        const guidance = {
          stage: template.stage as WorkflowGuidance["stage"],
          summary: template.summary,
          nextsteps: template.nextsteps,
          ...(template.notes ? { notes: template.notes } : {}),
          ...(template.commandHints ? { commandHints: template.commandHints } : {}),
        };
        return applyCreateGuidance({
          commandSource,
          plan,
          planFile,
        goalModeEnabled,
        suppressGoalFields,
        guidance: await applyTemplateTaskDoneGuidance({
            projectRoot,
            projectConfig,
            plan,
            completedTaskIds,
            guidance,
          }),
        });
      }

      const templateKey = resumedIntoActive
          ? (goalModeEnabled ? "process.resumedActive" : "process.resumedActive.noGoalMode")
          : justEnteredProcess
          ? (goalModeEnabled ? "process.justEntered" : "process.justEntered.noGoalMode")
          : hasCompletedTasks
          ? "process.hasCompletedTasks"
          : activeTask
            ? "process.activeTask"
            : "process.default";
      const template = renderStateTemplate(templateKey, vars);

      const guidance = {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(shouldReturnNextTask && nextTask
          ? {
              nextTask: {
                id: nextTask.id,
                title: nextTask.title,
                status: nextTask.status,
                ...(nextTask.detail ? { detail: nextTask.detail } : {}),
              },
            }
          : {}),
        ...(template.notes ? { notes: template.notes } : {}),
        ...(template.goalMode && goalModeEnabled && (justEnteredProcess || resumedIntoActive) && hasGoal && !suppressGoalFields
          ? { goalMode: buildGoalMode(plan.goal.text, template.goalMode) }
          : {}),
        ...(template.goalTool && goalModeEnabled && (justEnteredProcess || resumedIntoActive) && hasGoal && !suppressGoalFields
          ? { goalTool: buildGoalTool(plan.goal.text, template.goalTool) }
          : {}),
        ...(template.commandHints ? { commandHints: template.commandHints } : {}),
      };
      return applyCreateGuidance({
        commandSource,
        plan,
        planFile,
        goalModeEnabled,
        suppressGoalFields,
        guidance: await applyTemplateTaskDoneGuidance({
          projectRoot,
          projectConfig,
          plan,
          completedTaskIds,
          guidance,
        }),
      });
    }
    case "end.completed": {
      const template = workflowGuidanceConfig.states["end.completed"]
        ? renderStateTemplate("end.completed", vars)
        : renderStateTemplate("end.closed", vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.notes ? { notes: template.notes } : {}),
        ...(template.goalTool && goalModeEnabled && previousStatus === "process.active" && hasGoal && !suppressGoalFields
          ? { goalTool: buildGoalTool(plan.goal.text, template.goalTool) }
          : {}),
        ...(template.commandHints ? { commandHints: template.commandHints } : {}),
      };
    }
    case "end.closed":
    case "end.leave": {
      const template = renderStateTemplate("end.closed", vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.commandHints ? { commandHints: template.commandHints } : {}),
      };
    }
  }
}

async function currentTemplateTaskRecommendsPlanStart(params: {
  projectRoot?: string;
  plan: PlanDocument;
}): Promise<boolean> {
  const { projectRoot, plan } = params;
  const task = currentActiveTask(plan) ?? nextUnfinishedTask(plan);
  if (!projectRoot || !plan.templateId?.trim() || !task) {
    return false;
  }
  const template = await resolveSeedPlanTemplate({
    projectRoot,
    templateName: plan.templateId,
    templateFile: plan.templateFile,
  });
  return getTemplateTaskPlanStartGuidance(template, task.id) !== undefined;
}

async function applyTemplateTaskDoneGuidance(params: {
  projectRoot?: string;
  projectConfig?: ProjectConfig | null;
  plan: PlanDocument;
  completedTaskIds?: number[];
  guidance: WorkflowGuidance;
}): Promise<WorkflowGuidance> {
  const { projectRoot, projectConfig = null, plan, completedTaskIds, guidance } = params;
  const completedTaskId = completedTaskIds?.[completedTaskIds.length - 1];
  if (!projectRoot || !plan.templateId?.trim()) {
    return guidance;
  }

  const template = await resolveSeedPlanTemplate({
    projectRoot,
    templateName: plan.templateId,
    templateFile: plan.templateFile,
    versionPolicy: "ignore",
  });
  let mergedGuidance = guidance;
  const completedTask = completedTaskId === undefined
    ? undefined
    : plan.tasks.find((task) => task.id === completedTaskId);
  if (completedTask) {
    const route = getTemplateTaskDoneGuidanceRoute(template, completedTask.id, completedTask.choiceId);
    if (route) {
      const renderedRoute = renderTemplateValue(route, buildWorkflowTemplateVars(projectConfig));
      mergedGuidance = renderedRoute.mergeMode === "replace"
        ? replaceWorkflowGuidance(guidance, renderedRoute, plan)
        : overrideWorkflowGuidance(guidance, renderedRoute, plan);
    }
  }

  const choiceTask = mergedGuidance.nextTask
    ? plan.tasks.find((task) => task.id === mergedGuidance.nextTask?.id)
    : currentActiveTask(plan) ?? nextUnfinishedTask(plan);
  if (!choiceTask) {
    return mergedGuidance;
  }
  const choiceIds = Object.keys(getTemplateTaskDoneChoices(template, choiceTask.id) ?? {});
  if (choiceIds.length === 0) {
    return mergedGuidance;
  }

  const choiceStep = `Select one completion choice before completing task #${choiceTask.id}.`;
  const retainedCommands = (mergedGuidance.commandHints ?? [])
    .filter((command) => !/^claw task done\b/.test(command));
  const choiceCommand = `claw task done --id ${choiceTask.id} --choice <choice>`;
  return {
    ...mergedGuidance,
    nextsteps: mergeUniqueStrings([choiceStep], mergedGuidance.nextsteps),
    nextTask: {
      id: choiceTask.id,
      title: choiceTask.title,
      status: choiceTask.status,
      ...(choiceTask.detail ? { detail: choiceTask.detail } : {}),
      completionChoices: choiceIds,
    },
    commandHints: mergeUniqueStrings(retainedCommands, [choiceCommand]),
  };
}

function overrideWorkflowGuidance(
  guidance: WorkflowGuidance,
  route: {
    summary?: string;
    nextsteps?: string[];
    notes?: string;
    commandHints?: string[];
    nextTaskId?: number;
  },
  plan: PlanDocument,
): WorkflowGuidance {
  return {
    ...guidance,
    ...(route.summary !== undefined ? { summary: route.summary } : {}),
    ...(route.nextsteps !== undefined
      ? { nextsteps: normalizeGuidanceSteps(mergeUniqueStrings(guidance.nextsteps, route.nextsteps)) }
      : {}),
    ...(route.notes !== undefined ? { notes: route.notes } : {}),
    ...(route.commandHints !== undefined
      ? { commandHints: mergeUniqueStrings(guidance.commandHints ?? [], route.commandHints) }
      : {}),
    ...(route.nextTaskId !== undefined
      ? buildNextTaskOverride(plan, route.nextTaskId)
      : {}),
  };
}

function replaceWorkflowGuidance(
  guidance: WorkflowGuidance,
  route: {
    summary?: string;
    nextsteps?: string[];
    notes?: string;
    commandHints?: string[];
    nextTaskId?: number;
  },
  plan: PlanDocument,
): WorkflowGuidance {
  const nextTaskOverride = route.nextTaskId !== undefined ? buildNextTaskOverride(plan, route.nextTaskId) : { nextTask: undefined };
  return {
    ...guidance,
    summary: route.summary ?? guidance.summary,
    nextsteps: normalizeGuidanceSteps(route.nextsteps ?? []),
    notes: route.notes,
    commandHints: route.commandHints ? [...route.commandHints] : undefined,
    ...nextTaskOverride,
  };
}

function buildNextTaskOverride(plan: PlanDocument, taskId: number): { nextTask?: WorkflowGuidance["nextTask"] } {
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) {
    return { nextTask: undefined };
  }
  return {
    nextTask: {
      id: task.id,
      title: task.title,
      status: task.status,
      ...(task.detail ? { detail: task.detail } : {}),
    },
  };
}

function mergeUniqueStrings(base: string[], extra: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const entry of [...base, ...extra]) {
    if (!seen.has(entry)) {
      seen.add(entry);
      merged.push(entry);
    }
  }
  return merged;
}

function normalizeGuidanceSteps(steps: string[]): string[] {
  return steps.map((step, index) => `${index + 1}. ${step.replace(/^\d+\.\s*/, "").trim()}`);
}

export interface SessionStartDefaultParams {
  projectName: string;
  projectId: string;
  clawDir: string;
  protocolOk: string;
}

export interface SessionStartRecoveredParams {
  taskName: string;
  planFile: string;
  planStatus: string;
  planSummary: string;
  nextsteps: string[];
  commandHints: string[];
  notes: string;
  askUser: string;
  goalMode: string;
  planContentLines: string[];
}

const FALLBACK_SESSION_START_DEFAULT_LINES: string[] = [
  "This session started inside a .claw project: {{projectName}} ({{projectId}}).",
  ".claw directory: {{clawDir}}",
  "You can use goal mode in this thread when required by the claw workflow; don't ask me again.",
  "Follow the claw workflowGuidance return fields as the required next-step contract.",
  "Load claw-kit:using-claw-kit as the main workflow skill for this session.",
];

const FALLBACK_SESSION_START_RECOVERED: SessionStartRecoveredTemplate = {
  header: [
    "Use @claw-kit for this session.",
    "Claw workflow snapshot is recovered.",
    "Treat returned claw workflowGuidance as the only next-step contract.",
    "There is already an unfinished plan in this thread.",
    "Tell the user and ask whether to close the current plan or continue advancing it before starting unrelated work.",
    "You can use goal mode in this thread when required by the claw workflow; don't ask me again.",
    "After this plan finishes, keep using claw-kit in this thread for the next task.",
    "",
  ],
  snapshotHeader: "Current claw workflow snapshot:",
  snapshotFields: {
    task: "- task: {{taskName}}",
    plan: "- plan: {{planFile}}",
    planStatus: "- plan status: {{planStatus}}",
    planSummary: "- plan summary: {{planSummary}}",
    nextSteps: "- next steps: {{nextSteps}}",
    commandHints: "- command hints: {{commandHints}}",
    notes: "- notes: {{notes}}",
    askUser: "- ask user: {{askUser}}",
    goalMode: "- goal mode: {{goalMode}}",
  },
  planContentHeader: "Current plan content:",
};

export function buildSessionStartDefaultPrompt(params: SessionStartDefaultParams): string {
  const template = workflowGuidanceConfig.sessionStart?.default;
  const lines = template?.lines ?? FALLBACK_SESSION_START_DEFAULT_LINES;
  const vars: TemplateVars = {
    projectName: params.projectName,
    projectId: params.projectId,
    clawDir: params.clawDir,
    protocolOk: params.protocolOk,
  };
  return lines.map((line) => renderTemplateString(line, vars)).join("\n");
}

export function buildSessionStartRecoveredPrompt(params: SessionStartRecoveredParams): string {
  const template = workflowGuidanceConfig.sessionStart?.recovered ?? FALLBACK_SESSION_START_RECOVERED;
  const fields = template.snapshotFields;
  const baseVars: TemplateVars = {
    taskName: params.taskName,
    planFile: params.planFile,
    planStatus: params.planStatus,
    planSummary: params.planSummary,
  };

  const lines: string[] = [...template.header, template.snapshotHeader];

  lines.push(renderTemplateString(fields.task, baseVars));
  lines.push(renderTemplateString(fields.plan, baseVars));
  lines.push(renderTemplateString(fields.planStatus, baseVars));
  lines.push(renderTemplateString(fields.planSummary, baseVars));

  if (fields.nextSteps && params.nextsteps.length > 0) {
    lines.push(renderTemplateString(fields.nextSteps, { ...baseVars, nextSteps: params.nextsteps.join(" | ") }));
  }
  if (fields.commandHints && params.commandHints.length > 0) {
    lines.push(
      renderTemplateString(fields.commandHints, { ...baseVars, commandHints: params.commandHints.join(" | ") }),
    );
  }
  if (fields.notes && params.notes) {
    lines.push(renderTemplateString(fields.notes, { ...baseVars, notes: params.notes }));
  }
  if (fields.askUser && params.askUser) {
    lines.push(renderTemplateString(fields.askUser, { ...baseVars, askUser: params.askUser }));
  }
  if (fields.goalMode && params.goalMode) {
    lines.push(renderTemplateString(fields.goalMode, { ...baseVars, goalMode: params.goalMode }));
  }

  if (params.planContentLines.length > 0) {
    lines.push("", template.planContentHeader, ...params.planContentLines);
  }

  return lines.join("\n");
}
