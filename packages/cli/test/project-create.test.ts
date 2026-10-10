import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createFixture, runClaw, runClawExpectFailure } from "./cli-test-support.js";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";

for (const capture of [undefined, "true", "false"]) {
  test("CLI creates and initializes without scope, capture=" + capture, () => {
    const cwd = createFixture("auto-create");
    const result = runClaw(["plan", "create", "Normal plan", ...(capture === undefined ? [] : ["--knowledge-capture", capture])], cwd, {
      CLAW_HOST: "", CLAW_SESSION_ID: "actor-" + path.basename(cwd),
    });
    const plan = JSON.parse(fs.readFileSync(String(result.planPath), "utf8"));
    assert.equal(plan.knowledgeCapture, capture !== "false");
    assert.ok(String(result.planPath).startsWith(path.join(cwd, ".claw", "tasks")));
    assert.ok(fs.existsSync(path.join(cwd, ".claw", "project.json")));
  });
}
for (const flags of [["--scope", "session"], ["--scope=project"], ["--knowledge-capture", "invalid"], ["--knowledge-capture", "true", "--no-knowledge-capture"], ["--unknown-option", "x"]]) {
  test("CLI rejects malformed creation without setup: " + flags.join(" "), () => {
    const cwd = createFixture("reject-create");
    const result = runClawExpectFailure(["plan", "create", "Rejected", ...flags], cwd, { CLAW_HOST: "", CLAW_SESSION_ID: "actor-" + path.basename(cwd) });
    assert.equal((result.error as any).effect, "none");
    assert.equal((result.error as any).outcome, "known");
    assert.deepEqual(fs.readdirSync(cwd), []);
  });
}

test("no-capture project guidance and completion keep the same retrospective contract", async () => {
  const cwd = createFixture("capture-lifecycle");
  const executor = new SessionCommandExecutor(new SessionRegistryV2(createFixture("registry")));
  const identity = { agentSessionId: "actor-" + path.basename(cwd), workdir: cwd, client: { kind: "adapter" as const, host: "dsh" } };
  await executor.execute(identity, { operation: "plan.create", input: { title: "No capture", knowledgeCapture: false } });
  await executor.execute(identity, { operation: "plan.start", input: { appendTasks: [{ title: "Work" }] } });
  const progress = await executor.execute(identity, { operation: "task.done", input: { tasks: [{ id: 2 }] } });
  assert.ok((progress.output as any).workflowGuidance.commandHints.some((hint: string) => hint.includes("--retrospective")));
  await assert.rejects(executor.execute(identity, { operation: "plan.done", input: {} }));
  const done = await executor.execute(identity, { operation: "plan.done", input: { retrospectiveSummary: "Work verified; no knowledge deposition requested." } });
  assert.equal((done.output as any).planStatus, "end.completed");
  assert.equal(done.knowledgeDispatch, undefined);
});

test("all session adapters share bootstrap and no-capture storage semantics", async () => {
  for (const host of ["dsh", "cindy", "codex", "opencode"]) {
    const cwd = createFixture("adapter-create-" + host);
    const executor = new SessionCommandExecutor(new SessionRegistryV2(createFixture("registry")));
    const identity = { agentSessionId: "actor-" + path.basename(cwd), workdir: cwd, client: { kind: "adapter" as const, host } };
    const result = await executor.execute(identity, { operation: "plan.create", input: { title: "Shared plan", knowledgeCapture: false } });
    const output = result.output as any;
    assert.equal(output.scope, "project"); assert.equal(output.plan.knowledgeCapture, false);
    // A second explicit root switches focus atomically; the replaced plan is
    // left resumable instead of requiring a plan.leave ceremony.
    const second = await executor.execute(identity, { operation: "plan.create", input: { title: "Second root" } });
    assert.ok((second.output as { planPath: string }).planPath);
    assert.equal(JSON.parse(fs.readFileSync(output.planPath, "utf8")).status, "end.leave");
  }
});
