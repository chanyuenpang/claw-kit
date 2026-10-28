import test, { before, after } from "node:test";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { ClawClient } from "@veewo/claw-client";
import { initProject, writePlan, editPlan, showPlan, resolveProjectContext, listKnowledgeFinalizationJobs,
  readKnowledgeFinalizationJob } from "@veewo/claw-core";
import { startSessionDaemon } from "../dist/session-daemon.js";
import { registerReportCollector } from "../dist/report-collector-registry.js";
import { reconcileCompletionRefresh } from "../dist/completion-refresh-recovery.js";
import { runCompletionRefresh } from "../dist/completion-refresh.js";
import { assert, fs, path, thisDir, buildSpawnEnv, createFixture, runClaw, waitForCompletionRefreshStatus, waitForCondition, type JsonRecord } from "./cli-test-support.js";

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
  assert.ok(status.finishedAt, "the real refresh runner, not a queued envelope, completed");
  if ((status.operations as string[]).includes("memory.reindex.project")) {
    assert.ok((status.memory as { project?: unknown })?.project);
  }
  return status;
}
async function idle(root: string) {
  await waitForCondition(() => !fs.existsSync(path.join(root, ".claw", "logs", "completion-refresh", "inflight.lock")), 30_000);
}
function project(name: string) {
  const root = createFixture(name);
  initProject({ cwd: root, projectName: name, planning: false });
  const configPath = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.memory.embedding.enabled = true;
  fs.writeFileSync(configPath, JSON.stringify(config));
  return root;
}

for (const embeddingEnabled of [false, true]) test(`daemon finalization preserves external documents with embedding enabled=${embeddingEnabled}`, async () => {
  const root = project("refresh space & args " + embeddingEnabled);
  const configPath = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.knowledgeWriter.executionPolicy = "subagent";
  config.memory.embedding.enabled = embeddingEnabled;
  config.memory.externalDocPaths = ["docs"];
  fs.mkdirSync(path.join(root, "docs"));
  const handbook = path.join(root, "docs", "handbook.md");
  fs.writeFileSync(handbook, "Previous external documentation.");
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
    // Canonical response precedes maintenance; wait for the real recovery worker.
    await waitForCondition(() => receipts(root).length === 1, 30_000);
    await settled(receipts(root)[0]!);
    await idle(root);
    const jobPath = listKnowledgeFinalizationJobs(resolveProjectContext(root))[0]!;
    const job = readKnowledgeFinalizationJob(jobPath);
    assert.deepEqual(job.docUpdate, { externalDocPaths: ["docs"] });
    const claim = await session.command({ operation: "knowledge.claim", input: { finalizeId: job.finalizeId } }) as { claimToken: string };
    fs.writeFileSync(path.join(root, ".claw", "truth", "project.md"), "Knowledge deposited after plan refresh.");
    // Simulate completion of the unchanged writer assignment, not merely dispatch.
    fs.writeFileSync(handbook, "Updated external documentation after canonical knowledge.");
    const input = { finalizeId: job.finalizeId, claimToken: claim.claimToken, status: "succeeded" as const, result: "Deposited" };
    await session.command({ operation: "knowledge.done", input });
    const knowledgeReceipt = path.join(receiptDir(root), createHash("sha256").update("knowledge:" + job.finalizeId).digest("hex") + ".json");
    const status = await settled(knowledgeReceipt);
    assert.deepEqual(status.operations, embeddingEnabled ? ["memory.reindex.project"] : []);
    assert.equal(fs.readFileSync(handbook, "utf8"), "Updated external documentation after canonical knowledge.");
    assert.equal(fs.existsSync(path.join(root, ".claw", "memory.sqlite")), embeddingEnabled);
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

test("one-shot mutation replies survive background recovery with captured stdout and open stdin", async () => {
  const root = project("refresh one-shot & spaces");
  const command = (operation: string, input: object) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(thisDir, "..", "dist", "bin.js"), "internal-command"], {
      cwd: root, env: buildSpawnEnv({ CLAW_SESSION_ID: "refresh-one-shot", CLAW_EMBEDDING_MOCK: "1" }),
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 15_000,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", (code) => {
      try {
        assert.equal(code, 0, stderr);
        const reply = JSON.parse(stdout);
        assert.equal(reply.ok, true, stdout);
        assert.equal(reply.command, operation);
        resolve();
      } catch (error) { reject(error); }
    });
    // Match the adapter: it sends a line, not EOF, and waits for process exit.
    child.stdin.write(JSON.stringify({ operation, input }) + "\n");
  });
  await command("plan.create", { taskName: "one-shot", title: "One-shot", goalText: "Reply once", knowledgeCapture: false });
  await command("task.done", { tasks: [{ id: 1 }] });
  assert.equal(showPlan({ cwd: root, taskName: "one-shot" }).plan.tasks[0]?.status, "done");
  await command("plan.done", { retrospectiveSummary: "Complete" });
  await waitForCondition(() => receipts(root).length === 1, 30_000);
  await settled(receipts(root)[0]!);
  await idle(root);
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

test("old queued vector refresh respects the current disabled switch without touching the database", async () => {
  const root = project("old-embedding-queue");
  fs.writeFileSync(path.join(root, ".claw", "project-override.json"), JSON.stringify({ memory: { embedding: { enabled: false } } }));
  const storePath = path.join(root, ".claw", "memory.sqlite");
  fs.writeFileSync(storePath, "previous database bytes");
  const file = path.join(receiptDir(root), "old-queue.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ok: true, queued: true, cwd: root, taskName: "orphan",
    startedAt: "2000-01-01T00:00:00.000Z", operations: ["memory.reindex.project"] }));
  const flight = path.join(root, ".claw", "logs", "completion-refresh", "inflight.lock");
  fs.mkdirSync(flight, { recursive: true });
  fs.writeFileSync(path.join(flight, "state.json"), JSON.stringify({ schemaVersion: 1,
    queuedAt: "2000-01-01T00:00:00.000Z", leaderStatusFile: file, statusFiles: [file],
    requestedDirtyHash: "old", operations: ["memory.reindex.project"] }));
  runCompletionRefresh({ cwd: root, taskName: "orphan", statusFile: file });
  const status = await settled(file);
  assert.equal(((status.memory as JsonRecord).project as JsonRecord).skipped, "embedding_disabled");
  assert.equal(fs.readFileSync(storePath, "utf8"), "previous database bytes");
  await idle(root);
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
