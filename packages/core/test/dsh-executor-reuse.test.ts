import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { withFileLock } from "../src/io.js";
import type { ProjectContext } from "../src/types.js";
import {
  reserveDshFinalizerExecution, markDshFinalizerDelivery, inspectDshFinalizerExecutions,
  releaseDshFinalizerExecution, claimKnowledgeFinalizationJob, doneKnowledgeFinalizationJob,
  readKnowledgeFinalizationJob, writeKnowledgeFinalizationJob, tryEndKnowledgePlan,
  type KnowledgeFinalizationJob,
} from "../src/knowledge-sidecar.js";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-reuse-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clawDir = path.join(root, ".claw");
  const project: ProjectContext = { scope: "project", projectRoot: root, clawDir,
    projectJsonPath: path.join(clawDir, "project.json"), truthDir: path.join(clawDir, "truth"),
    tasksDir: path.join(clawDir, "tasks"), projectId: "fixture", projectName: "Fixture", projectConfig: null };
  const member = "opaque actual member/session";
  function job(id: string, parent = "parent") {
    const taskDir = path.join(project.tasksDir, id);
    const planPath = path.join(taskDir, "plan.json");
    const jobPath = path.join(taskDir, ".runtime", "knowledge-finalization", id + ".json");
    fs.mkdirSync(path.dirname(jobPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify({ title: "Source", status: "end.completed", goal: { text: "Source" }, tasks: [] }));
    const value: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId: id, host: "dsh", sessionId: parent,
      projectRoot: root, taskName: id, planPath, reportPath: path.join(taskDir, "plan.report"),
      status: "queued", attempts: 0, queuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
      writer: { executionPolicy: "subagent", externalSkills: ["fixture-writer"] } };
    fs.writeFileSync(jobPath, JSON.stringify(value));
    return jobPath;
  }
  const reserve = (jobPath: string, parentSessionId = "parent") => reserveDshFinalizerExecution({ project, jobPath, parentSessionId,
    route: "team", memberSessionId: member, teamId: parentSessionId + "-team", provider: "spawn", configFingerprint: "config-v1" });
  const mark = (jobPath: string, state: "attempted" | "accepted" | "uncertain", receiptId?: string) => markDshFinalizerDelivery({
    project, jobPath, parentSessionId: "parent", deliveryKey: readKnowledgeFinalizationJob(jobPath).finalizeId, state, receiptId });
  function delegate(name: string, status = "process.active") {
    const planPath = path.join(root, "session-delegates", name + ".json");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify({ status, templateId: "internal-dsh-knowledge-delegate", knowledgeCapture: false }));
    return { planPath, scope: "session" as const, projectRoot: root, ownerSessionId: member };
  }
  return { root, project, member, job, reserve, mark, delegate,
    claimant: { projectRoot: root, host: "dsh", agentSessionId: member } };
}

test("one exact full-id admission permits only one delivery attempt and never reassigns", (t) => {
  const f = fixture(t), jobPath = f.job("a".repeat(64));
  const first = f.reserve(jobPath);
  assert.equal(first.admitted, true);
  assert.equal(first.execution?.deliveryKey, "a".repeat(64));
  assert.equal(first.execution?.memberSessionId, f.member);
  assert.equal(f.reserve(jobPath).alreadyReserved, true);
  assert.throws(() => reserveDshFinalizerExecution({ project: f.project, jobPath, parentSessionId: "parent", route: "native-continuable",
    memberSessionId: "replacement", provider: "spawn", configFingerprint: "config-v1" }), /IMMUTABLE/);
  assert.throws(() => markDshFinalizerDelivery({ project: f.project, jobPath, parentSessionId: "parent", deliveryKey: "a".repeat(12), state: "attempted" }), /exact admitted delivery key/);
  assert.equal(f.mark(jobPath, "attempted").deliver, true);
  assert.equal(f.mark(jobPath, "attempted").deliver, false);
  f.mark(jobPath, "uncertain");
  assert.equal(f.mark(jobPath, "attempted").deliver, false);
  assert.equal(f.mark(jobPath, "accepted", "durable-message-id").execution.delivery.receiptId, "durable-message-id");
  assert.equal(f.mark(jobPath, "accepted", "durable-message-id").deliver, false);
  assert.throws(() => f.mark(jobPath, "accepted", "another-receipt"), /IMMUTABLE/);
});

test("first claim requires admitted child and active no-capture internal delegate", (t) => {
  const f = fixture(t), jobPath = f.job("b".repeat(64));
  f.reserve(jobPath);
  const delegate = f.delegate("B");
  const options = { claimant: f.claimant, version: "v1", resolveDelegatePlan: () => delegate };
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath, options), /NOT_DELIVERED/);
  f.mark(jobPath, "attempted");
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath, { ...options, claimant: { ...f.claimant, agentSessionId: "sibling" } }), /CLAIM_DENIED/);
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath, { claimant: f.claimant, version: "v1" }), /DELEGATE_PLAN_REQUIRED/);
  fs.writeFileSync(delegate.planPath, JSON.stringify({ status: "process.active", templateId: "another", knowledgeCapture: false }));
  assert.throws(() => claimKnowledgeFinalizationJob(jobPath, options), /DELEGATE_PLAN_REQUIRED/);
  assert.equal(readKnowledgeFinalizationJob(jobPath).attempts, 0);
  const valid = f.delegate("B");
  const claimed = claimKnowledgeFinalizationJob(jobPath, { ...options, resolveDelegatePlan: () => valid })!;
  assert.equal(claimed.dshExecution?.delegatePlanPath, valid.planPath);
  assert.equal(claimed.claimReceipt?.agentSessionId, f.member);
  assert.throws(() => writeKnowledgeFinalizationJob(jobPath, { ...claimed, dshExecution: undefined }), /immutable/);
});

