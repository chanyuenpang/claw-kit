import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Kept in sync with packages/cli/src/session-registry-v2.ts. The client package
// cannot import @veewo/claw-core, so the writability probe is duplicated here.

function canWriteDirectory(dir: string): boolean {
  const probe = path.join(
    dir,
    `.claw-write-probe-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );
  let fd: number | undefined;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fd = fs.openSync(probe, "wx", 0o600);
    fs.closeSync(fd);
    fd = undefined;
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* probe was not opened */ }
    }
    try { fs.rmSync(probe, { force: true }); } catch { /* probe was not created */ }
    return false;
  }
}

function projectSessionDaemonDirectory(cwd: string): string {
  return path.join(path.resolve(cwd), ".claw", "runtime", "session-daemon");
}

export function resolveSessionDaemonRuntimeRoot(env: NodeJS.ProcessEnv = process.env, cwd?: string): string {
  const explicit = env.CLAW_SESSION_DAEMON_RUNTIME_DIR?.trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (canWriteDirectory(resolved)) return resolved;
    throw new Error("CLAW_SESSION_DAEMON_RUNTIME_DIR must point at a directory claw can create. Unset it to use the project-local runtime directory.");
  }
  const candidates = process.platform === "win32"
    ? [path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "claw", "session-daemon-v2")]
    : [
        ...(env.XDG_RUNTIME_DIR?.trim() ? [path.join(env.XDG_RUNTIME_DIR, "claw", "session-daemon-v2")] : []),
        path.join(env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), ".cache"), "claw", "session-daemon-v2"),
      ];
  for (const candidate of candidates) {
    if (canWriteDirectory(candidate)) return path.resolve(candidate);
  }
  if (cwd && canWriteDirectory(projectSessionDaemonDirectory(cwd))) {
    return projectSessionDaemonDirectory(cwd);
  }
  throw new Error("Session daemon runtime directory is not writable. Set CLAW_SESSION_DAEMON_RUNTIME_DIR to a writable directory, or run claw from a writable project.");
}
