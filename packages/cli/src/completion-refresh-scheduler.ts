import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withoutInvocationHost } from "./invocation-host.js";

/** Maintenance must never sit before a mutation or between commit and its reply.
 * Canonical terminal facts remain the recovery source; only system work runs in
 * this worker, never the command that caused it. Coalesce while a worker runs,
 * then rescan once if another command may have committed a new fact meanwhile.
 */
export function createCompletionRefreshScheduler(
  launch: (cwd: string, sessionId?: string) => Promise<void>,
  report: (error: unknown) => void = (error) => {
    process.stderr.write("Completion refresh recovery deferred: " + String(error) + "\n");
  },
): (cwd: string, sessionId?: string) => void {
  const flights = new Map<string, { dirty: boolean }>();
  return (cwd, sessionId) => {
    const key = JSON.stringify([path.resolve(cwd), sessionId]);
    const existing = flights.get(key);
    if (existing) { existing.dirty = true; return; }
    const flight = { dirty: false };
    flights.set(key, flight);
    const run = () => {
      flight.dirty = false;
      let work: Promise<void>;
      try { work = launch(cwd, sessionId); }
      catch (error) { work = Promise.reject(error); }
      void work.catch((error) => { report(error); }).finally(() => {
        if (flight.dirty) run();
        else flights.delete(key);
      }).catch(() => { flights.delete(key); });
    };
    run();
  };
}

function quoteWindowsArgument(value: string): string {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
}

export const scheduleCompletionRefreshRecovery = createCompletionRefreshScheduler((cwd, sessionId) => {
  const args = [fileURLToPath(new URL("./completion-refresh-recovery-entry.js", import.meta.url)),
    path.resolve(cwd), ...(sessionId ? [sessionId] : [])];
  const env = withoutInvocationHost();
  // Do not reintroduce direct detached Node launch on Windows: it can lose the
  // foreground CLI's captured stdout (windows-async-completion-refresh ADR).
  // Keep only startup referenced until Start-Process acknowledges creation.
  // Unref'ing immediately can lose the worker on one-shot exit. After the ack,
  // the daemon still tracks completion for coalescing, without keeping a CLI alive.
  const windows = process.platform === "win32";
  const child = windows
    ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$worker = Start-Process -FilePath $env:CLAW_RECOVERY_NODE -ArgumentList $env:CLAW_RECOVERY_ARGS -WorkingDirectory $env:CLAW_RECOVERY_CWD -WindowStyle Hidden -PassThru -ErrorAction Stop; [Console]::Out.WriteLine('CLAW_RECOVERY_STARTED'); [Console]::Out.Flush(); $worker.WaitForExit(); exit $worker.ExitCode"],
    { cwd, env: { ...env, CLAW_RECOVERY_NODE: process.execPath,
      CLAW_RECOVERY_ARGS: args.map(quoteWindowsArgument).join(" "), CLAW_RECOVERY_CWD: path.resolve(cwd) },
      stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
    : spawn(process.execPath, args, { cwd, env, detached: true, stdio: "ignore" });
  if (!windows) child.unref();
  return new Promise<void>((resolve, reject) => {
    let startup: ReturnType<typeof setTimeout> | undefined;
    if (windows) {
      startup = setTimeout(() => {
        child.stdout?.destroy();
        child.kill();
        reject(new Error("Completion refresh recovery launcher timed out."));
      }, 5_000);
      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += String(chunk);
        if (!output.includes("CLAW_RECOVERY_STARTED")) return;
        clearTimeout(startup);
        child.stdout?.destroy();
        child.unref();
      });
    }
    child.once("error", (error) => { clearTimeout(startup); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(startup);
      if (code === 0 && !signal) resolve();
      else reject(new Error("Completion refresh recovery worker did not exit successfully."));
    });
  });
});
