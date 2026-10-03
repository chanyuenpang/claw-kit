import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

// This module has no imports or side effects. Transpile only this source in
// memory so focused tests do not rebuild or replace another worker's lib/ tree.
const source = await fs.readFile(new URL("../src/team-capability.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { resolveDshDelegationCapability: resolve } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

const never = () => { throw new Error("capability checks must not dispatch or mutate"); };
const parameters = (...names) => Object.fromEntries(names.map((name) => [name, { type: "string", required: true }]));

function fixture() {
  const agent = { id: "lead-id", options: { model: "model-a", reasoningEffort: "high" } };
  const provider = { name: "spawn", inheritsParentContext: false, capabilities: { agentOptions: true }, start: never, prepareContinuable: never };
  const definitions = new Map([
    ["spawn_teammate", { parameters: parameters("name", "description", "prompt") }],
    ["send_message", { parameters: parameters("target", "message") }],
    ["list_agents", { parameters: {} }],
    ["wait_agent", { parameters: {} }],
    ["team_task_create", { parameters: parameters("subject", "description") }],
    ["team_task_list", { parameters: {} }],
    ["team_task_get", { parameters: parameters("task_id") }],
    ["team_task_update", { parameters: parameters("task_id", "action") }],
    ["subagent", { parameters: parameters("prompt", "description") }],
  ]);
  const requestedServices = [];
  const services = {
    agentTeams: {
      tryMembership(caller) {
        assert.equal(caller, agent);
        return { id: agent.id, root: agent, role: "lead", name: "lead" };
      },
      listMembers: never, spawnTeammate: never, sendMessage: never,
    },
    subagents: { getProvider: (name) => name === provider.name ? provider : undefined, start: never, startContinuable: never, sendMessage: never },
    tools: { get(name, scope) { assert.equal(scope, agent); return definitions.get(name); } },
  };
  const input = { agent, role: "managed", provider: "spawn", getService(name) { requestedServices.push(name); return services[name]; } };
  return { agent, provider, definitions, requestedServices, services, input };
}

function exposeNativeOnly(f) {
  f.definitions.clear();
  f.definitions.set("subagent", { parameters: parameters("prompt", "description") });
  f.definitions.set("send_message", { parameters: parameters("agent_id", "message") });
  f.definitions.set("list_agents", { parameters: {} });
}

async function expectFailure(input, selectedRoute, reason) {
  const result = await resolve(input);
  assert.equal(result.selectedRoute, selectedRoute);
  assert.equal(result.ready, false);
  assert.equal(result.reason, reason);
  return result;
}

test("managed foreground role selects exact implicit Lead and reusable backend", async () => {
  const f = fixture();
  assert.deepEqual(await resolve(f.input), { selectedRoute: "team", ready: true, teamId: "lead-id", leadId: "lead-id", provider: "spawn", reusable: true });
  assert.deepEqual(f.requestedServices, ["tools", "agentTeams"]);
});

test("managed role only needs effective spawn signal and Team business APIs", async () => {
  const f = fixture();
  const spawn = f.definitions.get("spawn_teammate");
  f.definitions.clear();
  f.definitions.set("spawn_teammate", spawn);
  const inspected = [];
  f.services.tools.get = (name, scope) => { inspected.push(name); assert.equal(scope, f.agent); return f.definitions.get(name); };
  assert.deepEqual(await resolve(f.input), { selectedRoute: "team", ready: true, teamId: "lead-id", leadId: "lead-id", provider: "spawn", reusable: true });
  assert.equal(inspected.includes("wait_agent"), false);
  assert.equal(inspected.includes("list_agents"), false);
  assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
  delete f.services.agentTeams.sendMessage;
  await expectFailure(f.input, "team", "TEAM_SERVICE_UNAVAILABLE");
});

test("managed role treats partial schemas as route hints and lets business services decide", async () => {
  const f = fixture();
  f.definitions.set("spawn_teammate", { parameters: null });
  assert.equal((await resolve(f.input)).ready, true);
  f.services.tools.get = never;
  const native = await resolve(f.input);
  assert.equal(native.selectedRoute, "native");
  assert.equal(native.ready, true);
});

test("foreground uses exact scoped definitions even when outer PTC only exposes run_code", async () => {
  const f = fixture();
  delete f.services.subagents;
  const result = await resolve({ ...f.input, role: "foreground" });
  assert.equal(result.ready, true);
  assert.equal(result.selectedRoute, "team");
  assert.equal("provider" in result, false, "tool-private selected provider is not fabricated");
  assert.equal(f.requestedServices.includes("subagents"), false);
});

test("foreground can inspect detached schema projections without calling the tools", async () => {
  const f = fixture();
  f.services.tools = { schemas(scope) { assert.equal(scope, f.agent); return [...f.definitions].map(([name, definition]) => ({ name, parameters: { type: "object", properties: definition.parameters } })); } };
  assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
});

test("pluginManager presence, declarations and failures never select the route", async () => {
  const f = fixture();
  f.services.pluginManager = { listPlugins: never };
  assert.equal((await resolve(f.input)).selectedRoute, "team");
  exposeNativeOnly(f);
  assert.equal((await resolve(f.input)).selectedRoute, "native");
  delete f.services.pluginManager;
  assert.equal((await resolve(f.input)).ready, true);
  assert.equal(f.requestedServices.includes("pluginManager"), false);
});

test("unreadable schemas fall back to callable native service and ambiguous hints do not block Team", async () => {
  const f = fixture();
  f.services.tools = { get: never };
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: true });
  f.services.tools = { schemas: () => ({ tools: [] }) };
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: true });
  f.services.tools = { schemas: () => [{ name: "spawn_teammate", parameters: {} }, { name: "spawn_teammate", parameters: {} }] };
  assert.equal((await resolve(f.input)).ready, true);
  assert.equal((await resolve(f.input)).selectedRoute, "team");
});

