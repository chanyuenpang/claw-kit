import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const request = await readJson();
if (!request || request.host !== "codex") process.exit(2);
const transcript = findTranscript(request.sessionId);
if (!transcript) process.exit(3);
const startedAt = request.startedAt ? Date.parse(request.startedAt) : Number.NaN;
const endedAt = request.endedAt ? Date.parse(request.endedAt) : Number.NaN;
const events = [];
let precedingAssistant;
for (const [sequence, line] of fs.readFileSync(transcript, "utf8").split(/\r?\n/).entries()) {
  let record;
  try { record = JSON.parse(line); } catch { continue; }
  const timestamp = typeof record.timestamp === "string" ? record.timestamp : undefined;
  if ((Number.isFinite(startedAt) || Number.isFinite(endedAt)) && record?.type === "response_item" && (!timestamp || !Number.isFinite(Date.parse(timestamp)))) process.exit(4);
  if (Number.isFinite(startedAt) && timestamp && Date.parse(timestamp) < startedAt) continue;
  if (Number.isFinite(endedAt) && timestamp && Date.parse(timestamp) >= endedAt) break;
  if (isNewPlan(record, request.planPath)) break;
  const payload = record?.payload;
  if (record?.type === "response_item" && ["function_call_output", "custom_tool_call_output"].includes(payload?.type)) {
    if (precedingAssistant && successfulTaskDone(payload.output, request.planPath)) {
      events.push({ ...precedingAssistant, turnId: `task:${payload.call_id ?? sequence}` });
      precedingAssistant = undefined;
    }
    continue;
  }
  if (record?.type !== "response_item" || payload?.type !== "message" || payload?.role !== "assistant") continue;
  const turnId = payload?.internal_chat_message_metadata_passthrough?.turn_id;
  const message = Array.isArray(payload?.content) ? payload.content.filter((item) => typeof item?.text === "string").map((item) => item.text).join("\n").trim() : "";
  if (!message) continue;
  precedingAssistant = { ...(timestamp ? { occurredAt: timestamp } : {}), sequence, message };
  if (payload.phase === "final_answer" && typeof turnId === "string") {
    events.push({ ...precedingAssistant, turnId });
    precedingAssistant = undefined;
  }
}
events.sort((a, b) => (Date.parse(a.occurredAt ?? "") || Number.POSITIVE_INFINITY) - (Date.parse(b.occurredAt ?? "") || Number.POSITIVE_INFINITY) || a.sequence - b.sequence);
fs.mkdirSync(path.dirname(request.stagingReportPath), { recursive: true });
fs.writeFileSync(request.stagingReportPath, events.length ? `${events.map(({ sequence, ...entry }) => JSON.stringify(entry)).join("\n")}\n` : "", "utf8");

function isNewPlan(record, planPath) {
  const output = record?.payload?.output;
  const text = typeof output === "string" ? output : Array.isArray(output) ? output.map((item) => item?.text ?? "").join("\n") : "";
  return text.includes('"command":"plan.create"') && (!planPath || !text.includes(planPath));
}
function successfulTaskDone(output, planPath) {
  const text = typeof output === "string" ? output : Array.isArray(output) ? output.map((item) => item?.text ?? "").join("\n") : "";
  // Tool envelopes may prefix diagnostics. Decode complete JSON lines only;
  // quoted examples and failed mutations must never become task conclusions.
  for (const line of text.split(/\r?\n/)) {
    try {
      const receipt = JSON.parse(line);
      if (receipt?.ok === true && receipt.command === "task.done" && (!planPath || typeof receipt.planPath === "string" && path.dirname(receipt.planPath) === path.dirname(planPath))) return true;
    } catch { /* Shell diagnostics are not receipts. */ }
  }
  return false;
}
function findTranscript(sessionId) {
  const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions");
  if (!fs.existsSync(root)) return null;
  const found = [];
  const walk = (dir, depth = 0) => { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const candidate = path.join(dir, item.name); if (item.isDirectory() && depth < 4) walk(candidate, depth + 1); else if (item.isFile() && item.name.includes(sessionId) && item.name.endsWith(".jsonl")) found.push(candidate); } };
  walk(root); return found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
}
async function readJson() { const chunks = []; for await (const chunk of process.stdin) chunks.push(String(chunk)); try { return JSON.parse(chunks.join("")); } catch { return null; } }
