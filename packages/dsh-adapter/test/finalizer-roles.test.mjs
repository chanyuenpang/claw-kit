import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

// Run the actual two source modules, without emitting/replacing package lib/.
const moduleURL = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText).toString("base64");
const capabilityURL = moduleURL(await fs.readFile(new URL("../src/team-capability.ts", import.meta.url), "utf8"));
const { resolveDshDelegationCapability } = await import(capabilityURL);
const rolePreferencesURL = new URL("../lib/role-preferences.js", import.meta.url).href;
const modelSelectionURL = new URL("../lib/model-selection.js", import.meta.url).href;
const nativeStartURL = moduleURL(await fs.readFile(new URL("../src/native-start.ts", import.meta.url), "utf8"));
const dispatcherSource = (await fs.readFile(new URL("../src/finalizer-roles.ts", import.meta.url), "utf8"))
  .replace('"./team-capability.js"', JSON.stringify(capabilityURL))
  .replace('"./native-start.js"', JSON.stringify(nativeStartURL))
  .replace('"../lib/role-preferences.js"', JSON.stringify(rolePreferencesURL))
  .replace('"./model-selection.js"', JSON.stringify(modelSelectionURL))
  .replace('"../lib/errors.js"', JSON.stringify(new URL("../lib/errors.js", import.meta.url).href));
const { FinalizerRoleDispatcher, finalizerConfigFingerprint, nativeFinalizerRoleId } = await import(moduleURL(dispatcherSource));

const A = "a".repeat(63) + "1";
const B = "a".repeat(63) + "2"; // Same short prefix deliberately tests full-id isolation.
const ROLE = "claw-knowledge-finalizer";
const LABEL = "claw-kit:knowledge-finalizer:v1:";
const workdir = process.cwd();
const dispatchFor = (finalizeId) => ({ finalizeId, prompt: "Execute only job " + finalizeId });
const flag = (args, name) => args[args.indexOf(name) + 1];
const clone = (value) => structuredClone(value);

