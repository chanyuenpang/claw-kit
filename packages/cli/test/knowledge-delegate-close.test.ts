import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, knowledgeDelegateTemplatePath, readKnowledgeFinalizationJob,
  resolveSessionWorkflowContext, resolveSessionBoundPlan, withExecutionFailure, type KnowledgeFinalizationJob } from "@veewo/claw-core";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";
import { reserveDshFinalizerExecutionCommand, markDshFinalizerDeliveryCommand } from "../dist/dsh-finalizer-execution.js";

type Host = "codex" | "cindy" | "dsh" | "opencode";
async function fixture(t: TestContext, host: Host, builtin = false) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-delegate-close-"));
  const previous = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = path.join(cwd, "sessions");
  t.after(() => { if (previous === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR; else process.env.CLAW_SESSION_RUNTIME_DIR = previous; });
  initProject({ cwd, projectName: "Owned closeout", planning: false });
  const finalizeId = "a".repeat(64), actor = path.basename(cwd);
  const sourceDir = path.join(cwd, ".claw", "tasks", "source");
  const jobPath = path.join(sourceDir, ".runtime", "knowledge-finalization", finalizeId + ".json");
  fs.mkdirSync(path.dirname(jobPath), { recursive: true });
  const planPath = path.join(sourceDir, "plan.json"), reportPath = path.join(sourceDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ title: "Source", status: "end.completed", goal: { text: "Source" }, tasks: [] }));
  fs.writeFileSync(reportPath, "");
  const job: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId, projectRoot: cwd, sessionId: "parent", host,
    taskName: "source", planPath, reportPath, status: "queued", attempts: 0, queuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120000).toISOString(), writer: builtin ? {} : { externalSkills: ["fixture-writer"] },
    ...(builtin ? { docUpdate: { externalDocPaths: ["docs"] } } : {}),
    reportCapture: { mode: "claim", status: "captured" } };
  fs.writeFileSync(jobPath, JSON.stringify(job));
  if (host === "dsh") {
    reserveDshFinalizerExecutionCommand({ cwd, parentSessionId: "parent", finalizeId, route: "native-continuable", memberSessionId: actor, provider: "spawn", configFingerprint: "test" });
    markDshFinalizerDeliveryCommand({ cwd, parentSessionId: "parent", finalizeId, deliveryKey: finalizeId, state: "attempted" });
    markDshFinalizerDeliveryCommand({ cwd, parentSessionId: "parent", finalizeId, deliveryKey: finalizeId, state: "accepted", receiptId: "test-receipt" });
  }
  const executor = new SessionCommandExecutor(new SessionRegistryV2(path.join(cwd, "registry")));
  const identity = { agentSessionId: actor, workdir: cwd, client: { kind: "adapter" as const, host } };
  const templateFile = host === "cindy" || host === "dsh"
    ? path.resolve(path.dirname(knowledgeDelegateTemplatePath()), "..", host + "-delegate-writer", "TEMPLATE.json")
    : knowledgeDelegateTemplatePath();
  const root = (await executor.execute(identity, { operation: "plan.create", input: { title: "Owned delegate", templateFile, forcePlanning: true } })).output as any;
  const claim = (await executor.execute(identity, { operation: "knowledge.claim", input: { finalizeId } })).output as any;
  assert.equal(claim.claimed, true);
  assert.equal(readKnowledgeFinalizationJob(jobPath).delegateWorkflow?.planPath, root.planPath);
  await executor.execute(identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const child = (await executor.execute(identity, { operation: "subplan.create", input: { templateFile: claim.templatePath } })).output as any;
  const done = (status: "succeeded" | "failed") => executor.execute(identity, { operation: "knowledge.done", input: {
    finalizeId, claimToken: claim.claimToken, status, ...(status === "succeeded" ? { result: "Fixture result" } : { error: "Remaining conflict" }),
  } });
  return { cwd, executor, identity, root, child, claim, jobPath, done };
}

for (const host of ["codex", "cindy", "dsh", "opencode"] as Host[]) {
  test(host + ": common owner closes completed content and the matching delegate", async (t) => {
    const f = await fixture(t, host);
    await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
    const result = (await f.done("succeeded")).output as any;
    assert.equal(result.delegateClosed, true, JSON.stringify(result));
    assert.equal(JSON.parse(fs.readFileSync(f.root.planPath, "utf8")).status, "end.completed");
    assert.equal(JSON.parse(fs.readFileSync(f.child.planPath, "utf8")).status, "end.completed");
    assert.equal(readKnowledgeFinalizationJob(f.jobPath).attempts, 1);
    assert.equal(resolveSessionBoundPlan(resolveSessionWorkflowContext(f.identity.agentSessionId)!, f.identity.agentSessionId), null);
    assert.equal(fs.existsSync(f.claim.templatePath), false);
  });
}

