import { ClawError } from "@veewo/claw-core";

/** Shared envelope: business owners supply effect evidence; transports do not infer it from text. */
export function serializeCommandFailure(error: unknown, fallbackOutcome: "known" | "unknown", fallbackCode = "SESSION_COMMAND_FAILED") {
  const owner = error instanceof ClawError ? error : undefined;
  const code = owner?.details?.code === "SESSION_BUSY" ? "SESSION_BUSY" : owner?.code ?? fallbackCode;
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
    retryable: code === "SESSION_BUSY"
      && (owner?.execution?.outcome ?? fallbackOutcome) === "known"
      && (!owner?.execution || owner.execution.effect === "none"),
    outcome: owner?.execution?.outcome ?? fallbackOutcome,
    ...(owner?.execution ? { phase: owner.execution.phase, effect: owner.execution.effect } : {}),
  };
}
