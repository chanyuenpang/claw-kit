import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, findKnowledgeFinalizationJobPath, resolveProjectContext } from "@veewo/claw-core";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SessionCommandExecutor } from "../dist/session-command.js";
import { decodeClawCommand } from "../dist/command-contract.js";
import { ClawCommandService } from "../dist/command-service.js";
import { registerReportCollector } from "../dist/report-collector-registry.js";
import { publishDshHostReport } from "../dist/dsh-host-report.js";
import { recordDshFinalizerIssue, listDshFinalizerAlerts } from "../dist/dsh-finalizer-diagnostics.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";

function fixture(name: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-session-knowledge-" + name + "-"));
  initProject({ cwd: root, projectName: name, planning: false });
  const configPath = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.knowledgeWriter.executionPolicy = "subagent";
  fs.writeFileSync(configPath, JSON.stringify(config));
  return root;
}

test("session knowledge claim captures once and done shares CLI terminal behavior within its project", async () => {
  const root = fixture("owner");
  const other = fixture("other");
  const collector = path.join(root, "collector.cjs");
  fs.writeFileSync(collector, [
    'const fs = require("node:fs");',
    'const request = JSON.parse(fs.readFileSync(0, "utf8"));',
    'fs.writeFileSync(request.stagingReportPath, "captured\\n");',
  ].join("\n"));
  registerReportCollector(root, {
    schemaVersion: 1, contractVersion: 1, host: "cindy", collectorVersion: "fixture-v1",
    executable: process.execPath, args: [collector],
  });
  const registry = new SessionRegistryV2(fs.mkdtempSync(path.join(os.tmpdir(), "claw-knowledge-registry-")));
  const opened = await registry.open("knowledge-owner", root, { kind: "node" });
  const context = { cwd: opened.identity.canonicalWorkdir, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), host: "cindy", mode: "session" as const };
  const service = new ClawCommandService(registry);
  await service.execute(context, { operation: "plan.create", input: { taskName: "knowledge-task", title: "Knowledge task", goalText: "Capture" } });
  const ended = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Captured." } });
  const id = (ended.knowledgeDispatch as { finalizeId: string }).finalizeId;
  assert.match(id, /^[a-f0-9]{64}$/);
  await assert.rejects(() => service.execute({ ...context, cwd: other }, { operation: "knowledge.claim", input: { finalizeId: id } }), /unavailable/);
  await assert.rejects(() => service.execute(context, { operation: "knowledge.claim", input: { finalizeId: "../" } }), /64-character hexadecimal/);
  const claim = (await service.execute(context, { operation: "knowledge.claim", input: { finalizeId: id } })).output as Record<string, any>;
  assert.equal(claim.claimed, true);
  assert.equal(claim.assignments.length > 0, true);
  assert.equal(JSON.parse(fs.readFileSync(claim.templatePath, "utf8")).scope, "session");
  assert.equal(fs.readFileSync(claim.reportPath, "utf8"), "captured\n");
  assert.equal((JSON.parse(fs.readFileSync(claim.jobPath, "utf8")).reportCapture.receipt as Record<string, unknown>).collectorVersion, "fixture-v1");
  assert.equal(((await service.execute(context, { operation: "knowledge.claim", input: { finalizeId: id } })).output as any).claimed, false);
  await assert.rejects(() => service.execute(context, { operation: "knowledge.done", input: { finalizeId: id, claimToken: "wrong", status: "succeeded", result: "Done" } }), /active claim/);
  const input = { finalizeId: id, claimToken: claim.claimToken, status: "succeeded" as const, result: "Done" };
  const result = (await service.execute(context, { operation: "knowledge.done", input })).output as any;
  assert.equal(result.completed, true);
  assert.equal(result.alreadyDone, false);
  assert.equal(fs.existsSync(claim.templatePath), false);
  assert.equal((JSON.parse(fs.readFileSync(claim.jobPath, "utf8")) as any).finalResponse, "Done");
  assert.equal(((await service.execute(context, { operation: "knowledge.done", input })).output as any).alreadyDone, true);
  await service.execute(context, { operation: "plan.create", input: { taskName: "failed-task", title: "Failed task", goalText: "Fail" } });
  const failedEnd = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Ready." } });
  const failedId = (failedEnd.knowledgeDispatch as { finalizeId: string }).finalizeId;
  const failedClaim = (await service.execute(context, { operation: "knowledge.claim", input: { finalizeId: failedId } })).output as any;
  await assert.rejects(() => service.execute({ ...context, cwd: other }, {
    operation: "knowledge.done", input: { finalizeId: failedId, claimToken: failedClaim.claimToken, status: "failed", error: "Unavailable" },
  }), /unavailable/);
  const failedInput = { finalizeId: failedId, claimToken: failedClaim.claimToken, status: "failed" as const, error: "Writer failed" };
  assert.equal(((await service.execute(context, { operation: "knowledge.done", input: failedInput })).output as any).failed, true);
  assert.equal(((await service.execute(context, { operation: "knowledge.done", input: failedInput })).output as any).alreadyDone, true);
  assert.equal((JSON.parse(fs.readFileSync(failedClaim.jobPath, "utf8")) as any).error.message, "Writer failed");
});

