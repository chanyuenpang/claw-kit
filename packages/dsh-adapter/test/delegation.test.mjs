import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const moduleUrl = (code) => "data:text/javascript;base64," + Buffer.from(code).toString("base64");
async function compile(file, imports = {}) {
  const source = await fs.readFile(new URL("../src/" + file, import.meta.url), "utf8");
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  for (const [name, target] of Object.entries(imports)) code = code.replaceAll('"' + name + '"', '"' + target + '"');
  return moduleUrl(code);
}
const capability = await compile("team-capability.ts");
const receipts = await compile("delegation-receipts.ts");
const { RoleDelegation } = await import(await compile("delegation.ts", { "./team-capability.js": capability, "./delegation-receipts.js": receipts }));
const copy = (v) => v === undefined ? undefined : structuredClone(v);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

class MemoryReceipts {
  data = new Map(); tail = Promise.resolve(); locked = false; writes = 0;
  withParent(parent, workdir, callback) {
    const run = this.tail.then(async () => {
      this.locked = true;
      const prefix = parent + ":" + workdir + ":";
      try { return await callback({
        get: async (id) => copy(this.data.get(prefix + id)),
        list: async () => [...this.data].filter(([key]) => key.startsWith(prefix)).map(([, value]) => copy(value)),
        put: async (id, value) => { this.writes++; this.data.set(prefix + id, copy(value)); },
      }); } finally { this.locked = false; }
    });
    this.tail = run.catch(() => undefined); return run;
  }
  receipt(id) { return copy([...this.data.values()].find((r) => r.id === id)); }
}
const params = (...names) => Object.fromEntries(names.map((name) => [name, { type: "string" }]));

async function fixture(t, backend = "team") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-delegation-test-"));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const workdir = path.join(root, "project"); await fs.mkdir(workdir);
  const skillRoot = path.join(root, "installed", "skills");
  for (const role of ["researcher", "feature-architecture"]) {
    await fs.mkdir(path.join(skillRoot, role), { recursive: true });
    await fs.writeFile(path.join(skillRoot, role, "SKILL.md"), "# installed " + role);
  }
  const planPath = path.join(workdir, ".claw", "tasks", "active", "plan.json");
  await fs.mkdir(path.dirname(planPath), { recursive: true }); await fs.writeFile(planPath, "{}");
  const store = new MemoryReceipts();
  const parent = { id: "parent", options: { model: "m", reasoningEffort: "high" }, session: { header: { cwd: workdir } } };
  const actors = new Map([[parent.id, parent]]);
  const members = []; const children = []; const runs = [];
  const state = { context: { activeWorkflow: { planPath } }, starts: 0, sends: 0, registrations: 0, onSend: undefined, onStart: undefined, messages: [] };
  const outsideLock = () => assert.equal(store.locked, false, "external IO must not run under receipt lock");
  const child = (id) => { const actor = { id, options: parent.options, session: { header: { cwd: workdir, parentSession: parent.id } } }; actors.set(id, actor); return actor; };
  const provider = { name: "spawn", inheritsParentContext: false, capabilities: { agentOptions: true }, start() {}, ...(backend !== "one-shot" ? { prepareContinuable() {} } : {}) };
  const services = {
    tools: { get(name, actor) { assert.equal(actor, parent); return backend === "team" && name === "spawn_teammate" ? { parameters: params("name", "description", "prompt") } : undefined; } },
    subagents: {
      getProvider(name) { return name === "spawn" ? provider : undefined; },
      async listChildren(id) { outsideLock(); assert.equal(id, parent.id); return copy(children); },
      async startContinuable(spec) {
        outsideLock(); state.starts++; child(spec.childId);
        children.push({ kind: "child", id: spec.childId, label: spec.label, mode: "continuable", activity: "inactive", provider: "spawn" });
        return { childId: spec.childId, messageId: "bootstrap" };
      },
      async sendMessage(actor, id, content) {
        outsideLock(); assert.equal(actor, parent); state.sends++; state.messages.push(content[0].text);
        await state.onSend?.(actors.get(id), content[0].text); return "native-message-" + state.sends;
      },
      async start(name, request) {
        outsideLock(); assert.equal(name, "spawn"); state.starts++;
        const actor = child("actual-session-" + state.starts);
        children.push({ kind: "child", id: actor.id, label: request.label, provider: "spawn", mode: "one-shot" });
        const result = deferred(); runs.push(result);
        await state.onStart?.(actor, request.prompt[0].text);
        return { id: "opaque-run-" + state.starts, result: result.promise, dispose() {} };
      },
    },
    agentTeams: {
      tryMembership(actor) { return actor === parent ? { id: parent.id, root: parent, role: "lead" } : members.some((m) => m.id === actor.id) ? { id: parent.id, root: parent, role: "teammate" } : undefined; },
      listMembers(actor) { outsideLock(); assert.equal(actor, parent); return copy(members); },
      async spawnTeammate(actor, request) {
        outsideLock(); assert.equal(actor, parent); state.starts++;
        const member = { id: "team-child-" + state.starts, name: request.name, description: request.description, role: "teammate", status: "inactive", provider: request.provider, context: request.context, diagnostics: [] };
        members.push(member); child(member.id); return { member: copy(member) };
      },
      async sendMessage(actor, request) {
        outsideLock(); assert.equal(actor, parent); state.sends++; state.messages.push(request.content[0].text);
        const target = members.find((m) => m.name === request.target);
        await state.onSend?.(actors.get(target.id), request.content[0].text);
        return { messageId: "team-message-" + state.sends, status: "queued" };
      },
    },
  };
  const dependencies = {
    receipts: store, skillRoot, getService: (name) => services[name],
    resolveParent(actor) { assert.equal(actors.get(actor.id), actor, "exact host actor required"); return actor === parent ? parent : actor.session.header.parentSession === parent.id ? parent : undefined; },
    async readContext() { outsideLock(); return copy(state.context); },
    async registerReport(actor, captured, document) {
      outsideLock(); assert.equal(actor, parent); assert.equal(captured, state.context.activeWorkflow.planPath);
      assert.equal(path.dirname(document), path.join(path.dirname(captured), "feature-architecture"));
      state.registrations++; return { status: "registered" };
    },
  };
  const api = new RoleDelegation(dependencies);
  return { root, workdir, skillRoot, planPath, store, parent, actors, child, members, children, runs, state, services, dependencies, api };
}
const idFromPrompt = (prompt) => /claw-role-assignment:v1:([a-f0-9]{64})/.exec(prompt)[1];
async function finish(f, id, extra = {}) {
  const r = f.store.receipt(id);
  const actor = f.actors.get(r.memberId ?? f.children.find((c) => c.label === r.label)?.id);
  return f.api.complete(actor, f.workdir, { assignment_id: id, status: "completed", result: "answered with evidence", ...extra });
}

