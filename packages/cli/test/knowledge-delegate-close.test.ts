import { runTaskLifecycleMaintenance } from "../../core/dist/src/task-lifecycle.js";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, knowledgeDelegateTemplatePath, readKnowledgeFinalizationJob,
  enforceTaskRetention, resolveProjectContext, resolveSessionWorkflowContext, resolveSessionBoundPlan, writePlan, inspectDshFinalizerExecutions, withExecutionFailure, type KnowledgeFinalizationJob } from "@veewo/claw-core";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { SessionRegistryV2 } from "../dist/session-registry-v2.js";
import { reserveDshFinalizerExecutionCommand, markDshFinalizerDeliveryCommand, releaseDshFinalizerExecutionCommand } from "../dist/dsh-finalizer-execution.js";

type Host = "codex" | "cindy" | "dsh" | "opencode";
async function fixture(t: TestContext, host: Host, options: { builtin?: boolean; legacy?: boolean; templateId?: string } = {}) {
  const { builtin = false, legacy = false, templateId } = options;
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
  let templateFile = host === "cindy" || host === "dsh"
    ? path.resolve(path.dirname(knowledgeDelegateTemplatePath()), "..", host + "-delegate-writer", "TEMPLATE.json")
    : knowledgeDelegateTemplatePath();
  if (templateId) {
    const template = JSON.parse(fs.readFileSync(templateFile, "utf8")); template.id = templateId;
    templateFile = path.join(cwd, "custom-delegate.json"); fs.writeFileSync(templateFile, JSON.stringify(template));
  }
  const root = legacy
    ? await writePlan({ cwd, ownerSessionKey: actor, host, title: "Owned delegate", templateFile, forcePlanning: true, scope: "session", knowledgeCapture: false })
    : (await executor.execute(identity, { operation: "plan.create", input: { title: "Owned delegate", templateFile, forcePlanning: true } })).output as any;
  if (legacy) await executor.open(identity);
  const claim = (await executor.execute(identity, { operation: "knowledge.claim", input: { finalizeId } })).output as any;
  assert.equal(claim.claimed, true);
  assert.equal(readKnowledgeFinalizationJob(jobPath).delegateWorkflow?.planPath, root.planPath);
  if (legacy) {
    // Fixture bytes representing an already-claimed pre-upgrade job/receipt.
    const old = readKnowledgeFinalizationJob(jobPath); delete old.delegateWorkflow!.scope;
    if (old.claimReceipt) old.claimReceipt.template.scope = "session";
    fs.writeFileSync(jobPath, JSON.stringify(old));
    const assignment = JSON.parse(fs.readFileSync(claim.templatePath, "utf8")); assignment.scope = "session";
    fs.writeFileSync(claim.templatePath, JSON.stringify(assignment, null, 2) + "\n");
  }
  await executor.execute(identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const child = (await executor.execute(identity, { operation: "subplan.create", input: { templateFile: claim.templatePath } })).output as any;
  const done = (status: "succeeded" | "failed") => executor.execute(identity, { operation: "knowledge.done", input: {
    finalizeId, status, ...(status === "succeeded" ? { result: "Fixture result" } : { error: "Remaining conflict" }),
  } });
  const workflow = legacy ? resolveSessionWorkflowContext(actor)! : resolveProjectContext(cwd);
  return { cwd, executor, identity, root, child, claim, jobPath, done, workflow };
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
    assert.equal(resolveSessionBoundPlan(f.workflow, f.identity.agentSessionId), null);
    assert.equal(fs.existsSync(f.claim.templatePath), false);
  });
}

test("legacy session delegate and frozen receipt resume without creating a replacement", async (t) => {
  const f = await fixture(t, "dsh", { legacy: true });
  const before = fs.readFileSync(f.jobPath, "utf8");
  const receipt = (await f.executor.execute(f.identity, { operation: "knowledge.claim.receipt", input: { finalizeId: "a".repeat(64) } })).output as any;
  assert.equal(receipt.claimToken, f.claim.claimToken);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).claimReceipt?.template.scope, "session");
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const result = (await f.done("succeeded")).output as any;
  assert.equal(result.delegateClosed, true, JSON.stringify(result));
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).attempts, 1);
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).delegateWorkflow?.scope, undefined);
});

