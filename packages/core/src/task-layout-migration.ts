import fs from "node:fs";
import path from "node:path";
import { ClawError } from "./errors.js";
import { readJsonFile, writeJsonFile } from "./io.js";
import { ensureInsideDir, normalizePlanFile } from "./paths.js";
import { bindSessionToPlan, resolveSessionBoundPlan, unbindSession } from "./session-bindings.js";
import type { PlanDocument, ProjectContext, TaskMeta } from "./types.js";

type LegacyPlanMove = {
  sourcePath: string;
  targetPath: string;
  sourcePlanFile: string;
  targetPlanFile: string;
};

type LegacyBindingCandidate = {
  sessionKey: string;
  planPath: string;
  updatedAt: string;
};

export type TaskLayoutMigrationResult = {
  changed: boolean;
  fixedPaths: string[];
};

export function migrateLegacyTaskLayout(project: ProjectContext): TaskLayoutMigrationResult {
  const markerPath = taskLayoutMigrationMarkerPath(project.clawDir);
  if (fs.existsSync(markerPath)) {
    return { changed: false, fixedPaths: [] };
  }

  const taskDirs = fs.existsSync(project.tasksDir)
    ? fs.readdirSync(project.tasksDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(project.tasksDir, entry.name))
    : [];
  const moves = taskDirs.flatMap((taskDir) => collectLegacyPlanMoves(taskDir));
  validateMoves(moves);

  const fixedPaths = new Set<string>();
  const bindingCandidates = new Map<string, LegacyBindingCandidate>();

  for (const taskDir of taskDirs) {
    const metaPath = path.join(taskDir, "meta.json");
    const legacyMeta = readLegacyMeta(metaPath);
    const taskMoves = moves.filter((move) => path.dirname(move.targetPath) === taskDir);
    const planFileMap = new Map(taskMoves.map((move) => [move.sourcePlanFile, move.targetPlanFile]));

    rewriteTaskPlanReferences(taskDir, taskMoves, planFileMap, fixedPaths, project);
    for (const move of taskMoves) {
      fs.renameSync(move.sourcePath, move.targetPath);
      fixedPaths.add(toProjectRelativePath(project, move.sourcePath));
      fixedPaths.add(toProjectRelativePath(project, move.targetPath));
    }
    removeEmptyLegacyPlanDirectories(path.join(taskDir, "plans"));

    if (legacyMeta) {
      collectBindingCandidate(taskDir, legacyMeta, planFileMap, bindingCandidates);
      fs.unlinkSync(metaPath);
      fixedPaths.add(toProjectRelativePath(project, metaPath));
    }
  }

  applyBindingCandidates(project, bindingCandidates, fixedPaths);
  markTaskLayoutMigrationComplete(project.clawDir);
  fixedPaths.add(toProjectRelativePath(project, markerPath));
  return { changed: fixedPaths.size > 0, fixedPaths: [...fixedPaths] };
}

export function taskLayoutMigrationMarkerPath(clawDir: string): string {
  return path.join(clawDir, "runtime", "task-layout-v2.complete");
}

export function markTaskLayoutMigrationComplete(clawDir: string): string {
  const markerPath = taskLayoutMigrationMarkerPath(clawDir);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, "", "utf-8");
  return markerPath;
}

function collectLegacyPlanMoves(taskDir: string): LegacyPlanMove[] {
  const plansDir = path.join(taskDir, "plans");
  if (!fs.existsSync(plansDir)) {
    return [];
  }
  return fs.readdirSync(plansDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const sourcePath = path.join(entry.parentPath, entry.name);
      if (path.extname(entry.name).toLowerCase() !== ".json") {
        throw new ClawError("PROJECT_CONFIG_INVALID", `Legacy plans directory contains a non-JSON file: ${sourcePath}`, {
          path: sourcePath,
        });
      }
      const sourcePlanFile = path.relative(taskDir, sourcePath).replace(/\\/g, "/");
      const targetPlanFile = normalizePlanFile(path.basename(sourcePath));
      return {
        sourcePath,
        targetPath: path.join(taskDir, targetPlanFile),
        sourcePlanFile,
        targetPlanFile,
      };
    });
}

function validateMoves(moves: LegacyPlanMove[]): void {
  const targets = new Set<string>();
  for (const move of moves) {
    const normalizedTarget = path.resolve(move.targetPath).toLowerCase();
    if (targets.has(normalizedTarget) || fs.existsSync(move.targetPath)) {
      throw new ClawError("PLAN_ALREADY_EXISTS", `Cannot flatten legacy subplan because "${move.targetPlanFile}" already exists.`, {
        sourcePath: move.sourcePath,
        targetPath: move.targetPath,
      });
    }
    targets.add(normalizedTarget);
  }
}