test("same host call is idempotent; new queued invocation reuses role, never old result", async (t) => {
  const f = await fixture(t);
  const [a, duplicate] = await Promise.all([f.api.start(f.parent, f.workdir, "call-a", { role: "researcher", brief: "bounded question" }), f.api.start(f.parent, f.workdir, "call-a", { role: "researcher", brief: "bounded question" })]);
  assert.equal(a.assignment_id, duplicate.assignment_id); assert.equal(f.state.starts, 1); assert.equal(f.state.sends, 1);
  const b = await f.api.start(f.parent, f.workdir, "call-b", { role: "researcher", brief: "next question" });
  assert.notEqual(a.assignment_id, b.assignment_id); assert.equal(b.status, "pending"); assert.equal(f.state.sends, 1);
  assert.equal((await finish(f, a.assignment_id)).status, "completed");
  const current = await f.api.result(f.parent, f.workdir, { assignment_id: b.assignment_id, wait_ms: 0 });
  assert.equal(current.status, "running"); assert.equal(current.result, undefined); assert.equal(f.state.starts, 1); assert.equal(f.state.sends, 2);
  await finish(f, b.assignment_id, { result: "second evidence" });
  assert.equal((await f.api.start(f.parent, f.workdir, "call-a", { role: "researcher", brief: "bounded question" })).result, "answered with evidence");
  assert.equal((await f.api.start(f.parent, f.workdir, "call-a", { role: "researcher", brief: "changed" })).code, "DELEGATE_CALL_ID_CONFLICT");
});

test("completion racing send acknowledgment is not overwritten", async (t) => {
  const f = await fixture(t);
  f.state.onSend = async (actor, prompt) => { const done = await f.api.complete(actor, f.workdir, { assignment_id: idFromPrompt(prompt), status: "completed", result: "finished before ack" }); assert.equal(done.status, "completed"); };
  const result = await f.api.start(f.parent, f.workdir, "race", { role: "researcher", brief: "q" });
  assert.equal(result.status, "completed"); assert.equal(result.result, "finished before ack");
  assert.equal(f.store.receipt(result.assignment_id).delivery, "accepted");
});

test("unknown delivery is pinned across reconstruction and blocks only its role", async (t) => {
  const f = await fixture(t);
  f.state.onSend = () => { throw new Error("acknowledgment lost"); };
  const a = await f.api.start(f.parent, f.workdir, "unknown", { role: "researcher", brief: "q" });
  assert.equal(a.status, "unknown");
  f.api = new RoleDelegation(f.dependencies);
  assert.equal((await f.api.start(f.parent, f.workdir, "unknown", { role: "researcher", brief: "q" })).status, "unknown");
  const b = await f.api.start(f.parent, f.workdir, "later", { role: "researcher", brief: "later q" });
  assert.equal(b.status, "pending"); assert.equal(f.state.sends, 1);
  assert.equal((await f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 0 })).status, "unknown");
});