test("canonical admitted identity, not a template label, owns claim and release", async (t) => {
  const f = await fixture(t, "dsh", { templateId: "renamed-auxiliary-template" });
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  assert.equal((await f.done("succeeded")).output && readKnowledgeFinalizationJob(f.jobPath).status, "succeeded");
  const [row] = inspectDshFinalizerExecutions({ project: resolveProjectContext(f.cwd), parentSessionId: "parent", finalizeId: "a".repeat(64) });
  assert.equal(row?.readyForNext, true);
});

test("unreleased finalizer evidence survives archive and expiration until canonical release", async (t) => {
  const f = await fixture(t, "dsh");
  await f.executor.execute(f.identity, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  await f.done("succeeded");
  const project = resolveProjectContext(f.cwd);
  const now = Date.now() + 40 * 86400000;
  enforceTaskRetention(project, undefined, now);
  runTaskLifecycleMaintenance(project, new Date(now));
  assert.ok(fs.existsSync(f.root.planPath), "delegate proof must remain until release");
  assert.ok(fs.existsSync(f.jobPath), "the source job is the only lease ledger");
  const old = readKnowledgeFinalizationJob(f.jobPath);
  assert.equal(releaseDshFinalizerExecutionCommand({ cwd: f.cwd, actorSessionId: f.identity.agentSessionId, finalizeId: old.finalizeId }).released, true);
  enforceTaskRetention(project, undefined, now);
  assert.equal(fs.existsSync(f.root.planPath), false, "protection must end after release");
  const nextId = "b".repeat(64);
  const nextPath = path.join(project.tasksDir, "next", ".runtime", "knowledge-finalization", nextId + ".json");
  const next = { ...old, finalizeId: nextId, status: "queued", expiresAt: new Date(Date.now() + 120000).toISOString() } as any;
  delete next.dshExecution; delete next.delegateWorkflow; delete next.claimReceipt; delete next.claimToken;
  fs.mkdirSync(path.dirname(nextPath), { recursive: true }); fs.writeFileSync(nextPath, JSON.stringify(next));
  const admitted = reserveDshFinalizerExecutionCommand({ cwd: f.cwd, parentSessionId: "parent", finalizeId: nextId,
    route: "native-continuable", memberSessionId: f.identity.agentSessionId, provider: "spawn", configFingerprint: "test" });
  assert.equal(admitted.admitted, true);
});

test("temporarily left parent with a running child cannot release the finalizer role", async (t) => {
  const f = await fixture(t, "dsh");
  const result = (await f.done("succeeded")).output as any;
  assert.equal(result.delegateCloseDeferred, true);
  const [row] = inspectDshFinalizerExecutions({ project: resolveProjectContext(f.cwd), parentSessionId: "parent", finalizeId: "a".repeat(64) });
  assert.equal(row?.delegatePlanStatus, "end.leave");
  assert.equal(row?.readyForNext, false);
});

test("built-in no-edit workflow preserves external docs and closes its real nested doc plan", async (t) => {
  const f = await fixture(t, "codex", { builtin: true });
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
    title: "Unrelated current work", goalText: "Do not close", knowledgeCapture: false,
  } })).output as any;
  const before = fs.readFileSync(other.planPath, "utf8");
  const result = (await f.done("failed")).output as any;
  assert.notEqual(result.delegateClosed, true);
  assert.equal(fs.readFileSync(other.planPath, "utf8"), before);
  assert.equal(resolveSessionBoundPlan(f.workflow, f.identity.agentSessionId), other.planPath);
});

test("a receipt for an old session delegate does not project completion onto new project work", async (t) => {
  const f = await fixture(t, "cindy", { legacy: true });
  await f.executor.execute(f.identity, { operation: "plan.leave", input: {} });
  const other = (await f.executor.execute(f.identity, { operation: "plan.create", input: {
    title: "New project work", goalText: "Preserve project focus", knowledgeCapture: false,
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
