import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, knowledgeSessionRegistryPath, resolveProjectContext,
  tryLeaveKnowledgePlan, tryRegisterKnowledgePlan, writePlan } from "../src/index.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-capture-continuity-"));
  initProject({ cwd: root, projectName: "DSH capture continuity" });
  const project = resolveProjectContext(root);
  const sessionId = `capture-${path.basename(root)}`;
  const registryPath = knowledgeSessionRegistryPath(project, sessionId);
  const parent = path.join(project.tasksDir, "probe", "plan.json");
  const child = path.join(project.tasksDir, "probe", "child.json");
  const read = () => JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return { root, project, sessionId, registryPath, parent, child, read };
}

test("DSH plan creation registers a bounded capture start", async () => {
  const f = fixture();
  const created = await writePlan({ cwd: f.root, host: "dsh", ownerSessionKey: f.sessionId,
    taskName: "probe", title: "Root", goalText: "Bounded capture" });
  assert.ok(fs.existsSync(f.registryPath), "capture registration is required before any terminal dispatch");
  const capture = f.read();
  assert.equal(capture.activePlanPath, path.relative(f.project.clawDir, created.planPath).replaceAll("\\", "/"));
  assert.ok(Number.isFinite(Date.parse(capture.activeStartedAt)));
});

test("leaving a switched parent cannot erase the already active child's capture", () => {
  const f = fixture();
  assert.equal(tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath: f.parent }).ok, true);
  const rootStartedAt = f.read().activeStartedAt;
  assert.equal(tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath: f.child }).ok, true);
  assert.equal(tryLeaveKnowledgePlan({ ...f, leftPlanPath: f.parent }).ok, true);
  const capture = f.read();
  assert.equal(capture.activePlanPath, "tasks/probe/child.json");
  assert.equal(capture.activeStartedAt, rootStartedAt);
});

test("capture registration never carries an interval into a different root", () => {
  const f = fixture();
  tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath: f.parent });
  fs.writeFileSync(f.registryPath, JSON.stringify({ ...f.read(), activeStartedAt: "2000-01-01T00:00:00.000Z" }));
  tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath: path.join(f.project.tasksDir, "new-root", "plan.json") });
  const newStart = f.read().activeStartedAt;
  assert.notEqual(newStart, "2000-01-01T00:00:00.000Z");
  tryLeaveKnowledgePlan({ ...f, leftPlanPath: f.parent });
  assert.equal(f.read().activePlanPath, "tasks/new-root/plan.json");
  assert.equal(f.read().activeStartedAt, newStart);
});

test("manual leave clears only its matching capture and a new root starts independently", () => {
  const f = fixture();
  tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath: f.parent });
  // Stable old clock proves the later root cannot retain an abandoned window.
  fs.writeFileSync(f.registryPath, JSON.stringify({ ...f.read(), activeStartedAt: "2000-01-01T00:00:00.000Z" }));
  assert.equal(tryLeaveKnowledgePlan({ ...f, leftPlanPath: f.parent }).ok, true);
  assert.equal(f.read().activePlanPath, undefined);
  assert.equal(f.read().activeStartedAt, undefined);
  tryRegisterKnowledgePlan({ ...f, host: "dsh", planPath: path.join(f.project.tasksDir, "new-root", "plan.json") });
  assert.notEqual(f.read().activeStartedAt, "2000-01-01T00:00:00.000Z");
  assert.equal(f.read().activePlanPath, "tasks/new-root/plan.json");
});
