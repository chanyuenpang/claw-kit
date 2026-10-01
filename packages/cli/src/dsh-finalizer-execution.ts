import {
  inspectDshFinalizerExecutions, reserveDshFinalizerExecution, markDshFinalizerDelivery,
  releaseDshFinalizerExecution, resolveProjectContext, type DshFinalizerExecution,
} from "@veewo/claw-core";
import { findProjectKnowledgeJob } from "./knowledge-command.js";

/** Adapter-only facade: parent/actor comes from host-forged environment, not model args. */
export function reserveDshFinalizerExecutionCommand(input: {
  cwd: string; parentSessionId: string; finalizeId: string;
  route: DshFinalizerExecution["route"]; memberSessionId: string; teamId?: string;
  provider: string; configFingerprint: string;
}) {
  const project = resolveProjectContext(input.cwd);
  const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId, true);
  return reserveDshFinalizerExecution({ ...input, project, jobPath });
}

export function markDshFinalizerDeliveryCommand(input: {
  cwd: string; parentSessionId: string; finalizeId: string; deliveryKey: string;
  state: "attempted" | "accepted" | "uncertain"; receiptId?: string;
}) {
  const project = resolveProjectContext(input.cwd);
  const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId, true);
  return markDshFinalizerDelivery({ ...input, project, jobPath });
}

export function inspectDshFinalizerExecutionsCommand(input: {
  cwd: string; parentSessionId: string; finalizeId?: string;
}) {
  const project = resolveProjectContext(input.cwd);
  if (input.finalizeId) findProjectKnowledgeJob(project.projectRoot, input.finalizeId, true);
  return { executions: inspectDshFinalizerExecutions({ ...input, project }) };
}

export function releaseDshFinalizerExecutionCommand(input: {
  cwd: string; actorSessionId: string; finalizeId: string;
}) {
  const project = resolveProjectContext(input.cwd);
  const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId, true);
  return releaseDshFinalizerExecution({ ...input, project, jobPath });
}
