import test from "node:test";
import { initProject, readKnowledgeFinalizationJob, writeKnowledgeFinalizationJob, listKnowledgeFinalizationJobs, resolveProjectContext } from "@veewo/claw-core";
import { ClawCommandService } from "../dist/command-service.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";
import { pendingDshKnowledgeDispatches } from "../dist/knowledge-pending.js";
import { assert, fs, path, createFixture, runClaw } from "./cli-test-support.js";

test("explicit legacy inventory finds only its own queued DSH job without replaying a new source end", async () => {
  const root = createFixture("queued-dsh-dispatch");
  initProject({ cwd: root, projectName: "Queued Dispatch", planning: false });
  const configPath = path.join(root, ".claw", "project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.knowledgeWriter.executionPolicy = "subagent";
  fs.writeFileSync(configPath, JSON.stringify(config));
  const registry = new SessionRegistryV2(createFixture("queued-dispatch-runtime"));
  const opened = await registry.open("parent-session", root, { kind: "adapter", host: "dsh" });
  const context = { cwd: opened.identity.canonicalWorkdir, agentSessionId: opened.identity.agentSessionId,
    sessionKey: sessionFocusKey(opened.identity), host: "dsh", mode: "session" as const };
  const service = new ClawCommandService(registry);
  await service.execute(context, { operation: "plan.create", input: { taskName: "recover-dispatch", title: "Recover dispatch" } });
  const terminal = await service.execute(context, { operation: "plan.done", input: { retrospectiveSummary: "Queued writer." } });
  assert.equal(terminal.knowledgeDispatch?.schemaVersion, 2);
  assert.deepEqual(listKnowledgeFinalizationJobs(resolveProjectContext(root)), []);
  const id = "a".repeat(64);
  const planPath = (terminal.output as { planPath: string }).planPath;
  const jobPath = path.join(path.dirname(planPath), ".runtime", "knowledge-finalization", id + ".json");
  writeKnowledgeFinalizationJob(jobPath, { schemaVersion: 1, finalizeId: id, host: "dsh", sessionId: "parent-session",
    projectRoot: root, taskName: "recover-dispatch", planPath, reportPath: path.join(path.dirname(planPath), "plan.report"),
    status: "queued", attempts: 0, queuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    reportCapture: { mode: "claim", status: "pending", endedAt: new Date().toISOString() },
  });
  const before = fs.readFileSync(jobPath, "utf8");
  assert.deepEqual(pendingDshKnowledgeDispatches(root, "other-parent"), []);
  const pending = pendingDshKnowledgeDispatches(root, "parent-session");
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.finalizeId, id);
  assert.deepEqual((runClaw(["internal-knowledge-pending"], root, { CLAW_SESSION_ID: "parent-session" }).dispatches as Array<{ finalizeId: string }>).map((entry) => entry.finalizeId), [id]);
  assert.equal(fs.readFileSync(jobPath, "utf8"), before, "discovery cannot rewrite job state");
  const background = readKnowledgeFinalizationJob(jobPath);
  background.writer = { ...background.writer,  };
  fs.writeFileSync(jobPath, JSON.stringify(background));
  assert.equal(pendingDshKnowledgeDispatches(root, "parent-session").length, 1, "background also uses the native DSH writer");
  const expired = { ...background, expiresAt: "2000-01-01T00:00:00.000Z" };
  fs.writeFileSync(jobPath, JSON.stringify(expired));
  assert.deepEqual(pendingDshKnowledgeDispatches(root, "parent-session"), []);
});