test("invalid and foreign calls never mutate receipts or dispatch", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.api.start(f.parent, f.workdir, "invalid", { role: "researcher", brief: "q", provider: "fork" })).ok, false);
  assert.equal((await f.api.start(f.parent, f.workdir, "invalid", { role: "researcher", brief: "q", output: "report" })).code, "DELEGATE_RESEARCHER_REPLY_ONLY");
  assert.equal(f.store.writes, 0); assert.equal(f.state.starts, 0);
  const a = await f.api.start(f.parent, f.workdir, "valid", { role: "researcher", brief: "q" });
  const foreign = f.child("unassigned"); const before = f.store.writes;
  assert.equal((await f.api.complete(foreign, f.workdir, { assignment_id: a.assignment_id, status: "completed", result: "spoof" })).code, "DELEGATE_FOREIGN_WORKER");
  assert.equal((await f.api.result(f.parent, f.workdir, { assignment_id: "f".repeat(64), wait_ms: 0 })).code, "DELEGATE_ASSIGNMENT_NOT_FOUND");
  assert.equal((await finish(f, a.assignment_id, { status: "unresolved" })).code, "DELEGATE_COMPLETION_STATUS_INVALID");
  assert.equal((await finish(f, a.assignment_id, { document_path: "file.md" })).code, "DELEGATE_REPLY_FORBIDS_FILES");
  assert.equal(f.store.writes, before);
});

test("researcher auto never creates report artifacts and missing installed skills do not fall back", async (t) => {
  const f = await fixture(t);
  const a = await f.api.start(f.parent, f.workdir, "read", { role: "researcher", brief: "q" });
  assert.equal(a.output, "reply"); await assert.rejects(fs.access(path.join(path.dirname(f.planPath), "feature-architecture")));
  const absent = new RoleDelegation({ ...f.dependencies, skillRoot: path.join(f.root, "missing-skills") });
  assert.equal((await absent.start(f.parent, f.workdir, "absent", { role: "feature-architect", brief: "q", output: "reply" })).ok, false);
  assert.equal(f.state.starts, 1);
});

test("architect report is exact, scoped and registered only against its captured current plan", async (t) => {
  const f = await fixture(t);
  const a = await f.api.start(f.parent, f.workdir, "report", { role: "feature-architect", brief: "design boundary" });
  const r = f.store.receipt(a.assignment_id); assert.equal(a.output, "report");
  const other = path.join(f.workdir, "unrelated.md"); await fs.writeFile(other, "other");
  const before = f.store.writes;
  assert.equal((await finish(f, a.assignment_id, { document_path: other })).code, "DELEGATE_REPORT_PATH_INVALID"); assert.equal(f.store.writes, before);
  await fs.writeFile(r.reportPath, "# report");
  assert.equal((await finish(f, a.assignment_id, { document_path: r.reportPath })).status, "completed");
  f.state.context.activeWorkflow.planPath = path.join(f.workdir, "other-plan.json");
  assert.equal((await f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 0 })).registration, "deferred"); assert.equal(f.state.registrations, 0);
  f.state.context.activeWorkflow.planPath = f.planPath;
  const results = await Promise.all([f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 0 }), f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 0 })]);
  assert.ok(results.every((value) => value.registration === "registered")); assert.equal(f.state.registrations, 1);
});

test("architect without active workflow returns reply or rejects explicit report", async (t) => {
  const f = await fixture(t); f.state.context = {};
  assert.equal((await f.api.start(f.parent, f.workdir, "report", { role: "feature-architect", brief: "q", output: "report" })).code, "DELEGATE_REPORT_REQUIRES_ACTIVE_PLAN");
  assert.equal(f.store.writes, 0);
  assert.equal((await f.api.start(f.parent, f.workdir, "reply", { role: "feature-architect", brief: "q" })).output, "reply");
});

test("native continuable roles reuse exact catalog identity", async (t) => {
  const f = await fixture(t, "continuable");
  const a = await f.api.start(f.parent, f.workdir, "native-a", { role: "researcher", brief: "q" });
  assert.equal(a.status, "running"); await finish(f, a.assignment_id);
  const b = await f.api.start(f.parent, f.workdir, "native-b", { role: "researcher", brief: "q2" });
  assert.equal(b.status, "running"); assert.equal(f.state.starts, 1); assert.equal(f.state.sends, 2);
  assert.equal(f.store.receipt(a.assignment_id).memberId, f.store.receipt(b.assignment_id).memberId);
});