test("DSH writer claims after the live Host proves empty final history", async () => {
  const root = fixture("dsh-no-report-journal");
  const registry = new SessionRegistryV2(fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-no-journal-registry-")));
  const opened = await registry.open("dsh-no-report-owner", root, { kind: "adapter", host: "dsh" });
  const context = { cwd: opened.identity.canonicalWorkdir, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), host: "dsh", mode: "session" as const };
  const service = new ClawCommandService(registry);
  await service.execute(context, { operation: "plan.create", input: { taskName: "optional-evidence", title: "Optional evidence" } });
  const end = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Keep the writer running." } });
  const finalizeId = (end.knowledgeDispatch as { finalizeId: string }).finalizeId;
  const capture = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/bin.js", import.meta.url)),
    "internal-dsh-host-report-capture", "--finalize-id", finalizeId, "--collector-version", "desktop-v1"], {
    cwd: root, encoding: "utf8", input: JSON.stringify({ events: [] }),
    env: { ...process.env, CLAW_SESSION_ID: context.agentSessionId, CLAW_EMBEDDING_MOCK: "1" },
  });
  assert.equal(capture.status, 0, capture.stdout + capture.stderr);
  assert.equal(JSON.parse(capture.stdout.trim()).captured, true);
  const child = { ...context, agentSessionId: "dsh-no-report-child" };
  const claim = (await service.execute(child, { operation: "knowledge.claim", input: { finalizeId } })).output as any;
  assert.equal(claim.claimed, true);
  assert.ok(claim.assignments.length > 0);
  assert.equal(JSON.parse(fs.readFileSync(claim.jobPath, "utf8")).reportCapture.status, "captured");
  const done = (await service.execute(context, { operation: "knowledge.done", input: {
    finalizeId, claimToken: claim.claimToken, status: "succeeded", result: "Deposited from available plan evidence."
  } })).output as any;
  assert.equal(done.completed, true);
  assert.equal(JSON.parse(fs.readFileSync(claim.jobPath, "utf8")).status, "succeeded");
  assert.doesNotMatch(fs.readFileSync(claim.reportPath, "utf8"), /"entryType":"final_answer"/);
});