function fixture(route = "native") {
  const agent = { id: "lead-session", options: { provider: "llm-provider", model: "model-a", reasoningEffort: "high" } };
  const provider = { name: "spawn", inheritsParentContext: false, capabilities: { agentOptions: true },
    start() {}, prepareContinuable() {} };
  const definitions = new Map(route === "team" ? [["spawn_teammate", { parameters: {
    name: { type: "string" }, description: { type: "string" }, prompt: { type: "string" },
  } }]] : []);
  const members = [];
  const children = [];
  const events = [];
  const commands = [];
  const creates = [];
  const sends = [];
  const rows = new Map([[A, { finalizeId: A, status: "queued", readyForNext: false }],
    [B, { finalizeId: B, status: "queued", readyForNext: false }]]);
  const controller = new AbortController();
  const state = { failSend: false, failAcceptance: false, projectedSpawn: false,
    replaceNativeProxy: false, failCatalogReads: 0, onCommand: undefined, releaseReady: true };
  function eventFor(id, memberId, messageId = "receipt-" + id) {
    return { type: "team/message/queued", data: { version: 2, teamId: agent.id, message: {
      id: messageId, senderId: agent.id, targetId: memberId,
      content: [{ type: "text", text: "claw-finalizer-dispatch:v1:" + id + "\n" + dispatchFor(id).prompt }],
    } } };
  }
  const services = {
    tools: { get(name, caller) { assert.equal(caller, agent); return definitions.get(name); } },
    agentTeams: {
      tryMembership(caller) { assert.equal(caller, agent); return { id: agent.id, root: agent, role: "lead" }; },
      listMembers(caller) { assert.equal(caller, agent); return clone(members); },
      async spawnTeammate(caller, request) {
        assert.equal(caller, agent);
        assert.equal(request.signal, controller.signal);
        assert.equal(request.context, "fresh");
        assert.equal(request.provider, "spawn");
        assert.ok(Array.isArray(request.prompt));
        assert.match(request.prompt[0].text, /initializes the role ONLY/);
        assert.doesNotMatch(request.prompt[0].text, new RegExp(A + "|" + B));
        creates.push({ route: "team", request });
        const row = { id: "member-session", name: request.name, description: request.description,
          role: "teammate", status: "inactive", provider: request.provider, context: request.context, diagnostics: [] };
        members.push(row);
        // Installed roster.spawn returns {member: rawRow}; the public tool
        // projects that nested row into {target,...}, losing raw id/name.
        return { member: state.projectedSpawn
          ? { target: row.name, role: row.role, status: row.status, provider: row.provider, context: row.context, diagnostics: [] }
          : clone(row) };
      },
      async sendMessage(caller, request) {
        assert.equal(caller, agent);
        assert.equal(request.signal, controller.signal);
        assert.equal(request.target, ROLE, "business mailbox targets roster name, not model wrapper target");
        const id = request.content[0].text.split("\n")[0].slice("claw-finalizer-dispatch:v1:".length);
        const receipt = "team-receipt-" + id;
        sends.push({ route: "team", id, target: request.target, content: request.content });
        events.push(eventFor(id, members[0].id, receipt));
        if (state.failSend) throw new Error("SIMULATED_SEND_UNCERTAIN");
        return { messageId: receipt, status: "queued" };
      },
    },
    subagents: {
      getProvider(name) { return name === provider.name ? provider : undefined; }, start() {},
      async listChildren(parentId) { assert.equal(parentId, agent.id);
        if (state.failCatalogReads-- > 0) throw new Error("transient catalog read");
        return clone(children); },
      async startActivation(spec) {
        assert.equal(spec.signal, controller.signal);
        assert.equal(spec.request.parent, agent);
        assert.match(spec.request.prompt[0].text, /initializes the role ONLY/);
        creates.push({ route: "native", spec });
        const childId = spec.childId ?? "host-child-" + creates.length;
        // Match the Host listChildren catalog, not the UI list-entry projection.
        children.push({ id: childId, label: spec.label, mode: "continuable", createdAt: creates.length });
        return { childId, messageId: "bootstrap-message" };
      },
      async sendMessage(parent, childId, content, options) {
        assert.equal(parent, agent);
        assert.equal(options.signal, controller.signal);
        const id = content[0].text.split("\n")[0].slice("claw-finalizer-dispatch:v1:".length);
        sends.push({ route: "native", id, childId, content });
        if (state.failSend) throw new Error("SIMULATED_SEND_UNCERTAIN");
        return "native-receipt-" + id;
      },
    },
  };
  const getService = (name) => name === "subagents" && state.replaceNativeProxy
    ? { ...services.subagents } : services[name];
  const capability = (dispatch = dispatchFor(A)) => resolveDshDelegationCapability({ getService, agent, role: "finalizer", provider: "spawn",
    requestedModel: dispatch.model, requestedReasoningEffort: dispatch.reasoningEffort });
  const fingerprint = finalizerConfigFingerprint(agent, workdir, dispatchFor(A), "spawn");
  const execution = (id, overrides = {}) => ({ route: route === "team" ? "team" : "native-continuable", parentSessionId: agent.id,
    memberSessionId: route === "team" ? "member-session" : nativeFinalizerRoleId(agent.id, fingerprint),
    ...(route === "team" ? { teamId: agent.id } : {}), provider: "spawn", configFingerprint: fingerprint,
    deliveryKey: id, delivery: { state: "reserved" }, ...overrides });
  const deps = {
    getService, signal: controller.signal,
    async readParentEvents(parentId) { assert.equal(parentId, agent.id); return clone(events); },
    async command(operation, actorId, cwd, args) {
      assert.equal(actorId, agent.id);
      assert.equal(cwd, workdir);
      assert.ok(args.every((arg) => typeof arg === "string"));
      commands.push({ operation, args: [...args] });
      await state.onCommand?.(operation, args);
      if (operation === "inspect") {
        const selected = args.includes("--finalize-id") ? [rows.get(flag(args, "--finalize-id"))].filter(Boolean) : [...rows.values()];
        return { ok: true, executions: clone(selected) }; // Actual CLI envelope, never a bare array.
      }
      const id = flag(args, "--finalize-id");
      const row = rows.get(id);
      assert.ok(row, "private seam only addresses an existing canonical job");
      if (operation === "reserve") {
        const blocker = [...rows.values()].find((candidate) => candidate.finalizeId !== id && candidate.execution && !candidate.readyForNext);
        if (blocker) return { ok: true, admitted: false, blockingFinalizeId: blocker.finalizeId };
        row.execution ??= execution(id, { route: flag(args, "--route"), memberSessionId: flag(args, "--member-session-id"),
          ...(args.includes("--team-id") ? { teamId: flag(args, "--team-id") } : {}), provider: flag(args, "--provider"),
          configFingerprint: flag(args, "--config-fingerprint"),
          ...(args.includes("--model-selection") ? { modelSelection: JSON.parse(flag(args, "--model-selection")) } : {}) });
        return { ok: true, admitted: true, execution: clone(row.execution) };
      }
      if (operation === "release") {
        if (state.releaseReady) {
          row.status = row.expiresAt && Date.parse(row.expiresAt) <= Date.now() ? "expired" : row.status;
          row.readyForNext = true;
          row.execution.releasedAt = new Date().toISOString();
        }
        return { ok: true, released: state.releaseReady };
      }
      assert.equal(operation, "delivery");
      assert.equal(flag(args, "--delivery-key"), id);
      assert.equal(row.execution.deliveryKey, id);
      const next = flag(args, "--state");
      if (next === "attempted") {
        if (row.execution.delivery.state !== "reserved") return { ok: true, deliver: false };
        row.execution.delivery = { state: "attempted" };
        return { ok: true, deliver: true };
      }
      if (next === "accepted" && state.failAcceptance) { state.failAcceptance = false; throw Object.assign(new Error("SIMULATED_ACK_WRITE_FAILURE"), state.acceptanceCode ? { code: state.acceptanceCode } : {}); }
      row.execution.delivery = { state: next, ...(args.includes("--receipt-id") ? { receiptId: flag(args, "--receipt-id") } : {}) };
      return { ok: true };
    },
  };
  const dispatcher = new FinalizerRoleDispatcher(deps);
  async function run(id = A, cap) { return dispatcher.dispatch(agent, workdir, dispatchFor(id), cap ?? await capability(dispatchFor(id))); }
  const seedMember = (overrides = {}) => members.push({ id: "member-session", name: ROLE, description: LABEL + fingerprint + " background",
    role: "teammate", status: "inactive", provider: "spawn", context: "fresh", diagnostics: [], ...overrides });
  return { agent, provider, definitions, members, children, events, commands, creates, sends, rows, state, services, capability,
    fingerprint, execution, dispatcher, run, eventFor, seedMember };
}

