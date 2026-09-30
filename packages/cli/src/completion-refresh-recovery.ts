import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ClawError, listTaskDirectories, listKnowledgeFinalizationJobs, readKnowledgeFinalizationJob,
  resolveProjectContext, sessionWorkflowDir, type ProjectContext } from "@veewo/claw-core";
import { queueCompletionRefresh, resumeCompletionRefresh, tryReadCompletionRefreshStatus, type CompletionRefreshResult } from "./completion-refresh.js";

/** Read-only reconciliation recovers commit -> intent interruption gaps while
 * canonical terminal facts survive; it is not a core atomic outbox transaction.
 * Durable statuses deliberately live outside logs (daily maintenance deletes logs).
 * No domain command, focus transition, claim or writer assignment is replayed.
 * Recovery needs a later entry if the process dies before launching its worker.
 */
export function reconcileCompletionRefresh(cwd: string, sessionId?: string): CompletionRefreshResult[] {
  const sessionDir = sessionId ? sessionWorkflowDir(sessionId) : undefined;
  const manifestPath = sessionDir ? path.join(sessionDir, "session.json") : undefined;
  const manifest = manifestPath && fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { originCwd?: string } : undefined;
  let project: ProjectContext;
  try { project = resolveProjectContext(manifest?.originCwd ?? cwd); }
  catch (error) {
    if (error instanceof ClawError && (error.code === "PROJECT_ROOT_NOT_FOUND" || error.code === "CLAW_DIR_NOT_FOUND")) return [];
    throw error;
  }
  const dir = path.join(project.clawDir, "runtime", "completion-refresh");
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, "reconcile.lock");
  let fd: number;
  try { fd = fs.openSync(lock, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const pid = Number(fs.readFileSync(lock, "utf8"));
      if (!pid) {
        if (Date.now() - fs.statSync(lock).mtimeMs < 60_000) return [];
      } else {
        try { process.kill(pid, 0); return []; } catch { /* dead reconciler */ }
      }
      fs.unlinkSync(lock);
    } catch { return []; }
    return reconcileCompletionRefresh(cwd, sessionId);
  }
  fs.writeFileSync(fd, String(process.pid));
  const queued: CompletionRefreshResult[] = [];
  try {
    const facts: Array<{ key: string; taskName: string; retention: boolean; gitnexus: boolean }> = [];
    const ensure = (key: string, taskName: string, retention: boolean, gitnexus: boolean) => {
      facts.push({ key, taskName, retention, gitnexus });
    };
    const queueFact = ({ key, taskName, retention, gitnexus }: typeof facts[number]) => {
      const statusFile = path.join(dir, createHash("sha256").update(key).digest("hex") + ".json");
      const result = tryReadCompletionRefreshStatus(statusFile)
        ? resumeCompletionRefresh(statusFile)
        : queueCompletionRefresh({ cwd: project.projectRoot, taskName, statusFile,
            includeTaskRetention: retention, includeGitNexus: gitnexus });
      if (result) queued.push(result);
    };
    const scanPlans = (source: ProjectContext, scopeKey: string) => {
      for (const task of listTaskDirectories(source)) {
        // Only canonical plan files, not arbitrary JSON documents in a task.
        const plans = planFiles(task.taskDir);
        for (const file of plans) {
          if (!fs.existsSync(file)) continue;
          const plan = JSON.parse(fs.readFileSync(file, "utf8")) as { title?: string; tasks?: unknown[]; status?: string; completedAt?: string; updatedAt?: string };
          if (!plan.title || !Array.isArray(plan.tasks) || !plan.status?.startsWith("end.")) continue;
          const identity = [scopeKey, task.relativePath, path.relative(task.taskDir, file), plan.status, plan.completedAt ?? plan.updatedAt ?? "legacy"];
          ensure(JSON.stringify(identity), task.taskName, source.scope !== "session", true);
        }
      }
    };
    scanPlans(project, "project");
    // Archive paths use the same relative identity, so retention cannot requeue a terminal.
    scanPlans({ ...project, tasksDir: path.join(project.clawDir, "archive", "tasks") }, "project");
    if (sessionDir && manifest?.originCwd) {
      scanPlans({ ...project, scope: "session", tasksDir: path.join(sessionDir, "tasks") }, "session:" + sessionId);
    }
    for (const file of listKnowledgeFinalizationJobs(project)) {
      const job = readKnowledgeFinalizationJob(file); // deliberately NOT reconcileKnowledgeFinalizationJob
      if (job.status === "succeeded") ensure("knowledge:" + job.finalizeId, job.taskName, false, false);
    }
    // Inventory facts before launching retention, which may archive/prune task files.
    for (const fact of facts) queueFact(fact);
    // Restore orphan queued/running/failed statuses even if their terminal fact was archived/pruned.
    for (const root of [dir, path.join(project.clawDir, "logs", "completion-refresh")]) {
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const result = resumeCompletionRefresh(path.join(root, entry.name));
        if (result) queued.push(result);
      }
    }
    return queued;
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lock, { force: true });
  }
}

function planFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isFile() && entry.name.endsWith(".json") ? [file] : [];
  });
}

/** Refresh failures must not turn a committed domain command into a retry request. */
export function recoverCompletionRefreshBestEffort(cwd: string, sessionId?: string): void {
  try { reconcileCompletionRefresh(cwd, sessionId); }
  catch (error) { process.stderr.write("Completion refresh recovery deferred: " + String(error) + "\n"); }
}
