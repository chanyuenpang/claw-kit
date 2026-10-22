import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("claim collector captures ordinary conversation and bounds parent history", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-collector-"));
  try {
    const sessionId = "collector-parent";
    const planPath = path.join(root, "task", "plan.json");
    const report = path.join(root, "report");
    const dir = path.join(root, "sessions");
    fs.mkdirSync(dir);
    const record = (payload, timestamp = "2026-10-02T00:00:02.000Z") => ({ type: "response_item", timestamp, payload });
    const message = text => record({ type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text }] });
    const done = (ok, target = planPath) => record({ type: "custom_tool_call_output", call_id: "task-1", output: [{ type: "input_text", text: "Script completed\n" + JSON.stringify({ ok, command: "task.done", planPath: target }) }] });
    const user = (text, timestamp) => record({ type: "message", role: "user", content: [{ type: "input_text", text }] }, timestamp);
    const records = [
      user("Old request", "2026-10-02T00:00:00.000Z"),
      user("Trigger request", "2026-10-02T00:00:00.500Z"),
      record({ type: "message", role: "assistant", content: [{ type: "output_text", text: "Old assistant" }] }, "2026-10-02T00:00:00.750Z"),
      user("Clarification"),
      record({ type: "message", role: "system", content: [{ text: "system secret" }] }),
      record({ type: "message", role: "assistant", content: [{ type: "thinking", text: "thinking secret" }, { type: "reasoning", text: "reasoning secret" }, { type: "tool_result", text: "tool secret" }] }),
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "Untimed" }] } },
      { type: "response_item", payload: { type: "reasoning", summary: "untimed unrelated metadata" } },
      message("Quoted create example"), record({ type: "custom_tool_call_output", call_id: "quote", output: "example " + JSON.stringify({ ok: true, command: "plan.create", planPath: path.join(root, "other", "plan.json") }) }),
      message("Failed conclusion"), done(false),
      message("Wrong task"), done(true, path.join(root, "other", "plan.json")),
      message("Verified child task"), done(true, path.join(root, "task", "design.json")),
      done(true),
      record({ type: "message", role: "assistant", phase: "final_answer", content: [{ text: "Prior final" }], internal_chat_message_metadata_passthrough: { turn_id: "prior" } }),
      record({ type: "message", role: "assistant", phase: "final_answer", content: [{ text: "After boundary" }], internal_chat_message_metadata_passthrough: { turn_id: "future" } }, "2026-10-02T00:00:04.000Z"),
      record({ type: "message", role: "assistant", phase: "final_answer", content: [{ text: "Out-of-order valid final" }], internal_chat_message_metadata_passthrough: { turn_id: "late-line" } }, "2026-10-02T00:00:02.500Z"),
      record({ type: "custom_tool_call_output", output: JSON.stringify({ ok: true, command: "plan.create", planPath: path.join(root, "next", "plan.json") }) }, "2026-10-02T00:00:02.750Z"),
      message("Next plan text"),
    ];
    fs.writeFileSync(path.join(dir, sessionId + ".jsonl"), records.map(JSON.stringify).join("\n"));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/report-collector.mjs", import.meta.url))], {
      env: { ...process.env, CODEX_HOME: root }, encoding: "utf8",
      input: JSON.stringify({ host: "codex", sessionId, planPath, stagingReportPath: report, startedAt: "2026-10-02T00:00:01.000Z", endedAt: "2026-10-02T00:00:03.000Z" }),
    });
    assert.equal(result.status, 0, result.stderr);
    const events = fs.readFileSync(report, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(events.map(({ role, message }) => [role, message]), [
      ["user", "Trigger request"], ["user", "Clarification"],
      ["assistant", "Quoted create example"], ["assistant", "Failed conclusion"],
      ["assistant", "Wrong task"], ["assistant", "Verified child task"],
      ["assistant", "Prior final"], ["assistant", "Out-of-order valid final"],
    ]);
    assert.ok(events.every(event => typeof event.turnId === "string"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
