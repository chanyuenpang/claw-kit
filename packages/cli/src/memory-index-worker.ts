import { parentPort, workerData } from "node:worker_threads";
import { ClawError, buildMemoryIndex } from "@veewo/claw-core";

type WorkerInput = { cwd?: string; scope?: "project" };

try {
  const input = workerData as WorkerInput;
  const result = buildMemoryIndex({ cwd: String(input.cwd ?? ""), scope: "project" });
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    code: error instanceof ClawError ? error.code : undefined,
  });
}
