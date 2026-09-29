import fs from "node:fs";
import path from "node:path";
import {
  buildKnowledgeAssignmentTemplate,
  buildKnowledgeWriterAssignments,
  claimKnowledgeFinalizationJob,
  doneKnowledgeFinalizationJob,
  findKnowledgeFinalizationJobPath,
  normalizeTruthMarkdownEncoding,
  reconcileKnowledgeFinalizationJob,
  recordKnowledgeFinalizationResult,
  resolveHostIntegrationProfile,
  resolveProjectContext,
  resolveSessionWorkflowContext,
  type KnowledgeFinalizationJob,
  type ProjectContext,
} from "@veewo/claw-core";
import { collectReport, type ReportCollectorHost } from "./report-collector-registry.js";

/** One claim/terminal transition shared by the CLI and authenticated session service. */
export function claimKnowledgeCommand(jobPath: string, version: string) {
  const job = claimKnowledgeFinalizationJob(jobPath, {
    prepare: (queued) => {
      if (queued.writer?.executionPolicy !== "subagent"
        || queued.reportCapture?.mode !== "claim"
        || queued.reportCapture.status === "captured") return;
      if (resolveHostIntegrationProfile(queued.host)?.supportsClaimTimeReportCapture !== true) {
        throw new Error("Claim-time report capture is unavailable for host " + (queued.host ?? "unknown") + ".");
      }
      const receipt = collectReport({
        host: queued.host as ReportCollectorHost,
        sessionId: queued.sessionId,
        projectRoot: queued.projectRoot,
        planPath: queued.planPath,
        canonicalReportPath: queued.reportPath,
        startedAt: queued.reportCapture.startedAt,
      });
      return { reportCapture: { ...queued.reportCapture, status: "captured" as const, capturedAt: receipt.completedAt, receipt } };
    },
  });
  const assignments = job ? buildKnowledgeWriterAssignments(job) : [];
  const templatePath = job ? path.join(path.dirname(jobPath), job.finalizeId + ".assignments.json") : undefined;
  if (job && templatePath) {
    fs.writeFileSync(templatePath, JSON.stringify(buildKnowledgeAssignmentTemplate({ assignments, finalizeId: job.finalizeId, version }), null, 2) + "\n", "utf8");
  }
  return {
    ok: true, command: "knowledge.claim", claimed: Boolean(job),
    ...(job ? {
      finalizeId: job.finalizeId, jobPath, claimToken: job.claimToken, projectRoot: job.projectRoot,
      writer: job.writer ?? null, expiresAt: job.expiresAt, planPath: job.planPath,
      reportPath: job.reportPath, assignments, templatePath,
    } : {}),
  };
}

export function findProjectKnowledgeJob(projectRoot: string, finalizeId: string): string {
  // Only the canonical project's task-local jobs may be reached by session commands.
  const jobPath = findKnowledgeFinalizationJobPath(resolveProjectContext(projectRoot), finalizeId);
  if (!jobPath) throw new Error("Knowledge finalization " + finalizeId + " is unavailable.");
  const project = resolveProjectContext(projectRoot);
  const withinProject = (target: string) => {
    const resolved = fs.realpathSync(target);
    const relative = path.relative(fs.realpathSync(project.clawDir), resolved);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  if (!withinProject(jobPath)) throw new Error("Knowledge finalization job does not belong to the current project.");
  const job = reconcileKnowledgeFinalizationJob(jobPath);
  if (path.resolve(job.projectRoot) !== path.resolve(projectRoot)
    || job.finalizeId.toLowerCase() !== finalizeId.toLowerCase()
    || !withinProject(jobPath)
    || !withinProject(job.planPath)
    || !withinProject(path.dirname(job.reportPath))) {
    throw new Error("Knowledge finalization job does not belong to the current project.");
  }
  return jobPath;
}

function resolveKnowledgeJobProject(jobPath: string, job: KnowledgeFinalizationJob): ProjectContext {
  const project = resolveProjectContext(job.projectRoot);
  const sessionProject = resolveSessionWorkflowContext(job.sessionId);
  for (const candidate of sessionProject ? [sessionProject, project] : [project]) {
    const relative = path.relative(candidate.clawDir, path.resolve(jobPath));
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return candidate;
  }
  throw new Error("Knowledge finalization job is outside its project or session workflow.");
}

export function doneKnowledgeCommand(input: {
  jobPath: string; claimToken: string; status: "succeeded" | "failed"; result?: string; error?: string;
  onSuccess?: (job: KnowledgeFinalizationJob) => void;
}) {
  const { jobPath, claimToken } = input;
  if (input.status === "failed") {
    const terminal = doneKnowledgeFinalizationJob({ jobPath, claimToken, status: "failed", error: input.error });
    removeKnowledgeAssignmentTemplate(jobPath, terminal.job.finalizeId);
    return { ok: true, failed: true, alreadyDone: terminal.alreadyDone, finalizeId: terminal.job.finalizeId };
  }
  const running = reconcileKnowledgeFinalizationJob(jobPath);
  if (running.status === "succeeded") {
    const terminal = doneKnowledgeFinalizationJob({ jobPath, claimToken, status: "succeeded", result: input.result });
    removeKnowledgeAssignmentTemplate(jobPath, running.finalizeId);
    return { ok: true, completed: true, alreadyDone: terminal.alreadyDone, finalizeId: running.finalizeId };
  }
  if (running.status !== "running") throw new Error("Knowledge finalization job must be claimed before successful completion.");
  if (running.claimToken !== claimToken) throw new Error("Knowledge finalization completion does not match the active claim.");
  const project = resolveKnowledgeJobProject(jobPath, running);
  const finishedAt = new Date().toISOString();
  const truthEncoding = normalizeTruthMarkdownEncoding(project);
  recordKnowledgeFinalizationResult(project, running.reportPath, {
    schemaVersion: 1, entryType: "knowledge_finalization", finalizeId: running.finalizeId,
    taskName: running.taskName, recordedAt: finishedAt, status: "succeeded",
    result: input.result ?? "", attempts: running.attempts,
    ...(running.host !== undefined ? { host: running.host } : {}), truthEncoding,
  });
  const terminal = doneKnowledgeFinalizationJob({
    jobPath, claimToken, status: "succeeded", result: input.result, finishedAt, patch: { truthEncoding },
  });
  removeKnowledgeAssignmentTemplate(jobPath, running.finalizeId);
  input.onSuccess?.(running);
  return { ok: true, completed: true, alreadyDone: terminal.alreadyDone, finalizeId: running.finalizeId };
}

function removeKnowledgeAssignmentTemplate(jobPath: string, finalizeId: string): void {
  fs.rmSync(path.join(path.dirname(jobPath), finalizeId + ".assignments.json"), { force: true });
}
