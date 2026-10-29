import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { extractPlanConversation, textFromContent } from "../lib/capture.js";

const answer = (text, time, seq, content = []) => ({ type: "assistant/message", seq, time,
  data: { turn: 1, message: { content: [{ type: "text", text }, ...content] } } });
const user = (text, time, id, kind = "user") => ({ type: "agent/inbox/spliced", time,
  data: { inserted: [{ id, role: "user", source: { kind }, content: [{ type: "text", text }] }] } });

test("ordinary text whitelist ignores thinking and tool blocks", () => {
  assert.equal(textFromContent([{ type: "text", text: "a" }, { type: "thinking", text: "secret" },
    { type: "tool-result", text: "secret" }, { type: "reasoning", text: "secret" }, { type: "text", text: "b" }]), "ab");
  assert.equal(textFromContent(undefined), "");
});

test("collects every visible message including penultimate commentary and an open ending turn", () => {
  const rows = extractPlanConversation([
    user("request", 800, "request"), answer("pre-plan reply", 850, 1),
    answer("important commentary", 950, 2, [{ type: "tool-call", text: "secret" }]),
    { type: "tool/result", time: 960, data: { message: { content: [{ type: "text", text: "secret" }] } } },
    user("correction", 970, "correction"), user("reminder", 975, "reminder", "system"),
    answer("short last reply", 1000, 3), answer("after plan.done", 1100, 4),
  ], "session", 900, 1100);
  assert.deepEqual(rows.map(r => [r.role, r.message]), [
    ["user", "request"], ["assistant", "pre-plan reply"], ["assistant", "important commentary"], ["user", "correction"], ["assistant", "short last reply"],
  ]);
  assert.equal(rows[0].context, "plan_request");
  assert.ok(rows.every(r => r.entryType === "conversation_message"));
});

test("reads native user messages, excludes injected context and deduplicates inbox copies", () => {
  const input = user("request", 800, "request");
  const native = { type: "user/message", time: 820, data: input.data.inserted[0] };
  const rows = extractPlanConversation([input, answer("pre-plan reply", 810, 1), native,
    { type: "user/message", time: 950, data: user("context", 950, "context", "runtime-context").data.inserted[0] },
    { type: "user/message", time: 960, data: user("correction", 960, "correction").data.inserted[0] },
    { type: "user/message", time: 970, data: { message: user("legacy", 970, "legacy").data.inserted[0] } },
  ], "session", 900, 1100);
  assert.deepEqual(rows.map(r => r.message), ["request", "pre-plan reply", "correction", "legacy"]);
});

test("uses message identity rather than text and keeps legacy explicit final events", () => {
  const first = answer("same", 1000, 1);
  const rows = extractPlanConversation([first, first, answer("same", 1001, 2),
    { ...answer("legacy", 1002, 3), type: "assistant/final" }], "session", 900, 1100);
  assert.deepEqual(rows.map(r => r.message), ["same", "same", "legacy"]);
});

test("keeps only the nearest preceding user request and tolerates missing event metadata", () => {
  const rows = extractPlanConversation([user("unrelated", 100, "a"), user("trigger", 800, "b"),
    answer("missing time", undefined, 1), answer("inside", 1000, 2),
    { type: "turn/end", time: NaN }], "session", 900, 1100);
  assert.deepEqual(rows.map(r => r.message), ["trigger", "inside"]);
  assert.equal(extractPlanConversation([answer("legacy", undefined, 1)], "session").length, 1);
});

test("missing journal still stages existing task conclusions and permits claim", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-absent-journal-"));
  const canonicalReportPath = path.join(root, "report.jsonl");
  const stagingReportPath = path.join(root, "staging.jsonl");
  const existing = JSON.stringify({ schemaVersion: 1, entryType: "task_conclusion", message: "keep me" }) + "\n";
  fs.writeFileSync(canonicalReportPath, existing);
  try {
    const result = spawnSync(process.execPath, [path.resolve("lib/report-collector-cli.js")], {
      input: JSON.stringify({ host: "dsh", sessionId: "no-journal", canonicalReportPath, stagingReportPath }),
      env: { ...process.env, CLAW_DSH_REPORT_JOURNAL_DIR: path.join(root, "absent") }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(stagingReportPath, "utf8"), existing);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("DSH collector publishes a normalized chronological staging report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-report-"));
  const journalDir = path.join(root, "journal");
  const stagingPath = path.join(root, "staging.jsonl");
  fs.mkdirSync(journalDir, { recursive: true });
  const events = [
    { turnId: "late", occurredAt: "2026-08-22T00:00:02.000Z", message: "late" },
    { turnId: "early", occurredAt: "2026-08-22T00:00:01.000Z", message: "early" },
  ];
  fs.writeFileSync(path.join(journalDir, "session.json"), JSON.stringify({ sessionId: "session", events }));
  try {
    const result = spawnSync(process.execPath, [path.resolve("lib/report-collector-cli.js")], {
      input: JSON.stringify({ host: "dsh", sessionId: "session", stagingReportPath: stagingPath }),
      env: { ...process.env, CLAW_DSH_REPORT_JOURNAL_DIR: journalDir },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const captured = fs.readFileSync(stagingPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.deepEqual(captured.map((entry) => entry.message), ["early", "late"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
