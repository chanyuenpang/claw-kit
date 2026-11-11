import test, { before, after } from "node:test";
import { spawn } from "node:child_process";
import { initProject, withFileLock, resolveProjectContext, listKnowledgeFinalizationJobs, writeKnowledgeFinalizationJob } from "@veewo/claw-core";
import { openPersistentSession } from "../dist/session-command.js";
import { registerReportCollector } from "../dist/report-collector-registry.js";
import { queueCompletionRefresh, runCompletionRefresh } from "../dist/completion-refresh.js";
import { assert, fs, path, thisDir, buildSpawnEnv, createFixture, runClaw, waitForCompletionRefreshStatus } from "./cli-test-support.js";

const previousMock = process.env.CLAW_EMBEDDING_MOCK;
before(() => { process.env.CLAW_EMBEDDING_MOCK = "1"; });
after(() => { if (previousMock === undefined) delete process.env.CLAW_EMBEDDING_MOCK; else process.env.CLAW_EMBEDDING_MOCK = previousMock; });
function project(name: string) {
  const root = createFixture(name);
  initProject({ cwd: root, projectName: name, planning: false });
  const file = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.memory.embedding.enabled = true;
  fs.writeFileSync(file, JSON.stringify(config));
  return root;
}
function attempt(root: string, label: string, operations: Array<"memory.reindex.project" | "task.retention"> = ["memory.reindex.project"]) {
  return { cwd: root, taskName: label, operations,
    statusFile: path.join(root, ".claw", "logs", "completion-refresh", label + ".json") };
}
function status(file: string) { return JSON.parse(fs.readFileSync(file, "utf8")); }

test("read-only entries ignore hundreds of historical failed statuses and never multiply them", () => {
  const root = project("refresh-no-historical-recovery");
  const snapshots: Array<[string, string]> = [];
  for (const dir of ["runtime", "logs"]) {
    const target = path.join(root, ".claw", dir, "completion-refresh");
    fs.mkdirSync(target, { recursive: true });
    for (let i = 0; i < 100; i++) {
      const file = path.join(target, i + ".json");
      const bytes = i % 2 ? "invalid old diagnostic" : JSON.stringify({ ok: false, cwd: root, taskName: "old-task", operations: ["memory.reindex.project"] });
      fs.writeFileSync(file, bytes); snapshots.push([file, bytes]);
    }
  }
  for (let i = 0; i < 3; i++) runClaw(["context"], root, { CLAW_EMBEDDING_MOCK: "1" });
  for (const [file, bytes] of snapshots) assert.equal(fs.readFileSync(file, "utf8"), bytes);
  for (const dir of ["runtime", "logs"]) assert.equal(fs.readdirSync(path.join(root, ".claw", dir, "completion-refresh")).length, 100);
  assert.equal(fs.existsSync(path.join(root, ".claw", "memory.sqlite")), false);
});

test("busy refresh skips only that opportunity and the next independent opportunity succeeds", () => {
  const root = project("refresh-busy-opportunity");
  const first = attempt(root, "busy");
  withFileLock(path.join(root, ".claw", "runtime", "completion-refresh", "worker"), () => runCompletionRefresh(first));
  assert.equal(status(first.statusFile).skipped, "busy");
  assert.equal(fs.existsSync(path.join(root, ".claw", "memory.sqlite")), false);
  const second = attempt(root, "later");
  runCompletionRefresh(second);
  assert.equal(status(second.statusFile).ok, true);
  assert.ok(status(second.statusFile).memory.project);
  assert.equal(status(first.statusFile).skipped, "busy", "old log is not retried or rewritten");
});

test("one maintenance operation failing neither blocks another operation nor poisons future opportunities", () => {
  const root = project("refresh-failure-isolation");
  const database = path.join(root, ".claw", "memory.sqlite");
  fs.mkdirSync(database);
  const failed = attempt(root, "failed", ["memory.reindex.project", "task.retention"]);
  runCompletionRefresh(failed);
  const failure = status(failed.statusFile);
  assert.equal(failure.ok, false);
  assert.equal(failure.failures[0].operation, "memory.reindex.project");
  assert.ok(failure.taskRetention, "independent retention still ran");
  fs.rmdirSync(database);
  const later = attempt(root, "later");
  runCompletionRefresh(later);
  assert.equal(status(later.statusFile).ok, true);
  assert.equal(status(failed.statusFile).ok, false, "failed attempt is diagnostic history, not a retry request");
});

