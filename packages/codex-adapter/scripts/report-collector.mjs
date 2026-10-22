import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const request = await readJson();
if (!request || request.host !== "codex") process.exit(2);
const transcript = findTranscript(request.sessionId);
if (!transcript) process.exit(3);
const startedAt = request.startedAt ? Date.parse(request.startedAt) : Number.NaN;
const endedAt = request.endedAt ? Date.parse(request.endedAt) : Number.NaN;
if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) process.exit(4);
const events = [];
let precedingUser;
for (const [sequence, line] of fs.readFileSync(transcript, "utf8").split(/\r?\n/).entries()) {
  let record;
  try { record = JSON.parse(line); } catch { continue; }
  const timestamp = typeof record?.timestamp === "string" ? record.timestamp : undefined;
  const time = Date.parse(timestamp ?? "");
  // Unusable records must not discard the ordinary conversation we can collect.
  if (!Number.isFinite(time) || time >= endedAt) continue;
  const payload = record?.payload;
  const ordinary = record?.type === "response_item" && payload?.type === "message"
    && ["user", "assistant"].includes(payload.role);
  const message = ordinary && Array.isArray(payload.content)
    ? payload.content.filter((item) => (!item?.type || ["text", "input_text", "output_text"].includes(item.type)) && typeof item?.text === "string").map((item) => item.text).join("\n").trim() : "";
  const entry = message ? {
    occurredAt: timestamp, sequence, role: payload.role,
    turnId: payload.internal_chat_message_metadata_passthrough?.turn_id ?? ("message:" + sequence), message,
  } : undefined;
  if (time < startedAt) {
    if (entry?.role === "user" && (!precedingUser || time >= Date.parse(precedingUser.occurredAt))) precedingUser = entry;
    continue;
  }
  if (isNewPlan(record, request.planPath)) break;
  if (entry) events.push(entry);
}
// Include only the nearest available triggering user, not the preceding session.
if (precedingUser) events.push(precedingUser);
events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.sequence - b.sequence);
fs.mkdirSync(path.dirname(request.stagingReportPath), { recursive: true });
fs.writeFileSync(request.stagingReportPath, events.length ? `${events.map(({ sequence, ...entry }) => JSON.stringify(entry)).join("\n")}\n` : "", "utf8");

function isNewPlan(record, planPath) {
  const output = record?.payload?.output;
  const text = typeof output === "string" ? output : Array.isArray(output) ? output.map((item) => item?.text ?? "").join("\n") : "";
  for (const line of text.split(/\r?\n/)) {
    try {
      const receipt = JSON.parse(line);
      if (receipt?.ok === true && receipt.command === "plan.create"
        && (!planPath || typeof receipt.planPath === "string" && path.resolve(receipt.planPath) !== path.resolve(planPath))) return true;
    } catch { /* Quoted examples and diagnostics are not receipts. */ }
  }
  return false;
}
function findTranscript(sessionId) {
  const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions");
  if (!fs.existsSync(root)) return null;
  const found = [];
  const exactName = sessionId + ".jsonl";
  const suffix = "-" + sessionId + ".jsonl";
  const walk = (dir, depth = 0) => { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const candidate = path.join(dir, item.name); if (item.isDirectory() && depth < 4) walk(candidate, depth + 1); else if (item.isFile() && (item.name === exactName || item.name.endsWith(suffix))) found.push(candidate); } };
  walk(root); return found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
}
async function readJson() { const chunks = []; for await (const chunk of process.stdin) chunks.push(String(chunk)); try { return JSON.parse(chunks.join("")); } catch { return null; } }
