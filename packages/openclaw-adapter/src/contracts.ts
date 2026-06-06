import type {
  AdrDepositionCandidate,
  PlanCompletionHooks,
  PlanDocument,
  PlanReviewInput,
  PlanReviewResult,
  PlanStatus,
  TaskMeta,
  TruthDepositionCandidate,
} from "@claw-kit/core";

export type OpenClawSessionBinding = {
  sessionKey: string;
  rootAgentId?: string;
  projectId: string;
  taskName?: string;
  activePlan?: string;
};

export type OpenClawPlanGuardDecision = {
  shouldRemind: boolean;
  reason:
    | "plan_active"
    | "plan_wait"
    | "plan_discussing"
    | "plan_completed"
    | "owner_mismatch"
    | "no_active_plan";
  planStatus?: PlanStatus;
};

export interface ActiveContextStore {
  get(sessionKey: string): Promise<OpenClawSessionBinding | null>;
  set(binding: OpenClawSessionBinding): Promise<void>;
  clear(sessionKey: string): Promise<void>;
}

export interface OwnershipPolicy {
  canBind(params: {
    sessionKey: string;
    rootAgentId?: string;
    taskMeta: TaskMeta;
  }): Promise<{ ok: true } | { ok: false; reason: "takeover_required" | "owner_mismatch" }>;
}

export interface PlanGuardAdapter {
  decide(params: {
    binding: OpenClawSessionBinding;
    taskMeta: TaskMeta | null;
    plan: PlanDocument | null;
  }): Promise<OpenClawPlanGuardDecision>;
}

export interface ReminderScheduler {
  scheduleReminder(params: {
    binding: OpenClawSessionBinding;
    decision: OpenClawPlanGuardDecision;
  }): Promise<void>;
}

export interface TruthDispatchAdapter {
  dispatchTruthGeneration(params: {
    sessionKey: string;
    projectId: string;
    taskName: string;
    planPath: string;
    planStatus: PlanStatus;
  }): Promise<void>;
}

export interface PlanReviewRuntimeAdapter {
  review(input: PlanReviewInput): Promise<PlanReviewResult | null>;
}

export interface CompletionHookConsumer {
  onPlanCompleted(params: {
    binding: OpenClawSessionBinding;
    hooks: PlanCompletionHooks;
  }): Promise<void>;
  onTruthCandidate?(params: {
    binding: OpenClawSessionBinding;
    candidate: TruthDepositionCandidate;
  }): Promise<void>;
  onAdrCandidate?(params: {
    binding: OpenClawSessionBinding;
    candidate: AdrDepositionCandidate;
  }): Promise<void>;
}

export interface OpenClawSideEffects {
  afterPlanWrite?(params: {
    binding: OpenClawSessionBinding;
    taskMeta: TaskMeta;
    planPath: string;
  }): Promise<void>;
  afterTruthWrite?(params: {
    binding: OpenClawSessionBinding;
    truthPath: string;
  }): Promise<void>;
}
