import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { initProject, resolveProjectContext, createSessionWorkflowContext, bindSessionToPlan,
  doneKnowledgeFinalizationJob, readKnowledgeFinalizationJob, type KnowledgeFinalizationJob } from "@veewo/claw-core";
import { reserveDshFinalizerExecutionCommand, markDshFinalizerDeliveryCommand,
  inspectDshFinalizerExecutionsCommand, releaseDshFinalizerExecutionCommand } from "../dist/dsh-finalizer-execution.js";
import { claimKnowledgeCommand } from "../dist/knowledge-command.js";
import { pendingDshKnowledgeDispatches } from "../dist/knowledge-pending.js";
import { publishDshHostReport } from "../dist/dsh-host-report.js";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-execution-cli-"));
  const priorRuntime = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = path.join(root, "sessions");
  t.after(() => {
    if (priorRuntime === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR;
    else process.env.CLAW_SESSION_RUNTIME_DIR = priorRuntime;
    fs.rmSync(root, { recursive: true, force: true });
  });
  initProject({ cwd: root, projectName: "DSH Execution", planning: false });
  const project = resolveProjectContext(root);
  const parentSessionId = "trusted-parent", memberSessionId = "opaque/member/session";
  const finalizeId = "a".repeat(64), taskDir = path.join(project.tasksDir, "2026-10-01", "job");
  const jobPath = path.join(taskDir, ".runtime", "knowledge-finalization", finalizeId + ".json");
  fs.mkdirSync(path.dirname(jobPath), { recursive: true });
  const planPath = path.join(taskDir, "plan.json"), reportPath = path.join(taskDir, "plan.report");
  fs.writeFileSync(planPath, JSON.stringify({ status: "end.completed", goal: { text: "Source" }, tasks: [] }));
  fs.writeFileSync(reportPath, "");
  const endedAt = new Date(Date.now() - 5000).toISOString();
  const job: KnowledgeFinalizationJob = { schemaVersion: 1, finalizeId, projectRoot: root, sessionId: parentSessionId, host: "dsh",
    taskName: "job", planPath, reportPath, status: "queued", attempts: 0, queuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(), writer: { executionPolicy: "subagent", externalSkills: ["writer"] },
    reportCapture: { mode: "claim", status: "captured", endedAt } };
  fs.writeFileSync(jobPath, JSON.stringify(job));
  const common = { cwd: root, parentSessionId, finalizeId };
  const reserve = () => reserveDshFinalizerExecutionCommand({ ...common, route: "native-continuable", memberSessionId, provider: "spawn", configFingerprint: "frozen-config" });
  function delegate(templateId = "internal-dsh-knowledge-delegate", knowledgeCapture = false) {
    const session = createSessionWorkflowContext(root, memberSessionId);
    const pathToPlan = path.join(session.tasksDir, "delegate", "plan.json");
    fs.mkdirSync(path.dirname(pathToPlan), { recursive: true });
    fs.writeFileSync(pathToPlan, JSON.stringify({ title: "Delegate", goal: { text: "Run" }, tasks: [], status: "process.active", templateId, knowledgeCapture }));
    bindSessionToPlan(session, memberSessionId, pathToPlan);
    return pathToPlan;
  }
  return { root, project, job, jobPath, common, reserve, delegate, memberSessionId,
    claimant: { projectRoot: root, host: "dsh", agentSessionId: memberSessionId } };
}

test("canonical capture excludes later parent finals and end equality; captured receipt never recaptures", (t) => {
  const f = fixture(t);
  const startedAt = "2026-10-01T10:00:00.000Z", endedAt = "2026-10-01T10:01:00.000Z";
  fs.writeFileSync(f.jobPath, JSON.stringify({ ...f.job, reportCapture: { mode: "claim", status: "pending", startedAt, endedAt } }));
  const conclusion = JSON.stringify({ schemaVersion: 1, entryType: "task_conclusion", message: "preserve" }) + "\n";
  fs.writeFileSync(f.job.reportPath, conclusion);
  const event = (turnId: string, occurredAt: string) => ({ schemaVersion: 1, entryType: "final_answer", turnId, occurredAt, message: turnId });
  const input = { ...f.common, collectorVersion: "bounded-host-v1", events: [
    event("before", "2026-10-01T09:59:59.999Z"), event("start", startedAt),
    event("inside", "2026-10-01T10:00:30.000Z"), event("end", endedAt),
    event("later-parent-plan", "2026-10-01T10:02:00.000Z"),
  ] };
  const first = publishDshHostReport(input);
  const report = fs.readFileSync(f.job.reportPath, "utf8");
  assert.ok(report.startsWith(conclusion));
  const finals = report.trim().split("\n").map((line) => JSON.parse(line)).filter((entry) => entry.entryType === "final_answer");
  assert.deepEqual(finals.map((entry) => entry.turnId), ["start", "inside"]);
  const frozenJob = fs.readFileSync(f.jobPath, "utf8");
  const recovered = publishDshHostReport({ ...input, events: [{ schemaVersion: 1, entryType: "final_answer", turnId: "unbounded-later", message: "must not recapture" }] });
  assert.deepEqual(recovered.receipt, first.receipt);
  assert.equal(fs.readFileSync(f.job.reportPath, "utf8"), report);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), frozenJob);
});

