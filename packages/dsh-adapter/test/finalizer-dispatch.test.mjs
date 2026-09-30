import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizerChildLabel, resolveFinalizerReuse } from "../lib/index.js";

// One in-process flight and a trustworthy native child catalog prevent
// duplicate starts. Core still owns the exclusive claim and assignment gate.

const label = finalizerChildLabel("abcdef0123456789");

test("native finalizer label uses full ID so colliding title prefixes stay isolated", () => {
  assert.equal(label, "knowledge-finalizer-abcdef0123456789");
  assert.notEqual(finalizerChildLabel("abcdef012345aaaaaaaa"), finalizerChildLabel("abcdef012345bbbbbbbb"));
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
  assert.deepEqual(await run([{ kind: "diagnostic", id: "damaged", reason: "corrupt" }]),
    { deferred: true, reason: "native child catalog incomplete" });
  assert.equal(await run([]), undefined);
});

test("an unavailable child catalog defers rather than risking a duplicate start", async () => {
  const base = { finalizeId: "abcdef0123456789", parentSessionId: "parent", label, records: new Map() };
  assert.deepEqual(await resolveFinalizerReuse({ ...base }), { deferred: true, reason: "native child catalog unavailable" });
  assert.deepEqual(await resolveFinalizerReuse({
    ...base, subagents: { start: async () => ({ id: "unused" }) },
  }), { deferred: true, reason: "native child catalog unavailable" });
  assert.deepEqual(await resolveFinalizerReuse({
    ...base, subagents: { start: async () => ({ id: "unused" }),
      listChildren: async () => { throw new Error("projection registry not mounted"); } },
  }), { deferred: true, reason: "native child catalog lookup failed" });
});
