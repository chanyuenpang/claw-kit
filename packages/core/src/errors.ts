export type ClawErrorCode =
  | "PROJECT_ROOT_NOT_FOUND"
  | "CLAW_DIR_NOT_FOUND"
  | "PROJECT_ALREADY_INITIALIZED"
  | "PROJECT_CONFIG_INVALID"
  | "TASK_NOT_FOUND"
  | "TASK_NAME_INVALID"
  | "ACTIVE_PLAN_INVALID"
  | "ACTIVE_PLAN_MISSING"
  | "PLAN_NOT_FOUND"
  | "PLAN_STATUS_INVALID"
  | "PLAN_STATUS_NOT_SETTABLE"
  | "PLAN_STATUS_TRANSITION_FORBIDDEN"
  | "PLAN_STATUS_REOPEN_REQUIRED"
  | "TASK_STATUS_FORBIDDEN_IN_NON_ACTIVE_PLAN"
  | "PLAN_WRITE_CONFLICT"
  | "RETROSPECTIVE_REQUIRED"
  | "MEMORY_QUERY_REQUIRED"
  | "MEMORY_STORE_BUSY"
  | "MEMORY_VECTOR_INDEX_REQUIRED"
  | "GITNEXUS_REFRESH_FAILED"
  | "TRUTH_TARGET_INVALID"
  | "INPUT_REQUIRED";

export class ClawError extends Error {
  readonly code: ClawErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ClawErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ClawError";
    this.code = code;
    this.details = details;
  }
}
