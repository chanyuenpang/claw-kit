import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, writePlan, editPlan } from "../src/index.js";

test("ordinary corrections and idempotent prose cleanup do not reload vanished templates", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-friction-"));
  initProject({ cwd, projectName: "Friction", planning: false });
  const created = await writePlan({ cwd, taskName: "source-independent", goalText: "Correct work" });
  const before = JSON.parse(fs.readFileSync(created.planPath, "utf8"));
  before.templateId = "external-moved-template"; before.templateFile = path.join(cwd, "gone", "TEMPLATE.json");
  delete before.templateGuidance; // legacy initialized plan without compiled routes
  before.rules = ["keep this"]; fs.writeFileSync(created.planPath, JSON.stringify(before));
  const result = await editPlan({ cwd, taskName: created.taskName, taskPath: path.relative(path.join(cwd, ".claw", "tasks"), created.taskDir),
    updates: { requirementsSummary: "Corrected requirements", removeRules: ["already absent"], removeOpenQuestions: ["already answered"] } });
  assert.equal(result.plan.requirements?.summary, "Corrected requirements");
  assert.deepEqual(result.plan.rules, ["keep this"]);
  assert.equal(result.plan.templateFile, before.templateFile);
  const final = JSON.parse(fs.readFileSync(created.planPath, "utf8")); assert.equal(final.status, before.status);
});

test("initialized completion routes survive source template relocation and choice drift", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-route-"));
  initProject({ cwd, projectName: "Routes", planning: true });
  const templateFile = path.join(cwd, "custom-template.json");
  fs.writeFileSync(templateFile, JSON.stringify({ id: "routed", version: "1.0.0", knowledgeCapture: false, status: "process.active",
    tasks: [{ id: 1, title: "Choose route", status: "pending", guidance: { onDone: { choices: { finish: { nextTaskId: 2 } } } } },
      { id: 2, title: "Finish result", status: "pending" }] }));
  const created = await writePlan({ cwd, taskName: "routed", templateFile, goalText: "Work" });
  assert.ok(created.plan.templateGuidance?.["1"]?.onDone?.choices?.finish);
  const moved = templateFile + ".moved"; fs.renameSync(templateFile, moved);
  const result = await editPlan({ cwd, taskName: created.taskName, taskPath: path.relative(path.join(cwd, ".claw", "tasks"), created.taskDir),
    taskId: 1, taskStatus: "done", taskChoiceId: "finish" });
  assert.equal(result.plan.tasks[0].status, "done"); assert.equal(result.workflowGuidance?.nextTask?.id, 2);
});
