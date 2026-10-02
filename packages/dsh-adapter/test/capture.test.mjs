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
  assert.deepEqual(extractPlanFinalAnswers(events, "session", 900, 1100), []);
});

test("legacy explicit final events remain supported", () => {
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

test("completed Host turns prove their last non-tool assistant message", () => {
  const events = [
    { type: "assistant/message", time: 1000, data: { turn: 1, message: { content: [{ type: "text", text: "commentary" }] } } },
    { type: "tool/call", time: 1001, data: { turn: 1 } },
    { type: "assistant/message", time: 1002, data: { turn: 1, message: { content: [{ type: "text", text: "real final" }] } } },
    { type: "turn/end", time: 1003, data: { turn: 1, reason: { kind: "completed" } } },
  ];
  assert.deepEqual(extractPlanFinalAnswers(events, "session", 900, 1100), [
    { schemaVersion: 1, entryType: "final_answer", turnId: "1", occurredAt: new Date(1002).toISOString(), message: "real final" },
  ]);
});

test("interrupted, aborted, and tool-only endings cannot prove commentary as final", () => {
  for (const invalid of [
    { type: "assistant/message", time: 1002, data: { turn: 1, interrupted: true, message: { content: [{ type: "text", text: "partial" }] } } },
    { type: "assistant/message", time: 1002, data: { turn: 1, message: { content: [{ type: "tool-call", name: "read" }] } } },
    { type: "tool/call", time: 1002, data: { turn: 1 } },
  ]) {
    assert.deepEqual(extractPlanFinalAnswers([
      { type: "assistant/message", time: 1000, data: { turn: 1, message: { content: [{ type: "text", text: "commentary" }] } } },
      invalid, { type: "turn/end", time: 1003, data: { turn: 1, reason: { kind: "completed" } } },
    ], "session", 900, 1100), []);
  }
  assert.deepEqual(extractPlanFinalAnswers([
    { type: "assistant/message", time: 1000, data: { turn: 1, message: { content: [{ type: "text", text: "partial" }] } } },
    { type: "turn/end", time: 1003, data: { turn: 1, reason: { kind: "aborted" } } },
  ], "session", 900, 1100), []);
});

test("both Host final message and completion proof must fit the frozen window", () => {
  const answer = (turn, time) => ({ type: "assistant/message", time, data: { turn, message: { content: [{ type: "text", text: String(turn) }] } } });
  const end = (turn, time) => ({ type: "turn/end", time, data: { turn, reason: { kind: "completed" } } });
  assert.deepEqual(extractPlanFinalAnswers([
    answer(1, 899), end(1, 901), answer(2, 950), end(2, 1100),
    answer(3, 1000), end(3, 1001), answer(4, 1200), end(4, 1201),
  ], "session", 900, 1100).map(entry => entry.message), ["3"]);
});

test("bounded Host final proof refuses missing, non-finite, or backwards timestamps", () => {
  const answer = { type: "assistant/message", time: 1000, data: { turn: 1, message: { content: [{ type: "text", text: "final" }] } } };
  for (const time of [undefined, NaN, 999]) {
    assert.throws(() => extractPlanFinalAnswers([
      answer, { type: "turn/end", time, data: { turn: 1, reason: { kind: "completed" } } },
    ], "session", 900, 1100), /DSH_REPORT_BOUNDARY_UNAVAILABLE/);
  }
  assert.throws(() => extractPlanFinalAnswers([
    { ...answer, time: undefined }, { type: "turn/end", time: 1003, data: { turn: 1, reason: { kind: "completed" } } },
  ], "session", 900, 1100), /DSH_REPORT_BOUNDARY_UNAVAILABLE/);
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