test("bounded capture rejects missing or invalid timestamps instead of fabricating empty history", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.jobPath, JSON.stringify({ ...f.job, reportCapture: { mode: "claim", status: "pending", endedAt: f.job.queuedAt } }));
  const before = fs.readFileSync(f.jobPath, "utf8");
  const input = { ...f.common, collectorVersion: "host-v1" };
  const event = { schemaVersion: 1, entryType: "final_answer", turnId: "missing", message: "not empty" };
  assert.throws(() => publishDshHostReport({ ...input, events: [event] }), /require occurredAt/);
  assert.throws(() => publishDshHostReport({ ...input, events: [{ ...event, occurredAt: "not-a-date" }] }), /unproven final event/);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
  assert.equal(fs.readFileSync(f.job.reportPath, "utf8"), "");
  fs.writeFileSync(f.jobPath, JSON.stringify({ ...f.job, reportCapture: { mode: "claim", status: "pending", startedAt: "bad-bound", endedAt: f.job.queuedAt } }));
  assert.throws(() => publishDshHostReport({ ...input, events: [] }), /canonical capture bounds/);
});

test("legacy capture without explicit frozen bound retains untimestamped events but filters timed future finals", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.jobPath, JSON.stringify({ ...f.job, reportCapture: { mode: "claim", status: "pending" } }));
  const event = { schemaVersion: 1, entryType: "final_answer", turnId: "legacy", message: "legacy proof" };
  const before = new Date(Date.parse(f.job.queuedAt) - 1).toISOString();
  const after = new Date(Date.parse(f.job.queuedAt) + 1).toISOString();
  publishDshHostReport({ ...f.common, collectorVersion: "legacy-host", events: [event,
    { ...event, turnId: "before", occurredAt: before }, { ...event, turnId: "after", occurredAt: after }] });
  const rows = fs.readFileSync(f.job.reportPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.turnId), ["legacy", "before"]);
});

test("parent pending dispatches use queued chronology then the full finalization id", (t) => {
  const f = fixture(t);
  const earlier = new Date(Date.now() - 10000).toISOString();
  const later = new Date(Date.now() - 1000).toISOString();
  const paths = [f.jobPath];
  fs.writeFileSync(f.jobPath, JSON.stringify({ ...f.job, queuedAt: later }));
  for (const [finalizeId, queuedAt] of [["f".repeat(64), earlier], ["b".repeat(64), later]]) {
    const jobPath = path.join(path.dirname(f.jobPath), finalizeId! + ".json");
    fs.writeFileSync(jobPath, JSON.stringify({ ...f.job, finalizeId, queuedAt }));
    paths.push(jobPath);
  }
  const before = paths.map((file) => fs.readFileSync(file, "utf8"));
  const pending = pendingDshKnowledgeDispatches(f.root, f.common.parentSessionId);
  assert.deepEqual(pending.map((row) => row.finalizeId), ["f".repeat(64), "a".repeat(64), "b".repeat(64)]);
  assert.deepEqual(pending.map((row) => row.queuedAt), [earlier, later, later]);
  assert.deepEqual(paths.map((file) => fs.readFileSync(file, "utf8")), before);
});

test("private ledger facade isolates parent/member and freezes pending capture upper bound", (t) => {
  const f = fixture(t);
  assert.throws(() => reserveDshFinalizerExecutionCommand({ ...f.common, parentSessionId: "sibling", route: "team",
    teamId: "team", memberSessionId: f.memberSessionId, provider: "spawn", configFingerprint: "v1" }), /DENIED/);
  const reserved = f.reserve();
  assert.equal(reserved.execution?.deliveryKey, f.job.finalizeId);
  const pending = pendingDshKnowledgeDispatches(f.root, f.common.parentSessionId);
  assert.equal(pending[0]?.endedAt, f.job.reportCapture?.endedAt);
  assert.equal(pending[0]?.execution?.memberSessionId, f.memberSessionId);
  const before = fs.readFileSync(f.jobPath, "utf8");
  assert.equal(inspectDshFinalizerExecutionsCommand(f.common).executions.length, 1);
  assert.equal(inspectDshFinalizerExecutionsCommand({ ...f.common, parentSessionId: "other" }).executions.length, 0);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), before);
});

