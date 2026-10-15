import { resolveProjectContext, inspectOpenCodeFinalizerExecutions, transitionOpenCodeFinalizerExecution } from "@veewo/claw-core";
import { findProjectKnowledgeJob } from "./knowledge-command.js";

export function openCodeFinalizerExecutionCommand(input: {
  cwd: string; actorSessionId: string; action: "inspect" | "reserve" | "bind" | "attempt" | "accepted" | "rejected" | "unknown";
  finalizeId?: string; childSessionId?: string;
}) {
  const project = resolveProjectContext(input.cwd);
  if (input.action === "inspect") return { executions: inspectOpenCodeFinalizerExecutions(project, input.actorSessionId) };
  const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId!, true);
  return transitionOpenCodeFinalizerExecution({ project, jobPath, parentSessionId: input.actorSessionId, action: input.action, childSessionId: input.childSessionId });
}
