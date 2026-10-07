export type ClawErrorCode =
  | "PROJECT_ROOT_NOT_FOUND"
  | "CLAW_DIR_NOT_FOUND"
  | "PLAN_CREATE_SCOPE_DECISION_REQUIRED"
  | "PROJECT_ALREADY_INITIALIZED"
  | "PROJECT_CONFIG_INVALID"
  | "PROJECT_CONFIG_MISSING"
  | "PROJECT_CONFIG_LAYER_INVALID"
  | "PROJECT_CONFIG_CONFLICT"
  | "PROJECT_CONFIG_KEY_INVALID"
  | "TASK_NOT_FOUND"
  | "TASK_NAME_INVALID"
  | "ACTIVE_PLAN_INVALID"
  | "ACTIVE_PLAN_MISSING"
  | "PLAN_NOT_FOUND"
  | "PLAN_ALREADY_EXISTS"
  | "PLAN_STATUS_INVALID"
  | "PLAN_STATUS_NOT_SETTABLE"
  | "PLAN_STATUS_TRANSITION_FORBIDDEN"
  | "PLAN_STATUS_REOPEN_REQUIRED"
  | "TASK_STATUS_FORBIDDEN_IN_NON_ACTIVE_PLAN"
  | "PLAN_WRITE_CONFLICT"
  | "PLAN_STALE_EDIT"
  | "PLAN_CREATE_BLOCKED_BY_PROCESS_PLAN"
  | "CURRENT_PLAN_REQUIRED"
  | "PLAN_NOT_RESUMABLE"
  | "PLAN_FOCUS_CONFLICT"
  | "PLAN_FOCUS_CHANGED"
  | "PLAN_TRANSITION_CONFLICT"
  | "FOCUS_RECOVERY_CONFLICT"
  | "SESSION_IDENTITY_INVALID"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "SESSION_PROTOCOL_UNSUPPORTED"
  | "SESSION_COMMAND_FAILED"
  | "SESSION_OPERATION_UNSUPPORTED"
  | "RETROSPECTIVE_REQUIRED"
  | "MEMORY_QUERY_REQUIRED"
  | "MEMORY_DISABLED"
  | "MEMORY_STORE_BUSY"
  | "MEMORY_VECTOR_INDEX_REQUIRED"
  | "GITNEXUS_REFRESH_FAILED"
  | "KNOWLEDGE_CAPTURE_TARGET_REQUIRED"
  | "KNOWLEDGE_DIRECT_WORKFLOW_ACTIVE"
  | "KNOWLEDGE_DIRECT_CONFIG_CHANGED"
  | "KNOWLEDGE_DIRECT_RESOURCE_MISSING"
  | "KNOWLEDGE_DIRECT_PATH_INVALID"
  | "KNOWLEDGE_CANONICAL_FORMAT_INVALID"
  | "TRUTH_TARGET_INVALID"
  | "CLI_PLUGIN_VERSION_LAGGING"
  | "INPUT_REQUIRED";

export type ClawExecutionFailure = {
  phase: "prepare" | "commit" | "post-commit";
  outcome: "known" | "unknown";
  effect: "none" | "partial" | "committed" | "unknown";
};

export class ClawError extends Error {
  readonly code: ClawErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly execution?: ClawExecutionFailure;

  constructor(code: ClawErrorCode, message: string, details?: Record<string, unknown>, execution?: ClawExecutionFailure) {
    super(message);
    this.name = "ClawError";
    this.code = code;
    this.details = details;
    this.execution = execution;
  }
}

/** Only the business write owner may attach phase/effect evidence. */
export function withExecutionFailure(error: unknown, execution: ClawExecutionFailure): ClawError {
  if (error instanceof ClawError && error.execution
    && !(execution.effect === "committed" && error.execution.effect === "none")) return error;
  return new ClawError(error instanceof ClawError ? error.code : "SESSION_COMMAND_FAILED",
    error instanceof Error ? error.message : String(error),
    error instanceof ClawError ? error.details : undefined, { ...execution });
}
