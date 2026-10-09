import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { doneKnowledgeFinalizationJob, readKnowledgeCompletionReceipt, type KnowledgeFinalizationJob } from "../src/knowledge-sidecar.js";

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-knowledge-done-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const token = "immutable-claim", claimant = { projectRoot: root, host: "dsh", agentSessionId: "writer" };
  const job: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId: "a".repeat(64), projectRoot: root, host: "dsh", sessionId: "parent",
    taskName: "source", planPath: path.join(root, "plan.json"), reportPath: path.join(root, "plan.report"),
    status: "running", attempts: 1, queuedAt: new Date().toISOString(), claimedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: new Date(Date.now() + 60000).toISOString(), claimToken: token,
    claimReceipt: { schemaVersion: 1, finalizeId: "a".repeat(64), projectRoot: root, host: "dsh", parentSessionId: "parent",
      agentSessionId: "writer", claimedAt: "2026-01-01T00:00:00.000Z", claimToken: token, version: "1.0.0", assignments: [],
      template: { id: "fixture", version: "1.0.0", title: "Fixture", status: "process.active", tasks: [] } } };
  const jobPath = path.join(root, "job.json"), assignment = path.join(root, job.finalizeId + ".assignments.json");
  const write = () => fs.writeFileSync(jobPath, JSON.stringify(job));
  write(); fs.writeFileSync(job.reportPath, "existing report"); fs.writeFileSync(assignment, "frozen template");
  return { root, jobPath, assignment, token, claimant, job, write };
}

for (const expired of [false, true]) test("wrong token is known/no-effect even if expiry needs maintenance: " + expired, t => {
  const f = fixture(t); if (expired) f.job.expiresAt = "2000-01-01T00:00:00Z"; else f.job.expiresAt = new Date(Date.now() + 60000).toISOString().replace(".000Z", "Z"); f.write();
  const before = fs.readFileSync(f.jobPath, "utf8");
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: "wrong", status: "succeeded", result: "done" }), (e: any) => {
    assert.equal(e.code, "KNOWLEDGE_CLAIM_MISMATCH"); assert.deepEqual(e.execution, { operation: "knowledge.done", phase: "prepare", outcome: "known", effect: "none" }); return true;
  });
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before); assert.equal(fs.readFileSync(f.job.reportPath, "utf8"), "existing report");
  assert.equal(fs.readFileSync(f.assignment, "utf8"), "frozen template");
});

test("trusted credential injection uses exact claim actor and does not overwrite a wrong explicit token", t => {
  const f = fixture(t), before = fs.readFileSync(f.jobPath, "utf8");
  for (const claimant of [{ ...f.claimant, agentSessionId: "sibling" }, { ...f.claimant, host: "cindy" }, { ...f.claimant, projectRoot: f.root + "-other" }]) {
    assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant, status: "succeeded" }), { code: "KNOWLEDGE_CLAIM_OWNER_MISMATCH" });
  }
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, claimToken: "wrong", status: "succeeded" }), { code: "KNOWLEDGE_CLAIM_MISMATCH" });
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
  const result = doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "succeeded", result: "governance done" });
  assert.equal(result.job.status, "succeeded"); assert.equal(result.job.claimToken, f.token);
  assert.equal(fs.readFileSync(f.job.reportPath, "utf8"), "existing report", "terminal commit cannot pre-write a success report");
});

test("expired completion does not renew, expire-write or delete frozen material", t => {
  const f = fixture(t); f.job.expiresAt = "2000-01-01T00:00:00Z"; f.write();
  const before = fs.readFileSync(f.jobPath, "utf8");
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "succeeded" }), { code: "KNOWLEDGE_CLAIM_EXPIRED" });
  const receipt = readKnowledgeCompletionReceipt({ jobPath: f.jobPath, claimant: f.claimant });
  assert.equal(receipt.status, "expired"); assert.equal(receipt.canonicalStatus, "running");
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before); assert.ok(fs.existsSync(f.assignment));
});

