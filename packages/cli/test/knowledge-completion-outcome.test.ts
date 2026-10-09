import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, ClawError, type KnowledgeFinalizationJob } from "@veewo/claw-core";
import { doneKnowledgeCommand } from "../dist/knowledge-command.js";
import { serializeCommandFailure } from "../dist/command-failure.js";
function fixture(t: { after: (fn: () => void) => void }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-completion-outcome-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true })); initProject({ cwd });
  const dir = path.join(cwd, ".claw", "tasks", "source"), jobPath = path.join(dir, "job.json"); fs.mkdirSync(dir, { recursive: true });
  const job: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId: "a".repeat(64), projectRoot: cwd, sessionId: "source", host: "opencode", taskName: "source",
    planPath: path.join(dir, "plan.json"), reportPath: path.join(dir, "plan.report"), status: "running", attempts: 1, queuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(), claimToken: "explicit-test-credential" };
  fs.writeFileSync(jobPath, JSON.stringify(job)); return { cwd, jobPath, job };
}
test("wrong completion credential rejects before expiry, report or Truth side effects across serializer fallbacks", t => {
  const f = fixture(t), doc = path.join(f.cwd, ".claw", "truth", "existing.md"); fs.writeFileSync(doc, "preserve without BOM");
  f.job.expiresAt = "2000-01-01T00:00:00Z"; fs.writeFileSync(f.jobPath, JSON.stringify(f.job)); const before = fs.readFileSync(f.jobPath, "utf8");
  let error: unknown; try { doneKnowledgeCommand({ jobPath: f.jobPath, claimToken: "typo", status: "succeeded", result: "done" }); } catch (e) { error = e; }
  assert.ok(error instanceof ClawError);
  for (const fallback of ["known", "unknown"] as const) { const r = serializeCommandFailure(error, fallback); assert.equal(r.code, "KNOWLEDGE_CLAIM_MISMATCH"); assert.equal(r.outcome, "known"); assert.equal(r.phase, "prepare"); assert.equal(r.effect, "none"); }
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before); assert.equal(fs.readFileSync(doc, "utf8"), "preserve without BOM"); assert.equal(fs.existsSync(f.job.reportPath), false);
});
test("post-commit report failure keeps canonical success and does not license resend", t => {
  const f = fixture(t); fs.mkdirSync(f.job.reportPath);
  const result = doneKnowledgeCommand({ jobPath: f.jobPath, claimToken: f.job.claimToken, status: "succeeded", result: "done" });
  assert.equal("completed" in result && result.completed, true); assert.equal(result.completionEffect, "committed"); assert.equal(result.postCommitFailures?.[0]?.effect, "knowledge.report");
  assert.equal(JSON.parse(fs.readFileSync(f.jobPath, "utf8")).status, "succeeded");
  const before = fs.readFileSync(f.jobPath, "utf8"); assert.equal(doneKnowledgeCommand({ jobPath: f.jobPath, claimToken: f.job.claimToken, status: "succeeded", result: "done" }).alreadyDone, true);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
});
