import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, showPlan, writeJsonFile } from "@veewo/claw-core";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";

function fixture() {
  // Like session-focus fixtures, leave OS-temp cleanup to the environment:
  // completion refresh can still own project handles after the response.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-direct-focus-"));
  const cwd = path.join(root, "project");
  fs.mkdirSync(cwd);
  initProject({ cwd, projectName: "Direct focus", planning: false });
  const registry = new SessionRegistryV2(path.join(root, "runtime"));
  const executor = new SessionCommandExecutor(registry);
  const identity = { agentSessionId: "direct-focus", workdir: cwd,
    client: { kind: "adapter" as const, host: "dsh" } };
  return { root, cwd, registry, executor, identity };
}

test("DSH create and completion return goal sync without replacing focus/session JSON", async t => {
  const f = fixture();
  const originalRename = fs.renameSync;
  let replacements = 0;
  t.mock.method(fs, "renameSync", (source: fs.PathLike, destination: fs.PathLike) => {
    const target = String(destination);
    if (target.startsWith(f.root) && (target.endsWith("plan.json")
      || target.includes("focus-transitions") || target.startsWith(path.join(f.root, "runtime")))) {
      replacements++;
      throw Object.assign(new Error("rename denied"), { code: "EPERM" });
    }
    return originalRename(source, destination);
  });
  await f.executor.execute(f.identity, { operation: "plan.create", input: {
    taskName: "direct", title: "Direct", goalText: "Complete normally", knowledgeCapture: false,
  } });
  const plan = showPlan({ cwd: f.cwd, taskName: "direct" }).plan;
  await f.executor.execute(f.identity, { operation: "task.done", input: {
    tasks: plan.tasks.map(task => ({ id: task.id })),
  } });
  const result = await f.executor.execute(f.identity, { operation: "plan.done", input: {
    retrospectiveSummary: "Completed without rename replacement",
  } });
  assert.equal(showPlan({ cwd: f.cwd, taskName: "direct" }).plan.status, "end.completed");
  assert.ok(result.hostActions?.some(action => action.tool === "update_goal" && action.input.status === "complete"));
  const opened = await f.executor.open(f.identity);
  assert.equal(opened.currentPlan, undefined);
  assert.equal(replacements, 0);
});

test("a real session write denial is propagated once rather than retried or hidden", async t => {
  const f = fixture();
  const opened = await f.registry.open(f.identity.agentSessionId, f.cwd, f.identity.client);
  const target = f.registry.recordPath(opened.identity.sessionKeyHash);
  const originalWrite = fs.writeFileSync;
  let attempts = 0;
  t.mock.method(fs, "writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
    if (args[0] === target) {
      attempts++;
      throw Object.assign(new Error("write denied"), { code: "EPERM" });
    }
    return originalWrite(...args);
  });
  await assert.rejects(f.registry.touch(opened.identity.sessionKeyHash), { code: "EPERM" });
  assert.equal(attempts, 1);
  assert.deepEqual(f.registry.read(opened.identity.sessionKeyHash), opened.record);
});

test("direct JSON serialization fails before touching the existing file", t => {
  const f = fixture();
  const target = path.join(f.root, "state.json");
  writeJsonFile(target, { retained: true });
  const before = fs.readFileSync(target, "utf8");
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.throws(() => writeJsonFile(target, circular), TypeError);
  assert.equal(fs.readFileSync(target, "utf8"), before);
});