test("absent Team surface selects native despite a residual Team service", async () => {
  const f = fixture();
  exposeNativeOnly(f);
  f.services.agentTeams.tryMembership = never;
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: true });
  assert.equal(f.requestedServices.includes("agentTeams"), false);
  delete f.services.tools;
  assert.equal((await resolve(f.input)).selectedRoute, "native");
  assert.equal((await resolve(f.input)).ready, true);
  await expectFailure({ ...f.input, role: "foreground" }, "native", "SCOPED_TOOLS_UNAVAILABLE");
});

test("native preserves a valid one-shot route when continuation is absent", async () => {
  const f = fixture();
  exposeNativeOnly(f);
  delete f.provider.prepareContinuable;
  delete f.services.subagents.startContinuable;
  delete f.services.subagents.sendMessage;
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: false });
  delete f.services.subagents.start;
  await expectFailure(f.input, "native", "NATIVE_START_UNAVAILABLE");
});

test("foreground Team hints tolerate partial schemas while missing business service still fails", async () => {
  for (const change of [
    (f) => { f.definitions.delete("send_message"); },
    (f) => { f.definitions.set("spawn_teammate", { parameters: null }); },
    (f) => { f.definitions.delete("list_agents"); },
  ]) {
    const f = fixture(); change(f);
    assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
  }
  const missing = fixture(); delete missing.services.agentTeams;
  await expectFailure({ ...missing.input, role: "foreground" }, "team", "TEAM_SERVICE_UNAVAILABLE");
});

test("nonmember, teammate and stale root identity are not admitted as exact Lead", async () => {
  const f = fixture();
  f.services.agentTeams.tryMembership = () => undefined;
  await expectFailure(f.input, "team", "TEAM_CALLER_NOT_MEMBER");
  f.services.agentTeams.tryMembership = () => ({ id: "lead-id", root: f.agent, role: "teammate" });
  await expectFailure(f.input, "team", "TEAM_LEAD_REQUIRED");
  f.services.agentTeams.tryMembership = () => ({ id: "lead-id", root: { ...f.agent }, role: "lead" });
  await expectFailure(f.input, "team", "TEAM_LEAD_REQUIRED");
  f.services.agentTeams.tryMembership = () => ({ id: "other-team", root: f.agent, role: "lead" });
  await expectFailure(f.input, "team", "TEAM_MEMBERSHIP_INVALID");
});

