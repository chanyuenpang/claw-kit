export const SESSION_PROTOCOL_VERSION = 1;

/**
 * Shared lifecycle contract for `create_goal` and `update_goal` host actions.
 *
 * Hosts with a native blocked state retain it. Hosts such as DSH that only
 * expose an active-or-complete Goal map `blocked` to native completion; a
 * later active workflow state can then create a fresh native Goal. In either
 * case, consumers must not create over an existing unfinished/native-active
 * Goal, and must consume mismatched transitions as no-ops.
 */
export const PLAN_GOAL_TRANSITION_CONTRACT = {
  version: 1,
  createGoal: { allowedWhen: ["missing", "complete"] },
  updateGoal: {
    blocked: { allowedFrom: ["active"] },
    complete: { allowedFrom: ["active", "blocked"] },
  },
  nativeBlockedMappings: {
    retained: "blocked",
    complete: "complete",
  },
} as const;

export type SessionClientInfo = {
  kind: "terminal" | "node" | "adapter";
  host?: string;
};

export type SessionPlanRef = {
  projectRoot: string;
  taskName: string;
  planFile: string;
  /** Internal exact storage locator; never supplied by model-facing commands. */
  taskPath?: string;
  scope?: "project" | "session";
};

export type SessionSimplePlanView = {
  status: string;
  goal: { text: string };
  tasks: Array<{ title: string }>;
  rules: string[];
};

/** Closed model-allowed business domain; lifecycle/admin commands are separate. */
export type ClawPlanFields = {
  goalText?: string; requirementsSummary?: string; planSummary?: string; retrospectiveSummary?: string;
  openQuestions?: string[]; removeOpenQuestions?: string[]; acceptanceCriteria?: string[];
  removeAcceptanceCriteria?: string[]; rules?: string[]; removeRules?: string[];
  keyDecisions?: string[]; removeKeyDecisions?: string[]; removeReferencePaths?: string[];
  whatWorked?: string[]; issues?: string[]; followUps?: string[];
  references?: Array<{ path: string; why: string }>;
};
export type ClawTaskStatus = "pending" | "in_progress" | "subagent_running" | "done" | "blocked";
export type ClawPlanMutation =
  | { type: "plan.update"; updates: ClawPlanFields }
  | { type: "plan.status"; status: string }
  | { type: "task.add"; title: string; detail?: string }
  | { type: "task.edit"; id: number; title?: string; detail?: string; status?: ClawTaskStatus; choiceId?: string }
  | { type: "task.remove"; id: number };
export type ClawSessionCommand =
  | { operation: "plan.create"; input: {
      title?: string; taskName?: string; goalText?: string; description?: string;
      knowledgeCapture?: boolean; templateName?: string;
      templateFile?: string; planStatus?: string; forcePlanning?: boolean;
      tasks?: Array<{ title: string; detail?: string }>;
    } }
  | { operation: "plan.start"; input: { updates?: ClawPlanFields; appendTasks?: Array<{ title: string; detail?: string }> } }
  | { operation: "plan.resume"; input: { planId?: string } }
  | { operation: "plan.leave"; input: Record<string, never> }
  | { operation: "plan.show"; input: { simple?: boolean } }
  | { operation: "plan.edit"; input: { operations: ClawPlanMutation[] } }
  | { operation: "plan.wait"; input: Record<string, never> }
  | { operation: "plan.done"; input: ClawPlanFields }
  | { operation: "subplan.create"; input: { parentTaskName?: string; parentTaskId?: number; templateName?: string; templateFile?: string } }
  | { operation: "task.edit"; input: { taskId?: number; taskTitle?: string; taskDetail?: string; taskStatus?: ClawTaskStatus; taskChoiceId?: string } }
  | { operation: "task.add"; input: { tasks: Array<{ title: string; detail?: string }> } }
  | { operation: "task.done"; input: { tasks: Array<{ id: number; choiceId?: string }> } }
  | { operation: "task.remove"; input: { taskId?: number; tasks?: Array<{ id: number }> } }
  | { operation: "search"; input: { query: string; limit?: number } }
  | { operation: "search.index.refresh"; input: Record<string, never> }
  | { operation: "knowledge.materials"; input: { sourceSessionKey: string; sourcePlan: string } }
  | { operation: "knowledge.claim"; input: { finalizeId: string } }
  /** Internal read-only receipt reconciliation, not a model operation. */
  | { operation: "knowledge.claim.receipt"; input: { finalizeId: string } }
  | { operation: "knowledge.done.receipt"; input: { finalizeId: string; claimToken?: string; expectedStatus?: "succeeded" | "failed"; expectedResult?: string } }
  | { operation: "knowledge.done"; input: { finalizeId: string; claimToken?: string } & (
      { status: "succeeded"; result: string; error?: never } | { status: "failed"; error: string; result?: never }
    ) };

