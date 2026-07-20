import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJsonFile, withFileLock, writeJsonFile } from "./io.js";
import { ensureInsideDir } from "./paths.js";
import { ensureUtf8Bom, hasUtf8BomPrefix } from "./text-encoding.js";
import type { KnowledgeGovernanceResult } from "./knowledge-governance.js";
import type { KnowledgeWriterConfig, ProjectContext } from "./types.js";

export type KnowledgeReportTarget = {
  planPath: string;
  reportPath: string;
  endedAt?: string;
  /** Legacy field retained for registries written before every end.* boundary was eligible. */
  completedAt?: string;
};

export type KnowledgeFinalizationHost = "codex" | "opencode";

export type KnowledgeSessionRegistry = {
  schemaVersion: 1;
  sessionId: string;
  activePlanPath?: string;
  activeReportPath?: string;
  pendingTurnOwner?: KnowledgeReportTarget;
  lastCollectedTurnId?: string;
  updatedAt: string;
};

export type KnowledgeFinalizationJob = {
  schemaVersion: 1;
  finalizeId: string;
  sessionId: string;
  projectRoot: string;
  taskName: string;
  /** Optional only for jobs queued by versions released before writer config was snapshotted. */
  writer?: KnowledgeWriterConfig;
  /**
   * Host that queued the job, so the finalization worker can pick the correct runner.
   * Older jobs queued without this field fall back to the Codex SDK runner.
   */
  host?: KnowledgeFinalizationHost | null;
  planPath: string;
  reportPath: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  truthThreadId?: string;
  adrThreadId?: string;
  truthResponse?: string;
  adrResponse?: string;
  /** Legacy aggregate fields retained for job observability and older readers. */
  sdkThreadId?: string;
  finalResponse?: string;
  truthEncoding?: {
    checkedFiles: number;
    updatedFiles: number;
  };
  knowledgeGovernance?: KnowledgeGovernanceResult;
  error?: {
    message: string;
  };
};

export type KnowledgeReportEntry = {
  schemaVersion: 1;
  entryType?: "task_conclusion";
  sessionId: string;
  turnId: string;
  capturedAt: string;
  message: string;
};

export type KnowledgeTaskConclusion = {
  turnId: string;
  message: string;
};

export type KnowledgeFinalizationReportEntry = {
  schemaVersion: 1;
  entryType: "knowledge_finalization";
  finalizeId: string;
  taskName: string;
  recordedAt: string;
  status: "succeeded";
  result: string;
  attempts: number;
  host?: KnowledgeFinalizationHost | null;
  threadId?: string;
  truthEncoding?: {
    checkedFiles: number;
    updatedFiles: number;
  };
  knowledgeGovernance?: KnowledgeGovernanceResult;
};

export type KnowledgeSidecarResult = {
  ok: boolean;
  error?: string;
};

export type KnowledgeStopResult = KnowledgeSidecarResult & {
  captured?: boolean;
  duplicate?: boolean;
  reportPath?: string;
  jobPath?: string;
  finalizeId?: string;
};

export function deriveKnowledgeReportPath(planPath: string): string {
  return planPath.replace(/\.json$/i, ".report");
}

export function knowledgeSessionRegistryPath(project: ProjectContext, sessionId: string): string {
  const key = createHash("sha256").update(sessionId).digest("hex");
  return path.join(project.clawDir, "runtime", "knowledge-sessions", `${key}.json`);
}

export function knowledgeFinalizationJobPath(project: ProjectContext, finalizeId: string): string {
  return path.join(project.clawDir, "runtime", "knowledge-finalization", "jobs", `${finalizeId}.json`);
}

