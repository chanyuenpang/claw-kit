import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { extractPlanFinalAnswers, textFromContent } from "../lib/capture.js";

test("textFromContent concatenates text blocks and ignores others", () => {
  assert.equal(textFromContent([{ type: "text", text: "a" }, { type: "image", url: "x" }, { type: "text", text: "b" }]), "ab");
  assert.equal(textFromContent(undefined), "");
});

test("mid-turn assistant messages never masquerade as final answers", () => {
  const events = [
    { type: "assistant/message", time: 1000, data: { turn: 1, message: { content: [{ type: "text", text: "intermediate" }] } } },
    { type: "tool/call", time: 1001, data: { turn: 1, name: "claw_run", arguments: '{"operation":"task.done"}' } },
    { type: "assistant/message", time: 1002, data: { turn: 1, message: { content: [{ type: "text", text: "unverified last message" }] } } },
  ];
  assert.deepEqual(extractPlanFinalAnswers(events, "session"), []);
});

test("only an explicit final event can produce final_answer", () => {
  const events = [
    { type: "assistant/message", time: 1000, data: { turn: 1, message: { content: [{ type: "text", text: "commentary" }] } } },
    { type: "assistant/final", time: 1002, data: { turn: 1, message: { content: [{ type: "text", text: "proven final" }] } } },
  ];
  assert.deepEqual(extractPlanFinalAnswers(events, "session").map(({ turnId, message }) => ({ turnId, message })),
    [{ turnId: "1", message: "proven final" }]);
});

test("DSH collector honors the plan start boundary", () => {
  const events = [
    { type: "assistant/final", time: 100, data: { turn: 1, message: { content: [{ type: "text", text: "old" }] } } },
    { type: "assistant/final", time: 200, data: { turn: 2, message: { content: [{ type: "text", text: "new" }] } } },
  ];
  assert.deepEqual(extractPlanFinalAnswers(events, "session", 150).map((entry) => entry.message), ["new"]);
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
