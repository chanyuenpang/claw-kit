import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSourceFinalizerDispatcher } from "../lib/source-finalizer.js";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-source-delivery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { agent: { id: "parent" }, root, task: { schemaVersion: 2, dispatchId: "a".repeat(64), projectRoot: root, sourceSessionKey: "parent", sourcePlan: path.join(root, "plan.json"), prompt: "write knowledge" } };
}
test("new handoffs need no catalog, capture, claim or terminal job and deduplicate across reload", async t => {
  const f = fixture(t); let starts = 0;
  const options = { getService: name => { assert.equal(name, "subagents"); return { startActivation: async () => ({ childId: "child-" + ++starts }) }; }, selectModel: async () => { throw new Error("advisory metadata unavailable"); } };
  const dispatch = createSourceFinalizerDispatcher(options);
  const results = await Promise.all([dispatch(f.agent, f.root, f.task), dispatch(f.agent, f.root, f.task)]);
  assert.ok(results.every(r => r.ok)); assert.equal(starts, 1);
  assert.equal((await createSourceFinalizerDispatcher(options)(f.agent, f.root, f.task)).delivery, "accepted");
  assert.equal(starts, 1);
  assert.equal((await dispatch(f.agent, f.root, { ...f.task, dispatchId: "b".repeat(64) })).ok, true);
  assert.equal(starts, 2, "a second plan does not wait for a claim or dual terminal proof");
});
test("unknown native admission is reported and never resent", async t => {
  const f = fixture(t); let starts = 0;
  const options = { getService: () => ({ startActivation: async () => { starts++; throw Object.assign(new Error("lost ack"), { code: "NATIVE_ACK_LOST", outcome: "unknown" }); } }), selectModel: async () => undefined };
  const first = await createSourceFinalizerDispatcher(options)(f.agent, f.root, f.task);
  assert.equal(first.code, "NATIVE_ACK_LOST"); assert.equal(first.delivery, "unknown");
  await createSourceFinalizerDispatcher(options)(f.agent, f.root, f.task);
  assert.equal(starts, 1);
});
test("old jobs are not resumed and delivery-log failure does not veto new work", async t => {
  const f = fixture(t); let starts = 0;
  const dispatch = createSourceFinalizerDispatcher({ getService: () => ({ startActivation: async () => { starts++; return { childId: "child" }; } }), selectModel: async () => undefined });
  assert.equal((await dispatch(f.agent, f.root, { finalizeId: "old", schemaVersion: 1 })).code, "LEGACY_FINALIZER_NOT_RESUMED");
  const file = path.join(f.root, "not-a-directory"); fs.writeFileSync(file, "fixture");
  const result = await dispatch(f.agent, f.root, { ...f.task, projectRoot: file });
  assert.equal(result.ok, true); assert.ok(result.logWarning); assert.equal(starts, 1);
});
test("a proven no-effect rejection permits a later explicit delivery", async t => {
  const f = fixture(t); let calls = 0;
  const dispatch = createSourceFinalizerDispatcher({ selectModel: async () => undefined, getService: () => ({ startActivation: async () => {
    if (++calls === 1) throw Object.assign(new Error("temporarily unavailable"), { code: "NATIVE_UNAVAILABLE", outcome: "known", effect: "none", phase: "before-call" });
    return { childId: "writer" };
  } }) });
  assert.equal((await dispatch(f.agent, f.root, f.task)).delivery, "rejected");
  assert.equal((await dispatch(f.agent, f.root, f.task)).delivery, "accepted");
  assert.equal(calls, 2);
});
