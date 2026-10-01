import path from "node:path";
import {
  findKnowledgeFinalizationJobPath, listKnowledgeFinalizationJobs, readKnowledgeFinalizationJob,
  recordDshOperationalFailure, resolveProjectContext,
} from "@veewo/claw-core";

export function recordDshFinalizerIssue(input: {
  cwd: string; parentSessionId: string; finalizeId: string;
  phase: "capture" | "dispatch" | "writer"; code: string; correlationId: string;
}) {
  const project = resolveProjectContext(input.cwd);
  if (project.scope !== "project" || !/^[a-f0-9]{64}$/i.test(input.finalizeId)) {
    throw new Error("DSH_FINALIZER_DIAGNOSTIC_INVALID: project or finalize ID.");
  }
  const jobPath = findKnowledgeFinalizationJobPath(project, input.finalizeId);
  if (!jobPath) throw new Error("DSH_FINALIZER_DIAGNOSTIC_UNAVAILABLE: canonical job missing.");
  const job = readKnowledgeFinalizationJob(jobPath);
  if (path.resolve(job.projectRoot) !== path.resolve(project.projectRoot)) {
    throw new Error("DSH_FINALIZER_DIAGNOSTIC_DENIED: project mismatch.");
  }
  return recordDshOperationalFailure({ jobPath, parentSessionId: input.parentSessionId,
    phase: input.phase, code: input.code, correlationId: input.correlationId });
}

function nextAction(status: string, code: string): string {
  if (status === "failed" || status === "expired") return "Terminal job needs explicit review; never requeue the same claim blindly.";
  if (status === "running") return "Writer outcome is unconfirmed; inspect the same-child receipt and external writes before recovery.";
  if (code === "DSH_REPORT_HOST_UNAVAILABLE" || code === "DSH_REPORT_HISTORY_UNAVAILABLE") {
    return "Restore desktop parent-session history access; the queued job is retried at the next trusted parent entry, not by the model.";
  }
  if (code.startsWith("DSH_REPORT_CAPTURE_") || code === "DSH_REPORT_COMMIT_FAILED") {
    return "Check the current desktop adapter/CLI report handoff and canonical job permissions; do not replay the plan mutation.";
  }
  if (code === "NATIVE_SUBAGENTS_UNAVAILABLE" || code === "CHILD_CATALOG_UNAVAILABLE") {
    return "Check native child service/catalog availability; never spawn a second child while admission is uncertain.";
  }
  return "System retries at the next trusted parent entry; do not replay the plan mutation or claim manually.";
}

/** Only bounded categorical facts, never report bytes, exception messages, paths or tokens. */
export function listDshFinalizerAlerts(cwd: string, parentSessionId: string) {
  const project = resolveProjectContext(cwd);
  if (project.scope !== "project" || !parentSessionId.trim()) return [];
  const alerts = [] as Array<{ finalizeId: string; status: string; phase: string; code: string;
    lastAt: string; count: number; nextAction: string }>;
  for (const jobPath of listKnowledgeFinalizationJobs(project)) {
    try {
      const job = readKnowledgeFinalizationJob(jobPath);
      if (job.host !== "dsh" || job.sessionId !== parentSessionId
        || path.resolve(job.projectRoot) !== path.resolve(project.projectRoot)) continue;
      const failure = job.operationalFailure;
      if (!failure && job.status !== "failed" && job.status !== "expired") continue;
      const code = failure?.code ?? (job.status === "expired" ? "KNOWLEDGE_JOB_EXPIRED" : "KNOWLEDGE_WRITER_FAILED");
      alerts.push({ finalizeId: job.finalizeId, status: job.status,
        phase: failure?.phase ?? (job.status === "failed" ? "writer" : "dispatch"), code,
        lastAt: failure?.lastAt ?? job.finishedAt ?? job.queuedAt, count: failure?.count ?? 1,
        nextAction: nextAction(job.status, code) });
    } catch { /* Unrelated damaged jobs must not hide intact alerts. */ }
  }
  return alerts.sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, 8);
}