test("current activation-only host admits and reuses the finalizer", async () => {
  const f = fixture();
  assert.equal((await f.run(A)).delivered, true);
  f.rows.get(A).status = "succeeded";
  f.rows.get(A).readyForNext = true;
  assert.equal((await f.run(B)).reused, true);
  assert.equal(f.creates.length, 1);
  assert.deepEqual(f.sends.map(send => send.id), [A, B]);
});

test("native background role creates one executor for two independent full-id jobs", async () => {
  const f = fixture();
  const first = await f.run(A);
  assert.equal(first.delivered, true);
  assert.equal(first.reused, false);
  f.rows.get(A).status = "succeeded";
  f.rows.get(A).readyForNext = true; // Canonical job AND delegate plan terminal.
  const second = await f.run(B);
  assert.equal(second.delivered, true);
  assert.equal(second.reused, true);
  assert.equal(first.runId, second.runId);
  assert.equal(f.creates.length, 1);
  assert.deepEqual(f.sends.map((send) => send.id), [A, B]);
  assert.notEqual(f.rows.get(A).execution.deliveryKey, f.rows.get(B).execution.deliveryKey);
  assert.deepEqual(f.commands.filter((call) => call.operation === "delivery" && flag(call.args, "--state") === "attempted").map((call) => flag(call.args, "--finalize-id")), [A, B]);
});

test("duplicate roles from older adapters reuse the first compatible child without new creation", async () => {
  const f = fixture();
  const first = await f.run(A);
  f.rows.get(A).status = "succeeded";
  f.rows.get(A).readyForNext = true;
  f.children.push({ ...f.children[0], id: "old-duplicate" });
  const second = await f.run(B);
  assert.equal(second.reused, true);
  assert.equal(second.runId, first.runId);
  assert.equal(f.creates.length, 1);
  assert.deepEqual(f.sends.map(send => send.id), [A, B]);
});

