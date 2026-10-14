import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Detached completion work can briefly retain its cwd after the command exits.
// Retry at the directory boundary: Windows rm's internal retries do not cover
// every root-directory EPERM. Exhaustion remains a visible test failure.
export async function waitForTestCompletion(directory: string): Promise<void> {
  // Let an already-launched completion worker finish while its inputs still
  // exist; deleting them first can turn teardown into a worker failure.
  const flight = path.join(directory, ".claw", "logs", "completion-refresh", "inflight.lock", "state.json");
  const completionDeadline = Date.now() + 30_000;
  while (Date.now() < completionDeadline) {
    try {
      const state = JSON.parse(await fs.readFile(flight, "utf8")) as { pid?: number };
      if (state.pid) {
        try { process.kill(state.pid, 0); } catch { break; }
      }
    } catch { break; }
    await delay(100);
  }
}

export async function removeTestDirectory(directory: string): Promise<void> {
  const suiteRoot = process.env.CLAW_TEST_TEMP_ROOT;
  if (suiteRoot) {
    const relative = path.relative(path.resolve(suiteRoot), path.resolve(directory));
    // The outer npm runner verifies deletion after all test processes exit.
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return;
  }
  await waitForTestCompletion(directory);
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")
        || Date.now() >= deadline) throw error;
      await delay(100);
    }
  }
}
