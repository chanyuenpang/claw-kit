import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, writePlan, doneKnowledgeFinalizationJob, type KnowledgeFinalizationJob } from "@veewo/claw-core";
import { ClawClient } from "@veewo/claw-client";
import { startSessionDaemon } from "../dist/session-daemon.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";

test("receipt-only reconnect and query never restore focus or launch business refresh", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-readonly-receipt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, "project"), runtimeRoot = path.join(root, "registry"), actor = "claim-writer";
  fs.mkdirSync(cwd); initProject({ cwd, planning: false });
  const plan = await writePlan({ cwd, title: "Unrelated active work", taskName: "unrelated", ownerSessionKey: actor,
    knowledgeCapture: false, content: { title: "Unrelated", status: "process.active", goal: { text: "Do not recover during a receipt read" }, tasks: [{ id: 1, title: "Work", status: "pending" }] } });
  const beforePlan = fs.readFileSync(plan.planPath, "utf8");
  const source = path.join(cwd, ".claw", "tasks", "source"), finalizeId = "a".repeat(64);
  const jobPath = path.join(source, ".runtime", "knowledge-finalization", finalizeId + ".json"); fs.mkdirSync(path.dirname(jobPath), { recursive: true });
  const job: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId, projectRoot: cwd, host: "opencode", sessionId: "parent",
    taskName: "source", planPath: path.join(source, "plan.json"), reportPath: path.join(source, "plan.report"), status: "running", attempts: 1,
    queuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), claimToken: "fixture-token",
    delegateWorkflow: { ownerSessionId: actor, projectRoot: cwd, planPath: plan.planPath, scope: "project" } };
  fs.writeFileSync(job.planPath, JSON.stringify({ status: "end.completed", title: "Source", tasks: [] })); fs.writeFileSync(jobPath, JSON.stringify(job));
  doneKnowledgeFinalizationJob({ jobPath, claimToken: job.claimToken, status: "succeeded", result: "done" });
  const beforeJob = fs.readFileSync(jobPath, "utf8");
  const executor = new SessionCommandExecutor(new SessionRegistryV2(runtimeRoot)); let recoveryCalls = 0;
  executor.service.reconcileCanonicalFocus = async () => { recoveryCalls++; throw new Error("receipt must not invoke focus recovery"); };
  await executor.open({ agentSessionId: actor, workdir: cwd, client: { kind: "adapter", host: "opencode" } }, true);
  await executor.execute({ agentSessionId: actor, workdir: cwd, client: { kind: "adapter", host: "opencode" } },
    { operation: "knowledge.done.receipt", input: { finalizeId, expectedStatus: "succeeded", expectedResult: "done" } });
  assert.equal(recoveryCalls, 0);
  await assert.rejects(executor.execute({ agentSessionId: actor, workdir: cwd, client: { kind: "adapter", host: "opencode" } },
    { operation: "knowledge.done", input: { finalizeId, claimToken: "wrong", status: "succeeded", result: "done" } }), { code: "KNOWLEDGE_CLAIM_MISMATCH" });
  assert.equal(recoveryCalls, 0, "credential rejection must precede focus recovery even for a completion mutation");
  assert.equal(fs.existsSync(path.join(cwd, ".claw", "runtime", "completion-refresh")), false);
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const session = await new ClawClient({ runtimeRoot, host: "opencode", clientKind: "adapter", receiptOnly: true }).open(actor, cwd);
  try {
    assert.equal((session.openResult as any).currentPlan, undefined);
    const result = await session.command({ operation: "knowledge.done.receipt", input: { finalizeId, expectedStatus: "succeeded", expectedResult: "done" } }) as any;
    assert.equal(result.matches, true); assert.equal(result.postCommitEffectsVerified, false);
    assert.equal(fs.readFileSync(plan.planPath, "utf8"), beforePlan); assert.equal(fs.readFileSync(jobPath, "utf8"), beforeJob);
    assert.equal(fs.existsSync(path.join(cwd, ".claw", "runtime", "completion-refresh")), false);
  } finally { await session.close(); await daemon.close(); }
});