test("live DSH report capture preserves conclusions and is idempotent per parent", async () => {
  const root = fixture("dsh-parent-capture");
  const registry = new SessionRegistryV2(fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-parent-capture-")));
  const opened = await registry.open("dsh-capture-owner", root, { kind: "adapter", host: "dsh" });
  const context = { cwd: root, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), host: "dsh", mode: "session" as const };
  const service = new ClawCommandService(registry);
  await service.execute(context, { operation: "plan.create", input: { taskName: "parent-capture", title: "Parent capture" } });
  const end = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Complete." } });
  const finalizeId = end.knowledgeDispatch!.finalizeId;
  const jobPath = findKnowledgeFinalizationJobPath(resolveProjectContext(root), finalizeId)!;
  const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
  const conclusion = JSON.stringify({ schemaVersion: 1, entryType: "task_conclusion", message: "keep" }) + "\n";
  fs.writeFileSync(job.reportPath, conclusion);
  const event = { schemaVersion: 1, entryType: "final_answer", turnId: "2", message: "proven" };
  assert.throws(() => publishDshHostReport({ cwd: root, parentSessionId: "untrusted-sibling", finalizeId,
    collectorVersion: "desktop-v1", events: [event] }), /DENIED/);
  assert.equal(JSON.parse(fs.readFileSync(jobPath, "utf8")).attempts, 0);
  const first = publishDshHostReport({ cwd: root, parentSessionId: context.agentSessionId, finalizeId,
    collectorVersion: "desktop-v1", events: [event] });
  const second = publishDshHostReport({ cwd: root, parentSessionId: context.agentSessionId, finalizeId,
    collectorVersion: "desktop-v1", events: [event] });
  assert.equal(first.receipt?.captureId, second.receipt?.captureId);
  assert.equal(fs.readFileSync(job.reportPath, "utf8"), conclusion + JSON.stringify(event) + "\n");
});

test("DSH parent sees bounded errors, and successful capture clears stale warning", async () => {
  const root = fixture("dsh-error-report");
  const registry = new SessionRegistryV2(fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-error-registry-")));
  const opened = await registry.open("dsh-error-owner", root, { kind: "adapter", host: "dsh" });
  const context = { cwd: root, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), host: "dsh", mode: "session" as const };
  const service = new ClawCommandService(registry);
  await service.execute(context, { operation: "plan.create", input: { taskName: "error-report", title: "Error report" } });
  const end = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Complete." } });
  const finalizeId = end.knowledgeDispatch!.finalizeId;
  const failure = { cwd: root, parentSessionId: context.agentSessionId, finalizeId,
    phase: "capture" as const, code: "DSH_REPORT_HOST_UNAVAILABLE", correlationId: "attempt-1" };
  const issue = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/bin.js", import.meta.url)),
    "internal-dsh-finalizer-issue", "--finalize-id", finalizeId, "--phase", "capture",
    "--code", failure.code, "--correlation-id", failure.correlationId], {
    cwd: root, encoding: "utf8", env: { ...process.env, CLAW_SESSION_ID: context.agentSessionId },
  });
  assert.equal(issue.status, 0, issue.stdout + issue.stderr);
  recordDshFinalizerIssue(failure);
  const inventory = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/bin.js", import.meta.url)),
    "internal-dsh-finalizer-alerts"], { cwd: root, encoding: "utf8",
    env: { ...process.env, CLAW_SESSION_ID: context.agentSessionId } });
  assert.equal(inventory.status, 0, inventory.stdout + inventory.stderr);
  assert.equal(JSON.parse(inventory.stdout.trim()).alerts[0].code, failure.code);
  let alerts = listDshFinalizerAlerts(root, context.agentSessionId);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.count, 1);
  recordDshFinalizerIssue({ ...failure, correlationId: "attempt-2" });
  alerts = listDshFinalizerAlerts(root, context.agentSessionId);
  assert.equal(alerts[0]?.count, 2);
  assert.equal(alerts[0]?.code, "DSH_REPORT_HOST_UNAVAILABLE");
  assert.match(alerts[0]?.nextAction ?? "", /Restore desktop parent-session history/);
  assert.ok(!JSON.stringify(alerts).includes("plan.report"));
  assert.deepEqual(listDshFinalizerAlerts(root, "unrelated-parent"), []);
  publishDshHostReport({ cwd: root, parentSessionId: context.agentSessionId, finalizeId,
    collectorVersion: "desktop-v1", events: [] });
  assert.deepEqual(listDshFinalizerAlerts(root, context.agentSessionId), []);
  const claim = (await service.execute({ ...context, agentSessionId: "error-writer" },
    { operation: "knowledge.claim", input: { finalizeId } })).output as any;
  await service.execute(context, { operation: "knowledge.done", input: {
    finalizeId, claimToken: claim.claimToken, status: "failed", error: "contains private path C:\\secret" } });
  alerts = listDshFinalizerAlerts(root, context.agentSessionId);
  assert.equal(alerts[0]?.code, "KNOWLEDGE_WRITER_FAILED");
  assert.ok(!JSON.stringify(alerts).includes("secret"));
});

