import test from "node:test";
import assert from "node:assert/strict";
import { buildDshKnowledgeDispatch, buildKnowledgeDelegateDispatch } from "../src/knowledge-assignments.js";

test("reused DSH session uses the full per-job delegate identity, not a shared prefix", () => {
  const a = "0123456789ab" + "1".repeat(52);
  const b = "0123456789ab" + "2".repeat(52);
  const first = buildDshKnowledgeDispatch({ finalizeId: a });
  const second = buildDshKnowledgeDispatch({ finalizeId: b });
  assert.equal(first.preferReuse, true);
  assert.ok(first.prompt.includes("knowledge-finalizer-" + a));
  assert.ok(second.prompt.includes("knowledge-finalizer-" + b));
  assert.ok(!first.prompt.includes("knowledge-finalizer-" + b));
  assert.notEqual(first.prompt, second.prompt);
  assert.equal(buildKnowledgeDelegateDispatch({ policy: "subagent", finalizeId: a }).preferReuse, false);
});
