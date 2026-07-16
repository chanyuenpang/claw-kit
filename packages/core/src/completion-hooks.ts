import path from "node:path";
import type { PlanCompletionHooks, PlanDocument, TaskContext } from "./types.js";

export function buildCompletionHooks(params: {
  task: TaskContext;
  planPath: string;
  plan: PlanDocument;
}): PlanCompletionHooks {
  const { task, planPath, plan } = params;
  const truthCandidate = {
    projectId: task.project.projectId,
    taskName: task.taskName,
    planPath,
    planTitle: plan.title,
    goalText: plan.goal.text,
    planStatus: plan.status,
    ...(plan.summary ? { summary: plan.summary } : {}),
    ...(plan.rules ? { rules: plan.rules } : {}),
    ...(plan.references ? { references: plan.references } : {}),
    ...(plan.retrospective ? { retrospective: plan.retrospective } : {}),
    ...(plan.keyDecisions ? { keyDecisions: plan.keyDecisions } : {}),
    suggestedTruthPaths: buildSuggestedTruthPaths(planPath, plan),
  };

  const adrCandidate = {
    projectId: task.project.projectId,
    taskName: task.taskName,
    planPath,
    planTitle: plan.title,
    planStatus: plan.status,
    keyDecisions: plan.keyDecisions ?? [],
    shouldWriteAdr: (plan.keyDecisions?.length ?? 0) > 0,
    reason:
      (plan.keyDecisions?.length ?? 0) > 0
        ? "Plan completed with keyDecisions that may represent durable architecture or workflow decisions."
        : "No explicit keyDecisions were present on the completed plan.",
  };

  return {
    truthCandidate,
    adrCandidate,
    ...(plan.parentPlan && plan.parentTaskId !== undefined
      ? {
          subplanClosureCandidate: {
            taskName: task.taskName,
            parentPlan: plan.parentPlan,
            parentTaskId: plan.parentTaskId,
          },
        }
      : {}),
  };
}

function buildSuggestedTruthPaths(planPath: string, plan: PlanDocument): string[] {
  const suggestions = new Set<string>();
  if (plan.taskType?.trim()) {
    suggestions.add(`features/${slugify(plan.taskType)}.md`);
  } else {
    suggestions.add(`features/${slugify(plan.title)}.md`);
  }
  const planFileName = path.basename(planPath, path.extname(planPath));
  suggestions.add(`plans/${slugify(planFileName)}.md`);
  return [...suggestions];
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}
