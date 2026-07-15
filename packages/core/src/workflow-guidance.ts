import { readFileSync } from "node:fs";
import path from "node:path";
import { getTemplateTaskDoneGuidanceRoute, resolveSeedPlanTemplate } from "./plan-templates.js";
import workflowGuidanceConfigJson from "./workflow-guidance.config.json" with { type: "json" };
import type {
  PlanCompletionHooks,
  PlanDocument,
  ProjectConfig,
  PlanTask,
  PlanStatus,
  WorkflowGuidance,
  WorkflowGuidanceGoalTool,
  WorkflowGuidanceSubagent,
  WorkflowGuidanceOption,
} from "./types.js";

type DelegateConfigKey = "truthWriter" | "adrWriter";

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
  recommendedCommands?: string[];
  delegateSubagents?: DelegateConfigKey[];
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
  recommendedCommands?: string;
  notes?: string;
  delegateSubagents?: string;
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
  delegates: Record<DelegateConfigKey, Omit<WorkflowGuidanceSubagent, "skill"> & { fallbackSkill: string }>;
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

function truthWriterDelegate(projectConfig: ProjectConfig | null): WorkflowGuidanceSubagent {
  return buildConfiguredDelegate("truthWriter", projectConfig);
}

function adrWriterDelegate(projectConfig: ProjectConfig | null): WorkflowGuidanceSubagent {
  return buildConfiguredDelegate("adrWriter", projectConfig);
}

function buildConfiguredDelegate(key: DelegateConfigKey, projectConfig: ProjectConfig | null): WorkflowGuidanceSubagent {
  const config = workflowGuidanceConfig.delegates[key];
  const overrideSkill = key === "truthWriter" ? projectConfig?.externalTruthSkill : projectConfig?.externalAdrSkill;
  return {
    name: config.name,
    skill: normalizeWriterSkill(overrideSkill, config.fallbackSkill),
    dispatch: config.dispatch,
    model: config.model,
    fork_context: config.fork_context,
    waitForCompletion: config.waitForCompletion,
    preferReuseSameTypeInThread: config.preferReuseSameTypeInThread,
    inputContract: config.inputContract,
    outputContract: config.outputContract,
    closePolicy: config.closePolicy,
  };
}

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

