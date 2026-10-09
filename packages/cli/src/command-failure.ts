import { serializeFailure, redactFailureMessage } from "@veewo/claw-core";

/** Cause identity is independent from owner outcome/effect evidence. */
export function serializeCommandFailure(error: unknown, fallbackOutcome: "known" | "unknown", fallbackCode = "SESSION_COMMAND_FAILED") {
  const value = serializeFailure(error, { fallbackOutcome, fallbackCode, origin: "cli" });
  const details = error && typeof error === "object" ? (error as { details?: { code?: unknown } }).details : undefined;
  if (details?.code === "SESSION_BUSY") value.code = "SESSION_BUSY";
  const safeDetails: Record<string, unknown> = {};
  if (details) for (const [key, item] of Object.entries(details)) {
    if (/token|key|secret|password|authorization|payload|prompt/i.test(key)) continue;
    if (typeof item === "number" || typeof item === "boolean" || item === null) safeDetails[key] = item;
    else if (["code", "field", "scope", "reason", "path", "planPath", "operation", "resource"].includes(key) && typeof item === "string") safeDetails[key] = redactFailureMessage(item);
  }
  return { ...value, ...(Object.keys(safeDetails).length ? { details: safeDetails } : {}), retryable: value.code === "SESSION_BUSY" && value.outcome === "known" && (!value.effect || value.effect === "none") };
}
