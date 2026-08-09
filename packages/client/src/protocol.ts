export const SESSION_PROTOCOL_VERSION = 1;

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

export type ClawSessionCommand =
  | {
      operation: "plan.create";
      input: {
        title?: string;
        goalText?: string;
        taskName?: string;
        scope?: "project" | "session";
        templateName?: string;
        templateFile?: string;
      };
    }
  | {
      operation: "plan.start";
      input: {
        updates?: {
          goalText?: string;
          requirementsSummary?: string;
          acceptanceCriteria?: string[];
        };
        appendTasks?: Array<{ title: string; detail?: string }>;
      };
    }
  | { operation: "plan.resume"; input: { planId?: string } }
  | { operation: "plan.leave"; input: Record<string, never> }
  | { operation: "plan.show"; input: { simple?: boolean } }
  | {
      operation: "plan.edit";
      input: {
        operations: Array<
          | { type: "plan.update"; updates: Record<string, unknown> }
          | { type: "plan.status"; status: string }
        >;
      };
    }
  | { operation: "plan.wait"; input: Record<string, never> }
  | {
      operation: "plan.done";
      input: {
        retrospectiveSummary?: string;
        keyDecisions?: string[];
        whatWorked?: string[];
        issues?: string[];
        followUps?: string[];
      };
    }
  | { operation: "subplan.create"; input: { parentTaskName: string; parentTaskId: number } }
  | {
      operation: "task.edit";
      input: {
        taskId?: number;
        taskStatus?: "pending" | "in_progress" | "subagent_running" | "done" | "blocked";
        taskChoiceId?: string;
        taskTitle?: string;
        taskDetail?: string;
      };
    }
  | {
      operation: "task.add";
      input: { tasks: Array<{ title: string; detail?: string }> };
    }
  | {
      operation: "task.done";
      input: { tasks: Array<{ id: number; choiceId?: string }> };
    }
  | { operation: "search"; input: { query: string; limit?: number; dir?: string } };

export type ClawSessionCommandResult<T extends ClawSessionCommand> =
  T extends { operation: "plan.show"; input: { simple: true } }
    ? SessionSimplePlanView
    : unknown;

export type ClawSessionCommandEnvelope<T extends ClawSessionCommand = ClawSessionCommand> = {
  schemaVersion: 1;
  output: ClawSessionCommandResult<T>;
  hostActions?: unknown[];
  postCommitEffects?: unknown[];
  knowledgeDispatch?: unknown;
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
