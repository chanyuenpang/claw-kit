import path from "node:path";
import type {
  PlanCompletionHooks,
  PlanDocument,
  ProjectConfig,
  PlanTask,
  PlanStatus,
  WorkflowGuidance,
  WorkflowGuidanceSubagent,
} from "./types.js";

function truthWriterDelegate(projectConfig: ProjectConfig | null): WorkflowGuidanceSubagent {
  return {
    name: "truth-writer",
    skill: normalizeWriterSkill(projectConfig?.externalTruthSkill, "claw-kit:truth-writer"),
    model: "gpt-5.4-mini",
    waitForCompletion: false,
    preferReuseSameTypeInThread: true,
    inputContract: "curated completed subtask report with valuable findings for truth deposition",
    outputContract: "optional telemetry only",
    closePolicy: "keep_open_for_reuse",
  };
}

function adrWriterDelegate(projectConfig: ProjectConfig | null): WorkflowGuidanceSubagent {
  return {
    name: "adr-writer",
    skill: normalizeWriterSkill(projectConfig?.externalAdrSkill, "claw-kit:adr-writer"),
    model: "gpt-5.4-mini",
    waitForCompletion: false,
    preferReuseSameTypeInThread: true,
    inputContract: "completed plan.json only",
    outputContract: "optional telemetry only",
    closePolicy: "keep_open_for_reuse",
  };
}

function buildGoalModeObjective(planGoal: string): string {
  return `\u6309\u7167 claw \u6d41\u7a0b\uff0c\u63a8\u8fdb\u4efb\u52a1\uff0c\u66f4\u65b0plan\uff0c\u5b8c\u6210\uff1a${planGoal}`;
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
  const justEnteredProcess = previousStatus?.startsWith("prepare.") && plan.status.startsWith("process.");
  const hasChangedTasks = (changedTaskIds?.length ?? 0) > 0;
  const hasCompletedTasks = (completedTaskIds?.length ?? 0) > 0;
  const nextTask = nextUnfinishedTask(plan);
  const activeTask = currentActiveTask(plan);
  const shouldReturnNextTask = hasCompletedTasks || justEnteredProcess || (!hasChangedTasks && !activeTask);

  switch (plan.status) {
    case "prepare.requirements":
      return {
        stage: "requirements",
        summary: "Task scope is bound. Enter goal mode first, then decide whether requirements are clear enough to execute.",
        nextStep:
          "1. Enter goal mode with the recommended objective. 2. Review whether requirements are clear enough to execute. 3. Fill the `requirements` section and any other needed plan fields such as `tasks`, `references`, `rules`, and `keyDecisions`. 4. If requirements are clear, move into `process.active`. 5. If requirements are not clear, ask the user to clarify the missing scope first.",
        notes: [
          "Do not start implementation while the plan is still in `prepare.requirements`.",
        ],
        recommendedCommands: [
          `${editBase} --patch <updated-plan.json>`,
          `${editBase} --rule "..." --key-decision "..."`,
          `${editBase} --plan-status process.active`,
        ],
        goalMode: {
          recommendedObjective: buildGoalModeObjective(plan.goal.text),
          allowOverwrite: true as const,
        },
      };
    case "prepare.review":
      return {
        stage: "review",
        summary: "This plan is in a legacy review stage.",
        nextStep:
          "1. Fold the remaining review notes into the plan. 2. Confirm the route with the user. 3. Move the plan back into `prepare.requirements` or `process.discussing`.",
        notes: ["Do not create a separate review pass. Merge review criteria into planning itself."],
        recommendedCommands: [
          `${editBase} --patch <reviewed-plan.json>`,
          `${editBase} --plan-status prepare.requirements`,
          `${editBase} --plan-status process.discussing`,
        ],
        askUser: {
          reason: "This legacy review stage should be resolved back into normal planning before execution.",
          useCodexOptions: true,
          options: [
            {
              id: "merge-revisions",
              label: "Revise plan",
              description: "Apply the remaining plan changes directly, then continue with normal planning.",
              recommended: true,
            },
            {
              id: "discuss-tradeoff",
              label: "Discuss tradeoff",
              description: "The review raised a route choice that should be clarified with the user.",
            },
            {
              id: "hold-plan",
              label: "Hold execution",
              description: "Pause until missing requirements or constraints are clarified.",
            },
          ],
        },
      };
    case "process.active":
    case "process.wait":
    case "process.discussing":
      if (allTasksDone) {
      return {
        stage: "done",
        summary: "All plan tasks are done. Do truth deposition, then close the plan.",
        nextStep:
          "1. Sync the thread progress with our tasks. 2. Curate the valuable findings from the completed work into a completed subtask report, then dispatch `truth-writer` with that report. 3. Close the plan with `claw plan done` after writing the retrospective summary.",
        notes: [
          "`all task done` is not ADR completion.",
          "ADR happens after completed `plan.json` exists.",
        ],
          recommendedCommands: [
            `${doneBase} --summary \"<retrospective summary>\"`,
          ],
          delegateSubagents: [truthWriterDelegate(projectConfig)],
        };
      }

      return {
        stage: plan.status === "process.discussing" ? "discussion" : "execution",
        summary: justEnteredProcess
          ? "Execution is starting."
          : "Execution is in progress.",
        nextStep:
          hasCompletedTasks
            ? `1. Sync the thread progress with our tasks. 2. Curate the valuable findings from the completed task into a completed subtask report, then dispatch \`truth-writer\` with that report. 3. Continue with ${nextTask ? formatTaskRef(nextTask) : "the next task"}.`
            : justEnteredProcess
              ? `1. Sync the thread progress with our tasks. 2. Start with ${nextTask ? formatTaskRef(nextTask) : "the next task"}.`
              : activeTask
                ? "Continue the current task."
                : `Continue with ${nextTask ? formatTaskRef(nextTask) : "the next task"}.`,
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
        ...(hasCompletedTasks || justEnteredProcess
          ? {
              notes: [
                "Use delegated specialists for truth and ADR deposition.",
                "In `process.active`, keep moving unless there is a real blocker or explicit user interruption.",
              ],
            }
          : {}),
        recommendedCommands: [
          ...(activeTask && !hasCompletedTasks && !justEnteredProcess
            ? [`${editBase} --task-id ${activeTask.id} --task-status done`]
            : [`${editBase} --task-id <id> --task-status done`]),
          ...(hasCompletedTasks || justEnteredProcess ? [`${doneBase} --summary \"<retrospective summary>\"`] : []),
        ],
        ...(hasCompletedTasks
          ? {
              delegateSubagents: [truthWriterDelegate(projectConfig)],
            }
          : {}),
      };
    case "end.completed":
      return {
        stage: "deposition",
        summary: "The plan is completed. Deposit ADRs now.",
        nextStep:
          "Dispatch `adr-writer` with the completed `plan.json`.",
        notes: [
        ...(completionHooks?.truthCandidate.suggestedTruthPaths.length
            ? [`Suggested truth targets: ${completionHooks.truthCandidate.suggestedTruthPaths.join(", ")}`]
            : []),
          "Use completed `plan.json` as the ADR bundle.",
        ],
        delegateSubagents: [adrWriterDelegate(projectConfig)],
      };
    case "end.closed":
    case "end.leave":
      return {
        stage: "paused",
        summary: "The plan is no longer active.",
        nextStep:
          "Reopen through `prepare.requirements` before resuming, or leave it as historical context.",
        recommendedCommands: [`${editBase} --plan-status prepare.requirements`],
      };
  }
}

function normalizeWriterSkill(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}
