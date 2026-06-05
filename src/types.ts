export type AttachOptions = {
  cwd: string;
  taskName?: string | undefined;
};

export type AttachResult = {
  projectRoot: string;
  clawDir: string;
  projectId: string;
  projectName?: string;
  taskName?: string;
  taskDir?: string;
  activePlan?: string;
  activePlanPath?: string;
  metaPath?: string;
};

export type AttachErrorCode =
  | "PROJECT_ROOT_NOT_FOUND"
  | "CLAW_DIR_NOT_FOUND"
  | "PROJECT_CONFIG_INVALID"
  | "TASK_NOT_FOUND"
  | "TASK_ALREADY_EXISTS"
  | "TASK_NAME_INVALID"
  | "ACTIVE_PLAN_INVALID"
  | "ACTIVE_PLAN_MISSING"
  | "TASK_SCOPE_NOT_BOUND";

export class AttachError extends Error {
  readonly code: AttachErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: AttachErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
