import { Worker } from "node:worker_threads";
import { ClawError, buildMemoryIndex, type MemoryIndexResult } from "@veewo/claw-core";

type WorkerMessage = { ok?: boolean; result?: MemoryIndexResult; message?: string; code?: string };

/** Index refresh uses a blocking embedding worker. Inside the session daemon
 * that must not freeze the TCP event loop, or the next command times out
 * behind it. One-shot commands stay on the caller.
 */
export function buildMemoryIndexWithoutBlocking(cwd: string): Promise<MemoryIndexResult> {
  if (process.env.CLAW_IN_SESSION_DAEMON !== "1") {
    return Promise.resolve(buildMemoryIndex({ cwd, scope: "project" }));
  }
  const workerUrl = new URL("./memory-index-worker.js", import.meta.url);
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerUrl, {
      workerData: { cwd, scope: "project" },
      env: { ...process.env, CLAW_IN_SESSION_DAEMON: "0" },
    });
    const finish = (error?: Error, value?: MemoryIndexResult): void => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      if (error) reject(error);
      else resolve(value as MemoryIndexResult);
    };
    worker.on("message", (message: WorkerMessage) => {
      if (message?.ok) {
        finish(undefined, message.result);
        return;
      }
      finish(message?.code
        ? new ClawError(message.code, message.message ?? "Memory index refresh failed.")
        : new Error(message?.message ?? "Memory index refresh failed."));
    });
    worker.on("error", (error) => finish(error));
    worker.on("exit", (code) => {
      if (!settled && code !== 0) finish(new Error(`Memory index worker exited with code ${code}.`));
    });
  });
}