test("same terminal result is immutable and receipts are read-only after completion", t => {
  const f = fixture(t);
  doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: f.token, status: "succeeded", result: "done" });
  const before = fs.readFileSync(f.jobPath, "utf8");
  assert.equal(doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: f.token, status: "succeeded", result: "done" }).alreadyDone, true);
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "failed", error: "different" }), { code: "KNOWLEDGE_TERMINAL_RESULT_CONFLICT" });
  const receipt = readKnowledgeCompletionReceipt({ jobPath: f.jobPath, claimant: f.claimant, expectedStatus: "succeeded", expectedResult: "done" });
  assert.equal(receipt.matches, true); assert.equal(receipt.terminal, true); assert.equal(receipt.postCommitEffectsVerified, false); assert.equal("claimToken" in receipt, false);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
});

test("legacy explicit bearer and exact recorded legacy actor remain supported, focus alone does not authorize", t => {
  const f = fixture(t); delete f.job.claimReceipt; f.write();
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "failed" }), { code: "KNOWLEDGE_CLAIM_OWNER_MISMATCH" });
  assert.equal(doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: f.token, status: "failed", error: "failed content" }).job.status, "failed");
});

test("terminal patch cannot replace claim token, actor, project or admission", t => {
  const f = fixture(t);
  const result = doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "failed", error: "failed",
    patch: { claimToken: "replacement", projectRoot: "elsewhere", sessionId: "intruder", claimReceipt: undefined, finalizeId: "b".repeat(64) } });
  assert.equal(result.job.claimToken, f.token); assert.equal(result.job.projectRoot, f.root); assert.equal(result.job.sessionId, "parent");
  assert.equal(result.job.finalizeId, f.job.finalizeId); assert.deepEqual(result.job.claimReceipt, f.job.claimReceipt);
});

test("atomic write uncertainty retains commit/unknown; post-commit cleanup failure keeps committed evidence", t => {
  const f = fixture(t), rename = fs.renameSync, unlink = fs.unlinkSync;
  t.mock.method(fs, "renameSync", ((source: fs.PathLike, target: fs.PathLike) => {
    if (String(target) === f.jobPath) throw new Error("fixture atomic write failure");
    return rename(source, target);
  }) as typeof fs.renameSync);
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: f.token, status: "succeeded", result: "done" }), (e: any) => {
    assert.deepEqual(e.execution, { operation: "knowledge.done", phase: "commit", outcome: "unknown", effect: "unknown" }); return true;
  });
  t.mock.restoreAll();
  t.mock.method(fs, "unlinkSync", ((file: fs.PathLike) => {
    if (String(file) === f.jobPath + ".lock") throw new Error("fixture lock release failure");
    return unlink(file);
  }) as typeof fs.unlinkSync);
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: f.token, status: "succeeded", result: "done" }), (e: any) => {
    assert.deepEqual(e.execution, { operation: "knowledge.done", phase: "post-commit", outcome: "known", effect: "committed" }); return true;
  });
  assert.equal(readKnowledgeCompletionReceipt({ jobPath: f.jobPath, claimant: f.claimant, expectedStatus: "succeeded", expectedResult: "done" }).matches, true);
});

test("an existing hostless legacy claim uses its recorded owner and standard namespace, not a new executor grant", t => {
  const f = fixture(t); delete f.job.host; delete f.job.claimReceipt;
  f.job.delegateWorkflow = { ownerSessionId: "writer", projectRoot: f.root, planPath: f.job.planPath }; f.write();
  const claimant = { ...f.claimant, host: "standard" };
  assert.equal(doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant, status: "succeeded", result: "done" }).job.status, "succeeded");
  assert.equal(readKnowledgeCompletionReceipt({ jobPath: f.jobPath, claimant }).terminal, true);
  assert.throws(() => readKnowledgeCompletionReceipt({ jobPath: f.jobPath, claimant: { ...claimant, host: "codex" } }), { code: "KNOWLEDGE_CLAIM_OWNER_MISMATCH" });
});


test("native completion refuses inconsistent immutable claim-origin identity without writes", t => {
  const f = fixture(t); f.job.claimReceipt!.parentSessionId = "another-origin"; f.write();
  const before = fs.readFileSync(f.jobPath, "utf8");
  assert.throws(() => doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "succeeded", result: "done" }), { code: "KNOWLEDGE_CLAIM_OWNER_MISMATCH" });
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
});
