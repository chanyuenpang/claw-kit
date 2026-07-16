import { randomUUID } from "node:crypto";

export type PlanEventType =
  | "plan_created"
  | "plan_changed"
  | "plan_activated"
  | "plan_task_completed"
  | "plan_completed";

export type PlanEventCommandSource = "plan.create" | "subplan.create" | "plan.edit" | "plan.start" | "plan.done";

export type PlanEvent = {
  schemaVersion: 1;
  eventId: string;
  mutationId: string;
  type: PlanEventType;
  commandSource: PlanEventCommandSource;
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
  params: Omit<PlanEvent, "schemaVersion" | "eventId" | "type" | "timestamp">,
): PlanEvent {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    type,
    timestamp: Date.now(),
    ...params,
  };
}
