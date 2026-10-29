import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, resolveProjectContext, reconcileKnowledgeFinalizationJobs } from "@veewo/claw-core";
import { ClawCommandService, type ClawCommandRequest } from "../dist/command-service.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";
import { readSourceKnowledgeMaterials } from "../dist/knowledge-materials.js";

// New native sessions have no claim workflow. Explicit legacy owner behavior is
// covered by knowledge-completion-outcome and dsh-finalizer-execution fixtures.
for (const host of ["dsh", "codex", "cindy"] as const) test(host + " leaves old unknown jobs untouched when new source work closes", async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-source-isolation-"));
  const originalCwd = process.cwd();
  const prior = process.env.CLAW_SESSION_RUNTIME_DIR;
  process.env.CLAW_SESSION_RUNTIME_DIR = path.join(cwd, "sessions");
  t.after(() => { process.chdir(originalCwd); if (prior === undefined) delete process.env.CLAW_SESSION_RUNTIME_DIR; else process.env.CLAW_SESSION_RUNTIME_DIR = prior; fs.rmSync(cwd, { recursive: true, force: true }); });
  initProject({ cwd, planning: false });
  const registry = new SessionRegistryV2();
  const service = new ClawCommandService(registry, () => {}); // no unrelated maintenance workers in this slice
  const executor = { execute: async (actor: { agentSessionId: string; workdir: string; client: { kind: "adapter"; host: string } }, request: ClawCommandRequest) => {
    const opened = await registry.open(actor.agentSessionId, actor.workdir, actor.client);
    return service.execute({ cwd: actor.workdir, agentSessionId: actor.agentSessionId, host: actor.client.host,
      sessionKey: sessionFocusKey(opened.identity), mode: "session" }, request);
  } };
  const actor = { workdir: cwd, agentSessionId: "parent", client: { kind: "adapter" as const, host } };
  const created = await executor.execute(actor, { operation: "plan.create", input: { title: "Source" } });
  const sourcePlan = (created.output as { planPath: string }).planPath;
  const id = "a".repeat(64), oldPath = path.join(path.dirname(sourcePlan), ".runtime", "knowledge-finalization", id + ".json");
  fs.mkdirSync(path.dirname(oldPath), { recursive: true });
  const old = JSON.stringify({ schemaVersion: 1, finalizeId: id, sessionId: "old-parent", projectRoot: cwd,
    taskName: "Source", host, planPath: sourcePlan, reportPath: sourcePlan + ".report", status: "running", attempts: 1,
    queuedAt: "2000-01-01T00:00:00Z", expiresAt: "2000-01-02T00:00:00Z", claimToken: "old-unknown" });
  fs.writeFileSync(oldPath, old);
  const done = await executor.execute(actor, { operation: "plan.done", input: { retrospectiveSummary: "Source is complete." } });
  assert.equal(done.knowledgeDispatch?.schemaVersion, 2);
  assert.deepEqual(reconcileKnowledgeFinalizationJobs(resolveProjectContext(cwd)), { checked: 0, failed: 0 });
  assert.equal(fs.readFileSync(oldPath, "utf8"), old);
  const material = readSourceKnowledgeMaterials({ cwd, host, sourceSessionKey: "parent", sourcePlan });
  assert.equal(material.sourcePlan.retrospective?.summary, "Source is complete.");
  assert.equal(material.conversationStatus, host === "dsh" ? "host-owned" : "unavailable");
  assert.equal(fs.readFileSync(oldPath, "utf8"), old);
  assert.throws(() => readSourceKnowledgeMaterials({ cwd, host, sourceSessionKey: "parent", sourcePlan: path.join(cwd, "outside.json") }), { code: "KNOWLEDGE_SOURCE_OUTSIDE_PROJECT" });
});