test("existing old-protocol occupancy only skips optional maintenance and is never deleted", () => {
  const root = project("refresh-legacy-occupancy");
  const lock = path.join(root, ".claw", "logs", "completion-refresh", "inflight.lock");
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, "state.json"), "old worker state");
  const input = attempt(root, "legacy");
  runCompletionRefresh(input);
  assert.equal(status(input.statusFile).skipped, "legacy_refresh");
  assert.equal(fs.readFileSync(path.join(lock, "state.json"), "utf8"), "old worker state");
  runClaw(["context"], root);
});

test("current disabled embedding switch remains authoritative for a newly launched attempt", () => {
  const root = project("refresh-current-switch");
  fs.writeFileSync(path.join(root, ".claw", "project-override.json"), JSON.stringify({ memory: { embedding: { enabled: false } } }));
  const store = path.join(root, ".claw", "memory.sqlite");
  fs.writeFileSync(store, "previous bytes");
  const input = attempt(root, "disabled");
  runCompletionRefresh(input);
  assert.equal(status(input.statusFile).memory.project.skipped, "embedding_disabled");
  assert.equal(fs.readFileSync(store, "utf8"), "previous bytes");
});

test("one-shot mutation replies survive captured stdout and open stdin without a recovery worker", async () => {
  const root = project("refresh one-shot & spaces");
  const command = (operation: string, input: object) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(thisDir, "..", "dist", "bin.js"), "internal-command"], {
      cwd: root, env: buildSpawnEnv({ CLAW_SESSION_ID: "refresh-one-shot", CLAW_EMBEDDING_MOCK: "1" }),
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 15_000,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject); child.stdin.on("error", reject);
    child.on("close", code => {
      try { assert.equal(code, 0, stderr); const reply = JSON.parse(stdout); assert.equal(reply.ok, true, stdout); assert.equal(reply.command, operation); resolve(); }
      catch (error) { reject(error); }
    });
    child.stdin.write(JSON.stringify({ operation, input }) + "\n");
  });
  await command("plan.create", { taskName: "one-shot", title: "One-shot", knowledgeCapture: false });
  await command("task.done", { tasks: [{ id: 1 }] });
  const logs = path.join(root, ".claw", "logs", "completion-refresh");
  assert.equal(fs.existsSync(logs), false, "nonterminal mutations do not launch historical maintenance");
  await command("plan.done", { retrospectiveSummary: "Complete" });
  const files = fs.readdirSync(logs).filter(file => file.endsWith(".json"));
  assert.equal(files.length, 1);
  const finished = await waitForCompletionRefreshStatus(path.join(logs, files[0]!), 30_000);
  assert.equal(finished.ok, true, JSON.stringify(finished));
  assert.ok(finished.memory);
  assert.equal(fs.readdirSync(path.join(root, ".claw", "runtime", "completion-refresh")).some(file => file.endsWith(".json")), false);
});

test("a new explicit opportunity refreshes current state without durable completion receipts", async () => {
  const root = project("refresh-independent-opportunities");
  for (let i = 0; i < 2; i++) {
    fs.writeFileSync(path.join(root, ".claw", "truth", "project.md"), "Current content " + i);
    const result = queueCompletionRefresh({ cwd: root, taskName: "direct-" + i, includeTaskRetention: false });
    assert.equal(result.asyncRefresh.queued, true, JSON.stringify(result));
    const done = await waitForCompletionRefreshStatus(result.asyncRefresh.statusFile, 30_000);
    assert.equal(done.ok, true, JSON.stringify(done)); assert.ok(done.memory);
  }
});

test("diagnostic write failure does not gate maintenance or a later attempt", () => {
  const root = project("refresh-diagnostic-isolation");
  const input = attempt(root, "unwritable-log");
  fs.mkdirSync(input.statusFile, { recursive: true });
  runCompletionRefresh(input);
  assert.equal(fs.existsSync(path.join(root, ".claw", "memory.sqlite")), true);
  const later = attempt(root, "later-log"); runCompletionRefresh(later);
  assert.equal(status(later.statusFile).ok, true);
});