test("claim derives actual bound session delegate and recovers same child's original receipt", (t) => {
  const f = fixture(t); f.reserve();
  markDshFinalizerDeliveryCommand({ ...f.common, deliveryKey: f.job.finalizeId, state: "attempted" });
  assert.throws(() => claimKnowledgeCommand(f.jobPath, "v1", f.claimant), /DELEGATE_PLAN_REQUIRED/);
  f.delegate("wrong-template");
  assert.throws(() => claimKnowledgeCommand(f.jobPath, "v1", f.claimant), /DELEGATE_PLAN_REQUIRED/);
  f.delegate("internal-dsh-knowledge-delegate", true);
  assert.throws(() => claimKnowledgeCommand(f.jobPath, "v1", f.claimant), /DELEGATE_PLAN_REQUIRED/);
  const delegatePlanPath = f.delegate();
  assert.throws(() => claimKnowledgeCommand(f.jobPath, "v1", { ...f.claimant, agentSessionId: "wrong-member" }), /CLAIM_DENIED/);
  const first = claimKnowledgeCommand(f.jobPath, "v1", f.claimant) as any;
  assert.equal(first.claimed, true);
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).dshExecution?.delegatePlanPath, delegatePlanPath);
  const bytes = fs.readFileSync(f.jobPath, "utf8");
  const session = createSessionWorkflowContext(f.root, f.memberSessionId);
  const childPlan = path.join(session.tasksDir, "assignment", "plan.json");
  fs.mkdirSync(path.dirname(childPlan), { recursive: true });
  fs.writeFileSync(childPlan, JSON.stringify({ status: "process.active", templateId: "assignments", knowledgeCapture: false }));
  bindSessionToPlan(session, f.memberSessionId, childPlan);
  const repeated = claimKnowledgeCommand(f.jobPath, "new-version-must-not-change-receipt", f.claimant) as any;
  assert.deepEqual(repeated, first);
  assert.equal(fs.readFileSync(f.jobPath, "utf8"), bytes);
  doneKnowledgeFinalizationJob({ jobPath: f.jobPath, claimToken: first.claimToken, status: "succeeded", result: "done" });
  assert.equal(releaseDshFinalizerExecutionCommand({ cwd: f.root, actorSessionId: f.memberSessionId, finalizeId: f.job.finalizeId }).released, false);
  const ended = JSON.parse(fs.readFileSync(delegatePlanPath, "utf8")); ended.status = "end.completed";
  fs.writeFileSync(delegatePlanPath, JSON.stringify(ended));
  const released = releaseDshFinalizerExecutionCommand({ cwd: f.root, actorSessionId: f.memberSessionId, finalizeId: f.job.finalizeId });
  assert.equal(released.released, true);
  assert.equal(released.parentSessionId, f.common.parentSessionId);
});

test("internal CLI accepts only host-forged parent identity and dispatches full-id attempt once", (t) => {
  const f = fixture(t);
  const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: f.root, encoding: "utf8",
    env: { ...process.env, CLAW_SESSION_ID: f.common.parentSessionId, CLAW_EMBEDDING_MOCK: "1" } });
  const args = ["internal-dsh-finalizer-reserve", "--finalize-id", f.job.finalizeId, "--route", "team", "--team-id", "actual-team",
    "--member-session-id", f.memberSessionId, "--provider", "spawn", "--config-fingerprint", "config-v1"];
  const rejected = run([...args, "--parent-session-id", "spoofed-parent"]);
  assert.notEqual(rejected.status, 0);
  assert.equal(readKnowledgeFinalizationJob(f.jobPath).dshExecution, undefined);
  const reserved = run(args);
  assert.equal(reserved.status, 0, reserved.stdout + reserved.stderr);
  assert.equal(JSON.parse(reserved.stdout).execution.memberSessionId, f.memberSessionId);
  const mark = ["internal-dsh-finalizer-delivery", "--finalize-id", f.job.finalizeId, "--delivery-key", f.job.finalizeId, "--state", "attempted"];
  assert.equal(JSON.parse(run(mark).stdout).deliver, true);
  assert.equal(JSON.parse(run(mark).stdout).deliver, false);
  const inventory = run(["internal-dsh-finalizer-inspect"]);
  assert.equal(inventory.status, 0, inventory.stdout + inventory.stderr);
  assert.equal(JSON.parse(inventory.stdout).executions[0].execution.delivery.state, "attempted");
});
