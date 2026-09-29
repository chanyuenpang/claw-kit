import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject } from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { registerReportCollector } from "../dist/report-collector-registry.js";
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
