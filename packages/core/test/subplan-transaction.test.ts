import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitSubplanCreation, createPlanRef, focusSessionKeyHash, initProject,
  ProjectFocusSessionStore, recoverProjectFocusTransitions, resolveProjectContext,
  resolveSessionBoundPlan, writePlan } from "../src/index.js";
import type { FocusFailurePoint, PlanDocument } from "../src/index.js";

for (const failAt of ["after_prepared", "after_applying", "after_plan", "after_owners", "after_binding", "after_session", "after_committed"] as FocusFailurePoint[]) {
  test(`subplan creation recovers its full write set after ${failAt}`, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-create-transaction-"));
    initProject({ cwd, projectName: "Creation transaction", planning: false });
    const sessionKey = path.basename(cwd);
    const parent = await writePlan({ cwd, ownerSessionKey: sessionKey, taskName: "parent", goalText: "Expand task" });
    const project = resolveProjectContext(cwd);
    const parentBefore = JSON.parse(fs.readFileSync(parent.planPath, "utf8")) as PlanDocument;
    const childContent: PlanDocument = { title: "Child", status: "process.active", knowledgeCapture: false,
      goal: { text: "Child work" }, parentPlan: parent.planFile, parentTaskId: 1,
      tasks: [{ id: 1, title: "Do child work", status: "pending" }] };
    const childPath = path.join(parent.taskDir, "child.json");
    const store = new ProjectFocusSessionStore(project);
    await assert.rejects(commitSubplanCreation({ project, sessionKey, bindingSessionKey: sessionKey,
      parentPlan: createPlanRef(project, parent.taskName, parent.planFile, parent.taskDir), parentBefore,
      childPlan: createPlanRef(project, parent.taskName, "child.json", parent.taskDir), childContent,
      sessionStore: store, testHooks: { failAt, failAfterPlanWrites: 1 },
    }), (error: unknown) => {
      assert.match(String(error), new RegExp(failAt));
      assert.deepEqual((error as { execution: unknown }).execution, failAt === "after_prepared"
        ? { phase: "prepare", outcome: "known", effect: "none" }
        : failAt === "after_committed"
          ? { phase: "post-commit", outcome: "known", effect: "committed" }
          : { phase: "commit", outcome: "known", effect: "partial" });
      return true;
    });
    const recovered = await recoverProjectFocusTransitions({ project, sessionStore: store });
    if (failAt === "after_prepared") {
      assert.equal(recovered.discarded.length, 1);
      assert.equal(fs.existsSync(childPath), false);
      assert.equal(resolveSessionBoundPlan(project, sessionKey), parent.planPath);
      assert.deepEqual(JSON.parse(fs.readFileSync(parent.planPath, "utf8")), parentBefore);
    } else {
      assert.equal(recovered.recovered.length, 1);
      assert.deepEqual(JSON.parse(fs.readFileSync(childPath, "utf8")), childContent);
      const resumedParent = JSON.parse(fs.readFileSync(parent.planPath, "utf8"));
      assert.equal(resumedParent.status, "end.leave");
      assert.equal(resumedParent.leaveReason, "switch_to_new_plan");
      assert.equal(resumedParent.tasks[0].execution.subplan, "child.json");
      assert.equal(resolveSessionBoundPlan(project, sessionKey), childPath);
      assert.equal(store.read(focusSessionKeyHash(sessionKey)).currentPlan?.planFile, "child.json");
    }
    assert.deepEqual(await recoverProjectFocusTransitions({ project, sessionStore: store }), { recovered: [], discarded: [], quarantined: [] });
  });
}