test("managed Team role relies on Team business service, not a shadow native provider audit", async () => {
  for (const change of [
    (f) => { delete f.services.subagents; },
    (f) => { f.services.subagents.getProvider = () => undefined; },
    (f) => { f.provider.name = "different"; f.services.subagents.getProvider = () => f.provider; },
    (f) => { f.provider.inheritsParentContext = true; },
    (f) => { delete f.provider.prepareContinuable; },
    (f) => { delete f.services.subagents.sendMessage; },
  ]) {
    const f = fixture(); change(f);
    assert.equal((await resolve(f.input)).ready, true);
    assert.equal(f.requestedServices.includes("subagents"), false);
  }
});

test("foreground does not require unrelated observation tools or exact parameter projections", async () => {
  const f = fixture();
  f.definitions.set("send_message", { parameters: parameters("agent_id", "message") });
  assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
  f.definitions.delete("wait_agent");
  f.definitions.delete("list_agents");
  assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
});

test("model and effort preferences are syntactic hints, not capability admission gates", async () => {
  const f = fixture();
  for (const input of [
    { requestedModel: "model-a", requestedReasoningEffort: "high" },
    { requestedModel: "model-b" },
    { requestedReasoningEffort: "low" },
  ]) assert.equal((await resolve({ ...f.input, ...input })).ready, true);
  delete f.agent.options.model;
  assert.equal((await resolve({ ...f.input, requestedModel: "model-a" })).ready, true);
  assert.equal((await resolve({ ...f.input, requestedModel: "" })).ready, true);
});

test("provider catalog failure degrades route metadata without blocking a callable carrier", async () => {
  const f = fixture();
  exposeNativeOnly(f);
  f.services.subagents.getProvider = () => { throw new Error("catalog unavailable"); };
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: false });
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: false, supportsOptions: false });
});

test("native option support is reported to finalizer selection without blocking hints", async () => {
  const f = fixture();
  exposeNativeOnly(f);
  f.provider.capabilities.agentOptions = false;
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer", requestedModel: "model-b" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: true, supportsOptions: false });
  f.provider.capabilities.agentOptions = true;
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer", requestedModel: "model-b" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: true, supportsOptions: true });
});

test("background finalizer stays native even while Team tools are exposed", async () => {
  const f = fixture();
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: true, supportsOptions: true });
  assert.equal(f.requestedServices.includes("agentTeams"), false);
});

test("native foreground requires scoped subagent route and every admission rechecks services", async () => {
  const f = fixture();
  assert.equal((await resolve(f.input)).selectedRoute, "team");
  exposeNativeOnly(f);
  assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
  f.definitions.delete("subagent");
  await expectFailure({ ...f.input, role: "foreground" }, "native", "NATIVE_FOREGROUND_TOOLS_UNAVAILABLE");
  f.services.tools.get = () => { throw new Error("disposed scope"); };
  await expectFailure({ ...f.input, role: "foreground" }, "native", "SCOPED_TOOLS_UNAVAILABLE");
});

test("managed foreground facade uses business capability without model coordination tools", async () => {
  const f = fixture();
  const spawn = f.definitions.get("spawn_teammate");
  f.definitions.clear();
  f.definitions.set("spawn_teammate", spawn);
  assert.deepEqual(await resolve({ ...f.input, role: "managed" }), { selectedRoute: "team", ready: true, teamId: "lead-id", leadId: "lead-id", provider: "spawn", reusable: true });
  exposeNativeOnly(f);
  delete f.provider.prepareContinuable;
  assert.deepEqual(await resolve({ ...f.input, role: "managed" }), { selectedRoute: "native", ready: true, provider: "spawn", reusable: false });
});
