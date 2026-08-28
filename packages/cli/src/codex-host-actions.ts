import {
  shouldUsePlanHostIntegration,
  type PlanDocument,
  type PlanEvent,
  type WorkflowGuidance,
} from "@veewo/claw-core";
import type { ClawHostActionV1 } from "@veewo/claw-client";

export function buildCodexHostActions(
  result: {
    planStatus: string;
    previousPlan?: PlanDocument;
    plan?: PlanDocument;
    workflowGuidance: WorkflowGuidance;
    events?: PlanEvent[];
  },
  options: { forceProjectionSync?: boolean; actionIdPrefix?: string; includeLightweightProcessProgress?: boolean } = {},
): ClawHostActionV1[] {
  const latestEvent = result.events?.at(-1);
  const actionIdPrefix = options.actionIdPrefix ?? latestEvent?.mutationId;
  if (!actionIdPrefix) return [];

  const actions: ClawHostActionV1[] = [];
  const isProcessStatus = result.planStatus.startsWith("process.");
  const isEndStatus = result.planStatus.startsWith("end.");
  const goalTool = result.workflowGuidance.goalTool;
  const isSubplanGoalHandoff = Boolean(
    result.plan?.parentPlan
    && goalTool?.tool === "update_goal"
    && goalTool.status === "complete",
  );
  if (isSubplanGoalHandoff) {
    actions.push({
      schemaVersion: 1,
      id: `${actionIdPrefix}:update_goal`,
      tool: "update_goal",
      input: { status: "complete" },
    });
  }
  if (isEndStatus && result.plan) {
    actions.push({
      schemaVersion: 1,
      id: `${actionIdPrefix}:clear_progress`,
      tool: "update_plan",
      input: {
        explanation: result.workflowGuidance.summary,
        plan: [],
      },
    });
  } else if (
    result.plan
    && result.plan.tasks.length > 0
    && (
      shouldUsePlanHostIntegration(result.plan)
      || (options.includeLightweightProcessProgress === true && isProcessStatus)
    )
    && (
      options.forceProjectionSync
      || result.previousPlan?.status !== result.planStatus
      || codexPlanProjectionChanged(result.previousPlan, result.plan, result.planStatus)
    )
  ) {
    actions.push({
      schemaVersion: 1,
      id: `${actionIdPrefix}:update_plan`,
      tool: "update_plan",
      input: {
        explanation: result.workflowGuidance.summary,
        plan: buildCodexPlanProjection(result.plan, result.planStatus),
      },
    });
  }
  if (isEndStatus && !isSubplanGoalHandoff) {
    actions.push({
      schemaVersion: 1,
      id: `${actionIdPrefix}:update_goal`,
      tool: "update_goal",
      input: { status: "complete" },
    });
  } else if (goalTool && !isSubplanGoalHandoff) {
    actions.push(goalTool.tool === "create_goal"
      ? {
          schemaVersion: 1,
          id: `${actionIdPrefix}:create_goal`,
          tool: "create_goal",
          input: { objective: goalTool.objective },
        }
      : {
          schemaVersion: 1,
          id: `${actionIdPrefix}:update_goal`,
          tool: "update_goal",
          input: { status: goalTool.status },
        });
  }
  return actions;
}

export function buildCodexPlanProjection(
  plan: PlanDocument,
  planStatus: string,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const activeTask = plan.tasks.find(
    (task) => task.status === "in_progress" || task.status === "subagent_running",
  ) ?? (planStatus === "process.active"
    ? plan.tasks.find((task) => task.status !== "done")
    : undefined);
  return plan.tasks.map((task) => ({
    step: task.title,
    status: task.status === "done"
      ? "completed"
      : task.id === activeTask?.id
        ? "in_progress"
        : "pending",
  }));
}

function codexPlanProjectionChanged(
  previousPlan: PlanDocument | undefined,
  plan: PlanDocument,
  planStatus: string,
): boolean {
  if (!previousPlan) return true;
  return JSON.stringify(buildCodexPlanProjection(previousPlan, previousPlan.status))
    !== JSON.stringify(buildCodexPlanProjection(plan, planStatus));
}
