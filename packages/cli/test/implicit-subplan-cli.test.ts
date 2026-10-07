import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { initProject } from "@veewo/claw-core";
import { createFixture, runClaw } from "./cli-test-support.js";

for (const sessionEnv of ["CLAW_SESSION_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID"]) {
  test(`ordinary CLI creates and returns implicit subplans with ${sessionEnv}`, () => {
    const cwd = createFixture("implicit-cli");
    initProject({ cwd, projectName: "Implicit CLI", planning: false });
    const env = { [sessionEnv]: `implicit-${sessionEnv}`,
      CLAW_SESSION_RUNTIME_DIR: createFixture("implicit-session-runtime"),
      CLAW_SESSION_DAEMON_RUNTIME_DIR: createFixture("implicit-daemon-runtime"),
    };
    const templateFile = path.join(cwd, "child-template.json");
    fs.writeFileSync(templateFile, JSON.stringify({ id: "child-work", version: "1.0.0", status: "process.active",
      knowledgeCapture: false, goal: { text: "Child work" }, tasks: [{ id: 1, title: "Finish child", status: "pending" }] }));
    const root = runClaw(["plan", "create", "Root", "--no-knowledge-capture"], cwd, env);
    const child = runClaw(["subplan", "create", "--template-file", templateFile], cwd, env);
    assert.equal(child.ok, true);
    const parent = JSON.parse(fs.readFileSync(String(root.planPath), "utf8"));
    assert.equal(parent.status, "end.leave");
    assert.equal(parent.leaveReason, "switch_to_new_plan");
    const childPlan = JSON.parse(fs.readFileSync(String(child.planPath), "utf8"));
    assert.equal(childPlan.parentPlan, "plan.json");
    assert.equal(childPlan.parentTaskId, 1);
    runClaw(["task", "done", "--id", "1"], cwd, env);
    runClaw(["plan", "done", "--retrospective", "Finished child"], cwd, env);
    const recovered = runClaw(["context"], cwd, env);
    assert.equal((recovered.activeWorkflow as { planPath: string }).planPath, root.planPath);
    assert.equal(JSON.parse(fs.readFileSync(String(root.planPath), "utf8")).status, "process.active");
  });
}
