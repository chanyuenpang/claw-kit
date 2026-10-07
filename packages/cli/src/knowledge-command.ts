import fs from "node:fs";
import path from "node:path";
import {
  buildKnowledgeAssignmentTemplate,
  buildKnowledgeWriterAssignments,
  claimKnowledgeFinalizationJob,
  doneKnowledgeFinalizationJob,
  findKnowledgeFinalizationJobPath,
  normalizeTruthMarkdownEncoding,
  readKnowledgeClaimReceipt,
  readKnowledgeFinalizationJob,
  withFileLock,
  writeJsonFileAtomic,
  type KnowledgeClaimant,
  reconcileKnowledgeFinalizationJob,
  recordKnowledgeFinalizationResult,
  resolveHostIntegrationProfile,
  resolveProjectContext,
  resolveSessionWorkflowContext,
  resolveSessionBoundPlan,
  type KnowledgeFinalizationJob,
  type ProjectContext,
} from "@veewo/claw-core";
import { collectReport, type ReportCollectorHost } from "./report-collector-registry.js";

/** One claim/terminal transition shared by the CLI and authenticated session service. */
export function claimKnowledgeCommand(jobPath: string, version: string, claimant?: KnowledgeClaimant) {
  const observed = readKnowledgeFinalizationJob(jobPath);
  if (observed.dshExecution && claimant && readKnowledgeClaimReceipt(jobPath, claimant)) {
    return knowledgeClaimReceiptCommand(jobPath, claimant, "knowledge.claim");
  }
  const job = claimKnowledgeFinalizationJob(jobPath, {
    claimant, version,
    resolveDelegatePlan: () => {
      if (!claimant) return undefined;
      const session = resolveSessionWorkflowContext(claimant.agentSessionId);
      const planPath = session && resolveSessionBoundPlan(session, claimant.agentSessionId);
      if (!session || session.scope !== "session" || !planPath
        || path.resolve(session.projectRoot) !== path.resolve(claimant.projectRoot)) {
        if (observed.dshExecution) throw new Error("DSH_DELEGATE_PLAN_REQUIRED: no current session delegate for admitted child.");
        return undefined;
      }
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as { templateId?: string; knowledgeCapture?: boolean };
      const delegateTemplate = ["internal-knowledge-delegate", "internal-cindy-knowledge-delegate", "internal-dsh-knowledge-delegate"].includes(plan.templateId ?? "");
      // This selects an optional closeout target, not permission to claim.
      if (!observed.dshExecution && (!delegateTemplate || plan.knowledgeCapture !== false)) return undefined;
      return { planPath, scope: "session", projectRoot: session.projectRoot, ownerSessionId: claimant.agentSessionId };
    },
    prepare: (queued) => {
      if (queued.reportCapture?.mode !== "claim"
        || queued.reportCapture.status === "captured") return;
      // DSH captures through its live parent adapter before dispatch. An empty
      // proven history has a valid receipt; a missing Host handoff is not proof of emptiness.
      if (queued.host === "dsh") throw new Error("DSH_REPORT_CAPTURE_REQUIRED: dsh");
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
        endedAt: queued.reportCapture.endedAt,
      });
      return { reportCapture: { ...queued.reportCapture, status: "captured" as const, capturedAt: receipt.completedAt, receipt } };
    },
  });
  // DSH returns only its committed receipt, including on the first response.
  if (job?.claimReceipt) return knowledgeClaimReceiptCommand(jobPath, claimant!, "knowledge.claim");
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

/** Canonical job is read-only; only its disposable template projection may be repaired. */
export function knowledgeClaimReceiptCommand(jobPath: string, claimant: KnowledgeClaimant, command = "knowledge.claim.receipt") {
  return withFileLock(jobPath, () => {
    const job = readKnowledgeClaimReceipt(jobPath, claimant);
    if (!job) return { ok: true, command, claimed: false };
    const receipt = job.claimReceipt!;
    const templatePath = path.join(path.dirname(jobPath), job.finalizeId + ".assignments.json");
    const serialized = JSON.stringify(receipt.template, null, 2) + "\n";
    if (!fs.existsSync(templatePath) || fs.readFileSync(templatePath, "utf8") !== serialized) {
      writeJsonFileAtomic(templatePath, receipt.template);
    }
    return {
      ok: true, command, claimed: true,
      finalizeId: job.finalizeId, jobPath, claimToken: receipt.claimToken, projectRoot: job.projectRoot,
      writer: job.writer ?? null, expiresAt: job.expiresAt, planPath: job.planPath,
      reportPath: job.reportPath, assignments: receipt.assignments, templatePath,
    };
  });
}

export function findProjectKnowledgeJob(projectRoot: string, finalizeId: string, readOnly = false): string {
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
  const job = readOnly ? readKnowledgeFinalizationJob(jobPath) : reconcileKnowledgeFinalizationJob(jobPath);
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
  /** Keep the frozen template while the runtime closes or recovers its plan. */
  retainTemplate?: boolean;
}) {
  const { jobPath, claimToken } = input;
  if (input.status === "failed") {
    const terminal = doneKnowledgeFinalizationJob({ jobPath, claimToken, status: "failed", error: input.error });
    if (!input.retainTemplate) removeKnowledgeAssignmentTemplate(jobPath, terminal.job.finalizeId);
    return { ok: true, failed: true, alreadyDone: terminal.alreadyDone, finalizeId: terminal.job.finalizeId };
  }
  const running = reconcileKnowledgeFinalizationJob(jobPath);
  if (running.status === "succeeded") {
    const terminal = doneKnowledgeFinalizationJob({ jobPath, claimToken, status: "succeeded", result: input.result });
    if (!input.retainTemplate) removeKnowledgeAssignmentTemplate(jobPath, running.finalizeId);
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
  if (!input.retainTemplate) removeKnowledgeAssignmentTemplate(jobPath, running.finalizeId);
  input.onSuccess?.(running);
  return { ok: true, completed: true, alreadyDone: terminal.alreadyDone, finalizeId: running.finalizeId };
}

export function removeKnowledgeAssignmentTemplate(jobPath: string, finalizeId: string): { error?: string } {
  try {
    fs.rmSync(path.join(path.dirname(jobPath), finalizeId + ".assignments.json"), { force: true });
    return {};
  } catch (error) {
    // Disposal is a projection effect, never a reason to replay knowledge.done.
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