test("reserved executor wins over duplicate label and missing pinned child never creates", async () => {
  for (const missing of [false, true]) {
    const f = fixture();
    await f.run(A);
    const row = f.rows.get(A);
    row.execution.delivery = { state: "reserved" }; // Simulate pre-send reservation recovery.
    f.sends.length = 0;
    f.children.unshift({ ...f.children[0], id: "different-child" });
    if (missing) f.children.pop();
    const result = await f.run(A);
    assert.equal(f.creates.length, 1);
    if (missing) {
      assert.equal(result.code, "DSH_FINALIZER_EXECUTOR_PINNED");
      assert.equal(f.sends.length, 0);
    } else {
      assert.equal(result.runId, "host-child-1");
      assert.equal(f.sends[0].childId, "host-child-1");
      assert.equal(f.sends.length, 1);
    }
  }
});

test("inactive member is not readiness: queued or unfinished delegate blocks another job", async () => {
  for (const status of ["queued", "running", "succeeded"]) {
    const f = fixture();
    await f.run(A);
    f.rows.get(A).status = status;
    f.rows.get(A).readyForNext = false;
    f.state.releaseReady = false;
    f.children[0].activity = "inactive"; // Even legacy activity is not job readiness.
    const next = await f.run(B);
    assert.equal(next.phase, "waiting-for-role");
    assert.equal(next.blockingFinalizeId, A);
    assert.equal(f.sends.length, 1);
    assert.equal(f.creates.length, 1);
  }
});

test("concurrent admissions serialize and accepted duplicates never resend", async () => {
  const f = fixture();
  const [a, duplicate, b] = await Promise.all([f.run(A), f.run(A), f.run(B)]);
  assert.equal(a.delivered, true);
  assert.equal(duplicate.deliveryState, "accepted");
  assert.equal(b.phase, "waiting-for-role");
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
  const recovered = await f.dispatcher.recoverAcknowledgement(f.agent, workdir, A);
  assert.equal(recovered.messageId, "native-receipt-" + A);
  assert.equal(f.sends.length, 1);
});

test("finalizer catalog tolerates one read failure and unrelated diagnostics", async () => {
  const f = fixture();
  f.state.failCatalogReads = 1;
  f.children.push({ kind: "diagnostic", id: "unrelated", reason: "corrupt" });
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
});

test("finalizer target diagnostic remains a hard identity failure", async () => {
  const f = fixture();
  const selection = { requested: { intent: "low-cost" }, applied: { mode: "inherit", options: {},
    inheritanceBasis: { provider: "llm-provider", model: "model-a", reasoningEffort: "high" } },
    resolved: { known: false }, reason: "catalog-unavailable" };
  const fingerprint = finalizerConfigFingerprint(f.agent, workdir, { ...dispatchFor(A), selection }, "spawn");
  const targetId = "persisted-child";
  f.rows.get(A).execution = f.execution(A, { memberSessionId: targetId, configFingerprint: fingerprint, modelSelection: selection });
  f.children.push({ kind: "diagnostic", id: targetId, reason: "corrupt" });
  const result = await f.run();
  assert.equal(result.ok, false);
  assert.equal(result.code, "DSH_NATIVE_ROLE_CATALOG_UNAVAILABLE");
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 0);
});

test("existing native role tolerates omitted provider and activity observations", async () => {
  const f = fixture();
  const selection = { requested: { intent: "low-cost" }, applied: { mode: "inherit", options: {},
    inheritanceBasis: { provider: "llm-provider", model: "model-a", reasoningEffort: "high" } },
    resolved: { known: false }, reason: "catalog-unavailable" };
  const fingerprint = finalizerConfigFingerprint(f.agent, workdir, { ...dispatchFor(A), selection }, "spawn");
  f.children.push({ kind: "child", id: nativeFinalizerRoleId(f.agent.id, fingerprint),
    label: LABEL + fingerprint.slice(0, 16), mode: "continuable" });
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.reused, true);
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 1);
});

