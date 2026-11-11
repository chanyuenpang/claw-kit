import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, showPlan } from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";
import type { CompletionRefreshInput } from "../dist/completion-refresh.js";

test("a failed maintenance launch cannot block another task or schedule work on reads", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-maintenance-isolation-"));
  const project = path.join(root, "project"); fs.mkdirSync(project);
  initProject({ cwd: project, projectName: "Maintenance isolation", planning: false });
  const registry = new SessionRegistryV2(path.join(root, "runtime"));
  const opened = await registry.open("isolation-agent", project, { kind: "node" });
  const context = { cwd: opened.identity.canonicalWorkdir, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), mode: "session" as const };
  const opportunities: CompletionRefreshInput[] = [];
  const service = new ClawCommandService(registry, input => {
    opportunities.push(input);
    if (opportunities.length === 1) throw new Error("first task launcher failed");
  });
  try {
    for (const taskName of ["first", "second"]) {
      const before = opportunities.length;
      await service.execute(context, { operation: "plan.create", input: { taskName, title: taskName, knowledgeCapture: false } });
      await service.execute(context, { operation: "plan.show", input: {} });
      await service.execute(context, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
      assert.equal(opportunities.length, before, "reads and nonterminal mutations have no maintenance side effects");
      const ended = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Complete" } });
      assert.equal((ended.output as { planStatus: string }).planStatus, "end.completed");
      assert.equal(opportunities.length, before + 1);
      assert.equal(showPlan({ cwd: project, taskName }).plan.status, "end.completed");
    }
    assert.deepEqual(opportunities.map(input => input.taskName), ["first", "second"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