test("DSH ignores obsolete executable collectors but requires a live Host receipt", async () => {
  const root = fixture("dsh-corrupt-evidence");
  const failingCollector = path.join(root, "broken-collector.cjs");
  fs.writeFileSync(failingCollector, "process.exit(1);");
  registerReportCollector(root, { schemaVersion: 1, contractVersion: 1, host: "dsh",
    collectorVersion: "broken", executable: process.execPath, args: [failingCollector] });
  const registry = new SessionRegistryV2(fs.mkdtempSync(path.join(os.tmpdir(), "claw-dsh-corrupt-registry-")));
  const opened = await registry.open("dsh-corrupt-owner", root, { kind: "adapter", host: "dsh" });
  const context = { cwd: opened.identity.canonicalWorkdir, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), host: "dsh", mode: "session" as const };
  const service = new ClawCommandService(registry);
  await service.execute(context, { operation: "plan.create", input: { taskName: "corrupt-evidence", title: "Corrupt evidence" } });
  const end = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Collector failure must be explicit." } });
  const finalizeId = (end.knowledgeDispatch as { finalizeId: string }).finalizeId;
  await assert.rejects(() => service.execute({ ...context, agentSessionId: "dsh-corrupt-child" },
    { operation: "knowledge.claim", input: { finalizeId } }), /DSH_REPORT_CAPTURE_REQUIRED/);
  const jobPath = findKnowledgeFinalizationJobPath(resolveProjectContext(root), finalizeId)!;
  assert.equal(JSON.parse(fs.readFileSync(jobPath, "utf8")).attempts, 0);
  publishDshHostReport({ cwd: root, parentSessionId: context.agentSessionId, finalizeId,
    collectorVersion: "desktop-v1", events: [] });
  const claim = (await service.execute({ ...context, agentSessionId: "dsh-corrupt-child" },
    { operation: "knowledge.claim", input: { finalizeId } })).output as any;
  assert.equal(claim.claimed, true);
});

