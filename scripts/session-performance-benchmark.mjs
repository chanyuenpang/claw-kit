import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { initProject } from "../packages/core/dist/src/index.js";
import { openPersistentSession } from "../packages/cli/dist/session-command.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-session-benchmark-"));
const project = path.join(root, "project");
const runtimeRoot = path.join(root, "runtime");
fs.mkdirSync(project);
initProject({ cwd: project, projectName: "Session benchmark", planning: false });

function rssBytes(pid) {
  try {
    if (process.platform === "win32") {
      return Number(execFileSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${Number(pid)}).WorkingSet64`,
      ], { encoding: "utf-8" }).trim());
    }
    const status = fs.readFileSync(`/proc/${Number(pid)}/status`, "utf-8");
    return Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] ?? 0) * 1024;
  } catch {
    return null;
  }
}

try {
  const coldStarted = performance.now();
  const first = await openPersistentSession({ workdir: project, agentSessionId: "benchmark-1", runtimeRoot });
  const coldOpenMs = performance.now() - coldStarted;
  await first.execute({
    operation: "plan.create",
    input: { taskName: "benchmark-plan", title: "Benchmark plan", goalText: "Measure session operations" },
  });
  const rssAtOneSession = rssBytes(process.pid);
  await first.close();

  const warmStarted = performance.now();
  const warm = await openPersistentSession({ workdir: project, agentSessionId: "benchmark-1", runtimeRoot });
  const warmOpenMs = performance.now() - warmStarted;
  const commandSamples = [];
  for (let index = 0; index < 25; index += 1) {
    const started = performance.now();
    await warm.execute({ operation: "plan.show", input: { simple: true } });
    commandSamples.push(performance.now() - started);
  }
  // Use a non-terminal focus transition: `plan.leave` enters `end.leave` and
  // schedules a detached completion refresh whose project cwd would keep the
  // benchmark fixture locked on Windows.
  const focusSamples = [];
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    await warm.execute({ operation: "plan.wait", input: {} });
    await warm.execute({ operation: "plan.resume", input: { planId: "benchmark-plan" } });
    focusSamples.push((performance.now() - started) / 2);
  }

  const sessions = [warm];
  for (let index = 2; index <= 10; index += 1) {
    sessions.push(await openPersistentSession({ workdir: project, agentSessionId: `benchmark-${index}`, runtimeRoot }));
  }
  const rssAtTenSessions = rssBytes(process.pid);
  for (const openSession of sessions) await openSession.close();

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  console.log(JSON.stringify({
    transport: "direct",
    corpus: { sessions: 10, typedCommands: commandSamples.length, focusTransitions: focusSamples.length * 2 },
    coldOpenMs: Number(coldOpenMs.toFixed(2)),
    warmOpenMs: Number(warmOpenMs.toFixed(2)),
    typedCommandAverageMs: Number(average(commandSamples).toFixed(2)),
    focusJournalAverageMs: Number(average(focusSamples).toFixed(2)),
    rssAtOneSession,
    rssAtTenSessions,
    rssGrowthBytes: rssAtOneSession === null || rssAtTenSessions === null
      ? null
      : rssAtTenSessions - rssAtOneSession,
  }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 });
  } catch (error) {
    // Cleanup residue is not a measurement failure; never hide it either.
    console.warn(`session benchmark cleanup left ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