export function tryRegisterKnowledgePlan(input: {
  project: ProjectContext;
  sessionId?: string;
  planPath: string;
}): KnowledgeSidecarResult {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    return { ok: true };
  }
  try {
    const planPath = toProjectRelativePlanPath(input.project, input.planPath);
    const reportPath = toProjectRelativeReportPath(input.project, deriveKnowledgeReportPath(input.planPath));
    updateKnowledgeRegistry(input.project, sessionId, (registry) => ({
      ...registry,
      activePlanPath: planPath,
      activeReportPath: reportPath,
      updatedAt: new Date().toISOString(),
    }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export function tryEndKnowledgePlan(input: {
  project: ProjectContext;
  sessionId?: string;
  endedPlanPath: string;
  resumedPlanPath?: string;
  endedAt: string;
}): KnowledgeSidecarResult {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    return { ok: true };
  }
  try {
    const endedPlanPath = toProjectRelativePlanPath(input.project, input.endedPlanPath);
    const reportPath = toProjectRelativeReportPath(
      input.project,
      deriveKnowledgeReportPath(input.endedPlanPath),
    );
    const resumedPlanPath = input.resumedPlanPath
      ? toProjectRelativePlanPath(input.project, input.resumedPlanPath)
      : undefined;
    const resumedReportPath = input.resumedPlanPath
      ? toProjectRelativeReportPath(input.project, deriveKnowledgeReportPath(input.resumedPlanPath))
      : undefined;
    updateKnowledgeRegistry(input.project, sessionId, (registry) => ({
      ...registry,
      ...(resumedPlanPath
        ? { activePlanPath: resumedPlanPath, activeReportPath: resumedReportPath }
        : { activePlanPath: undefined, activeReportPath: undefined }),
      pendingTurnOwner: {
        planPath: endedPlanPath,
        reportPath,
        endedAt: input.endedAt,
      },
      updatedAt: new Date().toISOString(),
    }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** @deprecated Use tryEndKnowledgePlan for lifecycle-neutral end.* finalization. */
export function tryCompleteKnowledgePlan(input: {
  project: ProjectContext;
  sessionId?: string;
  completedPlanPath: string;
  resumedPlanPath?: string;
  completedAt?: string;
}): KnowledgeSidecarResult {
  return tryEndKnowledgePlan({
    project: input.project,
    sessionId: input.sessionId,
    endedPlanPath: input.completedPlanPath,
    resumedPlanPath: input.resumedPlanPath,
    endedAt: input.completedAt ?? new Date().toISOString(),
  });
}

export function tryCaptureKnowledgeStop(input: {
  project: ProjectContext;
  sessionId?: string;
  turnId?: string;
  message?: string;
  host?: KnowledgeFinalizationHost;
  taskConclusions?: KnowledgeTaskConclusion[];
}): KnowledgeStopResult {
  const sessionId = input.sessionId?.trim();
  const turnId = input.turnId?.trim();
  const message = input.message?.trim();
  if (!sessionId || !turnId || !message) {
    return { ok: true, captured: false };
  }
  const registryPath = knowledgeSessionRegistryPath(input.project, sessionId);
  if (!fs.existsSync(registryPath)) {
    return { ok: true, captured: false };
  }
  try {
    return withFileLock(registryPath, () => {
      const registry = readKnowledgeRegistry(registryPath, sessionId);
      const target = registry.pendingTurnOwner ?? (
        registry.activePlanPath && registry.activeReportPath
          ? { planPath: registry.activePlanPath, reportPath: registry.activeReportPath }
          : undefined
      );
      if (!target) {
        return { ok: true, captured: false };
      }
      const reportPath = resolveProjectRelativeReportPath(input.project, target.reportPath);
      const capturedAt = new Date().toISOString();
      for (const conclusion of input.taskConclusions ?? []) {
        if (conclusion.turnId !== turnId) {
          continue;
        }
        appendKnowledgeReportEntry(reportPath, {
          schemaVersion: 1,
          entryType: "task_conclusion",
          sessionId,
          turnId: conclusion.turnId,
          capturedAt,
          message: conclusion.message,
        });
      }
      const duplicate = appendKnowledgeReportEntry(reportPath, {
        schemaVersion: 1,
        sessionId,
        turnId,
        capturedAt,
        message,
      });
      let jobPath: string | undefined;
      let finalizeId: string | undefined;
      if (registry.pendingTurnOwner) {
        finalizeId = createHash("sha256")
          .update(`${sessionId}\n${registry.pendingTurnOwner.planPath}\n${registry.pendingTurnOwner.endedAt ?? registry.pendingTurnOwner.completedAt ?? ""}`)
          .digest("hex");
        jobPath = knowledgeFinalizationJobPath(input.project, finalizeId);
        if (!fs.existsSync(jobPath)) {
          const job: KnowledgeFinalizationJob = {
            schemaVersion: 1,
            finalizeId,
            sessionId,
            projectRoot: input.project.projectRoot,
            taskName: taskNameFromPlanPath(registry.pendingTurnOwner.planPath),
            writer: {
              externalSkill: input.project.projectConfig?.knowledgeWriter?.externalSkill ?? null,
              model: input.project.projectConfig?.knowledgeWriter?.model ?? null,
              reasoningEffort: input.project.projectConfig?.knowledgeWriter?.reasoningEffort ?? "medium",
              datedSectionsToKeep:
                input.project.projectConfig?.knowledgeWriter?.datedSectionsToKeep ?? 6,
            },
            host: input.host ?? null,
            planPath: resolveProjectRelativePlanPath(input.project, registry.pendingTurnOwner.planPath),
            reportPath,
            status: "queued",
            attempts: 0,
            queuedAt: new Date().toISOString(),
          };
          writeJsonFile(jobPath, job);
        }
        delete registry.pendingTurnOwner;
      }
      registry.lastCollectedTurnId = turnId;
      registry.updatedAt = new Date().toISOString();
      if (!registry.activePlanPath && !registry.pendingTurnOwner) {
        fs.unlinkSync(registryPath);
      } else {
        writeJsonFile(registryPath, registry);
      }
      return {
        ok: true,
        captured: true,
        duplicate,
        reportPath,
        ...(jobPath ? { jobPath } : {}),
        ...(finalizeId ? { finalizeId } : {}),
      };
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export function readKnowledgeFinalizationJob(jobPath: string): KnowledgeFinalizationJob {
  return readJsonFile<KnowledgeFinalizationJob>(jobPath);
}

export function claimKnowledgeFinalizationJob(jobPath: string): KnowledgeFinalizationJob | null {
  return withFileLock(jobPath, () => {
    const job = readJsonFile<KnowledgeFinalizationJob>(jobPath);
    if (job.status === "succeeded" || job.status === "running" || job.attempts >= 3) {
      return null;
    }
    const running: KnowledgeFinalizationJob = {
      ...job,
      status: "running",
      attempts: job.attempts + 1,
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      error: undefined,
    };
    writeJsonFile(jobPath, running);
    return running;
  });
}

export function listRetryableKnowledgeFinalizationJobs(project: ProjectContext): string[] {
  const jobsDir = path.join(project.clawDir, "runtime", "knowledge-finalization", "jobs");
  if (!fs.existsSync(jobsDir)) {
    return [];
  }
  return fs.readdirSync(jobsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(jobsDir, name))
    .filter((jobPath) => {
      try {
        const job = readKnowledgeFinalizationJob(jobPath);
        return (job.status === "queued" || job.status === "failed") && job.attempts < 3;
      } catch {
        return false;
      }
    });
}

export function normalizeTruthMarkdownEncoding(project: ProjectContext): {
  checkedFiles: number;
  updatedFiles: number;
} {
  if (!fs.existsSync(project.truthDir)) {
    return { checkedFiles: 0, updatedFiles: 0 };
  }
  let checkedFiles = 0;
  let updatedFiles = 0;
  const queue = [project.truthDir];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const targetPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(targetPath);
        continue;
      }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) {
        continue;
      }
      checkedFiles += 1;
      const raw = fs.readFileSync(targetPath);
      if (hasUtf8BomPrefix(raw)) {
        continue;
      }
      fs.writeFileSync(targetPath, ensureUtf8Bom(raw.toString("utf-8")), "utf-8");
      updatedFiles += 1;
    }
  }
  return { checkedFiles, updatedFiles };
}

export function recordKnowledgeFinalizationResult(
  project: ProjectContext,
  reportPath: string,
  entry: KnowledgeFinalizationReportEntry,
): { written: boolean; duplicate: boolean } {
  const relative = path.relative(project.tasksDir, path.resolve(reportPath));
  const resolved = ensureInsideDir(project.tasksDir, relative);
  if (!resolved || resolved !== path.resolve(reportPath)) {
    throw new Error(`Knowledge report path must stay inside ${project.tasksDir}: ${reportPath}`);
  }
  return withFileLock(resolved, () => {
    if (fs.existsSync(resolved)) {
      const duplicate = fs.readFileSync(resolved, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean)
        .some((line) => {
          try {
            const existing = JSON.parse(line) as Partial<KnowledgeFinalizationReportEntry>;
            return existing.entryType === "knowledge_finalization"
              && existing.finalizeId === entry.finalizeId;
          } catch {
            return false;
          }
        });
      if (duplicate) {
        return { written: false, duplicate: true };
      }
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.appendFileSync(resolved, `${JSON.stringify(entry)}\n`, "utf-8");
    return { written: true, duplicate: false };
  });
}

export function writeKnowledgeFinalizationJob(jobPath: string, job: KnowledgeFinalizationJob): void {
  withFileLock(jobPath, () => writeJsonFile(jobPath, job));
}

function updateKnowledgeRegistry(
  project: ProjectContext,
  sessionId: string,
  update: (registry: KnowledgeSessionRegistry) => KnowledgeSessionRegistry,
): void {
  const registryPath = knowledgeSessionRegistryPath(project, sessionId);
  withFileLock(registryPath, () => {
    const registry = readKnowledgeRegistry(registryPath, sessionId);
    writeJsonFile(registryPath, update(registry));
  });
}

function readKnowledgeRegistry(registryPath: string, sessionId: string): KnowledgeSessionRegistry {
  if (!fs.existsSync(registryPath)) {
    return {
      schemaVersion: 1,
      sessionId,
      updatedAt: new Date().toISOString(),
    };
  }
  const registry = readJsonFile<KnowledgeSessionRegistry>(registryPath);
  if (registry.schemaVersion !== 1 || registry.sessionId !== sessionId) {
    throw new Error(`Invalid knowledge session registry: ${registryPath}`);
  }
  return registry;
}

function appendKnowledgeReportEntry(reportPath: string, entry: KnowledgeReportEntry): boolean {
  return withFileLock(reportPath, () => {
    if (fs.existsSync(reportPath)) {
      const duplicate = fs.readFileSync(reportPath, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean)
        .some((line) => {
          try {
            const existing = JSON.parse(line) as Partial<KnowledgeReportEntry>;
            if (existing.sessionId !== entry.sessionId || existing.turnId !== entry.turnId) {
              return false;
            }
            if (existing.entryType !== entry.entryType) {
              return false;
            }
            return entry.entryType !== "task_conclusion"
              || existing.message === entry.message;
          } catch {
            return false;
          }
        });
      if (duplicate) {
        return true;
      }
    }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.appendFileSync(reportPath, `${JSON.stringify(entry)}\n`, "utf-8");
    return false;
  });
}

function toProjectRelativePlanPath(project: ProjectContext, planPath: string): string {
  const absolutePath = path.resolve(planPath);
  const relativePath = path.relative(project.tasksDir, absolutePath);
  const checked = ensureInsideDir(project.tasksDir, relativePath);
  if (!checked || checked !== absolutePath) {
    throw new Error(`Knowledge plan path must stay inside ${project.tasksDir}: ${planPath}`);
  }
  return path.posix.join("tasks", relativePath.replace(/\\/g, "/"));
}

function toProjectRelativeReportPath(project: ProjectContext, reportPath: string): string {
  const absolutePath = path.resolve(reportPath);
  const relativePath = path.relative(project.tasksDir, absolutePath);
  const checked = ensureInsideDir(project.tasksDir, relativePath);
  if (!checked || checked !== absolutePath) {
    throw new Error(`Knowledge report path must stay inside ${project.tasksDir}: ${reportPath}`);
  }
  return path.posix.join("tasks", relativePath.replace(/\\/g, "/"));
}

function resolveProjectRelativePlanPath(project: ProjectContext, planPath: string): string {
  const taskRelativePath = planPath.startsWith("tasks/") ? planPath.slice("tasks/".length) : "";
  const resolved = taskRelativePath ? ensureInsideDir(project.tasksDir, taskRelativePath) : null;
  if (!resolved) {
    throw new Error(`Invalid knowledge plan path: ${planPath}`);
  }
  return resolved;
}

function resolveProjectRelativeReportPath(project: ProjectContext, reportPath: string): string {
  const taskRelativePath = reportPath.startsWith("tasks/") ? reportPath.slice("tasks/".length) : "";
  const resolved = taskRelativePath ? ensureInsideDir(project.tasksDir, taskRelativePath) : null;
  if (!resolved) {
    throw new Error(`Invalid knowledge report path: ${reportPath}`);
  }
  return resolved;
}

function taskNameFromPlanPath(planPath: string): string {
  const taskRelativePath = planPath.startsWith("tasks/") ? planPath.slice("tasks/".length) : "";
  const taskName = taskRelativePath.split("/")[0];
  if (!taskName) {
    throw new Error(`Invalid knowledge plan path: ${planPath}`);
  }
  return taskName;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
