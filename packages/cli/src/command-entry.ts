import { createInterface } from "node:readline";
import { ClawError } from "@veewo/claw-core";
import { SessionCommandExecutor } from "./session-command.js";
import { SessionRegistryV2 } from "./session-registry-v2.js";

/** Trusted one-shot protocol, not a model-facing arbitrary CLI dispatcher.
 * Identity comes from the adapter-owned process environment and cwd, never
 * from the command payload. Exactly one bounded JSON line is executed.
 */
export async function runCommandEntry(): Promise<void> {
  let command: string | undefined;
  let executionStarted = false;
  try {
    if (process.argv.slice(3).length) throw new Error("internal-command accepts no argv arguments");
    const agentSessionId = process.env.CLAW_SESSION_ID;
    if (!agentSessionId?.trim()) throw new Error("internal-command requires trusted CLAW_SESSION_ID");
    const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
    let payload: unknown;
    try {
      for await (const line of reader) {
        if (Buffer.byteLength(line, "utf8") > 1024 * 1024) throw new Error("Command exceeds 1 MiB");
        payload = JSON.parse(line);
        break;
      }
    } finally { reader.close(); process.stdin.pause(); }
    // Validate before preparation, and report a rejected request as known.
    const { decodeClawCommand } = await import("./command-contract.js");
    const request = decodeClawCommand(payload);
    command = request.operation;
    const executor = new SessionCommandExecutor(new SessionRegistryV2());
    executionStarted = true;
    const envelope = await executor.execute({ agentSessionId, workdir: process.cwd(), client: { kind: "adapter", host: "dsh" } }, request);
    process.stdout.write(JSON.stringify({ ok: true, command, ...envelope }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, command, error: {
      code: error instanceof ClawError ? error.code : "SESSION_COMMAND_FAILED",
      message: error instanceof Error ? error.message : String(error),
      outcome: executionStarted ? "unknown" : "known", retryable: false,
    } }) + "\n");
    process.exitCode = 1;
  }
}
