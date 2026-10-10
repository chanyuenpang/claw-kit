import fs from "node:fs";
import path from "node:path";
import {
  ClawError, withExecutionFailure,
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
  type KnowledgeCompletionCredentials,
  type KnowledgeClaimant,
  type KnowledgeDelegatePlan,
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

function resolveDirectDelegate(claimant: KnowledgeClaimant): KnowledgeDelegatePlan | undefined {
  const project = resolveProjectContext(claimant.projectRoot);
  const legacy = resolveSessionWorkflowContext(claimant.agentSessionId, { readOnly: true });
  const candidates = [project, legacy].flatMap((target) => {
    if (!target || path.resolve(target.projectRoot) !== path.resolve(claimant.projectRoot)) return [];
    const planPath = resolveSessionBoundPlan(target, claimant.agentSessionId);
    if (!planPath) return [];
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as { status?: string };
    return plan.status?.startsWith("end.") ? [] : [{ planPath, scope: target.scope ?? "project", projectRoot: target.projectRoot, ownerSessionId: claimant.agentSessionId }];
  });
  if (candidates.length > 1) throw new Error("KNOWLEDGE_DELEGATE_CONFLICT: more than one current workflow.");
  return candidates[0];
}

/** One claim/terminal transition shared by the CLI and authenticated session service. */
export function claimKnowledgeCommand(jobPath: string, version: string, claimant?: KnowledgeClaimant, currentDelegate?: () => KnowledgeDelegatePlan | undefined) {
  const observed = readKnowledgeFinalizationJob(jobPath);
  if (observed.dshExecution && claimant && readKnowledgeClaimReceipt(jobPath, claimant)) {
    return knowledgeClaimReceiptCommand(jobPath, claimant, "knowledge.claim");
  }
  const job = claimKnowledgeFinalizationJob(jobPath, {
    claimant, version,
    resolveDelegatePlan: () => {
      if (!claimant) return undefined;
      // Session-command callers supply exact current focus. The fallback only
      // serves legacy direct CLI callers without that application context.
      const delegate = currentDelegate ? currentDelegate() : resolveDirectDelegate(claimant);
      if (!delegate) return undefined;
      const plan = JSON.parse(fs.readFileSync(delegate.planPath, "utf8")) as { knowledgeCapture?: boolean; title?: string; tasks?: Array<{ execution?: { lifecycle?: string } }> };
      if (plan.knowledgeCapture !== false) return undefined; // Unrelated capturing work is not claim authorization or auxiliary association.
      // The admitted child's canonical binding selects the association; template label,
      // phase and content heuristics are not authorization.
      return delegate;
    },
    prepare: (queued, evidence) => {
      if (queued.reportCapture?.mode !== "claim"
        || queued.reportCapture.status === "captured") return;
      // DSH captures through its live parent adapter before dispatch. An empty
      // proven history has a valid receipt; a missing Host handoff is not proof of emptiness.
      if (queued.host === "dsh") throw new ClawError("DSH_REPORT_CAPTURE_REQUIRED", "The DSH parent report capture has not been handed off.");
      if (resolveHostIntegrationProfile(queued.host)?.supportsClaimTimeReportCapture !== true) {
        throw new ClawError("KNOWLEDGE_REPORT_COLLECTOR_UNAVAILABLE", "Claim-time report capture is unavailable for host " + (queued.host ?? "unknown") + ".");
      }
      Object.assign(evidence, { phase: "report-capture", outcome: "unknown", effect: "unknown" });
      const receipt = collectReport({
        host: queued.host as ReportCollectorHost,
        sessionId: queued.sessionId,
        projectRoot: queued.projectRoot,
        planPath: queued.planPath,
        canonicalReportPath: queued.reportPath,
        startedAt: queued.reportCapture.startedAt,
        endedAt: queued.reportCapture.endedAt,
      });
      Object.assign(evidence, { phase: "prepare", outcome: "known", effect: "partial" });
      return { reportCapture: { ...queued.reportCapture, status: "captured" as const, capturedAt: receipt.completedAt, receipt } };
    },
  });
  // All trusted hosts return the committed claim materials, including the first response.
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
  try {
  // Only the canonical project's task-local jobs may be reached by session commands.
  const jobPath = findKnowledgeFinalizationJobPath(resolveProjectContext(projectRoot), finalizeId);
  if (!jobPath) throw new ClawError("KNOWLEDGE_JOB_UNAVAILABLE", "Knowledge finalization " + finalizeId + " is unavailable.");
  const project = resolveProjectContext(projectRoot);
  const withinProject = (target: string) => {
    const resolved = fs.realpathSync(target);
    const relative = path.relative(fs.realpathSync(project.clawDir), resolved);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  if (!withinProject(jobPath)) throw new ClawError("KNOWLEDGE_JOB_SCOPE_INVALID", "Knowledge finalization job does not belong to the current project.");
  const job = readOnly ? readKnowledgeFinalizationJob(jobPath) : reconcileKnowledgeFinalizationJob(jobPath);
  if (path.resolve(job.projectRoot) !== path.resolve(projectRoot)
    || job.finalizeId.toLowerCase() !== finalizeId.toLowerCase()
    || !withinProject(jobPath)
    || !withinProject(job.planPath)
    || !withinProject(path.dirname(job.reportPath))) {
    throw new ClawError("KNOWLEDGE_JOB_SCOPE_INVALID", "Knowledge finalization job does not belong to the current project.");
  }
  return jobPath;
  } catch (error) {
    if (readOnly) throw withExecutionFailure(error, { phase: "prepare", outcome: "known", effect: "none" });
    throw error;
  }
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

export function doneKnowledgeCommand(input: KnowledgeCompletionCredentials & {
  jobPath: string; status: "succeeded" | "failed"; result?: string; error?: string;
  onSuccess?: (job: KnowledgeFinalizationJob) => void;
  /** Keep the frozen template while the runtime closes or recovers its plan. */
  retainTemplate?: boolean;
}) {
  // Exactly one authoritative owner call; no pre-validation reconcile, report
  // or document encoding mutation can turn a credential refusal into unknown.
  const terminal = doneKnowledgeFinalizationJob(input);
  const job = terminal.job;
  const postCommitFailures: Array<{ effect: string; message: string }> = [];
  if (input.status === "succeeded" && !terminal.alreadyDone) {
    try {
      const project = resolveKnowledgeJobProject(input.jobPath, job);
      const truthEncoding = normalizeTruthMarkdownEncoding(project);
      recordKnowledgeFinalizationResult(project, job.reportPath, {
        schemaVersion: 1, entryType: "knowledge_finalization", finalizeId: job.finalizeId,
        taskName: job.taskName, recordedAt: job.finishedAt ?? new Date().toISOString(), status: "succeeded",
        result: job.finalResponse ?? "", attempts: job.attempts,
        ...(job.host !== undefined ? { host: job.host } : {}), truthEncoding,
      });
    } catch (error) { postCommitFailures.push({ effect: "knowledge.report", message: error instanceof Error ? error.message : String(error) }); }
    try { input.onSuccess?.(job); }
    catch (error) { postCommitFailures.push({ effect: "knowledge.success", message: error instanceof Error ? error.message : String(error) }); }
  }
  if (!input.retainTemplate) {
    const cleanup = removeKnowledgeAssignmentTemplate(input.jobPath, job.finalizeId);
    if (cleanup.error) postCommitFailures.push({ effect: "knowledge.template-cleanup", message: cleanup.error });
  }
  return { ok: true, command: "knowledge.done", ...(input.status === "succeeded" ? { completed: true } : { failed: true }),
    alreadyDone: terminal.alreadyDone, finalizeId: job.finalizeId,
    ...(postCommitFailures.length ? { postCommitFailures, completionEffect: "committed" } : {}) };
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