test("role locking is per parent; next job waits for job and delegate then durable release survives retention", (t) => {
  const f = fixture(t), a = f.job("c".repeat(64)), b = f.job("d".repeat(64)), other = f.job("e".repeat(64), "other-parent");
  f.reserve(a);
  assert.equal(f.reserve(b).blockingFinalizeId, "c".repeat(64));
  assert.equal(f.reserve(other, "other-parent").admitted, true);
  const key = createHash("sha256").update("parent").digest("hex");
  withFileLock(path.join(f.project.clawDir, "runtime", "dsh-finalizer-roles", key), () => {
    assert.throws(() => f.reserve(b), /Concurrent write/);
    assert.equal(f.reserve(other, "other-parent").alreadyReserved, true);
  });
  f.mark(a, "attempted");
  const delegate = f.delegate("A");
  const claimed = claimKnowledgeFinalizationJob(a, { claimant: f.claimant, version: "v1", resolveDelegatePlan: () => delegate })!;
  const ended = doneKnowledgeFinalizationJob({ jobPath: a, claimToken: claimed.claimToken!, status: "succeeded", result: "done", patch: { dshExecution: undefined } });
  assert.deepEqual(ended.job.dshExecution, claimed.dshExecution);
  assert.equal(releaseDshFinalizerExecution({ project: f.project, jobPath: a, actorSessionId: f.member }).released, false);
  assert.equal(f.reserve(b).admitted, false);
  f.delegate("A", "end.completed");
  assert.equal(releaseDshFinalizerExecution({ project: f.project, jobPath: a, actorSessionId: f.member }).released, true);
  fs.unlinkSync(delegate.planPath);
  assert.equal(f.reserve(b).admitted, true);
  const rows = inspectDshFinalizerExecutions({ project: f.project, parentSessionId: "parent" });
  assert.equal(rows.find((row) => row.finalizeId === "c".repeat(64))?.readyForNext, true);
  assert.equal(rows.length, 2);
});

test("uncertain delivery without delegate proof remains blocked even after expiry; unattempted expiry releases", (t) => {
  const f = fixture(t), a = f.job("f".repeat(64)), b = f.job("1".repeat(64));
  f.reserve(a); f.mark(a, "attempted"); f.mark(a, "uncertain");
  fs.writeFileSync(a, JSON.stringify({ ...readKnowledgeFinalizationJob(a), expiresAt: "2000-01-01T00:00:00.000Z" }));
  const beforeDenied = fs.readFileSync(a, "utf8");
  assert.throws(() => releaseDshFinalizerExecution({ project: f.project, jobPath: a, actorSessionId: "wrong-member" }), /DENIED/);
  assert.throws(() => markDshFinalizerDelivery({ project: f.project, jobPath: a, parentSessionId: "wrong-parent", deliveryKey: "f".repeat(64), state: "attempted" }), /DENIED/);
  assert.equal(fs.readFileSync(a, "utf8"), beforeDenied, "unauthorized requests cannot reconcile or rewrite job expiry");
  assert.equal(releaseDshFinalizerExecution({ project: f.project, jobPath: a, actorSessionId: "parent" }).released, false);
  assert.equal(f.reserve(b).reason, "delegate-terminal-proof-required");
  const idle = f.job("2".repeat(64), "idle-parent");
  f.reserve(idle, "idle-parent");
  fs.writeFileSync(idle, JSON.stringify({ ...readKnowledgeFinalizationJob(idle), expiresAt: "2000-01-01T00:00:00.000Z" }));
  assert.equal(releaseDshFinalizerExecution({ project: f.project, jobPath: idle, actorSessionId: "idle-parent" }).released, true);
});

test("expired admitted first claim binds its delegate for a no-token end.leave release", (t) => {
  const f = fixture(t), jobPath = f.job("4".repeat(64));
  f.reserve(jobPath); f.mark(jobPath, "attempted");
  fs.writeFileSync(jobPath, JSON.stringify({ ...readKnowledgeFinalizationJob(jobPath), expiresAt: "2000-01-01T00:00:00.000Z" }));
  const delegate = f.delegate("expired");
  assert.equal(claimKnowledgeFinalizationJob(jobPath, { claimant: f.claimant, version: "v1", resolveDelegatePlan: () => delegate }), null);
  const expired = readKnowledgeFinalizationJob(jobPath);
  assert.equal(expired.status, "expired");
  assert.equal(expired.claimToken, undefined);
  assert.equal(expired.dshExecution?.delegatePlanPath, delegate.planPath);
  f.delegate("expired", "end.leave");
  assert.equal(releaseDshFinalizerExecution({ project: f.project, jobPath, actorSessionId: f.member }).released, true);
});

test("queue freezes the parent report upper bound instead of delayed writer time", (t) => {
  const f = fixture(t), original = f.job("3".repeat(64));
  const planPath = readKnowledgeFinalizationJob(original).planPath;
  const endedAt = new Date(Date.now() - 2000).toISOString();
  const result = tryEndKnowledgePlan({ project: f.project, sessionId: "capture-parent", endedPlanPath: planPath,
    endedAt, host: "dsh", writer: { executionPolicy: "subagent" } });
  assert.equal(result.ok, true);
  assert.equal(readKnowledgeFinalizationJob(result.jobPath!).reportCapture?.endedAt, endedAt);
});
