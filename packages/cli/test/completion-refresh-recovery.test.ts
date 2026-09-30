import test, { before, after } from "node:test";
import { createHash } from "node:crypto";
import { ClawClient } from "@veewo/claw-client";
import { initProject, writePlan, editPlan, showPlan, resolveProjectContext, listKnowledgeFinalizationJobs,
  readKnowledgeFinalizationJob } from "@veewo/claw-core";
import { startSessionDaemon } from "../dist/session-daemon.js";
import { registerReportCollector } from "../dist/report-collector-registry.js";
import { reconcileCompletionRefresh } from "../dist/completion-refresh-recovery.js";
import { assert, fs, path, createFixture, runClaw, waitForCompletionRefreshStatus, waitForCondition } from "./cli-test-support.js";

const previousMock = process.env.CLAW_EMBEDDING_MOCK;
before(() => { process.env.CLAW_EMBEDDING_MOCK = "1"; });
after(() => { if (previousMock === undefined) delete process.env.CLAW_EMBEDDING_MOCK; else process.env.CLAW_EMBEDDING_MOCK = previousMock; });
function receiptDir(root: string) { return path.join(root, ".claw", "runtime", "completion-refresh"); }
function receipts(root: string): string[] {
  const dir = receiptDir(root);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => path.join(dir, file)) : [];
}
async function settled(file: string) {
  const status = await waitForCompletionRefreshStatus(file, 30_000);
  assert.equal(status.ok, true, JSON.stringify(status));
  assert.ok((status.memory as { project?: unknown })?.project, "the actual indexing runner, not an envelope, completed");
  return status;
}
async function idle(root: string) {
  await waitForCondition(() => !fs.existsSync(path.join(root, ".claw", "logs", "completion-refresh", "inflight.lock")), 30_000);
}
function project(name: string) {
  const root = createFixture(name);
  initProject({ cwd: root, projectName: name, planning: false });
  return root;
}

test("daemon terminal and successful knowledge.done execute the real refresh worker automatically", async () => {
  const root = project("refresh space & args");
  const configPath = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.knowledgeWriter.executionPolicy = "subagent";
  fs.writeFileSync(configPath, JSON.stringify(config));
  const collector = path.join(root, "collector.cjs");
  fs.writeFileSync(collector, 'const fs = require("node:fs"); const r = JSON.parse(fs.readFileSync(0, "utf8")); fs.writeFileSync(r.stagingReportPath, "evidence");');
  registerReportCollector(root, { schemaVersion: 1, contractVersion: 1, host: "cindy", collectorVersion: "fixture", executable: process.execPath, args: [collector] });
  const runtimeRoot = createFixture("refresh-daemon-runtime");
  const daemon = await startSessionDaemon({ runtimeRoot, idleTtlMs: 0 });
  const session = await new ClawClient({ runtimeRoot, host: "cindy", clientKind: "adapter" }).open("refresh-agent", root);
  try {
    await session.command({ operation: "plan.create", input: { taskName: "refresh-plan", title: "Refresh plan" } });
    await session.command({ operation: "plan.done", input: { retrospectiveSummary: "Complete" } });
    assert.equal(receipts(root).length, 1);
    await settled(receipts(root)[0]!);
    await idle(root);
    const jobPath = listKnowledgeFinalizationJobs(resolveProjectContext(root))[0]!;
    const job = readKnowledgeFinalizationJob(jobPath);
    const claim = await session.command({ operation: "knowledge.claim", input: { finalizeId: job.finalizeId } }) as { claimToken: string };
    fs.writeFileSync(path.join(root, ".claw", "memory.md"), "Knowledge deposited after plan refresh.");
    const input = { finalizeId: job.finalizeId, claimToken: claim.claimToken, status: "succeeded" as const, result: "Deposited" };
    await session.command({ operation: "knowledge.done", input });
    const knowledgeReceipt = path.join(receiptDir(root), createHash("sha256").update("knowledge:" + job.finalizeId).digest("hex") + ".json");
    const status = await settled(knowledgeReceipt);
    assert.deepEqual(status.operations, ["memory.reindex.project"]);
    await idle(root);
    const before = fs.readFileSync(jobPath, "utf8");
    // Simulate lost intent after the canonical successful commit, without replaying assignments.
    fs.unlinkSync(knowledgeReceipt);
    const repeated = await session.command({ operation: "knowledge.done", input }) as { alreadyDone: boolean };
    assert.equal(repeated.alreadyDone, true);
    await settled(knowledgeReceipt);
    await idle(root);
    assert.equal(fs.readFileSync(jobPath, "utf8"), before);
    const receiptBefore = fs.readFileSync(knowledgeReceipt, "utf8");
    fs.rmSync(path.join(root, ".claw", "logs", "completion-refresh"), { recursive: true, force: true });
    assert.deepEqual(reconcileCompletionRefresh(root), []);
    assert.equal(fs.readFileSync(knowledgeReceipt, "utf8"), receiptBefore, "log cleanup does not erase terminal acknowledgement");
  } finally { await session.close(); await daemon.close(); }
});

test("terminal plan commit without intent recovers through stateless CLI context without domain replay", async () => {
  const root = project("refresh-crash-gap");
  await writePlan({ cwd: root, taskName: "crashed", title: "Crashed", goalText: "Recover" });
  await editPlan({ cwd: root, taskName: "crashed", operations: [{ type: "plan.status", status: "end.closed" }] });
  const shown = showPlan({ cwd: root, taskName: "crashed" });
  const before = fs.readFileSync(shown.planPath, "utf8");
  assert.equal(receipts(root).length, 0);
  runClaw(["context"], root, { CLAW_EMBEDDING_MOCK: "1" });
  assert.equal(receipts(root).length, 1);
  await settled(receipts(root)[0]!);
  await idle(root);
  assert.equal(fs.readFileSync(shown.planPath, "utf8"), before);
  const receipt = fs.readFileSync(receipts(root)[0]!, "utf8");
  assert.deepEqual(reconcileCompletionRefresh(root), []);
  assert.equal(fs.readFileSync(receipts(root)[0]!, "utf8"), receipt);
});

test("orphan queued, interrupted running, and failed refresh statuses resume actual indexing", async () => {
  for (const phase of ["queued", "queued-flight", "running", "failed"] as const) {
    const root = project("refresh-recover-" + phase);
    const file = path.join(receiptDir(root), phase + ".json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ok: phase !== "failed", [phase]: true, cwd: root, taskName: "orphan",
      startedAt: "2000-01-01T00:00:00.000Z", operations: ["memory.reindex.project"],
      ...(phase === "failed" ? { finishedAt: "2000-01-01T00:00:01.000Z", error: { message: "interrupted" } } : {}) }));
    if (phase === "running" || phase === "queued-flight") {
      const flight = path.join(root, ".claw", "logs", "completion-refresh", "inflight.lock");
      fs.mkdirSync(flight, { recursive: true });
      fs.writeFileSync(path.join(flight, "state.json"), JSON.stringify({ schemaVersion: 1, ...(phase === "running" ? { pid: 2147483647 } : {}),
        queuedAt: "2000-01-01T00:00:00.000Z", leaderStatusFile: file, statusFiles: [file],
        requestedDirtyHash: "old", operations: ["memory.reindex.project"] }));
    }
    reconcileCompletionRefresh(root);
    await settled(file);
    await idle(root);
    assert.deepEqual(reconcileCompletionRefresh(root), []);
  }
});
