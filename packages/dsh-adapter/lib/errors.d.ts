// Generated from packages/core/src/errors.ts; do not edit this artifact.
export type ClawErrorCode = "PROJECT_ROOT_NOT_FOUND" | "CLAW_DIR_NOT_FOUND" | "PLAN_CREATE_SCOPE_DECISION_REQUIRED" | "PROJECT_ALREADY_INITIALIZED" | "PROJECT_CONFIG_INVALID" | "PROJECT_CONFIG_MISSING" | "PROJECT_CONFIG_LAYER_INVALID" | "PROJECT_CONFIG_CONFLICT" | "PROJECT_CONFIG_KEY_INVALID" | "TASK_NOT_FOUND" | "TASK_NAME_INVALID" | "ACTIVE_PLAN_INVALID" | "ACTIVE_PLAN_MISSING" | "PLAN_NOT_FOUND" | "PLAN_ALREADY_EXISTS" | "PLAN_STATUS_INVALID" | "PLAN_STATUS_NOT_SETTABLE" | "PLAN_STATUS_TRANSITION_FORBIDDEN" | "TASK_STATUS_FORBIDDEN_IN_NON_ACTIVE_PLAN" | "PLAN_WRITE_CONFLICT" | "PLAN_STALE_EDIT" | "CURRENT_PLAN_REQUIRED" | "PLAN_NOT_RESUMABLE" | "PLAN_FOCUS_CONFLICT" | "PLAN_FOCUS_CHANGED" | "PLAN_TRANSITION_CONFLICT" | "FOCUS_RECOVERY_CONFLICT" | "SESSION_IDENTITY_INVALID" | "SESSION_NOT_FOUND" | "SESSION_EXPIRED" | "SESSION_PROTOCOL_UNSUPPORTED" | "SESSION_COMMAND_FAILED" | "SESSION_OPERATION_UNSUPPORTED" | "RETROSPECTIVE_REQUIRED" | "MEMORY_QUERY_REQUIRED" | "MEMORY_DISABLED" | "MEMORY_STORE_BUSY" | "MEMORY_VECTOR_INDEX_REQUIRED" | "GITNEXUS_REFRESH_FAILED" | "KNOWLEDGE_JOB_UNAVAILABLE" | "KNOWLEDGE_JOB_SCOPE_INVALID" | "KNOWLEDGE_CLAIM_MISMATCH" | "KNOWLEDGE_CLAIM_OWNER_MISMATCH" | "KNOWLEDGE_JOB_NOT_CLAIMED" | "KNOWLEDGE_CLAIM_EXPIRED" | "KNOWLEDGE_TERMINAL_RESULT_CONFLICT" | "KNOWLEDGE_COMPLETION_INVALID" | "KNOWLEDGE_CAPTURE_TARGET_REQUIRED" | "KNOWLEDGE_DIRECT_WORKFLOW_ACTIVE" | "KNOWLEDGE_DIRECT_CONFIG_CHANGED" | "KNOWLEDGE_DIRECT_RESOURCE_MISSING" | "KNOWLEDGE_DIRECT_PATH_INVALID" | "KNOWLEDGE_CANONICAL_FORMAT_INVALID" | "TRUTH_TARGET_INVALID" | "CLI_PLUGIN_VERSION_LAGGING" | "PLAN_SCOPE_REMOVED" | "PROJECT_INITIALIZATION_FAILED" | "RUNTIME_DIR_NOT_WRITABLE" | "INPUT_REQUIRED";
export type ClawExecutionFailure = {
    phase: "prepare" | "initialize" | "commit" | "post-commit";
    outcome: "known" | "unknown";
    effect: "none" | "partial" | "committed" | "unknown";
    operation?: string;
    resource?: string;
    correlationId?: string;
};
export declare class ClawError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown> | undefined;
    readonly execution?: ClawExecutionFailure;
    constructor(code: string, message: string, details?: Record<string, unknown>, execution?: ClawExecutionFailure, cause?: unknown);
}
/** Only the business write owner may attach phase/effect evidence. */
export declare function withExecutionFailure(error: unknown, execution: ClawExecutionFailure): ClawError;
export type SafeFailure = {
    code: string;
    message: string;
    name?: string;
    origin?: string;
    operation?: string;
    phase?: string;
    outcome: "known" | "unknown";
    effect?: "none" | "partial" | "committed" | "unknown";
    resource?: string;
    correlationId?: string;
    cause?: SafeFailure;
    diagnostics?: SafeFailure[];
};
export declare function safeFailureCode(value: unknown): string | undefined;
export declare function redactFailureMessage(value: string): string;
export declare function serializeFailure(error: unknown, options?: {
    fallbackCode?: string;
    fallbackOutcome?: "known" | "unknown";
    origin?: string;
    operation?: string;
    execution?: ClawExecutionFailure;
    resource?: string;
    correlationId?: string;
}): SafeFailure;
