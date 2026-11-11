import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, knowledgeSessionRegistryPath, listKnowledgeFinalizationJobs, resolveProjectContext,
  tryEndKnowledgePlan, tryRegisterKnowledgePlan, writePlan } from "../src/index.js";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-source-continuity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initProject({ cwd: root, projectName: "DSH source continuity" });
  const project = resolveProjectContext(root);
  const sessionId = "source-" + path.basename(root);
  const registryPath = knowledgeSessionRegistryPath(project, sessionId);
  const parent = path.join(project.tasksDir, "probe", "plan.json");
  const child = path.join(project.tasksDir, "probe", "child.json");
  function legacySnapshot() {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const text = JSON.stringify({ schemaVersion: 1, sessionId,
      activePlanPath: "tasks/old/plan.json", activeStartedAt: "2000-01-01T00:00:00.000Z" });
    fs.writeFileSync(registryPath, text);
    return text;
  }
  return { root, project, sessionId, registryPath, parent, child, legacySnapshot };
}

// Source-plan-knowledge-handoff ADR: ordinary plan timestamps/materials replace
// the former DSH capture registry. Existing jobs/registries are not auto-migrated.
test("DSH plan creation owns its start time without a legacy capture registration", async t => {
  const f = fixture(t);
  const created = await writePlan({ cwd: f.root, host: "dsh", ownerSessionKey: f.sessionId,
    taskName: "probe", title: "Root", goalText: "Source capture" });
  assert.ok(Number.isFinite(Date.parse(created.plan.createdAt!)));
  assert.equal(fs.existsSync(f.registryPath), false);
  assert.deepEqual(listKnowledgeFinalizationJobs(f.project), []);
});

test("DSH source child registration and end cannot rewrite historical capture state", t => {
  const f = fixture(t), before = f.legacySnapshot();
  for (const planPath of [f.parent, f.child]) {
    assert.deepEqual(tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath }), { ok: true });
  }
  const ended = tryEndKnowledgePlan({ ...f, host: "dsh", endedPlanPath: f.child,
    resumedPlanPath: f.parent, endedAt: "2026-11-11T00:00:00.000Z" });
  assert.match(ended.finalizeId ?? "", /^[a-f0-9]{64}$/);
  assert.equal(ended.jobPath, undefined);
  assert.equal(fs.readFileSync(f.registryPath, "utf8"), before);
  assert.deepEqual(listKnowledgeFinalizationJobs(f.project), []);
});

test("a new DSH source plan never inherits the historical registry clock", async t => {
  const f = fixture(t), before = f.legacySnapshot();
  const created = await writePlan({ cwd: f.root, host: "dsh", ownerSessionKey: f.sessionId,
    taskName: "new-root", title: "New source", goalText: "Independent source" });
  assert.ok(Number.isFinite(Date.parse(created.plan.createdAt!)));
  assert.notEqual(created.plan.createdAt, "2000-01-01T00:00:00.000Z");
  assert.equal(fs.readFileSync(f.registryPath, "utf8"), before);
});

test("DSH source knowledge opt-out produces neither a capture registry nor a dispatch key", async t => {
  const f = fixture(t);
  const created = await writePlan({ cwd: f.root, host: "dsh", ownerSessionKey: f.sessionId,
    taskName: "probe", title: "No capture", goalText: "Auxiliary work", knowledgeCapture: false });
  assert.equal(created.plan.knowledgeCapture, false);
  assert.deepEqual(tryEndKnowledgePlan({ ...f, host: "dsh", endedPlanPath: created.planPath,
    endedAt: new Date().toISOString(), knowledgeCapture: false }), { ok: true });
  assert.equal(fs.existsSync(f.registryPath), false);
  assert.deepEqual(listKnowledgeFinalizationJobs(f.project), []);
});
