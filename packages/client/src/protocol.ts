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
      scope?: "project" | "session"; knowledgeCapture?: boolean; templateName?: string;
      templateFile?: string; planStatus?: string; forcePlanning?: boolean;
    } }
  | { operation: "plan.start"; input: { updates?: ClawPlanFields; appendTasks?: Array<{ title: string; detail?: string }> } }
  | { operation: "plan.resume"; input: { planId?: string } }
  | { operation: "plan.leave"; input: Record<string, never> }
  | { operation: "plan.show"; input: { simple?: boolean } }
  | { operation: "plan.edit"; input: { operations: ClawPlanMutation[] } }
  | { operation: "plan.wait"; input: Record<string, never> }
  | { operation: "plan.done"; input: ClawPlanFields }
  | { operation: "subplan.create"; input: { parentTaskName: string; parentTaskId: number; templateName?: string; templateFile?: string } }
  | { operation: "task.edit"; input: { taskId?: number; taskTitle?: string; taskDetail?: string; taskStatus?: ClawTaskStatus; taskChoiceId?: string } }
  | { operation: "task.add"; input: { tasks: Array<{ title: string; detail?: string }> } }
  | { operation: "task.done"; input: { tasks: Array<{ id: number; choiceId?: string }> } }
  | { operation: "search"; input: { query: string; limit?: number } }
  | { operation: "search.index.refresh"; input: Record<string, never> }
  | { operation: "knowledge.claim"; input: { finalizeId: string } }
  /** Internal read-only receipt reconciliation, not a model operation. */
  | { operation: "knowledge.claim.receipt"; input: { finalizeId: string } }
  | { operation: "knowledge.done"; input: { finalizeId: string; claimToken: string } & (
      { status: "succeeded"; result: string; error?: never } | { status: "failed"; error: string; result?: never }
    ) };

export type ClawSessionCommandResult<T extends ClawSessionCommand> =
  T extends { operation: "plan.show"; input: { simple: true } }
    ? SessionSimplePlanView
    : unknown;

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

export type ClawKnowledgeDispatchV1 = {
  schemaVersion: 1;
  policy: "background" | "subagent";
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
  knowledgeDispatch?: ClawKnowledgeDispatchV1;
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
        recoveryCommand?: string;
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
