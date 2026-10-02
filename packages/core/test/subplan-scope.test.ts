import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSubplan, editPlan, initProject, resolveProjectContext, resolveSessionBoundPlan, showPlan, writePlan } from "../src/index.js";
import { resolveSessionWorkflowContext } from "../src/session-workflows.js";

for (const host of ["dsh", "codex"] as const) {
  test(`${host}: project subplan keeps scope after rejected session creation`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-subplan-scope-"));
    const runtime = path.join(root, "session-runtime");
    const previousRuntime = process.env.CLAW_SESSION_RUNTIME_DIR;
    process.env.CLAW_SESSION_RUNTIME_DIR = runtime;
    const ownerSessionKey = `scope-${host}-${path.basename(root)}`;
    try {
      initProject({ cwd: root, projectName: "Subplan scope" });
      await assert.rejects(writePlan({ cwd: root, scope: "session", ownerSessionKey,
        taskName: "rejected-session", title: "Rejected", goalText: "No capture target", host }),
        { code: "KNOWLEDGE_CAPTURE_TARGET_REQUIRED" });
      assert.ok(resolveSessionWorkflowContext(ownerSessionKey), "rejected creation retained its manifest");
      await writePlan({ cwd: root, scope: "project", ownerSessionKey, host,
        taskName: "父计划", title: "父计划", goalText: "Keep the root objective",
        content: { title: "父计划", status: "process.active", goal: { text: "Keep the root objective" },
          tasks: [{ id: 2, title: "Child work", status: "pending" }] } });
      const child = await createSubplan({ cwd: root, scope: "project", ownerSessionKey, host,
        parentTaskName: "父计划", parentTaskId: 2 });
      assert.equal(child.scope, "project");
      assert.equal(child.parentPlan, "plan.json");
      assert.equal(child.parentTaskId, 2);
      assert.equal(showPlan({ cwd: root, scope: "project", ownerSessionKey,
        taskName: "父计划" }).plan.tasks[0]?.execution?.subplan, child.planFile);
      const discussing = await editPlan({ cwd: root, scope: "project", ownerSessionKey, host,
        taskName: "父计划", planFile: child.planFile, updates: { requirementsSummary: "Discuss child" } });
      assert.equal(discussing.planStatus, "process.discussing");
      // Both start's pre-commit root validation and edit's response generation
      // must use the same canonical project scope as creation.
      const edited = await editPlan({ cwd: root, scope: "project", ownerSessionKey, host,
        taskName: "父计划", planFile: child.planFile, applyPlanStartGuidance: true,
        appendTasks: [{ id: 2, title: "Implement child", status: "pending" }] });
      assert.equal(edited.planStatus, "process.active");
      const updated = await editPlan({ cwd: root, scope: "project", ownerSessionKey, host,
        taskName: "父计划", planFile: child.planFile, updates: { requirementsSummary: "Still in project storage" } });
      assert.equal(updated.plan.requirements?.summary, "Still in project storage");
    } finally {
      if (previousRuntime === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
      else process.env.CLAW_SESSION_RUNTIME_DIR = previousRuntime;
    }
  });
}

test("invalid root Goal rejects child creation before parent, child, or binding changes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-subplan-invalid-root-"));
  const ownerSessionKey = `invalid-${path.basename(root)}`;
  initProject({ cwd: root, projectName: "Invalid root" });
  const parent = await writePlan({ cwd: root, scope: "project", ownerSessionKey,
    taskName: "invalid-root", title: "Invalid root", goalText: "",
    content: { title: "Invalid root", status: "prepare.requirements", goal: { text: "" },
      tasks: [{ id: 2, title: "Child work", status: "pending" }] } });
  const parentBefore = fs.readFileSync(parent.planPath, "utf8");
  const bindingBefore = resolveSessionBoundPlan(resolveProjectContext(root), ownerSessionKey);
  await assert.rejects(createSubplan({ cwd: root, scope: "project", ownerSessionKey,
    parentTaskName: "invalid-root", parentTaskId: 2 }),
    /root plan.json must contain a non-empty goal/);
  assert.equal(fs.readFileSync(parent.planPath, "utf8"), parentBefore);
  assert.equal(fs.existsSync(path.join(parent.taskDir, "Child-work.json")), false);
  assert.equal(resolveSessionBoundPlan(resolveProjectContext(root), ownerSessionKey), bindingBefore);
});

test("invalid root Goal rejects a discussing child edit without committing it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-subplan-invalid-edit-"));
  const ownerSessionKey = `invalid-edit-${path.basename(root)}`;
  initProject({ cwd: root, projectName: "Invalid root edit" });
  const parent = await writePlan({ cwd: root, scope: "project", ownerSessionKey,
    taskName: "invalid-edit", title: "Root", goalText: "Valid root",
    content: { title: "Root", status: "process.active", goal: { text: "Valid root" },
      tasks: [{ id: 2, title: "Child work", status: "pending" }] } });
  const child = await createSubplan({ cwd: root, scope: "project", ownerSessionKey,
    parentTaskName: "invalid-edit", parentTaskId: 2 });
  const childBefore = fs.readFileSync(child.planPath, "utf8");
  const invalidRoot = JSON.parse(fs.readFileSync(parent.planPath, "utf8"));
  invalidRoot.status = "prepare.requirements";
  invalidRoot.goal.text = "";
  fs.writeFileSync(parent.planPath, JSON.stringify(invalidRoot));
  await assert.rejects(editPlan({ cwd: root, scope: "project", ownerSessionKey,
    taskName: "invalid-edit", planFile: child.planFile,
    updates: { requirementsSummary: "Must not commit" } }),
    /root plan.json must contain a non-empty goal/);
  assert.equal(fs.readFileSync(child.planPath, "utf8"), childBefore);
  assert.equal(resolveSessionBoundPlan(resolveProjectContext(root), ownerSessionKey), child.planPath);
});
