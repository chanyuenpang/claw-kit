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
  | "TASK_STATUS_FORBIDDEN_IN_NON_ACTIVE_PLAN"
  | "PLAN_WRITE_CONFLICT"
  | "PLAN_STALE_EDIT"
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
  | "KNOWLEDGE_JOB_UNAVAILABLE"
  | "KNOWLEDGE_JOB_SCOPE_INVALID"
  | "KNOWLEDGE_CLAIM_MISMATCH"
  | "KNOWLEDGE_CLAIM_OWNER_MISMATCH"
  | "KNOWLEDGE_JOB_NOT_CLAIMED"
  | "KNOWLEDGE_CLAIM_EXPIRED"
  | "KNOWLEDGE_TERMINAL_RESULT_CONFLICT"
  | "KNOWLEDGE_COMPLETION_INVALID"
  | "KNOWLEDGE_CAPTURE_TARGET_REQUIRED"
  | "KNOWLEDGE_DIRECT_WORKFLOW_ACTIVE"
  | "KNOWLEDGE_DIRECT_CONFIG_CHANGED"
  | "KNOWLEDGE_DIRECT_RESOURCE_MISSING"
  | "KNOWLEDGE_DIRECT_PATH_INVALID"
  | "KNOWLEDGE_CANONICAL_FORMAT_INVALID"
  | "TRUTH_TARGET_INVALID"
  | "CLI_PLUGIN_VERSION_LAGGING"
  | "PLAN_SCOPE_REMOVED"
  | "PROJECT_INITIALIZATION_FAILED"
  | "INPUT_REQUIRED";

export type ClawExecutionFailure = {
  phase: "prepare" | "initialize" | "commit" | "post-commit";
  outcome: "known" | "unknown";
  effect: "none" | "partial" | "committed" | "unknown";
  operation?: string;
  resource?: string;
  correlationId?: string;
};

