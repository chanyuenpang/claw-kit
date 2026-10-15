import { reconcileCompletionRefresh } from "./completion-refresh-recovery.js";

// A private maintenance-only entry: no workflow command decoding or replay.
const [cwd, sessionId, ...extra] = process.argv.slice(2);
if (!cwd || extra.length) process.exitCode = 1;
else {
  try { reconcileCompletionRefresh(cwd, sessionId); }
  catch { process.exitCode = 1; }
}
