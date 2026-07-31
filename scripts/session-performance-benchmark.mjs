import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { initProject } from "../packages/core/dist/src/index.js";
import { ClawClient } from "../packages/client/dist/index.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-session-benchmark-"));
const project = path.join(root, "project");
const runtimeRoot = path.join(root, "runtime");
process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS = "100";
fs.mkdirSync(project);
initProject({ cwd: project, projectName: "Session benchmark", planning: false });
const daemonEntryPath = path.resolve("packages/cli/dist/session-daemon-entry.js");
const client = new ClawClient({ runtimeRoot, daemonEntryPath, startupTimeoutMs: 10_000 });

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
  const first = await client.open("benchmark-1", project);
  const coldOpenMs = performance.now() - coldStarted;
  await first.command({
    operation: "plan.create",
    input: { taskName: "benchmark-plan", title: "Benchmark plan", goalText: "Measure session operations" },
  });
  const daemon = await first.status();
  const rssAtOneSession = rssBytes(daemon.daemon.pid);
  await first.close();

  const warmStarted = performance.now();
  const warm = await client.open("benchmark-1", project);
  const warmOpenMs = performance.now() - warmStarted;
  const commandSamples = [];
  for (let index = 0; index < 25; index += 1) {
    const started = performance.now();
    await warm.command({ operation: "plan.show", input: { simple: true } });
    commandSamples.push(performance.now() - started);
  }
  const focusSamples = [];
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    await warm.command({ operation: "plan.leave", input: {} });
    await warm.command({ operation: "plan.resume", input: { planId: "benchmark-plan" } });
    focusSamples.push((performance.now() - started) / 2);
  }

  const sessions = [warm];
  for (let index = 2; index <= 10; index += 1) {
    sessions.push(await client.open(`benchmark-${index}`, project));
  }
  const tenStatus = await sessions.at(-1).status();
  const rssAtTenSessions = rssBytes(tenStatus.daemon.pid);
  for (const openSession of sessions) await openSession.close();

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  console.log(JSON.stringify({
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
  await new Promise((resolve) => setTimeout(resolve, 250));
  fs.rmSync(root, { recursive: true, force: true });
}
