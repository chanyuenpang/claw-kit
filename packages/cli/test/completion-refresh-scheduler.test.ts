import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, showPlan } from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { createCompletionRefreshScheduler } from "../dist/completion-refresh-scheduler.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("blocked historical maintenance cannot delay task.done or replay its mutation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-maintenance-response-"));
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  initProject({ cwd: project, projectName: "Maintenance response", planning: false });
  const registry = new SessionRegistryV2(path.join(root, "runtime"));
  const opened = await registry.open("maintenance-agent", project, { kind: "node" });
  const context = { cwd: opened.identity.canonicalWorkdir,
    agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), mode: "session" as const };
  let release!: () => void;
  let launches = 0;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const schedule = createCompletionRefreshScheduler(async () => { launches++; await blocked; });
  const service = new ClawCommandService(registry, schedule);
  await service.execute(context, { operation: "plan.create", input: {
    taskName: "response", title: "Response", goalText: "Do not wait for maintenance",
  } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      service.execute(context, { operation: "task.done", input: { tasks: [{ id: 1 }] } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("task.done waited for historical maintenance")), 3000);
      }),
    ]);
    const plan = showPlan({ cwd: project, taskName: "response" }).plan;
    assert.equal(plan.tasks[0]?.status, "done");
    assert.equal(launches, 1, "in-flight maintenance is coalesced, not awaited");
    const canonical = JSON.stringify(plan);
    release();
    await turn();
    await turn();
    assert.equal(launches, 2, "a later commit requests one follow-up recovery scan");
    assert.equal(JSON.stringify(showPlan({ cwd: project, taskName: "response" }).plan), canonical,
      "maintenance completion must not replay the business command");
  } finally {
    if (timer) clearTimeout(timer);
    release();
    await turn();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("maintenance launch failures are isolated and do not poison future recovery", async () => {
  const errors: unknown[] = [];
  let calls = 0;
  const schedule = createCompletionRefreshScheduler(() => {
    calls++;
    if (calls === 1) throw new Error("spawn failed");
    if (calls === 2) return Promise.reject(new Error("worker failed"));
    return Promise.resolve();
  }, (error) => { errors.push(error); });
  for (let i = 0; i < 3; i++) {
    assert.doesNotThrow(() => schedule(process.cwd(), "failure-test"));
    await turn();
  }
  assert.equal(calls, 3);
  assert.equal(errors.length, 2);
});
