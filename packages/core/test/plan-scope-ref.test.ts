import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPlanRef,
  editPlan,
  initProject,
  resolveWorkflowProjectContext,
  writePlan,
} from "../src/index.js";

function createFixture(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `claw-kit-${name}-`));
}

test("project-scoped plan stays reachable when the session owns a session workflow manifest", async () => {
  const previousRuntimeDir = process.env.CLAW_SESSION_RUNTIME_DIR;
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-kit-scope-runtime-"));
  process.env.CLAW_SESSION_RUNTIME_DIR = runtimeDir;
  const root = createFixture("scope-ref");
  const sessionKey = "scope-regression-session";
  try {
    initProject({ cwd: root, projectName: "Scope Ref" });

    // 1. A session-scoped plan creates the session workflow manifest, which
    //    the ambient undefined-scope resolution prefers from then on.
    const sessionPlan = await writePlan({
      cwd: root,
      scope: "session",
      ownerSessionKey: sessionKey,
      title: "session-plan",
    });
    assert.equal(sessionPlan.scope, "session");

    // 2. A default-scope plan (e.g. created from a template without an
    //    explicit scope) is project-scoped per writePlan's contract.
    const projectPlan = await writePlan({
      cwd: root,
      ownerSessionKey: sessionKey,
      title: "project-plan",
    });
    assert.equal(projectPlan.scope, "project");
    assert.ok(projectPlan.planPath.startsWith(path.join(root, ".claw")), "plan must live under the project tasks dir");
    assert.ok(fs.existsSync(projectPlan.planPath));

    // 3. The ref created from the correct project context records the scope.
    const project = resolveWorkflowProjectContext(root, sessionKey, "project");
    const ref = createPlanRef(project, projectPlan.taskName, "plan.json");
    assert.equal(ref.scope, "project");

    // 4. editPlan with the ref's scope reaches the project-scoped plan even
    //    though the session owns a manifest. Before the fix this threw
    //    Task "..." does not exist because resolution searched the session
    //    runtime instead.
    const edited = await editPlan({
      cwd: root,
      scope: ref.scope,
      taskName: projectPlan.taskName,
      planFile: "plan.json",
      appendTasks: [{ id: 99, title: "scope regression probe", status: "pending" }],
      ownerSessionKey: sessionKey,
    });
    assert.equal(edited.plan.tasks.some((task) => task.id === 99), true);

    // 5. The ambient hazard stays documented: without a scope the resolver
    //    still prefers the session manifest and cannot see the project plan.
    await assert.rejects(
      () => editPlan({
        cwd: root,
        taskName: projectPlan.taskName,
        planFile: "plan.json",
        appendTasks: [{ id: 98, title: "ambient probe", status: "pending" }],
        ownerSessionKey: sessionKey,
      }),
      /does not exist/,
    );
  } finally {
    if (previousRuntimeDir === undefined) {
      delete process.env.CLAW_SESSION_RUNTIME_DIR;
    } else {
      process.env.CLAW_SESSION_RUNTIME_DIR = previousRuntimeDir;
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