function emphasizeSubplanCreateGuidance(params: {
  commandSource?: "plan.create" | "subplan.create" | "plan.edit" | "plan.done";
  plan: PlanDocument;
  planFile: string;
  goalModeEnabled: boolean;
  suppressGoalFields: boolean;
  guidance: WorkflowGuidance;
}): WorkflowGuidance {
  if (
    params.commandSource !== "subplan.create" ||
    !params.plan.parentPlan ||
    !params.goalModeEnabled ||
    params.suppressGoalFields
  ) {
    return params.guidance;
  }

  const subplanObjective = buildGoalModeObjective(params.plan.goal.text);
  const subplanNextstep = `Set or overwrite Goal Mode to this subplan objective before doing target work: ${subplanObjective}`;
  const subplanNote =
    `Subplan "${params.planFile}" is now the active plan under parent plan "${params.plan.parentPlan}" task #${params.plan.parentTaskId}. ` +
    "Treat the parent/root plan as paused for this target until the subplan completes.";

  return {
    ...params.guidance,
    nextsteps: params.guidance.nextsteps.includes(subplanNextstep)
      ? params.guidance.nextsteps
      : [subplanNextstep, ...params.guidance.nextsteps],
    notes: params.guidance.notes ? `${subplanNote} ${params.guidance.notes}` : subplanNote,
    goalMode: {
      ...params.guidance.goalMode,
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
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => vars[key] ?? "");
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

function buildConfiguredDelegates(
  keys: DelegateConfigKey[] | undefined,
  projectConfig: ProjectConfig | null,
): WorkflowGuidanceSubagent[] | undefined {
  if (!keys?.length) {
    return undefined;
  }
  return keys.map((key) => buildConfiguredDelegate(key, projectConfig));
}

function isGoalModeEnabled(projectConfig: ProjectConfig | null): boolean {
  return projectConfig?.goalMode !== false;
}

function usesPerTaskTruthDispatch(projectConfig: ProjectConfig | null): boolean {
  return projectConfig?.truthDispatch !== "final_only";
}

export function buildDirectWorkflowGuidance(params: {
  projectConfig?: ProjectConfig | null;
  host?: string;
} = {}): WorkflowGuidance {
  const { projectConfig = null } = params;
  return {
    stage: "done",
    summary: "This task completed through a lean path without extra decomposition.",
    nextsteps: [
      "1. If the completed task produced reusable knowledge, read `delegateSubagents` and execute the returned `truth-writer` dispatch contract field-by-field.",
      "2. Let the asynchronously queued completion refresh finish. This reuses the same refresh flow as `claw plan done`.",
    ],
    notes:
      "Use this lean completion path only as a compatibility surface. Normal workflow guidance should stay on `claw plan create`, then let the planning task decide whether more decomposition is needed.",
    delegateSubagents: [truthWriterDelegate(projectConfig)],
  };
}

export async function buildPlanWorkflowGuidance(params: {
  taskName: string;
  planFile: string;
  plan: PlanDocument;
  commandSource?: "plan.create" | "subplan.create" | "plan.edit" | "plan.done";
  projectRoot?: string;
  projectConfig?: ProjectConfig | null;
  previousStatus?: PlanStatus;
  completionHooks?: PlanCompletionHooks;
  changedTaskIds?: number[];
  completedTaskIds?: number[];
  host?: string;
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
    completedTaskIds,
  } = params;
  const scopedPlan = planFile === "plan.json" ? "" : ` --plan ${planFile}`;
  const editBase = `claw plan edit --task ${taskName}${scopedPlan}`;
  const doneBase = `claw plan done --task ${taskName}${scopedPlan}`;
  const hasTasks = plan.tasks.length > 0;
  const allTasksDone = hasTasks && plan.tasks.every((task) => task.status === "done");
  const justEnteredProcess = plan.status.startsWith("process.") && (!previousStatus || previousStatus.startsWith("prepare."));
  const resumedIntoActive = plan.status === "process.active"
    && (previousStatus === "process.wait" || previousStatus === "process.discussing");
  const hasChangedTasks = (changedTaskIds?.length ?? 0) > 0;
  const hasCompletedTasks = (completedTaskIds?.length ?? 0) > 0;
  const goalModeEnabled = isGoalModeEnabled(projectConfig);
  const suppressGoalFields = params.host === "opencode";
  const startedGoalModeThisRound = goalModeEnabled && previousStatus === "process.active";
  const perTaskTruthDispatch = usesPerTaskTruthDispatch(projectConfig);
  const nextTask = nextUnfinishedTask(plan);
  const activeTask = currentActiveTask(plan);
  const shouldReturnNextTask = hasCompletedTasks || justEnteredProcess || (!hasChangedTasks && !activeTask);
  const hasGoal = typeof plan.goal.text === "string" && plan.goal.text.trim().length > 0;
  const nextTaskRef = nextTask ? formatTaskRef(nextTask) : "the next task";
  const processStage = plan.status === "process.discussing" ? "discussion" : "execution";
  const taskDoneCommand = activeTask && !hasCompletedTasks && !justEnteredProcess
    ? `${editBase} --task-id ${activeTask.id} --task-status done`
    : `${editBase} --task-id <id> --task-status done`;
  const suggestedTruthTargetsNote = completionHooks?.truthCandidate.suggestedTruthPaths.length
    ? `Suggested truth targets: ${completionHooks.truthCandidate.suggestedTruthPaths.join(", ")}`
    : "";
  const vars: TemplateVars = {
    editBase,
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
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
      };
    }
    case "prepare.review": {
      const template = renderStateTemplate("prepare.review", vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.notes ? { notes: template.notes } : {}),
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
        ...(template.askUser ? { askUser: template.askUser } : {}),
      };
    }
    case "process.wait":
    case "process.discussing": {
      const templateKey = plan.status === "process.discussing" && (commandSource === "plan.create" || commandSource === "subplan.create")
        ? "process.discussing.initial"
        : startedGoalModeThisRound
          ? plan.status
          : `${plan.status}.noGoalMode`;
      const template = renderStateTemplate(templateKey, vars);
      const shouldEmitBlockedGoalTool = startedGoalModeThisRound;
      return emphasizeSubplanCreateGuidance({
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
          ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
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
          ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
          ...(template.delegateSubagents
            ? { delegateSubagents: buildConfiguredDelegates(template.delegateSubagents, projectConfig) }
            : {}),
        };
        return emphasizeSubplanCreateGuidance({
          commandSource,
          plan,
          planFile,
        goalModeEnabled,
        suppressGoalFields,
        guidance: await applyTemplateTaskDoneGuidance({
            projectRoot,
            plan,
            completedTaskIds,
            guidance,
          }),
        });
      }

      const templateKey = hasCompletedTasks
        ? (perTaskTruthDispatch ? "process.hasCompletedTasks" : "process.hasCompletedTasks.finalOnlyTruth")
        : resumedIntoActive
          ? (goalModeEnabled ? "process.resumedActive" : "process.resumedActive.noGoalMode")
          : justEnteredProcess
          ? (goalModeEnabled ? "process.justEntered" : "process.justEntered.noGoalMode")
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
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
        ...(hasCompletedTasks && template.delegateSubagents
          ? {
              delegateSubagents: buildConfiguredDelegates(template.delegateSubagents, projectConfig),
            }
          : {}),
      };
      return emphasizeSubplanCreateGuidance({
        commandSource,
        plan,
        planFile,
        goalModeEnabled,
        suppressGoalFields,
        guidance: await applyTemplateTaskDoneGuidance({
          projectRoot,
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
        ...(template.goalTool && goalModeEnabled && hasGoal && !suppressGoalFields ? { goalTool: buildGoalTool(plan.goal.text, template.goalTool) } : {}),
        ...(template.delegateSubagents
          ? { delegateSubagents: buildConfiguredDelegates(template.delegateSubagents, projectConfig) }
          : {}),
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
      };
    }
    case "end.closed":
    case "end.leave": {
      const template = renderStateTemplate("end.closed", vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
      };
    }
  }
}

async function applyTemplateTaskDoneGuidance(params: {
  projectRoot?: string;
  plan: PlanDocument;
  completedTaskIds?: number[];
  guidance: WorkflowGuidance;
}): Promise<WorkflowGuidance> {
  const { projectRoot, plan, completedTaskIds, guidance } = params;
  const completedTaskId = completedTaskIds?.[completedTaskIds.length - 1];
  if (!projectRoot || !plan.templateId?.trim() || completedTaskId === undefined) {
    return guidance;
  }

  const completedTask = plan.tasks.find((task) => task.id === completedTaskId);
  if (!completedTask) {
    return guidance;
  }

  const template = await resolveSeedPlanTemplate({
    projectRoot,
    templateName: plan.templateId,
  });
  const route = getTemplateTaskDoneGuidanceRoute(template, completedTaskId, completedTask.choiceId);
  if (!route) {
    return guidance;
  }

  const merged = route.mergeMode === "replace"
    ? replaceWorkflowGuidance(guidance, route, plan)
    : overrideWorkflowGuidance(guidance, route, plan);
  return route.delegateTruth === false ? suppressTruthDelegate(merged) : merged;
}

function overrideWorkflowGuidance(
  guidance: WorkflowGuidance,
  route: {
    summary?: string;
    nextsteps?: string[];
    notes?: string;
    recommendedCommands?: string[];
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
    ...(route.recommendedCommands !== undefined
      ? { recommendedCommands: mergeUniqueStrings(guidance.recommendedCommands ?? [], route.recommendedCommands) }
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
    recommendedCommands?: string[];
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
    recommendedCommands: route.recommendedCommands ? [...route.recommendedCommands] : undefined,
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

function suppressTruthDelegate(guidance: WorkflowGuidance): WorkflowGuidance {
  const delegateSubagents = guidance.delegateSubagents?.filter((delegate) => delegate.name !== "truth-writer");
  const nextsteps = normalizeGuidanceSteps(
    guidance.nextsteps.filter((step) => !step.toLowerCase().includes("truth-writer")),
  );
  return {
    ...guidance,
    nextsteps,
    ...(delegateSubagents && delegateSubagents.length > 0 ? { delegateSubagents } : { delegateSubagents: undefined }),
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

function normalizeWriterSkill(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
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
  recommendedCommands: string[];
  delegateSubagents: string[];
  notes: string;
  askUser: string;
  goalMode: string;
  planContentLines: string[];
}

const FALLBACK_SESSION_START_DEFAULT_LINES: string[] = [
  "This session started inside a .claw project: {{projectName}} ({{projectId}}).",
  ".claw directory: {{clawDir}}",
  "You can use goal mode in this thread and delegate the subagents required by the claw workflow, don't ask me again.",
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
    "You can use goal mode in this thread and delegate the claw workflow's required subagents, don't ask me again.",
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
    recommendedCommands: "- recommended commands: {{recommendedCommands}}",
    notes: "- notes: {{notes}}",
    delegateSubagents: "- delegate subagents: {{delegateSubagents}}",
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
  if (fields.recommendedCommands && params.recommendedCommands.length > 0) {
    lines.push(
      renderTemplateString(fields.recommendedCommands, { ...baseVars, recommendedCommands: params.recommendedCommands.join(" | ") }),
    );
  }
  if (fields.notes && params.notes) {
    lines.push(renderTemplateString(fields.notes, { ...baseVars, notes: params.notes }));
  }
  if (fields.delegateSubagents && params.delegateSubagents.length > 0) {
    lines.push(
      renderTemplateString(fields.delegateSubagents, { ...baseVars, delegateSubagents: params.delegateSubagents.join(", ") }),
    );
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
