import { runTaskLifecycleMaintenance } from "../../core/dist/src/task-lifecycle.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { editPlan, enforceTaskRetention, resolveProjectContext, writePlan } from "@veewo/claw-core";
import { createFixture } from "./cli-test-support.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";

test("committed terminal plan survives failed focus sync until recovery releases ownership", async () => {
  const cwd = createFixture("retention-focus");
  const executor = new SessionCommandExecutor(new SessionRegistryV2(createFixture("retention-registry")));
  const identity = { agentSessionId: path.basename(cwd), workdir: cwd, client: { kind: "terminal" as const, host: "codex" } };
  const created = (await executor.execute(identity, { operation: "plan.create", input: { title: "Protected terminal", knowledgeCapture: false } })).output as any;
  await executor.execute(identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  // The direct CLI mutation commits before its best-effort focus reconciliation.
  await editPlan({ cwd, scope: "project", taskName: created.taskName, ownerSessionKey: identity.agentSessionId,
    planStatus: "end.completed", updates: { retrospectiveSummary: "Committed before lost focus synchronization" } });
  const reconcile = executor.service.reconcileCanonicalFocus.bind(executor.service);
  executor.service.reconcileCanonicalFocus = async () => { throw new Error("fixture focus-sync failure"); };
  await assert.rejects(executor.open(identity), /focus-sync failure/);
  const project = resolveProjectContext(cwd), now = Date.now() + 40 * 86400000;
  const unrelated = await writePlan({ cwd, taskName: "unrelated-completed", knowledgeCapture: false,
    content: { title: "Independent completed work", status: "end.completed", goal: { text: "Done" }, tasks: [], completedAt: new Date().toISOString() } });
  enforceTaskRetention(project, undefined, now);
  assert.equal(fs.existsSync(unrelated.planPath), false, "unrelated cleanup must remain independent");
  runTaskLifecycleMaintenance(project, new Date(now));
  assert.ok(fs.existsSync(created.planPath), "focus proof must survive both maintenance paths");
  executor.service.reconcileCanonicalFocus = reconcile;
  await executor.open(identity);
  enforceTaskRetention(project, undefined, now);
  assert.equal(fs.existsSync(created.planPath), false);
  const next = await executor.execute(identity, { operation: "plan.create", input: { title: "Recovered next root", knowledgeCapture: false } });
  assert.ok((next.output as any).planPath);
});
