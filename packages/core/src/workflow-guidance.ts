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
    inputContract: "completed subtask report",
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

function formatNextTask(task: PlanTask): string {
  return `#${task.id} ${task.title}`;
}

function requirementsNeedClarification(plan: PlanDocument): boolean {
  return plan.tasks.length === 0;
}

export function buildPlanWorkflowGuidance(params: {
  taskName: string;
  planFile: string;
  plan: PlanDocument;
  projectConfig?: ProjectConfig | null;
  previousStatus?: PlanStatus;
  completionHooks?: PlanCompletionHooks;
  changedTaskIds?: number[];
}): WorkflowGuidance {
  const { taskName, planFile, plan, projectConfig = null, previousStatus, completionHooks, changedTaskIds } = params;
  const scopedPlan = planFile === "plan.json" ? "" : ` --plan ${planFile}`;
  const editBase = `claw plan edit --task ${taskName}${scopedPlan}`;
  const doneBase = `claw plan done --task ${taskName}${scopedPlan}`;
  const hasTasks = plan.tasks.length > 0;
  const allTasksDone = hasTasks && plan.tasks.every((task) => task.status === "done");
  const justEnteredProcess = previousStatus?.startsWith("prepare.") && plan.status.startsWith("process.");
  const justCompletedTasks = (changedTaskIds?.length ?? 0) > 0;
  const nextTask = nextUnfinishedTask(plan);
  const needsClarification = requirementsNeedClarification(plan);

  switch (plan.status) {
    case "prepare.requirements":
      return {
        stage: "requirements",
        summary: "Task scope is bound. Enter goal mode first, then decide whether requirements are clear enough to execute.",
        nextStep:
          needsClarification
            ? "Enter goal mode from `workflowGuidance.goalMode`, review whether requirements are clear, and if they are not, ask the user to clarify before execution begins."
            : "Enter goal mode from `workflowGuidance.goalMode`, verify requirements are already clear, then move directly to `process.active` before doing any implementation or task execution.",
        notes: [
          "The legacy `claw context` workflow step is now handled by session bootstrap hooks instead of the post-plan workflow.",
          "After `plan write`, goal mode is the first required follow-up action.",
          "Do not start implementation while the plan is still in `prepare.requirements`.",
          needsClarification
            ? "If requirements are still ambiguous, resolve that ambiguity before moving into `process.active`."
            : "Requirements already look clear enough to move directly into `process.active`.",
        ],
        recommendedCommands: [
          `${editBase} --patch <updated-plan.json>`,
          `${editBase} --plan-status process.active`,
          `${editBase} --plan-status process.discussing`,
        ],
        goalMode: {
          recommendedObjective: buildGoalModeObjective(plan.goal.text),
          setWhen: "on_plan_write" as const,
          ifNoActiveGoal: true as const,
          doNotOverwriteExisting: true as const,
          supportedSurfaces: ["/goal", "create_goal"] as Array<"/goal" | "create_goal">,
        },
        ...(needsClarification
          ? {
              askUser: {
                reason: "Requirements are not yet clear enough to start execution directly.",
                useCodexOptions: true as const,
                options: [
                  {
                    id: "clarify-requirements",
                    label: "Clarify requirements",
                    description: "Collect the missing scope or constraints before execution starts.",
                    recommended: true,
                  },
                  {
                    id: "revise-plan",
                    label: "Revise plan",
                    description: "Update goal, tasks, or sequencing to make the plan execution-ready.",
                  },
                  {
                    id: "pause-discussion",
                    label: "Discuss first",
                    description: "Keep the plan in discussion until the user resolves the ambiguity.",
                  },
                ],
              },
            }
          : {}),
      };
    case "prepare.review":
      return {
        stage: "review",
        summary: "This plan is in a legacy review stage.",
        nextStep:
          "Fold any remaining review notes into the plan, confirm the route with the user, then move back into process.*.",
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
          "Dispatch `truth-writer`, complete the retrospective, then close the plan with `claw plan done`.",
        notes: [
          "`all task done` is not ADR completion.",
          "ADR happens after completed `plan.json` exists.",
          "If the host shows thread progress, sync it to the current plan state now.",
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
          justEnteredProcess
            ? `Confirm the route with the user if needed, then start with ${nextTask ? formatNextTask(nextTask) : "the next task"} and update task status as work progresses.`
            : `Continue execution with ${nextTask ? formatNextTask(nextTask) : "the next task"}, update task status with \`claw plan edit\`, and close with \`claw plan done\` when work is complete.`,
        ...(nextTask
          ? {
              nextTask: {
                id: nextTask.id,
                title: nextTask.title,
                status: nextTask.status,
                ...(nextTask.detail ? { detail: nextTask.detail } : {}),
              },
            }
          : {}),
        notes: [
          "Use delegated specialists for truth and ADR deposition.",
          "In `process.active`, keep moving unless there is a real blocker or explicit user interruption.",
          "If the host shows thread progress, sync it after this plan edit.",
          ...(justCompletedTasks
            ? [
                "If the completed subtask produced reusable knowledge, dispatch truth-writer.",
                `Continue with next task: ${nextTask ? `id ${nextTask.id} content ${nextTask.title}` : "id <next> content <next task>"}.`,
              ]
            : []),
        ],
        recommendedCommands: [
          `${editBase} --task-id <id> --task-status done`,
          `${doneBase} --summary \"<retrospective summary>\"`,
        ],
        ...(justEnteredProcess
          ? {
              askUser: {
                reason: "Execution is starting and any remaining route choice should be made explicit with the user.",
                useCodexOptions: true,
                options: [
                  {
                    id: "execute-current-route",
                    label: "Execute route",
                    description: "Proceed with the current plan as written.",
                    recommended: true,
                  },
                  {
                    id: "revise-before-execution",
                    label: "Revise first",
                    description: "Adjust the plan before deeper implementation begins.",
                  },
                  {
                    id: "pause-for-input",
                    label: "Pause for input",
                    description: "Wait for additional requirements or direction from the user.",
                  },
                ],
              },
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