test("native one-shot completion proves child catalog identity, not opaque run id", async (t) => {
  const f = await fixture(t, "one-shot");
  f.state.onStart = async (actor, prompt) => { const result = await f.api.complete(actor, f.workdir, { assignment_id: idFromPrompt(prompt), status: "completed", result: "one-shot evidence" }); assert.equal(result.status, "completed"); };
  const a = await f.api.start(f.parent, f.workdir, "one", { role: "researcher", brief: "q" });
  assert.equal(a.status, "completed"); const r = f.store.receipt(a.assignment_id);
  assert.equal(r.memberId, "actual-session-1"); assert.equal(r.runId, "opaque-run-1");
  f.runs[0].resolve({ output: "not authoritative" });
  assert.equal((await f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 0 })).result, "one-shot evidence");
});

test("one-shot termination without semantic complete does not fabricate success", async (t) => {
  const f = await fixture(t, "one-shot");
  const a = await f.api.start(f.parent, f.workdir, "one", { role: "researcher", brief: "q" });
  const wait = f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 1000 });
  f.runs[0].resolve({ output: "untrusted free text" });
  const result = await wait; assert.equal(result.status, "failed"); assert.equal(result.error, "DELEGATE_WORKER_ENDED_WITHOUT_COMPLETE");
});

test("result bounded wait observes completed receipt and rejects excessive waits", async (t) => {
  const f = await fixture(t);
  const a = await f.api.start(f.parent, f.workdir, "wait", { role: "researcher", brief: "q" });
  assert.equal((await f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 120001 })).code, "DELEGATE_WAIT_INVALID");
  const wait = f.api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 1000 });
  await finish(f, a.assignment_id);
  assert.equal((await wait).status, "completed");
});

test("receipt store survives facade reconstruction without replaying SDK effects", async (t) => {
  const f = await fixture(t);
  const { DelegationReceiptStore } = await import(receipts);
  const root = path.join(f.root, "private-runtime");
  let api = new RoleDelegation({ ...f.dependencies, receipts: new DelegationReceiptStore(root) });
  const a = await api.start(f.parent, f.workdir, "persistent", { role: "researcher", brief: "q" });
  assert.equal(a.status, "running");
  api = new RoleDelegation({ ...f.dependencies, receipts: new DelegationReceiptStore(root) });
  const duplicate = await api.start(f.parent, f.workdir, "persistent", { role: "researcher", brief: "q" });
  assert.equal(duplicate.assignment_id, a.assignment_id); assert.equal(f.state.starts, 1); assert.equal(f.state.sends, 1);
  const actor = f.actors.get(f.members[0].id);
  await api.complete(actor, f.workdir, { assignment_id: a.assignment_id, status: "completed", result: "durable result" });
  assert.equal((await api.result(f.parent, f.workdir, { assignment_id: a.assignment_id, wait_ms: 0 })).result, "durable result");
});

test("queued roles advance FIFO even when each worker completes before send returns", async (t) => {
  const f = await fixture(t);
  const a = await f.api.start(f.parent, f.workdir, "fifo-a", { role: "researcher", brief: "first" });
  const b = await f.api.start(f.parent, f.workdir, "fifo-b", { role: "researcher", brief: "second" });
  const c = await f.api.start(f.parent, f.workdir, "fifo-c", { role: "researcher", brief: "third" });
  f.state.onSend = async (actor, prompt) => {
    await f.api.complete(actor, f.workdir, { assignment_id: idFromPrompt(prompt), status: "completed", result: "done " + idFromPrompt(prompt) });
  };
  await finish(f, a.assignment_id);
  assert.equal((await f.api.result(f.parent, f.workdir, { assignment_id: c.assignment_id, wait_ms: 1000 })).status, "completed");
  assert.deepEqual(f.state.messages.map(idFromPrompt), [a.assignment_id, b.assignment_id, c.assignment_id]);
  assert.equal(f.state.starts, 1);
});

test("report completion rejects a symlinked report directory escape", async (t) => {
  const f = await fixture(t);
  const a = await f.api.start(f.parent, f.workdir, "symlink", { role: "feature-architect", brief: "q" });
  const r = f.store.receipt(a.assignment_id);
  const outside = path.join(f.root, "outside-report"); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, path.basename(r.reportPath)), "outside");
  assert.ok(path.resolve(r.reportDir).startsWith(path.resolve(f.root) + path.sep));
  await fs.rmdir(r.reportDir);
  try { await fs.symlink(outside, r.reportDir, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error.code === "EPERM") { t.skip("host cannot create test symlink"); return; } throw error; }
  const before = f.store.writes;
  assert.equal((await finish(f, a.assignment_id, { document_path: r.reportPath })).code, "DELEGATE_REPORT_PATH_INVALID");
  assert.equal(f.store.writes, before);
});