test("lost DSH claim response reattaches only the same child through shared daemon and CLI service routes", async () => {
  const root = fixture("dsh-receipt");
  const collector = path.join(root, "receipt-collector.cjs");
  const countPath = path.join(root, "collection-count.txt");
  fs.writeFileSync(collector, [
    'const fs = require("node:fs");',
    'const request = JSON.parse(fs.readFileSync(0, "utf8"));',
    'fs.appendFileSync(' + JSON.stringify(countPath) + ', "1");',
    'fs.writeFileSync(request.stagingReportPath, "captured\\n");',
  ].join("\n"));
  registerReportCollector(root, { schemaVersion: 1, contractVersion: 1, host: "dsh",
    collectorVersion: "fixture-v1", executable: process.execPath, args: [collector] });
  const registry = new SessionRegistryV2(fs.mkdtempSync(path.join(os.tmpdir(), "claw-receipt-registry-")));
  const executor = new SessionCommandExecutor(registry);
  const parent = { agentSessionId: "receipt-parent", workdir: root, client: { kind: "adapter" as const, host: "dsh" } };
  const child = { ...parent, agentSessionId: "receipt-child" };
  await executor.execute(parent, { operation: "plan.create", input: { taskName: "receipt-task", title: "Receipt" } });
  const end = await executor.execute(parent, { operation: "plan.done", input: { retrospectiveSummary: "Ready" } });
  const finalizeId = end.knowledgeDispatch!.finalizeId;
  publishDshHostReport({ cwd: root, parentSessionId: parent.agentSessionId, finalizeId,
    collectorVersion: "desktop-v1", events: [] });
  const claimRequest = { operation: "knowledge.claim", input: { finalizeId } };
  const receiptRequest = { operation: "knowledge.claim.receipt", input: { finalizeId } };
  const jobPath = findKnowledgeFinalizationJobPath(resolveProjectContext(root), finalizeId)!;
  // The first claim response is deliberately discarded, as if transport lost it.
  await executor.execute(child, claimRequest);
  const committed = fs.readFileSync(jobPath, "utf8");
  const frozen = JSON.parse(committed);
  const templatePath = path.join(path.dirname(jobPath), finalizeId + ".assignments.json");
  const template = fs.readFileSync(templatePath, "utf8");
  assert.equal(frozen.claimReceipt.agentSessionId, child.agentSessionId);
  assert.equal(frozen.sessionId, parent.agentSessionId);
  fs.rmSync(templatePath);
  const native = (await executor.execute(child, receiptRequest)).output as any;
  assert.equal(native.claimed, true);
  assert.equal(native.claimToken, frozen.claimToken);
  assert.deepEqual(native.assignments, frozen.claimReceipt.assignments);
  assert.equal(fs.readFileSync(templatePath, "utf8"), template);
  // Same typed request enters via the trusted one-shot CLI transport.
  fs.rmSync(templatePath);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/bin.js", import.meta.url)), "internal-command"], {
    cwd: root, encoding: "utf8", input: JSON.stringify(receiptRequest) + "\n",
    env: { ...process.env, CLAW_SESSION_ID: child.agentSessionId, CLAW_EMBEDDING_MOCK: "1" },
  });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  const baseline = JSON.parse(cli.stdout.trim()).output;
  assert.deepEqual(baseline, native);
  assert.equal(fs.readFileSync(templatePath, "utf8"), template);
  assert.equal(fs.readFileSync(jobPath, "utf8"), committed);
  assert.equal(fs.existsSync(countPath), false, "stale executable collector was never invoked");
  assert.equal(JSON.parse(committed).attempts, 1);
  assert.equal(((await executor.execute(child, claimRequest)).output as any).claimed, false);
  assert.equal(fs.existsSync(countPath), false, "stale executable collector was never invoked");

  await assert.rejects(() => executor.execute(parent, receiptRequest), /trusted DSH child/);
  await assert.rejects(() => executor.execute({ ...child, client: { kind: "adapter", host: "cindy" } }, receiptRequest), /trusted DSH child/);
  await assert.rejects(() => executor.execute({ ...child, workdir: fixture("wrong-receipt-project") }, receiptRequest), /unavailable/);
  for (const agentSessionId of ["sibling", "replacement"]) {
    const denied = (await executor.execute({ ...child, agentSessionId }, receiptRequest)).output as any;
    assert.deepEqual(denied, { ok: true, command: "knowledge.claim.receipt", claimed: false });
  }
  assert.throws(() => decodeClawCommand({ ...receiptRequest, input: { finalizeId, agentSessionId: child.agentSessionId } }), /Invalid or unsupported/);
  assert.equal(fs.readFileSync(jobPath, "utf8"), committed);

  await executor.execute(child, { operation: "knowledge.done", input: { finalizeId, claimToken: native.claimToken, status: "failed", error: "test complete" } });
  const terminal = fs.readFileSync(jobPath, "utf8");
  assert.equal(((await executor.execute(child, receiptRequest)).output as any).claimed, false);
  assert.equal(fs.readFileSync(jobPath, "utf8"), terminal);
  assert.equal(fs.existsSync(templatePath), false);
});
