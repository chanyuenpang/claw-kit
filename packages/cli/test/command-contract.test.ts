import test from "node:test";
import assert from "node:assert/strict";
import { ClawError } from "@veewo/claw-core";
import { decodeClawCommand } from "../dist/command-contract.js";
import { serializeCommandFailure } from "../dist/command-failure.js";

function rejected(request: unknown) {
  try { decodeClawCommand(request); }
  catch (error) {
    assert.ok(error instanceof ClawError);
    const failure = serializeCommandFailure(error, "unknown");
    assert.equal(failure.code, "COMMAND_INPUT_INVALID");
    assert.equal(failure.operation, "command.decode");
    assert.equal(failure.phase, "prepare");
    assert.equal(failure.outcome, "known");
    assert.equal(failure.effect, "none");
    assert.equal(failure.retryable, false);
    return failure;
  }
  assert.fail("Expected invalid command input to be rejected");
}

test("new task status errors identify the field and the owner-controlled initial state", () => {
  for (const status of ["pending", "done"]) {
    const failure = rejected({ operation: "plan.start", input: { appendTasks: [{ title: "Govern knowledge", status }] } });
    assert.equal(failure.details?.field, "input.appendTasks[0].status");
    assert.equal(failure.details?.reason, "unknown_field");
    assert.match(failure.message, /Allowed fields here: title, detail/);
    assert.match(failure.message, /New tasks start as pending\. Omit status/);
  }
  const corrected = { operation: "plan.start", input: { appendTasks: [{ title: "Govern knowledge", detail: "Source-backed edits" }] } };
  assert.deepEqual(decodeClawCommand(corrected), corrected);
});

test("nested missing, invalid and misspelled fields give value-free correction guidance", () => {
  const cases: Array<{ request: unknown; field: string; message: RegExp }> = [
    { request: { operation: "task.add", input: { tasks: [{}] } }, field: "input.tasks[0].title", message: /Required field .*title is missing/ },
    { request: { operation: "task.add", input: { tasks: [{ title: "T", detail: { password: "private-value" } }] } }, field: "input.tasks[0].detail", message: /must be a string/ },
    { request: { operation: "task.add", input: { tasks: [{ title: "T", detial: "private-value" }] } }, field: "input.tasks[0].detial", message: /Allowed fields here: title, detail/ },
    { request: { operation: "task.done", input: { tasks: [{ id: 0 }] } }, field: "input.tasks[0].id", message: /positive safe integer/ },
    { request: { operation: "task.edit", input: { taskId: 1, taskStatus: "private-value" } }, field: "input.taskStatus", message: /one of pending, in_progress, subagent_running, done, blocked/ },
    { request: { operation: "plan.start", input: { appendTasks: "private-value" } }, field: "input.appendTasks", message: /must be an array/ },
    { request: { operation: "plan.start", input: { appendTasks: [null] } }, field: "input.appendTasks[0]", message: /must be an object/ },
    { request: { operation: "plan.start", input: { updates: { references: [{ path: "private-value" }] } } }, field: "input.updates.references[0].why", message: /Required field/ },
    { request: { operation: "plan.edit", input: { operations: [{ type: "task.edit", id: 1, status: false }] } }, field: "input.operations[0].status", message: /one of pending/ },
    { request: { operation: "plan.edit", input: { operations: [{ type: "private-value" }] } }, field: "input.operations[0].type", message: /one of plan.update/ },
    { request: { operation: "plan.create", input: { knowledgeCapture: "private-value" } }, field: "input.knowledgeCapture", message: /must be a boolean/ },
    { request: { operation: "knowledge.done", input: { finalizeId: "a".repeat(64), status: "succeeded" } }, field: "input.result", message: /Required field/ },
  ];
  for (const { request, field, message } of cases) {
    const failure = rejected(request);
    assert.equal(failure.details?.field, field);
    assert.match(failure.message, message);
    assert.doesNotMatch(JSON.stringify(failure), /private-value/);
  }
});

test("malformed envelopes and unknown fields on empty operations are request errors, not config errors", () => {
  assert.equal(rejected({ operation: "plan.start" }).details?.field, "request.input");
  assert.equal(rejected(null).details?.field, "request");
  assert.equal(rejected({ operation: false, input: {} }).details?.field, "request.operation");
  const failure = rejected({ operation: "plan.wait", input: { unexpected: "private-value" } });
  assert.equal(failure.details?.field, "input.unexpected");
  assert.match(failure.message, /Allowed fields here: none/);
  assert.doesNotMatch(JSON.stringify(failure), /private-value/);
  const hidden = rejected({ operation: "plan.wait", input: { ["private-value/".repeat(100)]: true } });
  assert.equal(hidden.details?.field, "input[unrecognized field]");
  assert.doesNotMatch(JSON.stringify(hidden), /private-value/);
});

test("conditional completion and optional fields keep the same accepted contract", () => {
  const requests = [
    { operation: "plan.start", input: {} },
    { operation: "plan.start", input: { appendTasks: [] } },
    { operation: "plan.create", input: { knowledgeCapture: false } },
    { operation: "plan.edit", input: { operations: [{ type: "task.edit", id: 1, status: "done" }] } },
    { operation: "knowledge.done", input: { finalizeId: "a".repeat(64), status: "succeeded", result: "Updated" } },
    { operation: "knowledge.done", input: { finalizeId: "a".repeat(64), status: "failed", error: "Unavailable" } },
  ];
  for (const request of requests) assert.deepEqual(decodeClawCommand(request), request);
  const failure = rejected({ operation: "knowledge.done", input: { finalizeId: "a".repeat(64), status: "failed", result: "Not an error" } });
  assert.equal(failure.details?.field, "input.error");
  assert.throws(() => decodeClawCommand({ operation: "unsupported", input: {} }),
    (error: unknown) => error instanceof ClawError && error.code === "SESSION_OPERATION_UNSUPPORTED");
});