export type ClawSessionCommandResult<T extends ClawSessionCommand> =
  T extends { operation: "plan.show"; input: { simple: true } }
    ? SessionSimplePlanView
    : T extends { operation: `knowledge.${string}` } ? ClawKnowledgeResult : unknown;

/** Owner-produced business payload. Adapters preserve additive fields, including claim material. */
export type ClawKnowledgeResult = {
  ok: boolean;
  command: `knowledge.${string}`;
  finalizeId?: string;
  claimed?: boolean;
  claimToken?: string;
  jobPath?: string;
  templatePath?: string;
  assignments?: unknown[];
  completed?: boolean;
  alreadyDone?: boolean;
  failed?: boolean;
  terminal?: boolean;
  matches?: boolean;
  [field: string]: unknown;
};

export type ClawHostActionV1 =
  | {
      schemaVersion: 1;
      id: string;
      tool: "update_plan";
      input: {
        explanation?: string;
        plan: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>;
      };
    }
  | {
      schemaVersion: 1;
      id: string;
      tool: "create_goal";
      input: { objective: string };
    }
  | {
      schemaVersion: 1;
      id: string;
      tool: "update_goal";
      input: { status: "complete" | "blocked" };
    };

export type ClawPostCommitEffectV1 = {
  type: "completion.refresh";
  taskName: string;
  planFile?: string;
  planStatus: string;
  endedAt?: string;
};

export type ClawSourceKnowledgeDispatchV2 = {
  schemaVersion: 2; kind: "knowledge.finalize"; host: "codex" | "cindy" | "dsh";
  dispatchId: string; sourceSessionKey: string; sourcePlan: string; sourcePlanTitle: string;
  projectRoot: string; preferReuse: false; prompt: string; leadInstruction?: string;
  model?: string; reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
};
export type ClawKnowledgeDispatch = ClawSourceKnowledgeDispatchV2 | ClawKnowledgeDispatchV1;
export type ClawKnowledgeDispatchV1 = {
  schemaVersion: 1;
  /** Additive fields; legacy envelopes may omit them. New dispatches always carry the host. */
  kind?: "knowledge.finalize";
  host?: "codex" | "cindy" | "dsh" | "opencode";
  finalizeId: string;
  preferReuse: boolean;
  projectRoot?: string;
  leadInstruction?: string;
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  prompt: string;
};

export type ClawSessionCommandEnvelope<T extends ClawSessionCommand = ClawSessionCommand> = {
  schemaVersion: 1;
  output: ClawSessionCommandResult<T>;
  hostActions?: ClawHostActionV1[];
  postCommitEffects?: ClawPostCommitEffectV1[];
  knowledgeDispatch?: ClawKnowledgeDispatch;
};

export type SessionProtocolRequest =
  | {
      protocolVersion: 1;
      requestId: string;
      token: string;
      operation: "session.open";
      input: {
        agentSessionId: string;
        workdir: string;
        client: SessionClientInfo;
      };
    }
  | {
      protocolVersion: 1;
      requestId: string;
      token: string;
      operation: "session.open.receipt";
      input: {
        agentSessionId: string;
        workdir: string;
        client: SessionClientInfo;
      };
    }
  | {
      protocolVersion: 1;
      requestId: string;
      token: string;
      operation: "session.command";
      sessionHandle: string;
      input: ClawSessionCommand;
    }
  | {
      protocolVersion: 1;
      requestId: string;
      token: string;
      operation: "session.status" | "session.close";
      sessionHandle: string;
      input: Record<string, never>;
    };

export type FailureDiagnostic = {
  code: string; message: string; outcome: "known" | "unknown"; phase?: string;
  effect?: "none" | "partial" | "committed" | "unknown";
  origin?: string; operation?: string; resource?: string; correlationId?: string;
  cause?: FailureDiagnostic; diagnostics?: FailureDiagnostic[];
};

export type SessionProtocolResponse =
  | {
      ok: true;
      requestId: string;
      output: unknown;
    }
  | {
      ok: false;
      requestId: string;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        outcome: "known" | "unknown";
        phase?: string;
        effect?: "none" | "partial" | "committed" | "unknown";
        recoveryCommand?: string;
        origin?: string; operation?: string; resource?: string; correlationId?: string;
        cause?: FailureDiagnostic; diagnostics?: FailureDiagnostic[];
        details?: Record<string, unknown>;
      };
    };

export type SessionDaemonState = {
  schemaVersion: 1;
  protocolVersion: 1;
  pid: number;
  host: "127.0.0.1";
  port: number;
  token: string;
  startedAt: string;
};
