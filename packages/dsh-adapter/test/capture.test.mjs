import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPlanCapture, extractTurnCapture, textFromContent } from "../lib/capture.js";

test("textFromContent concatenates text blocks and ignores others", () => {
  assert.equal(textFromContent([{ type: "text", text: "a" }, { type: "image", url: "x" }, { type: "text", text: "b" }]), "ab");
  assert.equal(textFromContent(undefined), "");
  assert.equal(textFromContent([{ type: "tool", id: "t" }]), "");
});

test("extractTurnCapture picks the final assistant message and task.done conclusions", () => {
  const events = [
    { type: "user/message", data: { turn: 1, message: { content: [{ type: "text", text: "do it" }] } } },
    { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "text", text: "I will start task A." }] } } },
    { type: "tool/call", data: { turn: 1, name: "claw_run", arguments: '{"operation":"plan.start"}' } },
    { type: "tool/result", data: { turn: 1, message: { content: [{ type: "text", text: "ok" }] } } },
    { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "text", text: "Task A done — evidence: tests pass." }] } } },
    { type: "tool/call", data: { turn: 1, name: "claw_run", arguments: '{"operation":"task.done","args":{"id":1}}' } },
    { type: "tool/result", data: { turn: 1, message: { content: [{ type: "text", text: "done" }] } } },
    { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "text", text: "Final summary of the turn." }] } } },
  ];
  const capture = extractTurnCapture(events, 1);
  assert.equal(capture.message, "Final summary of the turn.");
  assert.deepEqual(capture.taskConclusions, [{ turnId: "1", message: "Task A done — evidence: tests pass." }]);
});

test("extractTurnCapture ignores other turns and empty messages", () => {
  const events = [
    { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "text", text: "turn one" }] } } },
    { type: "assistant/message", data: { turn: 2, message: { content: [{ type: "text", text: "turn two" }] } } },
    { type: "tool/call", data: { turn: 2, name: "claw_run", arguments: '{"operation":"task.done"}' } },
  ];
  assert.equal(extractTurnCapture(events, 2).message, "turn two");
  const noText = extractTurnCapture(
    [{ type: "assistant/message", data: { turn: 3, message: { content: [] } } }],
    3,
  );
  assert.equal(noText.message, undefined);
  assert.deepEqual(noText.taskConclusions, []);
});

test("extractTurnCapture requires an assistant message before task.done", () => {
  const events = [
    { type: "tool/call", data: { turn: 1, name: "claw_run", arguments: '{"operation":"task.done"}' } },
  ];
  assert.deepEqual(extractTurnCapture(events, 1).taskConclusions, []);
});

test("extractPlanCapture collects every task.done conclusion and the final message", () => {
  const events = [
    { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "text", text: "Task A complete — tests green." }] } }, time: 1000 },
    { type: "tool/call", data: { turn: 1, name: "claw_run", arguments: '{"operation":"task.done","args":{"id":1}}' }, time: 1001 },
    { type: "assistant/message", data: { turn: 2, message: { content: [{ type: "text", text: "Task B done — capture verified." }] } }, time: 2000 },
    { type: "tool/call", data: { turn: 2, name: "claw_run", arguments: '{"operation":"task.done","args":{"id":2}}' }, time: 2001 },
    { type: "assistant/message", data: { turn: 3, message: { content: [{ type: "text", text: "Final plan summary." }] } }, time: 3000 },
  ];
  const capture = extractPlanCapture(events);
  assert.equal(capture.message, "Final plan summary.");
  assert.deepEqual(capture.taskConclusions, [
    { turnId: "1", message: "Task A complete — tests green.", time: 1001 },
    { turnId: "2", message: "Task B done — capture verified.", time: 2001 },
  ]);
});

test("extractPlanCapture filters conclusions by startedAt", () => {
  const events = [
    { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "text", text: "Old conclusion." }] } }, time: 100 },
    { type: "tool/call", data: { turn: 1, name: "claw_run", arguments: '{"operation":"task.done"}' }, time: 101 },
    { type: "assistant/message", data: { turn: 2, message: { content: [{ type: "text", text: "New conclusion." }] } }, time: 200 },
    { type: "tool/call", data: { turn: 2, name: "claw_run", arguments: '{"operation":"task.done"}' }, time: 201 },
  ];
  const capture = extractPlanCapture(events, 150);
  assert.deepEqual(capture.taskConclusions, [{ turnId: "2", message: "New conclusion.", time: 201 }]);
});
