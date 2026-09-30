import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claimKnowledgeFinalizationJob, readKnowledgeClaimReceipt, readKnowledgeFinalizationJob,
  reconcileKnowledgeFinalizationJob, doneKnowledgeFinalizationJob, writeKnowledgeFinalizationJob, type KnowledgeFinalizationJob } from "../src/knowledge-sidecar.js";

function fixture() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-claim-receipt-"));
  const jobPath = path.join(projectRoot, "job.json");
  const job: KnowledgeFinalizationJob = {
    schemaVersion: 1, finalizeId: "a".repeat(64), host: "dsh", sessionId: "parent", projectRoot,
    taskName: "task", planPath: path.join(projectRoot, "plan.json"), reportPath: path.join(projectRoot, "plan.report"),
    status: "queued", attempts: 0, queuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    writer: { executionPolicy: "subagent", externalSkills: ["writer-v1"] },
  };
  fs.writeFileSync(jobPath, JSON.stringify(job));
  return { jobPath, job, claimant: { host: "dsh", agentSessionId: "child", projectRoot } };
}

test("DSH first claim atomically freezes identity, token and assignment material; receipt is read-only", () => {
  const { jobPath, claimant } = fixture();
  let collections = 0;
  const options = { claimant, version: "first-version", prepare: () => { collections++; } };
  const claimed = claimKnowledgeFinalizationJob(jobPath, options)!;
  assert.equal(claimed.claimReceipt?.claimToken, claimed.claimToken);
  assert.equal(claimed.claimReceipt?.agentSessionId, "child");
  assert.equal(claimed.claimReceipt?.parentSessionId, "parent");
  assert.equal(claimed.claimReceipt?.template.version, "first-version");
  const before = fs.readFileSync(jobPath, "utf8");
  assert.deepEqual(readKnowledgeClaimReceipt(jobPath, claimant), JSON.parse(before));
  assert.equal(claimKnowledgeFinalizationJob(jobPath, { ...options, version: "later-version" }), null);
  assert.equal(fs.readFileSync(jobPath, "utf8"), before);
  assert.equal(readKnowledgeFinalizationJob(jobPath).attempts, 1);
  assert.equal(collections, 1);
});

test("receipt denies parent, other project/host, sibling, missing identity and legacy running jobs", () => {
  const { jobPath, claimant } = fixture();
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath), /trusted DSH child/);
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath, { claimant: { ...claimant, agentSessionId: "parent" }, version: "v1" }), /trusted DSH child/);
  const claimed = claimKnowledgeFinalizationJob(jobPath, { claimant, version: "v1" })!;
  const before = fs.readFileSync(jobPath, "utf8");
  for (const wrong of [{ agentSessionId: "parent" }, { agentSessionId: "" }, { host: "cindy" }, { projectRoot: path.join(claimant.projectRoot, "other") }]) {
    assert.throws(() => readKnowledgeClaimReceipt(jobPath, { ...claimant, ...wrong }), /trusted DSH child/);
  }
  assert.equal(readKnowledgeClaimReceipt(jobPath, { ...claimant, agentSessionId: "sibling" }), null);
  assert.equal(readKnowledgeClaimReceipt(jobPath, { ...claimant, agentSessionId: "replacement-child" }), null);
  assert.equal(fs.readFileSync(jobPath, "utf8"), before);
  delete claimed.claimReceipt;
  fs.writeFileSync(jobPath, JSON.stringify(claimed));
  assert.equal(readKnowledgeClaimReceipt(jobPath, claimant), null);
});

test("receipt denies stale and all terminal jobs without changing canonical bytes or reopening expiry", () => {
  for (const status of ["succeeded", "failed", "expired", "running"] as const) {
    const { jobPath, claimant } = fixture();
    const claimed = claimKnowledgeFinalizationJob(jobPath, { claimant, version: "v1" })!;
    claimed.status = status;
    if (status === "running") claimed.expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(jobPath, JSON.stringify(claimed));
    const before = fs.readFileSync(jobPath, "utf8");
    assert.equal(readKnowledgeClaimReceipt(jobPath, claimant), null);
    assert.equal(fs.readFileSync(jobPath, "utf8"), before);
    assert.equal(claimKnowledgeFinalizationJob(jobPath, { claimant, version: "v2" }), null);
    assert.equal(readKnowledgeFinalizationJob(jobPath).attempts, 1);
    if (status === "running") assert.equal(reconcileKnowledgeFinalizationJob(jobPath).status, "expired");
  }
});

test("template failure cannot commit a running job without its first-claim receipt", (t) => {
  const { jobPath, job, claimant } = fixture();
  job.writer = { executionPolicy: "subagent" };
  fs.writeFileSync(jobPath, JSON.stringify(job));
  const read = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => {
    if (String(args[0]).endsWith("TEMPLATE.json")) throw new Error("template unavailable");
    return read(...args);
  });
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath, { claimant, version: "v1" }), /template unavailable/);
  const after = readKnowledgeFinalizationJob(jobPath);
  assert.equal(after.status, "queued");
  assert.equal(after.attempts, 0);
  assert.equal(after.claimToken, undefined);
  assert.equal(after.claimReceipt, undefined);
});

test("done preserves the frozen receipt but no longer makes it recoverable", () => {
  const { jobPath, claimant } = fixture();
  const claimed = claimKnowledgeFinalizationJob(jobPath, { claimant, version: "v1" })!;
  assert.throws(() => writeKnowledgeFinalizationJob(jobPath, { ...claimed, claimReceipt: undefined }), /immutable/);
  const done = doneKnowledgeFinalizationJob({ jobPath, claimToken: claimed.claimToken!, status: "succeeded", result: "done", patch: { claimReceipt: undefined } });
  assert.deepEqual(done.job.claimReceipt, claimed.claimReceipt);
  assert.equal(readKnowledgeClaimReceipt(jobPath, claimant), null);
});