test("structured Host start rejection keeps a safe actionable code", async () => {
  const f = fixture();
  f.services.subagents.startActivation = async () => { throw { code: "subagent/session-conflict" }; };
  const result = await f.run();
  assert.equal(result.ok, false);
  assert.equal(result.code, "subagent/session-conflict");
  assert.equal(result.operation, "native.member.start");
  assert.equal(result.outcome, "unknown");
  assert.equal(f.rows.get(A).execution, undefined);
  assert.equal(f.sends.length, 0);
});

test("replaceable equivalent native service proxies do not fail capability rechecks", async () => {
  const f = fixture();
  f.state.replaceNativeProxy = true;
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.executor, "native-continuable");
  assert.equal(result.runId, "host-child-1");
  assert.equal(f.creates.length, 1);
  assert.equal(f.creates[0].spec.childId, undefined, "Host owns durable child identity");
  assert.equal(f.sends.length, 1);
});

test("a child appearing in the reacquired catalog is reused instead of started twice", async () => {
  const f = fixture();
  const selection = { requested: { intent: "low-cost" }, applied: { mode: "inherit", options: {},
    inheritanceBasis: { provider: "llm-provider", model: "model-a", reasoningEffort: "high" } },
    resolved: { known: false }, reason: "catalog-unavailable" };
  const fingerprint = finalizerConfigFingerprint(f.agent, workdir, { ...dispatchFor(A), selection }, "spawn");
  const childId = nativeFinalizerRoleId(f.agent.id, fingerprint);
  let reads = 0;
  const original = f.services.subagents.listChildren;
  f.services.subagents.listChildren = async id => {
    reads++;
    if (reads === 2) f.children.push({ kind: "child", id: childId, label: LABEL + fingerprint.slice(0, 16),
      mode: "continuable", activity: "inactive", provider: "spawn" });
    return original(id);
  };
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.reused, true);
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 1);
});

test("native admission persists the best-effort selection used by its launch recipe", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.executor, "native-continuable");
  assert.equal(result.modelSelection.requested.intent, "low-cost");
  const reserve = f.commands.find(call => call.operation === "reserve");
  assert.ok(reserve.args.includes("--model-selection"));
  assert.equal(f.creates[0].route, "native");
});

test("uncertain native delivery never changes recipe or resends", async () => {
  const f = fixture();
  f.state.failSend = true;
  const first = await f.run();
  assert.equal(first.ok, false);
  assert.equal(f.rows.get(A).execution.delivery.state, "uncertain");
  const pinned = clone(f.rows.get(A).execution);
  const repeated = await f.run();
  assert.equal(repeated.code, "DSH_FINALIZER_DELIVERY_UNCERTAIN");
  assert.deepEqual(f.rows.get(A).execution, pinned);
  assert.equal(f.sends.length, 1);
  assert.equal(f.creates.length, 1);
});

test("post-send native acknowledgement loss stays uncertain without sending twice", async () => {
  const f = fixture();
  f.state.failAcceptance = true;
  const failed = await f.run();
  assert.equal(failed.code, "FINALIZER_DELIVERY_PERSIST_FAILED");
  assert.equal(failed.deliveryAccepted, true); assert.equal(failed.phase, "receipt-persist");
  assert.equal(failed.message, "SIMULATED_ACK_WRITE_FAILURE");
  assert.equal(failed.outcome, "unknown");
  assert.equal(f.rows.get(A).execution.delivery.state, "uncertain");
  assert.equal((await f.run()).code, "DSH_FINALIZER_DELIVERY_UNCERTAIN");
  assert.equal(f.sends.length, 1);
});

test("legacy Team execution diagnoses multiple durable receipts rather than choosing one", async () => {
  const f = fixture("team");
  f.rows.get(A).execution = f.execution(A, { delivery: { state: "uncertain" } });
  f.events.push(f.eventFor(A, "member-session", "first"), f.eventFor(A, "member-session", "second"));
  assert.equal((await f.run()).code, "DSH_FINALIZER_MULTIPLE_DELIVERY_RECEIPTS");
  assert.equal(f.sends.length, 0);
});

