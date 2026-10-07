import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSubplan, initProject, resolveProjectContext, resolveSessionBoundPlan, showPlan, writePlan } from "../src/index.js";

test("implicit subplan uses exact binding despite newer and flat same-named tasks", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-implicit-subplan-"));
  initProject({ cwd, projectName: "Implicit", planning: false });
  const ownerSessionKey = path.basename(cwd);
  const parent = await writePlan({ cwd, ownerSessionKey, scope: "project", taskName: "same-name",
    content: { title: "Parent", status: "process.active", goal: { text: "Keep exact parent" },
      tasks: [{ id: 4, title: "Chosen child", status: "in_progress" }, { id: 5, title: "Later", status: "pending" }] } });
  const parentBefore = fs.readFileSync(parent.planPath, "utf8");
  const duplicates = [path.join(cwd, ".claw", "tasks", "same-name"),
    path.join(cwd, ".claw", "tasks", "9999-01-01", "same-name")];
  for (const dir of duplicates) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "plan.json"), parentBefore); }
  const child = await createSubplan({ cwd, ownerSessionKey });
  assert.equal(child.parentTaskId, 4);
  assert.equal(child.parentPlan, "plan.json");
  assert.equal(child.taskDir, parent.taskDir);
  assert.equal(showPlan({ cwd, ownerSessionKey, taskName: "same-name", planFile: "plan.json" }).plan.tasks[0]?.execution?.subplan, child.planFile);
  assert.equal(resolveSessionBoundPlan(resolveProjectContext(cwd), ownerSessionKey), child.planPath);
  for (const dir of duplicates) {
    assert.equal(fs.readFileSync(path.join(dir, "plan.json"), "utf8"), parentBefore);
    assert.equal(fs.existsSync(path.join(dir, child.planFile)), false);
  }
  const grandchild = await createSubplan({ cwd, ownerSessionKey });
  assert.equal(grandchild.parentPlan, child.planFile);
  assert.equal(grandchild.taskDir, parent.taskDir);
});

test("implicit subplan rejects absent focus instead of guessing a task directory", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-unbound-subplan-"));
  initProject({ cwd, projectName: "Unbound", planning: false });
  await writePlan({ cwd, taskName: "unowned", goalText: "Not this session" });
  await assert.rejects(createSubplan({ cwd, ownerSessionKey: path.basename(cwd) }), { code: "CURRENT_PLAN_REQUIRED" });
});
