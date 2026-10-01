import path from "node:path";
import { buildDshKnowledgeDispatch, listKnowledgeFinalizationJobs, readKnowledgeFinalizationJob,
  resolveProjectContext, type KnowledgeDelegateDispatch } from "@veewo/claw-core";

/** Inspect canonical queued jobs without changing the business command or job. */
export function pendingDshKnowledgeDispatches(cwd: string, parentSessionId: string): Array<KnowledgeDelegateDispatch & { startedAt?: string; captureStatus?: "pending" | "captured" }> {
  const project = resolveProjectContext(cwd);
  if (project.scope !== "project" || !parentSessionId.trim()) return [];
  const projectRoot = path.resolve(project.projectRoot);
  const result: Array<KnowledgeDelegateDispatch & { startedAt?: string; captureStatus?: "pending" | "captured" }> = [];
  for (const jobPath of listKnowledgeFinalizationJobs(project)) {
    try {
      const job = readKnowledgeFinalizationJob(jobPath);
      if (job.host !== "dsh" || job.sessionId !== parentSessionId || job.status !== "queued"
        || !["subagent", "background"].includes(job.writer?.executionPolicy ?? "")
        || path.resolve(job.projectRoot) !== projectRoot
        || !/^[a-f0-9]{64}$/i.test(job.finalizeId)
        || !job.expiresAt || Date.parse(job.expiresAt) <= Date.now()) continue;
      const relative = path.relative(project.clawDir, path.resolve(job.planPath));
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
      result.push({ ...buildDshKnowledgeDispatch({ finalizeId: job.finalizeId, writer: job.writer }),
        ...(job.reportCapture?.startedAt ? { startedAt: job.reportCapture.startedAt } : {}),
        ...(job.reportCapture?.status ? { captureStatus: job.reportCapture.status } : {}) });
    } catch {
      // A damaged unrelated job does not prevent recovery of another queued job.
    }
  }
  return result;
}
