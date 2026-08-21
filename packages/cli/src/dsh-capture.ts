import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * DSH report capture hand-off. The dsh-adapter plugin owns reading the DSH
 * session log; at turn stop it writes the extracted final message and task
 * conclusions to a capture file the CLI's `knowledge claim` dsh branch reads,
 * mirroring the Codex transcript hand-off but with an adapter-written JSON
 * payload instead of a raw host transcript.
 */

export type DshKnowledgeCapture = {
  sessionId: string;
  turnId?: string;
  message?: string;
  taskConclusions?: Array<{ turnId: string; message: string }>;
};

/** Windows user-local capture root (matches the claw session-daemon layout). */
export function dshCaptureRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const localAppData = env.LOCALAPPDATA
    ?? (process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Local")
      : path.join(os.homedir(), ".local", "share"));
  return env.CLAW_DSH_CAPTURE_DIR ?? path.join(localAppData, "claw", "dsh-capture");
}

/** The capture file path for one DSH session id. */
export function findDshCapturePath(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(dshCaptureRoot(env), `${sessionId.trim()}.json`);
}

/** Read an adapter-written capture payload, or null when absent/invalid. */
export function readDshKnowledgeCapture(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): DshKnowledgeCapture | null {
  const capturePath = findDshCapturePath(sessionId, env);
  if (!fs.existsSync(capturePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(capturePath, "utf8")) as unknown;
    if (
      !parsed
      || typeof parsed !== "object"
      || typeof (parsed as Record<string, unknown>).sessionId !== "string"
    ) {
      return null;
    }
    return parsed as DshKnowledgeCapture;
  } catch {
    return null;
  }
}
