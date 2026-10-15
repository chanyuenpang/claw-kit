import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { transitionOpenCodeFinalizerExecution } from "../src/opencode-finalizer-execution.js";
import { claimKnowledgeFinalizationJob, doneKnowledgeFinalizationJob, readKnowledgeFinalizationJob, writeKnowledgeFinalizationJob, type KnowledgeFinalizationJob } from "../src/knowledge-sidecar.js";
import type { ProjectContext } from "../src/types.js";

function fixture(t: import("node:test").TestContext) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-opencode-native-"));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const jobPath = path.join(projectRoot, "job.json");
  const job: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId: "a".repeat(64), host: "opencode", sessionId: "parent", projectRoot,
    taskName: "task", planPath: path.join(projectRoot, "plan.json"), reportPath: path.join(projectRoot, "plan.report"),
    status: "queued", attempts: 0, queuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), writer: { externalSkills: ["writer"] } };
  fs.writeFileSync(jobPath, JSON.stringify(job));
  const project = { projectRoot } as ProjectContext;
  const act = (action: Parameters<typeof transitionOpenCodeFinalizerExecution>[0]["action"], childSessionId?: string) =>
    transitionOpenCodeFinalizerExecution({ project, jobPath, parentSessionId: "parent", action, childSessionId });
  return { project, jobPath, act, claimant: { host: "opencode", agentSessionId: "child", projectRoot } };
}

test("OpenCode reservations are durable, one-shot, and authorize only the bound child", t => {
  const f = fixture(t);
  const before = fs.readFileSync(f.jobPath, "utf8");
  assert.throws(() => transitionOpenCodeFinalizerExecution({ ...f, parentSessionId: "other", action: "reserve" }), /canonical parent/);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
  assert.equal(f.act("reserve").execute, true);
  assert.equal(f.act("reserve").execute, false);
  f.act("bind", "child");
  assert.throws(() => f.act("bind", "sibling"), /cannot be replaced/);
  assert.throws(() => claimKnowledgeFinalizationJob(f.jobPath, { claimant: f.claimant }), /bound OpenCode child/);
  assert.equal(f.act("attempt").execute, true);
  assert.equal(f.act("attempt").execute, false);
  f.act("unknown");
  assert.equal(f.act("reserve").execute, false);
  assert.equal(f.act("attempt").execute, false);
  for (const agentSessionId of ["parent", "sibling"]) assert.throws(() => claimKnowledgeFinalizationJob(f.jobPath, { claimant: { ...f.claimant, agentSessionId } }), /bound OpenCode child/);
  const claimed = claimKnowledgeFinalizationJob(f.jobPath, { claimant: f.claimant })!;
  assert.equal(claimed.claimReceipt?.agentSessionId, "child");
  assert.throws(() => writeKnowledgeFinalizationJob(f.jobPath, { ...claimed, opencodeExecution: undefined }), /immutable/);
  const done = doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimant: f.claimant, status: "succeeded", result: "done", patch: { opencodeExecution: undefined } });
  assert.deepEqual(done.job.opencodeExecution, claimed.opencodeExecution);
});

test("accepted transport is not canonical completion and cannot replay", t => {
  const f = fixture(t); f.act("reserve"); f.act("bind", "child"); f.act("attempt"); f.act("accepted");
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).status, "queued");
  assert.equal(f.act("reserve").execute, false);
  assert.equal(f.act("attempt").execute, false);
});