export class ClawError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly execution?: ClawExecutionFailure;

  constructor(code: string, message: string, details?: Record<string, unknown>, execution?: ClawExecutionFailure, cause?: unknown) {
    super(message);
    this.name = "ClawError";
    this.code = code;
    this.details = details;
    this.execution = execution;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Only the business write owner may attach phase/effect evidence. */
export function withExecutionFailure(error: unknown, execution: ClawExecutionFailure): ClawError {
  const inner = error instanceof ClawError ? error.execution : undefined;
  const sameScope = inner && inner.operation === execution.operation && inner.resource === execution.resource;
  if (error instanceof ClawError && inner && execution.effect === "none" && sameScope) return error;
  const evidence = inner && execution.effect === "none" && inner.effect !== "none"
    ? { ...execution, outcome: inner.outcome, effect: inner.effect } : execution;
  let code: string | undefined, message: string;
  try { code = safeFailureCode(failureRecord(error)?.code); message = failureMessage(error); }
  catch { message = "Owner failure detail could not be safely inspected"; }
  return new ClawError(code ?? "SESSION_COMMAND_FAILED",
    message, error instanceof ClawError ? error.details : undefined,
    { ...evidence }, error instanceof ClawError && !error.execution ? error.cause : error);
}

export type SafeFailure = {
  code: string; message: string; name?: string; origin?: string; operation?: string;
  phase?: string; outcome: "known" | "unknown"; effect?: "none" | "partial" | "committed" | "unknown";
  resource?: string; correlationId?: string; cause?: SafeFailure; diagnostics?: SafeFailure[];
};

/** Serialization only: these helpers never authorize, execute, probe or retry. */
function failureRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function safeFailureCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_.:/-]{0,95}$/.test(value) && !/^[A-Za-z]:[\\/]|:\/\//.test(value) ? value : undefined;
}
export function redactFailureMessage(value: string): string {
  return value.slice(0, 4096)
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9+/=_:.-]+/gi, "[authorization-redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[url-redacted]")
    .replace(/(["']?(?:claim[_-]?token|token|api[_-]?key|password|authorization|secret)["']?\s*[=:]\s*)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/(["']?(?:prompt|payload|messages|content|input)["']?\s*[:=]\s*)[^\n]*/gi, "$1[content-redacted]")
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9+/=_:.-]+/gi, "[authorization-redacted]")
    .replace(/(--(?:claim-token|api-key|password|token)\s+)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id-redacted]")
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[path-redacted]")
    .replace(/\\\\[^\s"'<>]+/g, "[path-redacted]")
    .replace(/\/(?:Users|home)\/[^\s"'<>]+/g, "[path-redacted]")
    .replace(/\r?\n[\s\S]*/g, " [additional detail omitted]").slice(0, 768);
}

function failureMessage(error: unknown): string {
  const row = failureRecord(error);
  if (typeof row?.syscall === "string" && safeFailureCode(row.syscall) && safeFailureCode(row.code)) return row.syscall + " failed (" + row.code + "); filesystem detail redacted";
  const value = typeof row?.message === "string" ? row.message : typeof error === "string" ? error : "Owner supplied no safe error message";
  // Structured envelope bodies belong in fields, not a raw payload transcript.
  if (/^\s*\{/.test(value) || /^\s*\[\s*(?:\{|\[|\")/.test(value)) return "Structured error detail omitted; see code and cause";
  return redactFailureMessage(value);
}
export function serializeFailure(error: unknown, options: {
  fallbackCode?: string; fallbackOutcome?: "known" | "unknown"; origin?: string; operation?: string;
  execution?: ClawExecutionFailure; resource?: string; correlationId?: string;
} = {}): SafeFailure {
  const seen = new Set<unknown>(); let nodes = 0;
  const visit = (value: unknown, depth: number): SafeFailure => {
    if (++nodes > 12 || depth > 3 || seen.has(value)) return { code: "DIAGNOSTIC_TRUNCATED", message: "Repeated or over-budget diagnostic omitted", outcome: "unknown" };
    seen.add(value);
    const inspections: SafeFailure[] = [];
    const get = (row: Record<string, unknown> | undefined, key: string): unknown => {
      try { return row?.[key]; } catch {
        if (inspections.length < 3) inspections.push({ code: "ERROR_DIAGNOSTIC_UNAVAILABLE", message: "Error " + key + " inspection failed", operation: "error.inspect", outcome: "known" });
        return undefined;
      }
    };
    let row: Record<string, unknown> | undefined;
    try { row = failureRecord(value); } catch { /* revoked proxy is diagnostic only */ }
    const outerCode = safeFailureCode(get(row, "code"));
    const nested = outerCode ? undefined : failureRecord(get(row, "error"));
    const actual = outerCode ? row : nested ?? row;
    const execution = failureRecord(get(actual, "execution"));
    const code = outerCode ?? safeFailureCode(get(actual, "code")) ?? options.fallbackCode ?? "OWNER_OPERATION_FAILED";
    const outcome = get(execution, "outcome") ?? get(actual, "outcome");
    const effect = get(execution, "effect") ?? get(actual, "effect");
    const phase = get(execution, "phase") ?? get(actual, "phase");
    const syscall = get(actual, "syscall"), message = get(actual, "message");
    const safe: SafeFailure = { code,
      message: typeof syscall === "string" && safeFailureCode(syscall) ? syscall + " failed (" + code + "); filesystem detail redacted"
        : typeof message === "string" ? failureMessage({ message }) : typeof value === "string" ? failureMessage(value) : "Owner supplied no safe error message",
      outcome: outcome === "known" || outcome === "unknown" ? outcome : options.fallbackOutcome ?? "unknown",
      ...(typeof phase === "string" && safeFailureCode(phase) ? { phase } : {}),
      ...(effect === "none" || effect === "partial" || effect === "committed" || effect === "unknown" ? { effect } : {}),
    };
    for (const key of ["name", "origin", "operation", "resource", "correlationId"] as const) {
      const field = get(execution, key) ?? get(actual, key);
      if (typeof field === "string" && field.length <= 160) safe[key] = (key === "resource" || key === "correlationId") && /^[A-Za-z0-9_.:-]{1,160}$/.test(field) ? field : redactFailureMessage(field);
    }
    const cause = get(actual, "cause") ?? (actual === row ? failureRecord(get(row, "error")) : undefined);
    if (cause !== undefined && depth < 3) safe.cause = visit(cause, depth + 1);
    const diagnostics = get(actual, "diagnostics");
    if (Array.isArray(diagnostics) && depth < 2) {
      try { safe.diagnostics = [];
        for (let i = 0; i < Math.min(3, diagnostics.length); i++) safe.diagnostics.push(visit(get(diagnostics as unknown as Record<string, unknown>, String(i)), depth + 1)); }
      catch { inspections.push({ code: "ERROR_DIAGNOSTIC_UNAVAILABLE", message: "Secondary diagnostics inspection failed", operation: "error.diagnostics.inspect", outcome: "known" }); }
    }
    if (inspections.length) safe.diagnostics = [...(safe.diagnostics ?? []), ...inspections].slice(0, 3);
    return safe;
  };
  let result: SafeFailure;
  try { result = visit(error, 0); }
  catch { result = { code: options.fallbackCode ?? "OWNER_OPERATION_FAILED", message: "Owner error detail could not be safely inspected", outcome: options.fallbackOutcome ?? "unknown" }; }
  for (const key of ["origin", "operation", "resource", "correlationId"] as const) if (!result[key] && options[key]) result[key] = (key === "resource" || key === "correlationId") && /^[A-Za-z0-9_.:-]{1,160}$/.test(options[key]!) ? options[key] : redactFailureMessage(options[key]!);
  if (options.execution) {
    result.phase = options.execution.phase; result.outcome = options.execution.outcome; result.effect = options.execution.effect;
    for (const key of ["operation", "resource", "correlationId"] as const) {
      const field = options.execution[key];
      if (typeof field === "string") result[key] = (key === "resource" || key === "correlationId") && /^[A-Za-z0-9_.:-]{1,160}$/.test(field) ? field : redactFailureMessage(field);
    }
  }
  return result;
}
