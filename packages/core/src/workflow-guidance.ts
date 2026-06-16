import path from "node:path";
import workflowGuidanceConfigJson from "./workflow-guidance.config.json" with { type: "json" };
import type {
  PlanCompletionHooks,
  PlanDocument,
  ProjectConfig,
  PlanTask,
  PlanStatus,
  WorkflowGuidance,
  WorkflowGuidanceSubagent,
  WorkflowGuidanceOption,
} from "./types.js";

type DelegateConfigKey = "truthWriter" | "adrWriter";

type GoalModeTemplate = {
  allowOverwrite: true;
  setWhen?: "on_enter_process_active" | "on_resume_process_active";
};

type GuidanceStateTemplate = {
  stage: WorkflowGuidance["stage"] | "{{processStage}}";
  summary: string;
  nextsteps: string[];
  notes?: string;
  recommendedCommands?: string[];
  delegateSubagents?: DelegateConfigKey[];
  goalMode?: GoalModeTemplate;
  askUser?: {
    reason: string;
    useCodexOptions: true;
    options: WorkflowGuidanceOption[];
  };
};

type GuidanceConfig = {
  goalModeObjective: {
    withGoal: string;
    withoutGoal: string;
  };
  delegates: Record<DelegateConfigKey, Omit<WorkflowGuidanceSubagent, "skill"> & { fallbackSkill: string }>;
  states: Record<string, GuidanceStateTemplate>;
};

type TemplateVars = Record<string, string>;

const workflowGuidanceConfig = workflowGuidanceConfigJson as GuidanceConfig;

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

function buildGoalModeObjective(planGoal: string): string {
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
  return projectConfig?.workflow?.goalMode?.enabled !== false;
}

function usesPerTaskTruthDispatch(projectConfig: ProjectConfig | null): boolean {
  return projectConfig?.workflow?.truthDispatch?.mode !== "final_only";
}

export function buildDirectWorkflowGuidance(params: {
  projectConfig?: ProjectConfig | null;
} = {}): WorkflowGuidance {
  const { projectConfig = null } = params;
  return {
    stage: "done",
    summary: "This was a low-complexity task, so no formal plan was needed.",
    nextsteps: [
      "1. If the completed task produced reusable knowledge, read `delegateSubagents` and execute the returned `truth-writer` dispatch contract field-by-field.",
      "2. Let the asynchronously queued completion refresh finish. This direct path reuses the same refresh flow as `claw plan done`.",
    ],
    notes:
      "Tasks with complexity scores below 4 can stay on the direct claw path: run `claw search` before execution when project recall is relevant, solve directly, then dispatch `truth-writer` only when the completed work has reusable truth.",
    delegateSubagents: [truthWriterDelegate(projectConfig)],
  };
}

export function buildPlanWorkflowGuidance(params: {
  taskName: string;
  planFile: string;
  plan: PlanDocument;
  projectConfig?: ProjectConfig | null;
  previousStatus?: PlanStatus;
  completionHooks?: PlanCompletionHooks;
  changedTaskIds?: number[];
  completedTaskIds?: number[];
}): WorkflowGuidance {
  const { taskName, planFile, plan, projectConfig = null, previousStatus, completionHooks, changedTaskIds, completedTaskIds } = params;
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
        ...(template.goalMode && goalModeEnabled && hasGoal ? { goalMode: buildGoalMode(plan.goal.text, template.goalMode) } : {}),
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
      const template = renderStateTemplate(goalModeEnabled ? plan.status : `${plan.status}.noGoalMode`, vars);
      return {
        stage: template.stage as WorkflowGuidance["stage"],
        summary: template.summary,
        nextsteps: template.nextsteps,
        ...(template.notes ? { notes: template.notes } : {}),
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
      };
    }
    case "process.active": {
      if (allTasksDone) {
        const template = renderStateTemplate("process.allTasksDone", vars);
        return {
          stage: template.stage as WorkflowGuidance["stage"],
          summary: template.summary,
          nextsteps: template.nextsteps,
          ...(template.notes ? { notes: template.notes } : {}),
          ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
          ...(template.delegateSubagents
            ? { delegateSubagents: buildConfiguredDelegates(template.delegateSubagents, projectConfig) }
            : {}),
        };
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

      return {
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
        ...(template.goalMode && goalModeEnabled && (justEnteredProcess || resumedIntoActive) && hasGoal
          ? { goalMode: buildGoalMode(plan.goal.text, template.goalMode) }
          : {}),
        ...(template.recommendedCommands ? { recommendedCommands: template.recommendedCommands } : {}),
        ...(hasCompletedTasks && template.delegateSubagents
          ? {
              delegateSubagents: buildConfiguredDelegates(template.delegateSubagents, projectConfig),
            }
          : {}),
      };
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

function normalizeWriterSkill(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}
