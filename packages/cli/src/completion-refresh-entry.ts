import { runCompletionRefresh, type CompletionRefreshAttempt } from "./completion-refresh.js";

// A one-shot maintenance opportunity. No plan/job/log recovery or business replay.
const [encoded, ...extra] = process.argv.slice(2);
if (!encoded || extra.length) process.exitCode = 1;
else {
  try { runCompletionRefresh(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as CompletionRefreshAttempt); }
  catch { process.exitCode = 1; }
}
