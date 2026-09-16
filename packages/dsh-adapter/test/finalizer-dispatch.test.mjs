import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizerChildLabel, resolveFinalizerReuse } from "../lib/index.js";

// The finalizer dedupe contract: at most one UNSETTLED writer child per
// finalizeId. Duplicate children are harmless (the durable job's claim gate
// refuses the second one), so this is a cost invariant, not a write mutex --
// which is why the boundary cases below matter more than the happy path: a
// record that never releases would strand a job that only a NEW child can claim.

const label = finalizerChildLabel("abcdef0123456789");

test("finalizerChildLabel is the 12-char prefix the CLI delegate title uses", () => {
  assert.equal(label, "knowledge-finalizer-abcdef012345");
});

test("an unsettled in-process record reuses without touching the durable catalog", async () => {
  let listCalls = 0;
  const records = new Map([["f1", { runId: "run-1", settled: false }]]);

  const reused = await resolveFinalizerReuse({
    finalizeId: "f1",
    parentSessionId: "parent",
    label,
    records,
    subagents: {
      start: async () => ({ id: "unused" }),
      listChildren: async () => {
        listCalls += 1;
        return [];
      },
    },
  });

  assert.deepEqual(reused, { runId: "run-1", source: "in-process" });
  assert.equal(listCalls, 0, "the in-process record must short-circuit the durable query");
});

test("a settled record stops blocking: the next dispatch may start a new child", async () => {
  const records = new Map([["f1", { runId: "run-1", settled: true }]]);
  let listCalls = 0;

  const reused = await resolveFinalizerReuse({
    finalizeId: "f1",
    parentSessionId: "parent",
    label,
    records,
    subagents: {
      start: async () => ({ id: "unused" }),
      listChildren: async () => {
        listCalls += 1;
        return [];
      },
    },
  });

  assert.equal(reused, undefined, "a settled child must not be reported as reusable");
  assert.equal(listCalls, 1, "settlement must fall through to the durable query, not short-circuit it");
});

test("a still-running durable child with the finalizeId label is reused", async () => {
  const reused = await resolveFinalizerReuse({
    finalizeId: "abcdef0123456789",
    parentSessionId: "parent",
    label,
    records: new Map(),
    subagents: {
      start: async () => ({ id: "unused" }),
      listChildren: async (parentSessionId) => {
        assert.equal(parentSessionId, "parent");
        return [
          { kind: "child", id: "other", activity: "running", label: "knowledge-finalizer-ffffffffffff" },
          { kind: "child", id: "child-1", activity: "running", mode: "one-shot", label },
        ];
      },
    },
  });

  assert.deepEqual(reused, { runId: "child-1", source: "durable" });
});

test("the durable query ignores inactive, mislabelled and diagnostic rows", async () => {
  const run = async (children) => resolveFinalizerReuse({
    finalizeId: "abcdef0123456789",
    parentSessionId: "parent",
    label,
    records: new Map(),
    subagents: { start: async () => ({ id: "unused" }), listChildren: async () => children },
  });

  assert.equal(await run([{ kind: "child", id: "gone", activity: "inactive", label }]), undefined);
  assert.equal(await run([{ kind: "child", id: "wrong", activity: "running", label: "other" }]), undefined);
  assert.equal(await run([{ kind: "diagnostic", id: "damaged", reason: "corrupt" }]), undefined);
  assert.equal(await run([]), undefined);
});

test("a throwing or absent child catalog fails open instead of blocking the dispatch", async () => {
  const base = { finalizeId: "abcdef0123456789", parentSessionId: "parent", label, records: new Map() };

  assert.equal(await resolveFinalizerReuse({ ...base }), undefined, "an absent service is not a reuse");
  assert.equal(await resolveFinalizerReuse({
    ...base,
    subagents: { start: async () => ({ id: "unused" }) },
  }), undefined, "a service without listChildren is not a reuse");
  assert.equal(await resolveFinalizerReuse({
    ...base,
    subagents: {
      start: async () => ({ id: "unused" }),
      listChildren: async () => {
        throw new Error("projection registry not mounted");
      },
    },
  }), undefined, "a broken catalog must not surface as an error or as a reuse");
});
