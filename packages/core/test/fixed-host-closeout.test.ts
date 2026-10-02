import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, resolveProjectContext, ensureProjectProtocol, ProjectConfigRepository, claimKnowledgeFinalizationJob, readKnowledgeFinalizationJob } from "../src/index.js";

test("legacy writer policy is dropped on read and repair; new settings reject it", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-policy-removal-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initProject({ cwd: root, projectName: "Legacy writer" });
  const target = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(target, "utf8"));
  config.knowledgeWriter.executionPolicy = "background";
  config.knowledgeWriterByHost = { codex: { executionPolicy: "main-agent", model: "custom-model" } };
  fs.writeFileSync(target, JSON.stringify(config));
  const effective = resolveProjectContext(root).projectConfig!;
  assert.equal("executionPolicy" in effective.knowledgeWriter!, false);
  assert.deepEqual(effective.knowledgeWriterByHost?.codex, { model: "custom-model" });
  const legacySnapshot = new ProjectConfigRepository().read(root);
  assert.equal("executionPolicy" in (legacySnapshot.team.knowledgeWriter as object), false);
  ensureProjectProtocol(root);
  assert.doesNotMatch(fs.readFileSync(target, "utf8"), /executionPolicy/);
  const repository = new ProjectConfigRepository();
  const snapshot = repository.read(root);
  const before = fs.readFileSync(target, "utf8");
  assert.throws(() => repository.setKey({ projectRoot: root, layer: "team", path: "knowledgeWriter.executionPolicy", value: "subagent", expectedRevision: snapshot.revisions.team }));
  assert.equal(fs.readFileSync(target, "utf8"), before);
});

test("legacy queued jobs without supported host capture fail without a claim", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-legacy-job-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const host of [undefined, "codex", "standard"]) {
    const jobPath = path.join(root, String(host) + ".json");
    fs.writeFileSync(jobPath, JSON.stringify({ schemaVersion: 1, finalizeId: "a".repeat(64), host, sessionId: "parent", projectRoot: root, taskName: "task", planPath: path.join(root, "plan.json"), reportPath: path.join(root, "plan.report"), status: "queued", attempts: 0, queuedAt: new Date().toISOString(), writer: { executionPolicy: "background" } }));
    assert.equal(claimKnowledgeFinalizationJob(jobPath), null);
    const failed = readKnowledgeFinalizationJob(jobPath);
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 0);
    assert.equal(failed.claimToken, undefined);
    assert.equal("executionPolicy" in (failed.writer ?? {}), false);
  }
});
