import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertSingleTaskActivation, currentPlanTask, buildPlanWorkflowGuidance, editPlan, initProject, showPlan, writePlan } from "../src/index.js";
import type { PlanTask } from "../src/types.js";

test("single focus preserves ordered pending, active priority, blocked and legacy reads", () => {
  const tasks: PlanTask[] = [
    { id: 1, title: "First", status: "pending" },
    { id: 2, title: "Second", status: "pending" },
  ];
  assert.equal(currentPlanTask({ tasks })?.id, 1);
  tasks[1]!.status = "in_progress";
  assert.equal(currentPlanTask({ tasks })?.id, 2);
  tasks[0]!.status = "subagent_running";
  assert.equal(currentPlanTask({ tasks })?.id, 1, "legacy multiple actives remain readable");
  tasks[0]!.status = "blocked";
  tasks[1]!.status = "pending";
  assert.equal(currentPlanTask({ tasks })?.id, 1, "blocked work is not silently skipped");
  tasks.forEach((task) => { task.status = "done"; });
  assert.equal(currentPlanTask({ tasks }), undefined);
});

test("writers reject new parallel activation without blocking legacy reads or repairs", () => {
  const original: { tasks: PlanTask[] } = { tasks: [
    { id: 1, title: "Current", status: "in_progress" },
    { id: 2, title: "Next", status: "pending" },
  ] };
  const parallel = structuredClone(original);
  parallel.tasks[1]!.status = "in_progress";
  assert.throws(() => assertSingleTaskActivation(original, parallel), { code: "PLAN_TRANSITION_CONFLICT" });
  assert.throws(() => assertSingleTaskActivation(undefined, parallel), { code: "PLAN_TRANSITION_CONFLICT" });
  assert.doesNotThrow(() => assertSingleTaskActivation(parallel, structuredClone(parallel)));
  assert.doesNotThrow(() => assertSingleTaskActivation(parallel, original));
  const advanced = structuredClone(parallel);
  advanced.tasks[0]!.status = "done";
  assert.doesNotThrow(() => assertSingleTaskActivation(original, advanced));
});

for (const choice of [false, true]) {
  test(`template ${choice ? "choice" : "default"} route survives fresh guidance recovery`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-task-focus-"));
    initProject({ cwd: root, projectName: "Focus", planning: true });
    const templateFile = path.join(root, "route.json");
    fs.writeFileSync(templateFile, JSON.stringify({
      id: "focus-route", version: "1.0.0", status: "process.active", goal: { text: "Route work" },
      tasks: [
        { id: 1, title: "Choose", status: "pending", guidance: { onDone: choice
          ? { choices: { later: { nextTaskId: 3 } } }
          : { default: { nextTaskId: 3 } } } },
        { id: 2, title: "Earlier pending", status: "pending" },
        { id: 3, title: "Selected work", status: "pending" },
      ],
    }));
    await writePlan({ cwd: root, taskName: "routed", templateFile, forcePlanning: true });
    const result = await editPlan({ cwd: root, taskName: "routed", taskId: 1, taskStatus: "done",
      ...(choice ? { taskChoiceId: "later" } : {}) });
    assert.equal(result.workflowGuidance.nextTask?.id, 3);
    const recovered = showPlan({ cwd: root, taskName: "routed" });
    assert.equal(currentPlanTask(recovered.plan)?.id, 3);
    const guidance = await buildPlanWorkflowGuidance({ taskName: "routed", planFile: "plan.json",
      plan: recovered.plan, projectRoot: root, recoveryResync: true });
    assert.equal(guidance.nextTask?.id, 3, "fresh recovery keeps the routed task, not task 2");
  });
}
