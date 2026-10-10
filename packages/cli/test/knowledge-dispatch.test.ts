import test from "node:test";
import assert from "node:assert/strict";
import { buildKnowledgeDispatch } from "../dist/knowledge-dispatch.js";

test("every supported finalizer carries explicit host in its task and actual worker prompt", () => {
  for (const host of ["codex", "dsh", "cindy", "opencode"] as const) {
    const dispatch = buildKnowledgeDispatch({ host, projectRoot: process.cwd(), finalizeId: "a".repeat(64),
      writer: { model: "configured-model", reasoningEffort: "high" } });
    assert.equal(dispatch.host, host);
    assert.equal(dispatch.kind, "knowledge.finalize");
    assert.ok(dispatch.prompt.includes("[claw host]\nplatform: " + host + "\n"));
    assert.ok(dispatch.prompt.includes(JSON.stringify(dispatch.projectRoot)));
    assert.equal(dispatch.model, "configured-model");
    assert.equal(dispatch.reasoningEffort, "high");
    assert.equal(dispatch.preferReuse, host === "dsh");
    if (host === "codex") {
      assert.match(dispatch.prompt, /First driver argv:/);
      assert.match(dispatch.prompt, /knowledge operations, including claim, done and receipts/);
      assert.doesNotMatch(dispatch.prompt, /First run: claw/);
    } else if (host === "dsh") assert.match(dispatch.prompt, /First call claw_run/);
    else if (host === "cindy") assert.match(dispatch.prompt, /First use Ghost knowledge.claim/);
    else assert.match(dispatch.prompt, /First run: claw knowledge claim/);
  }
});

test("reused DSH session retains the full per-job delegate identity", () => {
  const a = "0123456789ab" + "1".repeat(52), b = "0123456789ab" + "2".repeat(52);
  const first = buildKnowledgeDispatch({ host: "dsh", projectRoot: process.cwd(), finalizeId: a });
  const second = buildKnowledgeDispatch({ host: "dsh", projectRoot: process.cwd(), finalizeId: b });
  assert.ok(first.prompt.includes(a));
  assert.ok(second.prompt.includes(b));
  assert.notEqual(first.prompt, second.prompt);
});