test("a failed preparation is reported without throwing or suppressing the next opportunity", async () => {
  const absent = createFixture("not-a-project");
  const failed = queueCompletionRefresh({ cwd: absent, taskName: "missing" });
  assert.equal(failed.asyncRefresh.queued, false); assert.ok(failed.asyncRefresh.error?.code);
  const root = project("refresh-after-preparation-failure");
  const later = queueCompletionRefresh({ cwd: root, taskName: "later", includeTaskRetention: false });
  assert.equal(later.asyncRefresh.queued, true);
  assert.equal((await waitForCompletionRefreshStatus(later.asyncRefresh.statusFile, 30_000)).ok, true);
});

test("first legacy knowledge completion gets a fresh opportunity while repeated completion creates no recovery work", async () => {
  const root = project("refresh-legacy-knowledge-opportunity");
  const configPath = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.knowledgeWriter.executionPolicy = "subagent"; config.memory.externalDocPaths = ["docs"];
  fs.writeFileSync(configPath, JSON.stringify(config));
  fs.mkdirSync(path.join(root, "docs"));
  const handbook = path.join(root, "docs", "handbook.md"); fs.writeFileSync(handbook, "External documentation");
  const collector = path.join(root, "collector.cjs");
  fs.writeFileSync(collector, 'const fs = require("node:fs"); const r = JSON.parse(fs.readFileSync(0, "utf8")); fs.writeFileSync(r.stagingReportPath, "evidence");');
  registerReportCollector(root, { schemaVersion: 1, contractVersion: 1, host: "cindy", collectorVersion: "fixture", executable: process.execPath, args: [collector] });
  const session = await openPersistentSession({ runtimeRoot: createFixture("legacy-knowledge-runtime"), workdir: root,
    agentSessionId: "refresh-agent", host: "cindy", clientKind: "adapter" });
  try {
    const created = await session.execute({ operation: "plan.create", input: { taskName: "refresh-plan", title: "Refresh plan" } });
    const ended = await session.execute({ operation: "plan.done", input: { retrospectiveSummary: "Complete" } });
    assert.equal((ended.knowledgeDispatch as { schemaVersion: number }).schemaVersion, 2);
    assert.deepEqual(listKnowledgeFinalizationJobs(resolveProjectContext(root)), []);
    const logDir = path.join(root, ".claw", "logs", "completion-refresh");
    for (const name of fs.readdirSync(logDir).filter(file => file.endsWith(".json"))) await waitForCompletionRefreshStatus(path.join(logDir, name), 30_000);
    const finalizeId = "d".repeat(64);
    const planPath = (created.output as { planPath: string }).planPath;
    const jobPath = path.join(path.dirname(planPath), ".runtime", "knowledge-finalization", finalizeId + ".json");
    writeKnowledgeFinalizationJob(jobPath, { schemaVersion: 1, finalizeId, host: "cindy", sessionId: "refresh-agent",
      projectRoot: root, taskName: "refresh-plan", planPath, reportPath: path.join(path.dirname(planPath), "plan.report"),
      status: "queued", attempts: 0, queuedAt: new Date().toISOString(), writer: { externalSkills: [] },
      docUpdate: { externalDocPaths: ["docs"] }, reportCapture: { mode: "claim", status: "pending", endedAt: new Date().toISOString() } });
    const claim = (await session.execute({ operation: "knowledge.claim", input: { finalizeId } })).output as { claimToken: string };
    fs.writeFileSync(handbook, "Updated external documentation");
    fs.writeFileSync(path.join(root, ".claw", "truth", "project.md"), "Newly deposited knowledge");
    const input = { finalizeId, claimToken: claim.claimToken, status: "succeeded" as const, result: "Deposited" };
    await session.execute({ operation: "knowledge.done", input });
    const knowledgeLog = fs.readdirSync(logDir).map(name => path.join(logDir, name))
      .find(file => file.endsWith(".json") && status(file).taskName === "knowledge-complete");
    assert.ok(knowledgeLog);
    const completed = await waitForCompletionRefreshStatus(knowledgeLog, 30_000);
    assert.equal(completed.ok, true, JSON.stringify(completed));
    assert.deepEqual(completed.operations, ["memory.reindex.project"]);
    const before = fs.readFileSync(jobPath, "utf8"); const count = fs.readdirSync(logDir).length;
    const repeated = await session.execute({ operation: "knowledge.done", input });
    assert.equal((repeated.output as { alreadyDone: boolean }).alreadyDone, true);
    assert.equal(fs.readdirSync(logDir).length, count);
    assert.equal(fs.readFileSync(jobPath, "utf8"), before);
    assert.equal(fs.readFileSync(handbook, "utf8"), "Updated external documentation");
  } finally { await session.close(); }
});
