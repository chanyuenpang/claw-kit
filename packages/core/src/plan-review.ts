import type { PlanDocument, PlanReviewInput, PlanReviewResult, PlanReviewer, PlanStatus } from "./types.js";

export const REQUIREMENTS_NEXT_ACTION = "collect_requirements" as const;
export const REQUIREMENTS_INSTRUCTION =
  "Collect requirements first. Clarify scope if needed, then update goal, rules, references, and tasks before moving to process.active/process.wait/process.discussing.";
export const REVIEW_NEXT_ACTION = "revise_plan_from_review" as const;
export const REVIEW_INSTRUCTION =
  "Plan review found actionable feedback. Revise goal, rules, references, and tasks using planReview, then move to process.active/process.wait/process.discussing.";
export const REVIEW_ADDRESSED_INSTRUCTION =
  "Review feedback is considered addressed. Continue with the selected process status.";

export async function runPlanReview(params: {
  reviewer?: PlanReviewer;
  planContent: PlanDocument;
  previousStatus?: PlanStatus;
  targetStatus: PlanStatus;
  workflowDefinitions?: string;
  projectId?: string;
  taskName?: string;
}): Promise<{
  nextStatus: PlanStatus;
  planReview?: PlanReviewResult;
  nextAction?: "revise_plan_from_review" | "proceed";
  instruction?: string;
}> {
  if (!params.reviewer) {
    return { nextStatus: params.targetStatus };
  }
  if (!shouldRunRequirementsExitReview(params.previousStatus, params.targetStatus)) {
    return { nextStatus: params.targetStatus };
  }

  const review = await params.reviewer({
    planContent: params.planContent,
    isSubPlan: Boolean(params.planContent.parentPlan || params.planContent.parentTaskId),
    workflowDefinitions: params.workflowDefinitions,
    projectId: params.projectId,
    taskName: params.taskName,
  } satisfies PlanReviewInput);

  if (!review || !hasActionableReviewFeedback(review)) {
    return {
      nextStatus: params.targetStatus,
      ...(review ? { planReview: review, nextAction: "proceed" as const } : {}),
      ...(review ? { instruction: REVIEW_ADDRESSED_INSTRUCTION } : {}),
    };
  }

  return {
    nextStatus: "prepare.review",
    planReview: review,
    nextAction: "revise_plan_from_review",
    instruction: REVIEW_INSTRUCTION,
  };
}

export function shouldRunRequirementsExitReview(
  previousStatus: PlanStatus | undefined,
  targetStatus: PlanStatus,
): boolean {
  if (!isProcessStatus(targetStatus)) {
    return false;
  }
  if (!previousStatus) {
    return true;
  }
  return previousStatus === "prepare.requirements";
}

export function hasActionableReviewFeedback(review: PlanReviewResult): boolean {
  return review.issues.length > 0 || review.suggestions.length > 0;
}

export function isProcessStatus(status: PlanStatus): boolean {
  return status.startsWith("process.");
}