test("legacy admitted Team executor is not migrated to the new native route", async () => {
  const f = fixture("team");
  f.rows.get(A).execution = f.execution(A);
  const pinned = clone(f.rows.get(A).execution);
  const result = await f.run();
  assert.equal(result.ok, false);
  assert.equal(result.code, "DSH_FINALIZER_EXECUTOR_PINNED");
  assert.deepEqual(f.rows.get(A).execution, pinned);
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 0);
});

test("native continuable route reuses one Host-owned child across full-id jobs", async () => {
  const f = fixture("native");
  const first = await f.run(A);
  assert.equal(first.executor, "native-continuable");
  assert.equal(first.runId, "host-child-1");
  f.rows.get(A).status = "succeeded";
  f.rows.get(A).readyForNext = true;
  const second = await f.run(B);
  assert.equal(second.reused, true);
  assert.equal(second.runId, first.runId);
  assert.equal(f.creates.length, 1);
  assert.deepEqual(f.sends.map((send) => send.id), [A, B]);
});

test("native uncertain delivery is never resent without a positive receipt", async () => {
  const f = fixture("native");
  f.state.failSend = true;
  await f.run(A);
  assert.equal((await f.run(A)).code, "DSH_FINALIZER_DELIVERY_UNCERTAIN");
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
});

test("provider/config/route capability loss cannot move an existing executor", async () => {
  for (const change of [
    (f) => { f.definitions.clear(); },
    (f) => { f.services.subagents.getProvider = () => undefined; },
    (f) => { f.agent.options.model = "changed-model"; },
  ]) {
    const f = fixture();
    f.seedMember();
    f.rows.get(A).execution = f.execution(A);
    const pinned = clone(f.rows.get(A).execution);
    change(f);
    const result = await f.run(A);
    assert.equal(result.ok, false);
    assert.deepEqual(f.rows.get(A).execution, pinned);
    assert.equal(f.creates.length, 0);
    assert.equal(f.sends.length, 0);
  }
});

test("advisory provider loss after attempted does not manufacture a false uncertain send", async () => {
  const f = fixture();
  f.state.onCommand = async (operation, args) => {
    if (operation === "delivery" && flag(args, "--state") === "attempted") f.services.subagents.getProvider = () => undefined;
  };
  const first = await f.run();
  assert.equal(first.ok, true);
  assert.equal(f.rows.get(A).execution.route, "native-continuable");
  assert.equal(f.rows.get(A).execution.delivery.state, "accepted");
  assert.equal(f.sends.length, 1);
  const recovered = await f.run();
  assert.equal(recovered.ok, true);
  assert.equal(f.sends.length, 1, "accepted delivery is never resent");
  assert.equal(f.creates.length, 1);
});

test("expired prior reservation is reconciled through canonical release before new admission", async () => {
  const f = fixture();
  f.seedMember();
  f.rows.get(A).execution = f.execution(A, { delivery: { state: "uncertain" } });
  f.rows.get(A).expiresAt = "2000-01-01T00:00:00.000Z";
  const result = await f.run(B);
  assert.equal(result.delivered, true);
  assert.equal(f.rows.get(A).status, "expired");
  assert.equal(f.rows.get(A).readyForNext, true);
  const release = f.commands.findIndex((call) => call.operation === "release");
  const reserve = f.commands.findIndex((call) => call.operation === "reserve");
  assert.ok(release >= 0 && reserve > release);
  assert.deepEqual(f.commands[release].args, ["--finalize-id", A]);
  assert.deepEqual(f.sends.map((send) => send.id), [B]);
});

test("known ledger I/O cause remains visible while post-send persistence is uncertain", async () => {
  const f = fixture(); f.state.failAcceptance = true; f.state.acceptanceCode = "EACCES";
  const failure = await f.run();
  assert.equal(failure.code, "EACCES"); assert.equal(failure.outcome, "unknown");
  assert.equal(failure.deliveryAccepted, true); assert.equal(failure.operation, "finalizer.delivery.persist");
  assert.equal(f.rows.get(A).execution.delivery.state, "uncertain");
  await f.run(); assert.equal(f.sends.length, 1); assert.equal(f.creates.length, 1);
});
