import test from "node:test";
import assert from "node:assert/strict";
import { ClawError, serializeFailure, withExecutionFailure } from "../src/errors.js";

test("one executed owner failure keeps Node cause independent from operation outcome", () => {
  let calls = 0;
  const owner = (committing: boolean) => { calls++; throw withExecutionFailure(Object.assign(new Error("private filesystem path"), { code: "EACCES", syscall: "rename", path: "C:/Users/private/execution.json" }),
    { operation: "execution.persist", phase: committing ? "commit" : "prepare", outcome: committing ? "unknown" : "known", effect: committing ? "unknown" : "none" }); };
  for (const committing of [false, true]) {
    try { owner(committing); } catch (error) {
      const result = serializeFailure(error);
      assert.equal(result.code, "EACCES"); assert.equal(result.cause?.code, "EACCES"); assert.equal(result.operation, "execution.persist");
      assert.equal(result.outcome, committing ? "unknown" : "known"); assert.equal(result.effect, committing ? "unknown" : "none");
      assert.doesNotMatch(JSON.stringify(result), /Users|execution.json/);
    }
  }
  assert.equal(calls, 2, "exactly one owner call per requested operation, no probe or retry");
});

test("outer partial effects cannot be erased by an inner no-write rejection", () => {
  const inner = new ClawError("PLAN_NOT_FOUND", "resource lookup rejected", undefined, { operation: "child.read", phase: "prepare", outcome: "known", effect: "none" });
  const result = serializeFailure(withExecutionFailure(inner, { operation: "parent.create", phase: "commit", outcome: "unknown", effect: "partial" }));
  assert.equal(result.effect, "partial"); assert.equal(result.operation, "parent.create");
  assert.equal(result.cause?.effect, "none"); assert.equal(result.cause?.operation, "child.read");
});

test("code-bearing owner objects do not require constructor identity and outer code is not replaced", () => {
  const result = serializeFailure({ code: "host.reserve-denied", message: "quota exceeded", phase: "admission", outcome: "known", effect: "none",
    error: { code: "EACCES", message: "underlying IO rejection" } });
  assert.equal(result.code, "host.reserve-denied"); assert.equal(result.phase, "admission"); assert.equal(result.cause?.code, "EACCES");
});

test("cause and diagnostics remain bounded and redact credentials, personal paths and raw bodies", () => {
  const error: any = Object.assign(new Error("claim_token=secret --api-key hidden Authorization=Bearer very-secret C:/Users/private/file https://example.com/api?token=hidden"), { code: "ECONNRESET" });
  error.cause = error; error.diagnostics = [new Error('{"prompt":"private-content","claimToken":"private-token"}')];
  const text = JSON.stringify(serializeFailure(error));
  assert.doesNotMatch(text, /very-secret|Users|private-content|private-token|hidden/); assert.ok(text.length < 5000);
});

test("broken diagnostic getters do not replace the original operation outcome", () => {
  const value = { get code(): string { throw new Error("getter failure"); } };
  const result = serializeFailure(value, { fallbackCode: "FINALIZER_ADMISSION_FAILED", fallbackOutcome: "unknown" });
  assert.equal(result.code, "FINALIZER_ADMISSION_FAILED"); assert.equal(result.outcome, "unknown");
  assert.equal(result.diagnostics?.[0]?.code, "ERROR_DIAGNOSTIC_UNAVAILABLE");
});

test("a broken nested cause cannot erase already-committed primary evidence", () => {
  const broken = { get code(): string { throw new Error("getter failure"); } };
  const primary = new ClawError("PLAN_TRANSITION_CONFLICT", "auxiliary failure", undefined, { operation: "plan.commit", phase: "post-commit", outcome: "known", effect: "committed" }, broken);
  const result = serializeFailure(primary); assert.equal(result.code, "PLAN_TRANSITION_CONFLICT"); assert.equal(result.effect, "committed");
  assert.equal(result.cause?.diagnostics?.[0]?.code, "ERROR_DIAGNOSTIC_UNAVAILABLE");
});

test("secondary property getters never erase readable primary evidence", () => {
  for (const key of ["error", "cause", "diagnostics", "name"]) {
    const value = { code: "HOST_QUOTA_DENIED", message: "quota exceeded", outcome: "known", effect: "none" };
    Object.defineProperty(value, key, { get() { throw new Error("dummy secondary getter"); } });
    const result = serializeFailure(value);
    assert.equal(result.code, "HOST_QUOTA_DENIED"); assert.equal(result.outcome, "known"); assert.equal(result.effect, "none");
    assert.equal(result.diagnostics?.[0]?.code, "ERROR_DIAGNOSTIC_UNAVAILABLE");
  }
});

test("inline credentials, raw content, URLs and UNC private paths are redacted", () => {
  const value = new Error('request rejected: {"api_key":"DUMMY_KEY","prompt":"DUMMY_PROMPT"} token=DUMMY_TOKEN connect https://dummy-user:dummy-pass@example.invalid/ cannot open \\dummy-server\Users\dummy-user\private.txt');
  const result = JSON.stringify(serializeFailure(value));
  assert.doesNotMatch(result, /DUMMY_KEY|DUMMY_PROMPT|DUMMY_TOKEN|dummy-user|dummy-pass|dummy-server|private.txt/);
  assert.match(serializeFailure(new Error("[quota] capacity exhausted")).message, /capacity exhausted/);
});

test("owner execution context is bounded and redacted; array methods cannot override diagnostic budget", () => {
  const diagnostics = [new Error("first"), new Error("second"), new Error("third"), new Error("fourth")];
  diagnostics.slice = () => { throw new Error("must not invoke input array method"); };
  const value = { code: "EACCES", message: "denied", diagnostics };
  const result = serializeFailure(value, { execution: { phase: "commit", outcome: "known", effect: "partial", operation: "dummy", resource: "C:/Users/dummy/private.txt", correlationId: "token=DUMMY_TOKEN" } });
  assert.equal(result.diagnostics?.length, 3); assert.equal(result.effect, "partial");
  assert.doesNotMatch(JSON.stringify(result), /Users|private.txt|DUMMY_TOKEN/);
  assert.ok(serializeFailure(value, { resource: "x".repeat(100000) }).resource!.length <= 768);
});

test("different parent operation remains visible even when only the child may have effects", () => {
  const child = new ClawError("ECONNRESET", "lost response", undefined, { operation: "child.send", phase: "commit", outcome: "unknown", effect: "unknown" });
  const result = serializeFailure(withExecutionFailure(child, { operation: "parent.prepare", phase: "prepare", outcome: "known", effect: "none" }));
  assert.equal(result.operation, "parent.prepare"); assert.equal(result.outcome, "unknown"); assert.equal(result.effect, "unknown");
  assert.equal(result.cause?.operation, "child.send");
});
