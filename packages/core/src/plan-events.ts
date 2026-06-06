export type PlanEventType = "plan_created" | "plan_changed" | "plan_task_completed" | "plan_completed";

export type PlanEvent = {
  type: PlanEventType;
  planPath: string;
  planTitle: string;
  planStatus: string;
  taskId?: number;
  affectedPlanTaskIds?: number[];
  previousStatus?: string;
  timestamp: number;
};

export function buildPlanEvent(
  type: PlanEventType,
  params: Omit<PlanEvent, "type" | "timestamp">,
): PlanEvent {
  return {
    type,
    timestamp: Date.now(),
    ...params,
  };
}