test("built-in no-edit workflow preserves external docs and closes its real nested doc plan", async (t) => {
  const f = await fixture(t, "codex", true);
  fs.mkdirSync(path.join(f.cwd, "docs"), { recursive: true });
  const documentPath = path.join(f.cwd, "docs", "existing.md");
  fs.writeFileSync(documentPath, "# Existing\nNo new facts in the supplied fixture.\n");
  const before = fs.readFileSync(documentPath, "utf8");
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const docTemplate = path.resolve(path.dirname(knowledgeDelegateTemplatePath()), "..", "doc-updater", "TEMPLATE.json");
  const docs = (await f.executor.execute(f.identity, { operation: "subplan.create", input: { templateFile: docTemplate } })).output as any;
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  await f.executor.execute(f.identity, { operation: "plan.done", input: { retrospectiveSummary: "No affected external claims; unchanged document verified." } });
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 3 }] } });
  const done = (await f.done("succeeded")).output as any;
  assert.equal(done.delegateClosed, true, JSON.stringify(done));
  assert.equal(JSON.parse(fs.readFileSync(docs.planPath, "utf8")).status, "end.completed");
  assert.equal(fs.readFileSync(documentPath, "utf8"), before);
  assert.equal(JSON.parse(fs.readFileSync(f.root.planPath, "utf8")).status, "end.completed");
});

test("failed content is left, not falsely completed, and releases its delegate focus", async (t) => {
  const f = await fixture(t, "cindy");
  const result = (await f.done("failed")).output as any;
  assert.equal(result.delegateClosed, true);
  const child = JSON.parse(fs.readFileSync(f.child.planPath, "utf8"));
  assert.equal(child.status, "end.leave");
  assert.equal(child.tasks[0].status, "pending");
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).status, "failed");
});

test("unfinished content is not auto-completed and keeps its frozen recovery template", async (t) => {
  const f = await fixture(t, "codex");
  const result = (await f.done("succeeded")).output as any;
  assert.equal(result.delegateCloseDeferred, true);
  assert.equal(JSON.parse(fs.readFileSync(f.child.planPath, "utf8")).tasks[0].status, "pending");
  assert.equal(fs.existsSync(f.claim.templatePath), true);
});

test("terminal receipt cannot close an unrelated current plan", async (t) => {
  const f = await fixture(t, "cindy");
  await f.executor.execute(f.identity, { operation: "plan.leave", input: {} });
  const other = (await f.executor.execute(f.identity, { operation: "plan.create", input: {
    title: "Unrelated current work", goalText: "Do not close", scope: "session", knowledgeCapture: false,
  } })).output as any;
  const before = fs.readFileSync(other.planPath, "utf8");
  const result = (await f.done("failed")).output as any;
  assert.notEqual(result.delegateClosed, true);
  assert.equal(fs.readFileSync(other.planPath, "utf8"), before);
  assert.equal(resolveSessionBoundPlan(resolveSessionWorkflowContext(f.identity.agentSessionId)!, f.identity.agentSessionId), other.planPath);
});

test("a receipt for an old session delegate does not project completion onto new project work", async (t) => {
  const f = await fixture(t, "cindy");
  await f.executor.execute(f.identity, { operation: "plan.leave", input: {} });
  const other = (await f.executor.execute(f.identity, { operation: "plan.create", input: {
    title: "New project work", goalText: "Preserve project focus", scope: "project", knowledgeCapture: false,
  } })).output as any;
  const before = fs.readFileSync(other.planPath, "utf8");
  const result = (await f.done("failed")).output as any;
  assert.notEqual(result.delegateClosed, true);
  assert.equal(result.planStatus, undefined);
  assert.equal(fs.readFileSync(other.planPath, "utf8"), before);
});

test("a partial close response is not reported as a closed delegate", async (t) => {
  const f = await fixture(t, "codex");
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const service = f.executor.service as any;
  const original = service.executeCommand.bind(service);
  service.executeCommand = async (context: unknown, request: any) => {
    if (request.operation === "plan.edit" && request.input.expectedPlanPath === f.root.planPath) {
      return { output: { operationChain: { status: "partial" } } };
    }
    return original(context, request);
  };
  const result = (await f.done("succeeded")).output as any;
  assert.equal(result.delegateCloseDeferred, true);
  assert.notEqual(result.delegateClosed, true);
  assert.equal(fs.existsSync(f.claim.templatePath), true);
});

test("committed close response failure does not replay close on a repeated terminal receipt", async (t) => {
  const f = await fixture(t, "codex");
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const service = f.executor.service as any;
  const original = service.executeCommand.bind(service);
  let closes = 0;
  service.executeCommand = async (context: unknown, request: any) => {
    const result = await original(context, request);
    if (request.operation === "plan.edit" && request.input.expectedPlanPath === f.root.planPath) {
      closes++;
      throw withExecutionFailure(new Error("lost close result"), { phase: "post-commit", outcome: "unknown", effect: "committed" });
    }
    return result;
  };
  const first = (await f.done("succeeded")).output as any;
  assert.equal(first.delegateCloseDeferred, true);
  const repeated = (await f.done("succeeded")).output as any;
  assert.equal(repeated.alreadyDone, true);
  assert.equal(closes, 1);
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).attempts, 1);
});
