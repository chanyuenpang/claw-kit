import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildHostPluginArtifact } from "../../../scripts/host-plugin-artifacts.mjs";

// Real installed layout + actual adapter entry. Only Host services/CLI transport
// are controlled fixtures; no live Team, profile, runtime or canonical plan writes.
test("claw_run semantic delegation owns identity, report registration and role reuse", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-role-entry-"));
  const oldHome = process.env.HOME, oldProfile = process.env.USERPROFILE, oldPath = process.env.PATH;
  process.env.HOME = path.join(root, "home"); process.env.USERPROFILE = process.env.HOME;
  await fs.mkdir(process.env.HOME, { recursive: true });
  let dispose;
  t.after(async () => {
    dispose?.();
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    if (oldProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldProfile;
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  // npm prepends workspace shims, which are deliberately not silently bypassed
  // by an installed adapter. Supply an isolated, valid CLI layout for the mock
  // transport instead of depending on whichever global CLI is on this machine.
  const bin = path.join(root, "bin");
  const cli = path.join(bin, "node_modules/@veewo/claw/dist");
  await fs.mkdir(cli, { recursive: true });
  await fs.writeFile(path.join(cli, "bin.js"), "// controlled fixture, never executed\n");
  await fs.writeFile(path.join(cli, "command-entry.js"), "// controlled fixture, never executed\n");
  if (process.platform === "win32") await fs.writeFile(path.join(bin, "claw.cmd"), "@echo off\n");
  else await fs.symlink(path.join(cli, "bin.js"), path.join(bin, "claw"));
  process.env.PATH = bin + path.delimiter + (oldPath ?? "");
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const artifact = path.join(root, "plugin");
  await buildHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot: artifact });
  const { apply } = await import(pathToFileURL(path.join(artifact, "lib/index.js")).href);
  const { DelegationReceiptStore } = await import(pathToFileURL(path.join(artifact, "lib/delegation-receipts.js")).href);
  const project = path.join(root, "project");
  const planA = path.join(project, ".claw/tasks/2026-10-01/A/plan.json");
  const planB = path.join(project, ".claw/tasks/2026-10-01/B/plan.json");
  for (const file of [planA, planB]) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, "{}\n"); }
  const parent = { id: "semantic-parent", options: { provider: "llm", model: "model", reasoningEffort: "medium" }, session: { header: { cwd: project }, append() {} } };
  const actors = new Map([[parent.id, parent]]);
  const members = [];
  const messages = [];
  const requests = [];
  const invocations = [];
  const references = new Map([[planA, []], [planB, []]]);
  let active = planA, switchBeforeEdit = false, tool;
  const immediate = value => ({ done: Promise.resolve({ exitCode: 0 }), collected: {
    stdout: { readFrom: () => ({ text: JSON.stringify(value), lossy: false }) }, stderr: { readFrom: () => ({ text: "", lossy: false }) },
  }, terminate: async () => {} });
  const subprocess = { spawn(spec) {
    invocations.push({ executable: spec.executable, argv: spec.argv });
    if (spec.argv.includes("context")) return immediate({ project: { projectRoot: project }, activeWorkflow: { planPath: active,
      planContent: { references: references.get(active) } } });
    const stdout = new Readable({ read() {} }); let end;
    const handle = { stdout, done: new Promise(resolve => { end = resolve; }), collected: {}, terminate: async () => {}, stdin: { write(line) {
      if (line.startsWith("session close")) { end({ code: 0 }); stdout.push(null); return true; }
      const request = JSON.parse(line); requests.push(request);
      assert.equal(request.operation, "plan.edit");
      if (switchBeforeEdit) { active = planB; switchBeforeEdit = false; }
      const valid = request.input.expectedPlanPath === active;
      if (valid) references.get(active).push(...request.input.operations[0].updates.references);
      const response = valid ? { ok: true, command: "plan.edit", output: { planStatus: "process.active" } }
        : { ok: false, error: { code: "PLAN_FOCUS_CHANGED", message: "focus changed" } };
      queueMicrotask(() => stdout.push(JSON.stringify(response) + "\n")); return true;
    } } };
    queueMicrotask(() => stdout.push(JSON.stringify({ ok: true, command: "session.open" }) + "\n"));
    return handle;
  } };
  const teams = {
    tryMembership: actor => actor === parent ? { root: parent, id: parent.id, role: "lead" }
      : actors.get(actor.id) === actor ? { root: parent, id: parent.id, role: "teammate" } : undefined,
    listMembers: () => members,
    async spawnTeammate(actor, request) {
      assert.equal(actor, parent);
      const member = { id: "member-" + request.name, name: request.name, role: "teammate", description: request.description,
        provider: request.provider, context: request.context, status: "inactive", diagnostics: [] };
      members.push(member);
      actors.set(member.id, { id: member.id, options: parent.options, session: { header: { cwd: project, parentSession: parent.id } } });
      return { member };
    },
    async sendMessage(actor, request) { assert.equal(actor, parent); messages.push(request); return { messageId: "receipt-" + messages.length, status: "queued" }; },
  };
  const native = { start() { throw new Error("wrong backend"); }, startContinuable() {}, sendMessage() {}, listChildren: async () => [],
    getProvider: () => ({ name: "spawn", inheritsParentContext: false, start() {}, prepareContinuable() {}, capabilities: { agentOptions: true } }) };
  const services = { subprocess, agentTeams: teams, subagents: native, agents: { get: id => actors.get(id) },
    tools: { register: definition => { if (definition.name === "claw_run") tool = definition; }, get: (name, actor) => name === "spawn_teammate" && actor === parent
      ? { parameters: { name: { type: "string" }, description: { type: "string" }, prompt: { type: "string" } } } : undefined },
    systemPrompt: { context() {}, section() {} } };
  apply({ get: name => services[name], on: (name, callback) => { if (name === "dispose") dispose = callback; } });
  const invoke = (operation, args, actor = parent, callId = "caller") => tool.execute({ operation, args }, { agent: actor, callId });
  const bad = await invoke("delegate.start", { role: "researcher", brief: "read only", host: "other" });
  assert.equal(bad.ok, false); assert.equal(members.length, 0);
  const missing = await tool.execute({ operation: "delegate.start", args: { role: "researcher", brief: "missing host id" } }, { agent: parent });
  assert.equal(missing.ok, false); assert.equal(members.length, 0);
  const first = await invoke("delegate.start", { role: "researcher", brief: "Question A", output: "reply" }, parent, "research-A");
  assert.equal(first.ok, true, JSON.stringify({ first, invocations, requests })); assert.equal(first.status, "running");
  assert.equal(members.length, 1);
  const researcher = actors.get(members[0].id);
  assert.equal((await invoke("delegate.complete", { assignment_id: first.assignment_id, status: "completed", result: "A answered" }, researcher)).ok, true);
  assert.equal((await invoke("delegate.result", { assignment_id: first.assignment_id, wait_ms: 0 })).result, "A answered");
  const next = await invoke("delegate.start", { role: "researcher", brief: "Question B", output: "reply" }, parent, "research-B");
  assert.notEqual(first.assignment_id, next.assignment_id); assert.equal(members.length, 1);
  assert.equal((await invoke("delegate.complete", { assignment_id: next.assignment_id, status: "completed", result: "B answered" }, researcher)).ok, true);
  assert.equal((await invoke("delegate.result", { assignment_id: next.assignment_id, wait_ms: 0 })).result, "B answered");
  const architecture = await invoke("delegate.start", { role: "feature-architect", brief: "Design bounded routing", output: "auto" }, parent, "architecture-A");
  assert.equal(architecture.status, "running");
  const author = actors.get(members.find(m => m.name === "claw-feature-architect").id);
  const store = new DelegationReceiptStore();
  const receipt = await store.withParent(parent.id, project, tx => tx.get(architecture.assignment_id));
  assert.ok(receipt.skillPath.startsWith(artifact.toLowerCase()) || receipt.skillPath.startsWith(artifact));
  await fs.writeFile(receipt.reportPath, "# " + path.basename(receipt.reportPath, ".md") + "\n\nDesign evidence.\n");
  assert.equal((await invoke("delegate.complete", { assignment_id: architecture.assignment_id, status: "completed", result: "ready", document_path: receipt.reportPath }, researcher)).ok, false);
  assert.equal((await invoke("delegate.complete", { assignment_id: architecture.assignment_id, status: "completed", result: "ready", document_path: receipt.reportPath }, author)).ok, true);
  const report = await invoke("delegate.result", { assignment_id: architecture.assignment_id, wait_ms: 0 });
  assert.equal(report.registration, "registered"); assert.equal(references.get(planA).length, 1);
  assert.equal(requests[0].input.expectedPlanPath, planA);
  await invoke("delegate.result", { assignment_id: architecture.assignment_id, wait_ms: 0 });
  assert.equal(references.get(planA).length, 1, "no duplicate registration on result retrieval");
  const later = await invoke("delegate.start", { role: "feature-architect", brief: "Review next change" }, parent, "architecture-B");
  const laterReceipt = await store.withParent(parent.id, project, tx => tx.get(later.assignment_id));
  await fs.writeFile(laterReceipt.reportPath, "# Review\n");
  await invoke("delegate.complete", { assignment_id: later.assignment_id, status: "completed", result: "ready", document_path: laterReceipt.reportPath }, author);
  switchBeforeEdit = true;
  const deferred = await invoke("delegate.result", { assignment_id: later.assignment_id, wait_ms: 0 });
  assert.equal(deferred.registration, "deferred");
  assert.equal(references.get(planA).length, 1); assert.equal(references.get(planB).length, 0);
  assert.equal(members.length, 2, "only the two semantic roles exist");
});
