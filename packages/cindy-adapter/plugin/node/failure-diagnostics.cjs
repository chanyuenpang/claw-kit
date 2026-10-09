// Generated from packages/core/src/errors.ts; do not edit.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawError = void 0;
exports.withExecutionFailure = withExecutionFailure;
exports.safeFailureCode = safeFailureCode;
exports.redactFailureMessage = redactFailureMessage;
exports.serializeFailure = serializeFailure;
class ClawError extends Error {
    code;
    details;
    execution;
    constructor(code, message, details, execution, cause) {
        super(message);
        this.name = "ClawError";
        this.code = code;
        this.details = details;
        this.execution = execution;
        if (cause !== undefined)
            this.cause = cause;
    }
}
exports.ClawError = ClawError;
/** Only the business write owner may attach phase/effect evidence. */
function withExecutionFailure(error, execution) {
    const inner = error instanceof ClawError ? error.execution : undefined;
    const sameScope = inner && inner.operation === execution.operation && inner.resource === execution.resource;
    if (error instanceof ClawError && inner && execution.effect === "none" && sameScope)
        return error;
    const evidence = inner && execution.effect === "none" && inner.effect !== "none"
        ? { ...execution, outcome: inner.outcome, effect: inner.effect } : execution;
    let code, message;
    try {
        code = safeFailureCode(failureRecord(error)?.code);
        message = failureMessage(error);
    }
    catch {
        message = "Owner failure detail could not be safely inspected";
    }
    return new ClawError(code ?? "SESSION_COMMAND_FAILED", message, error instanceof ClawError ? error.details : undefined, { ...evidence }, error instanceof ClawError && !error.execution ? error.cause : error);
}
/** Serialization only: these helpers never authorize, execute, probe or retry. */
function failureRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function safeFailureCode(value) {
    return typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_.:/-]{0,95}$/.test(value) && !/^[A-Za-z]:[\\/]|:\/\//.test(value) ? value : undefined;
}
function redactFailureMessage(value) {
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
function failureMessage(error) {
    const row = failureRecord(error);
    if (typeof row?.syscall === "string" && safeFailureCode(row.syscall) && safeFailureCode(row.code))
        return row.syscall + " failed (" + row.code + "); filesystem detail redacted";
    const value = typeof row?.message === "string" ? row.message : typeof error === "string" ? error : "Owner supplied no safe error message";
    // Structured envelope bodies belong in fields, not a raw payload transcript.
    if (/^\s*\{/.test(value) || /^\s*\[\s*(?:\{|\[|\")/.test(value))
        return "Structured error detail omitted; see code and cause";
    return redactFailureMessage(value);
}
function serializeFailure(error, options = {}) {
    const seen = new Set();
    let nodes = 0;
    const visit = (value, depth) => {
        if (++nodes > 12 || depth > 3 || seen.has(value))
            return { code: "DIAGNOSTIC_TRUNCATED", message: "Repeated or over-budget diagnostic omitted", outcome: "unknown" };
        seen.add(value);
        const inspections = [];
        const get = (row, key) => {
            try {
                return row?.[key];
            }
            catch {
                if (inspections.length < 3)
                    inspections.push({ code: "ERROR_DIAGNOSTIC_UNAVAILABLE", message: "Error " + key + " inspection failed", operation: "error.inspect", outcome: "known" });
                return undefined;
            }
        };
        let row;
        try {
            row = failureRecord(value);
        }
        catch { /* revoked proxy is diagnostic only */ }
        const outerCode = safeFailureCode(get(row, "code"));
        const nested = outerCode ? undefined : failureRecord(get(row, "error"));
        const actual = outerCode ? row : nested ?? row;
        const execution = failureRecord(get(actual, "execution"));
        const code = outerCode ?? safeFailureCode(get(actual, "code")) ?? options.fallbackCode ?? "OWNER_OPERATION_FAILED";
        const outcome = get(execution, "outcome") ?? get(actual, "outcome");
        const effect = get(execution, "effect") ?? get(actual, "effect");
        const phase = get(execution, "phase") ?? get(actual, "phase");
        const syscall = get(actual, "syscall"), message = get(actual, "message");
        const safe = { code,
            message: typeof syscall === "string" && safeFailureCode(syscall) ? syscall + " failed (" + code + "); filesystem detail redacted"
                : typeof message === "string" ? failureMessage({ message }) : typeof value === "string" ? failureMessage(value) : "Owner supplied no safe error message",
            outcome: outcome === "known" || outcome === "unknown" ? outcome : options.fallbackOutcome ?? "unknown",
            ...(typeof phase === "string" && safeFailureCode(phase) ? { phase } : {}),
            ...(effect === "none" || effect === "partial" || effect === "committed" || effect === "unknown" ? { effect } : {}),
        };
        for (const key of ["name", "origin", "operation", "resource", "correlationId"]) {
            const field = get(execution, key) ?? get(actual, key);
            if (typeof field === "string" && field.length <= 160)
                safe[key] = (key === "resource" || key === "correlationId") && /^[A-Za-z0-9_.:-]{1,160}$/.test(field) ? field : redactFailureMessage(field);
        }
        const cause = get(actual, "cause") ?? (actual === row ? failureRecord(get(row, "error")) : undefined);
        if (cause !== undefined && depth < 3)
            safe.cause = visit(cause, depth + 1);
        const diagnostics = get(actual, "diagnostics");
        if (Array.isArray(diagnostics) && depth < 2) {
            try {
                safe.diagnostics = [];
                for (let i = 0; i < Math.min(3, diagnostics.length); i++)
                    safe.diagnostics.push(visit(get(diagnostics, String(i)), depth + 1));
            }
            catch {
                inspections.push({ code: "ERROR_DIAGNOSTIC_UNAVAILABLE", message: "Secondary diagnostics inspection failed", operation: "error.diagnostics.inspect", outcome: "known" });
            }
        }
        if (inspections.length)
            safe.diagnostics = [...(safe.diagnostics ?? []), ...inspections].slice(0, 3);
        return safe;
    };
    let result;
    try {
        result = visit(error, 0);
    }
    catch {
        result = { code: options.fallbackCode ?? "OWNER_OPERATION_FAILED", message: "Owner error detail could not be safely inspected", outcome: options.fallbackOutcome ?? "unknown" };
    }
    for (const key of ["origin", "operation", "resource", "correlationId"])
        if (!result[key] && options[key])
            result[key] = (key === "resource" || key === "correlationId") && /^[A-Za-z0-9_.:-]{1,160}$/.test(options[key]) ? options[key] : redactFailureMessage(options[key]);
    if (options.execution) {
        result.phase = options.execution.phase;
        result.outcome = options.execution.outcome;
        result.effect = options.execution.effect;
        for (const key of ["operation", "resource", "correlationId"]) {
            const field = options.execution[key];
            if (typeof field === "string")
                result[key] = (key === "resource" || key === "correlationId") && /^[A-Za-z0-9_.:-]{1,160}$/.test(field) ? field : redactFailureMessage(field);
        }
    }
    return result;
}
