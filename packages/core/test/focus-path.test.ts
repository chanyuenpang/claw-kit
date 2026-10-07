import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { activatePlan, createPlanRef, focusOwnersPath, focusSessionKeyHash, initProject,
  leaveCurrentPlan, ProjectFocusSessionStore, readPlanFocusOwner, resolveProjectContext, writePlan } from "../src/index.js";

async function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-focus-path-"));
  initProject({ cwd, projectName: "Exact focus", planning: false });
  const parent = await writePlan({ cwd, taskName: "same-name", goalText: "Original" });
  const project = resolveProjectContext(cwd);
  return { cwd, parent, project };
}

test("focus identity retains date and never selects a newer or flat same-named plan", async () => {
  const { parent, project } = await fixture();
  const ref = createPlanRef(project, parent.taskName, parent.planFile, parent.taskDir);
  const original = fs.readFileSync(parent.planPath, "utf8");
  const copies = [path.join(project.tasksDir, "9999-01-01", parent.taskName), path.join(project.tasksDir, parent.taskName)];
  for (const dir of copies) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "plan.json"), original); }
  assert.ok(ref.taskPath?.includes("/"), "date is retained in the reference");
  await activatePlan({ project, sessionKey: "first", target: ref });
  const other = createPlanRef(project, parent.taskName, "plan.json", copies[0]);
  await activatePlan({ project, sessionKey: "second", target: other });
  assert.equal(readPlanFocusOwner(project, ref)?.sessionKeyHash, focusSessionKeyHash("first"));
  assert.equal(readPlanFocusOwner(project, other)?.sessionKeyHash, focusSessionKeyHash("second"));
  await leaveCurrentPlan({ project, sessionKey: "first" });
  assert.equal(JSON.parse(fs.readFileSync(parent.planPath, "utf8")).status, "end.leave");
  assert.equal(JSON.parse(fs.readFileSync(path.join(copies[0]!, "plan.json"), "utf8")).status, "process.active");
  assert.equal(fs.readFileSync(path.join(copies[1]!, "plan.json"), "utf8"), original);
  assert.throws(() => createPlanRef(project, parent.taskName), { code: "PLAN_TRANSITION_CONFLICT" });
});

test("unambiguous legacy owner keys remain usable without a global migration", async () => {
  const { parent, project } = await fixture();
  const ref = { projectRoot: project.projectRoot, taskName: parent.taskName, planFile: "plan.json", scope: project.scope };
  const sessionKeyHash = focusSessionKeyHash("legacy");
  const store = new ProjectFocusSessionStore(project);
  const now = new Date().toISOString();
  store.writePersistedAtomic(sessionKeyHash, { schemaVersion: 1, sessionKeyHash, currentPlan: ref, updatedAt: now });
  const separator = String.fromCharCode(0);
  const oldKey = createHash("sha256").update([path.resolve(project.projectRoot), ref.taskName, ref.planFile].join(separator)).digest("hex");
  fs.writeFileSync(focusOwnersPath(project), JSON.stringify({ schemaVersion: 1, owners: {
    [oldKey]: { sessionKeyHash, planRef: ref, acquiredAt: now, updatedAt: now },
  } }));
  await leaveCurrentPlan({ project, sessionKey: "legacy", sessionStore: store });
  assert.equal(store.read(sessionKeyHash).currentPlan, undefined);
  assert.equal(JSON.parse(fs.readFileSync(parent.planPath, "utf8")).status, "end.leave");
});
