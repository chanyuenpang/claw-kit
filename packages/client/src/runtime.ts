import os from "node:os";
import path from "node:path";

export function resolveSessionDaemonRuntimeRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLAW_SESSION_DAEMON_RUNTIME_DIR?.trim()) {
    return path.resolve(env.CLAW_SESSION_DAEMON_RUNTIME_DIR);
  }
  const userRuntime = process.platform === "win32"
    ? env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")
    : env.XDG_RUNTIME_DIR ?? env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.resolve(userRuntime, "claw", "session-daemon-v2");
}
