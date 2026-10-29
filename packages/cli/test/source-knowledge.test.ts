import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, resolveProjectContext, listKnowledgeFinalizationJobs } from "@veewo/claw-core";
import { ClawCommandService, type ClawCommandRequest } from "../dist/command-service.js";
import { SessionRegistryV2, sessionFocusKey } from "../dist/session-registry-v2.js";
import { registerReportCollector } from "../dist/report-collector-registry.js";
import { readSourceKnowledgeMaterials } from "../dist/knowledge-materials.js";

for (const host of ["codex", "cindy", "dsh"] as const) test(host + " source handoff ends through ordinary plans without knowledge jobs", async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-source-writer-"));
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
  const parent = { workdir: cwd, agentSessionId: "parent", client: { kind: "adapter" as const, host } };
  const worker = { ...parent, agentSessionId: "writer" };
  const created = await executor.execute(parent, { operation: "plan.create", input: { title: "Source", tasks: [{ title: "Implement" }] } });
  const source = (created.output as { planPath: string }).planPath;
  await executor.execute(parent, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
  const closed = await executor.execute(parent, { operation: "plan.done", input: { retrospectiveSummary: "Implemented the source task." } });
  const dispatch = closed.knowledgeDispatch;
  assert.equal(dispatch?.schemaVersion, 2);
  assert.ok(dispatch && dispatch.schemaVersion === 2);
  assert.equal(dispatch.sourceSessionKey, "parent");
  assert.equal(dispatch.sourcePlan, source);
  assert.doesNotMatch(dispatch.prompt, /knowledge[ .](claim|done)|claimToken|authenticated receipt/);
  assert.deepEqual(listKnowledgeFinalizationJobs(resolveProjectContext(cwd)), []);
  if (host !== "dsh") registerReportCollector(cwd, { schemaVersion: 1, contractVersion: 1, host, collectorVersion: "fixture",
    executable: process.execPath, args: ["-e", 'let s=""; process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);require("node:fs").writeFileSync(r.stagingReportPath,JSON.stringify({role:"user",message:"request"}))})'] });
  const materialResult = await executor.execute(worker, { operation: "knowledge.materials", input: { sourceSessionKey: "parent", sourcePlan: source } });
  const material = materialResult.output as { templatePath: string; assignmentsPath: string; conversationStatus: string; sourcePlan: { retrospective: { summary: string } } };
  assert.equal(material.sourcePlan.retrospective.summary, "Implemented the source task.");
  assert.equal(material.conversationStatus, host === "dsh" ? "host-owned" : "available");
  const auxiliary = await executor.execute(worker, { operation: "plan.create", input: { title: "Source knowledge", knowledgeCapture: false, templateFile: material.templatePath } });
  const child = await executor.execute(worker, { operation: "subplan.create", input: { parentTaskId: 1, templateFile: material.assignmentsPath } });
  const childPlan = JSON.parse(fs.readFileSync((child.output as { planPath: string }).planPath, "utf8"));
  assert.equal(childPlan.knowledgeCapture, false);
  await executor.execute(worker, { operation: "task.done", input: { tasks: childPlan.tasks.map((task: { id: number }) => ({ id: task.id })) } });
  await executor.execute(worker, { operation: "plan.done", input: { retrospectiveSummary: "No edit needed in fixture." } });
  const finished = await executor.execute(worker, { operation: "plan.done", input: { retrospectiveSummary: "Knowledge work completed." } });
  assert.equal(finished.knowledgeDispatch, undefined);
  assert.equal(JSON.parse(fs.readFileSync((auxiliary.output as { planPath: string }).planPath, "utf8")).status, "end.completed");
  assert.deepEqual(listKnowledgeFinalizationJobs(resolveProjectContext(cwd)), []);
});

test("legacy source timestamps are not invented and reader failures keep owner codes", t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-legacy-material-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  initProject({ cwd, planning: false });
  const sourcePlan = path.join(cwd, ".claw", "tasks", "legacy", "plan.json");
  fs.mkdirSync(path.dirname(sourcePlan), { recursive: true });
  fs.writeFileSync(sourcePlan, JSON.stringify({ title: "Legacy", status: "end.completed", tasks: [], updatedAt: "2020-01-01T00:00:00Z" }));
  registerReportCollector(cwd, { schemaVersion: 1, contractVersion: 1, host: "codex", collectorVersion: "fixture", executable: process.execPath,
    args: ["-e", 'process.stderr.write("warning"+String.fromCharCode(10)+JSON.stringify({error:{code:"SOURCE_SESSION_UNREADABLE",message:"read denied"}}));process.exit(1)'] });
  const material = readSourceKnowledgeMaterials({ cwd, host: "codex", sourceSessionKey: "parent", sourcePlan });
  assert.equal(material.startedAt, undefined);
  assert.equal(material.conversationStatus, "unavailable");
  assert.equal(material.diagnostic?.code, "SOURCE_SESSION_UNREADABLE");
  assert.equal(material.sourcePlan.title, "Legacy");
});
