import path from "node:path";
import { randomBytes } from "node:crypto";
import { ClawError } from "./errors.js";
import { withFileLock, writeJsonFileAtomic } from "./io.js";
import { listKnowledgeFinalizationJobs, readKnowledgeFinalizationJob } from "./knowledge-sidecar.js";
import type { ProjectContext } from "./types.js";

export type OpenCodeFinalizerExecution = {
  parentSessionId: string;
  childSessionId?: string;
  messageId: string;
  state: "create-attempted" | "created" | "send-attempted" | "accepted" | "rejected" | "unknown";
};

/** Read-only recovery, including child classification; never exposes claim credentials. */
export function inspectOpenCodeFinalizerExecutions(project: ProjectContext, actorSessionId: string) {
  return listKnowledgeFinalizationJobs(project).flatMap((jobPath) => {
    const job = readKnowledgeFinalizationJob(jobPath);
    const execution = job.opencodeExecution;
    if (job.host !== "opencode" || path.resolve(job.projectRoot) !== path.resolve(project.projectRoot)
      || (job.sessionId !== actorSessionId && execution?.childSessionId !== actorSessionId)) return [];
    const expired = job.expiresAt && Date.parse(job.expiresAt) <= Date.now();
    return [{ finalizeId: job.finalizeId, jobPath, status: expired && (job.status === "queued" || job.status === "running") ? "expired" : job.status,
      execution, error: job.operationalFailure?.code, claimed: !!job.claimReceipt }];
  });
}

/** Reserve before each external effect. A crash after reservation never authorizes replay. */
export function transitionOpenCodeFinalizerExecution(input: {
  project: ProjectContext; jobPath: string; parentSessionId: string;
  action: "reserve" | "bind" | "attempt" | "accepted" | "rejected" | "unknown";
  childSessionId?: string;
}) {
  return withFileLock(input.jobPath, () => {
    const job = readKnowledgeFinalizationJob(input.jobPath);
    if (!input.parentSessionId.trim() || job.host !== "opencode" || job.sessionId !== input.parentSessionId
      || path.resolve(job.projectRoot) !== path.resolve(input.project.projectRoot)) {
      throw new ClawError("KNOWLEDGE_CLAIM_OWNER_MISMATCH", "OpenCode dispatch requires the canonical parent and project.");
    }
    const current = job.opencodeExecution;
    let next: OpenCodeFinalizerExecution;
    if (input.action === "reserve") {
      if (current || job.status !== "queued" || (job.expiresAt && Date.parse(job.expiresAt) <= Date.now())) return { execute: false, execution: current };
      next = { parentSessionId: input.parentSessionId, messageId: "msg_" + randomBytes(16).toString("hex"), state: "create-attempted" };
    } else {
      if (!current) throw new ClawError("KNOWLEDGE_JOB_NOT_CLAIMED", "No OpenCode dispatch reservation exists.");
      if (input.action === "bind") {
        if (current.state !== "create-attempted" || !input.childSessionId?.trim() || input.childSessionId === input.parentSessionId)
          throw new ClawError("KNOWLEDGE_CLAIM_OWNER_MISMATCH", "Child association cannot be replaced.");
        next = { ...current, childSessionId: input.childSessionId, state: "created" };
      } else if (input.action === "attempt") {
        if (current.state !== "created" || job.status !== "queued") return { execute: false, execution: current };
        next = { ...current, state: "send-attempted" };
      } else {
        if (current.state !== "create-attempted" && current.state !== "send-attempted") return { execute: false, execution: current };
        if (input.action === "accepted" && current.state !== "send-attempted") throw new ClawError("KNOWLEDGE_JOB_NOT_CLAIMED", "No prompt attempt exists.");
        next = { ...current, state: input.action };
      }
    }
    writeJsonFileAtomic(input.jobPath, { ...job, opencodeExecution: next });
    return { execute: input.action === "reserve" || input.action === "attempt", execution: next };
  });
}