function rewriteTaskPlanReferences(
  taskDir: string,
  moves: LegacyPlanMove[],
  planFileMap: Map<string, string>,
  fixedPaths: Set<string>,
  project: ProjectContext,
): void {
  const planPaths = [
    ...fs.readdirSync(taskDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json" && entry.name !== "meta.json")
      .map((entry) => path.join(taskDir, entry.name)),
    ...moves.map((move) => move.sourcePath),
  ];

  for (const planPath of planPaths) {
    let plan: PlanDocument;
    try {
      plan = readJsonFile<PlanDocument>(planPath);
    } catch {
      continue;
    }
    let changed = false;
    const mappedParent = mapLegacyPlanFile(plan.parentPlan, planFileMap);
    if (mappedParent && mappedParent !== plan.parentPlan) {
      plan.parentPlan = mappedParent;
      changed = true;
    }
    for (const task of Array.isArray(plan.tasks) ? plan.tasks : []) {
      if (!task.execution) {
        continue;
      }
      const mappedSubplan = mapLegacyPlanFile(task.execution.subplan, planFileMap);
      const mappedPlanPath = mapLegacyPlanFile(task.execution.planPath, planFileMap);
      if (mappedSubplan && mappedSubplan !== task.execution.subplan) {
        task.execution.subplan = mappedSubplan;
        changed = true;
      }
      if (mappedPlanPath && mappedPlanPath !== task.execution.planPath) {
        task.execution.planPath = mappedPlanPath;
        changed = true;
      }
    }
    if (changed) {
      writeJsonFile(planPath, plan);
      fixedPaths.add(toProjectRelativePath(project, planPath));
    }
  }
}

function mapLegacyPlanFile(value: string | undefined, planFileMap: Map<string, string>): string | undefined {
  if (!value) {
    return value;
  }
  return planFileMap.get(value.replace(/\\/g, "/")) ?? value;
}

function collectBindingCandidate(
  taskDir: string,
  meta: TaskMeta,
  planFileMap: Map<string, string>,
  candidates: Map<string, LegacyBindingCandidate>,
): void {
  const sessionKey = typeof meta.ownerSessionKey === "string" ? meta.ownerSessionKey.trim() : "";
  if (!sessionKey) {
    return;
  }
  const legacyActivePlan = typeof meta.activePlan === "string" ? meta.activePlan.replace(/\\/g, "/") : "plan.json";
  const planFile = planFileMap.get(legacyActivePlan) ?? normalizePlanFile(legacyActivePlan);
  const planPath = ensureInsideDir(taskDir, planFile);
  if (!planPath || !isOpenPlan(planPath)) {
    return;
  }
  const updatedAt = typeof meta.updatedAt === "string" ? meta.updatedAt : "";
  const current = candidates.get(sessionKey);
  if (!current || updatedAt > current.updatedAt) {
    candidates.set(sessionKey, { sessionKey, planPath, updatedAt });
  }
}

function applyBindingCandidates(
  project: ProjectContext,
  candidates: Map<string, LegacyBindingCandidate>,
  fixedPaths: Set<string>,
): void {
  for (const candidate of candidates.values()) {
    const existingPlanPath = resolveSessionBoundPlan(project, candidate.sessionKey);
    if (existingPlanPath && isOpenPlan(existingPlanPath)) {
      continue;
    }
    if (existingPlanPath) {
      unbindSession(project, candidate.sessionKey);
    }
    bindSessionToPlan(project, candidate.sessionKey, candidate.planPath);
    fixedPaths.add(".claw/runtime/session-bindings.json");
  }
}

function isOpenPlan(planPath: string): boolean {
  if (!fs.existsSync(planPath)) {
    return false;
  }
  try {
    const plan = readJsonFile<Partial<PlanDocument>>(planPath);
    return typeof plan.status === "string" && !plan.status.startsWith("end.");
  } catch {
    return false;
  }
}

function readLegacyMeta(metaPath: string): TaskMeta | undefined {
  if (!fs.existsSync(metaPath)) {
    return undefined;
  }
  try {
    return readJsonFile<TaskMeta>(metaPath);
  } catch (error) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Failed to parse legacy task metadata: ${metaPath}`, {
      path: metaPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function removeEmptyLegacyPlanDirectories(plansDir: string): void {
  if (!fs.existsSync(plansDir)) {
    return;
  }
  for (const entry of fs.readdirSync(plansDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyLegacyPlanDirectories(path.join(plansDir, entry.name));
    }
  }
  if (fs.readdirSync(plansDir).length === 0) {
    fs.rmdirSync(plansDir);
  }
}

function toProjectRelativePath(project: ProjectContext, absolutePath: string): string {
  return path.relative(project.projectRoot, absolutePath).replace(/\\/g, "/");
}
