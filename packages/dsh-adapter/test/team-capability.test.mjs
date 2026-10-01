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
  const input = { agent, role: "finalizer", provider: "spawn", getService(name) { requestedServices.push(name); return services[name]; } };
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

test("active Team selects exact implicit Lead and explicit reusable finalizer backend", async () => {
  const f = fixture();
  assert.deepEqual(await resolve(f.input), { selectedRoute: "team", ready: true, teamId: "lead-id", leadId: "lead-id", provider: "spawn", reusable: true });
  assert.deepEqual(f.requestedServices, ["tools", "agentTeams", "subagents"]);
});

test("finalizer only needs effective spawn signal and Team business APIs, not model coordination tools", async () => {
  const f = fixture();
  const spawn = f.definitions.get("spawn_teammate");
  f.definitions.clear();
  f.definitions.set("spawn_teammate", spawn);
  const inspected = [];
  f.services.tools.get = (name, scope) => { inspected.push(name); assert.equal(scope, f.agent); return f.definitions.get(name); };
  assert.deepEqual(await resolve(f.input), { selectedRoute: "team", ready: true, teamId: "lead-id", leadId: "lead-id", provider: "spawn", reusable: true });
  assert.equal(inspected.includes("wait_agent"), false);
  assert.equal(inspected.includes("list_agents"), false);
  await expectFailure({ ...f.input, role: "foreground" }, "team", "TEAM_FOREGROUND_TOOL_SCHEMA_MISMATCH");
  delete f.services.agentTeams.sendMessage;
  await expectFailure(f.input, "team", "TEAM_SERVICE_UNAVAILABLE");
});

test("finalizer rejects partial or malformed enablement signals without probing execution", async () => {
  const f = fixture();
  f.definitions.delete("spawn_teammate");
  await expectFailure(f.input, "team", "TEAM_FINALIZER_SIGNAL_INVALID");
  f.definitions.set("spawn_teammate", { parameters: null });
  await expectFailure(f.input, "team", "TEAM_FINALIZER_SIGNAL_INVALID");
  f.services.tools.get = never;
  await expectFailure(f.input, "unknown", "SCOPED_TOOL_INSPECTION_FAILED");
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

test("unreadable and ambiguous scoped schemas diagnose instead of guessing", async () => {
  const f = fixture();
  f.services.tools = { get: never };
  await expectFailure(f.input, "unknown", "SCOPED_TOOL_INSPECTION_FAILED");
  f.services.tools = { schemas: () => ({ tools: [] }) };
  await expectFailure(f.input, "unknown", "SCOPED_TOOL_SCHEMAS_INVALID");
  f.services.tools = { schemas: () => [{ name: "spawn_teammate", parameters: {} }, { name: "spawn_teammate", parameters: {} }] };
  await expectFailure(f.input, "unknown", "SCOPED_TOOL_SCHEMAS_AMBIGUOUS");
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

test("foreground partial or malformed exposed Team surface remains a Team diagnosis", async () => {
  const cases = [
    [(f) => { f.definitions.delete("spawn_teammate"); }, "TEAM_FOREGROUND_TOOL_SCHEMA_MISMATCH"],
    [(f) => { f.definitions.delete("send_message"); }, "TEAM_FOREGROUND_TOOL_SCHEMA_MISMATCH"],
    [(f) => { f.definitions.set("spawn_teammate", { parameters: null }); }, "SCOPED_TOOL_SCHEMAS_INVALID"],
    [(f) => { f.definitions.delete("list_agents"); }, "TEAM_FOREGROUND_TOOLS_UNAVAILABLE"],
    [(f) => { delete f.services.agentTeams; }, "TEAM_SERVICE_UNAVAILABLE"],
  ];
  for (const [change, reason] of cases) { const f = fixture(); change(f); await expectFailure({ ...f.input, role: "foreground" }, "team", reason); }
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

test("Team finalizer requires fresh continuable backend and does not probe it", async () => {
  const cases = [
    [(f) => { delete f.services.subagents; }, "NATIVE_PROVIDER_CATALOG_UNAVAILABLE"],
    [(f) => { f.services.subagents.getProvider = () => undefined; }, "PROVIDER_UNAVAILABLE"],
    [(f) => { f.provider.name = "different"; f.services.subagents.getProvider = () => f.provider; }, "PROVIDER_IDENTITY_MISMATCH"],
    [(f) => { f.provider.inheritsParentContext = true; }, "PROVIDER_FRESH_CONTEXT_UNSUPPORTED"],
    [(f) => { delete f.provider.prepareContinuable; }, "PROVIDER_CONTINUABLE_UNSUPPORTED"],
    [(f) => { delete f.services.subagents.sendMessage; }, "PROVIDER_CONTINUABLE_UNSUPPORTED"],
  ];
  for (const [change, reason] of cases) { const f = fixture(); change(f); await expectFailure(f.input, "team", reason); }
});

test("foreground rejects native-child send schema and absent Team observation tools", async () => {
  const f = fixture();
  f.definitions.set("send_message", { parameters: parameters("agent_id", "message") });
  await expectFailure({ ...f.input, role: "foreground" }, "team", "TEAM_FOREGROUND_TOOL_SCHEMA_MISMATCH");
  f.definitions.set("send_message", { parameters: parameters("target", "message") });
  f.definitions.delete("wait_agent");
  await expectFailure({ ...f.input, role: "foreground" }, "team", "TEAM_FOREGROUND_TOOLS_UNAVAILABLE");
});

test("Team refuses unsupported or unknown explicit model/effort overrides", async () => {
  const f = fixture();
  assert.equal((await resolve({ ...f.input, requestedModel: "model-a", requestedReasoningEffort: "high" })).ready, true);
  await expectFailure({ ...f.input, requestedModel: "model-b" }, "team", "TEAM_MODEL_OVERRIDE_UNSUPPORTED");
  await expectFailure({ ...f.input, requestedReasoningEffort: "low" }, "team", "TEAM_REASONING_EFFORT_OVERRIDE_UNSUPPORTED");
  delete f.agent.options.model;
  await expectFailure({ ...f.input, requestedModel: "model-a" }, "team", "TEAM_MODEL_INHERITANCE_UNKNOWN");
});

test("native explicit overrides require supported agentOptions, matching inheritance does not", async () => {
  const f = fixture();
  exposeNativeOnly(f);
  f.provider.capabilities.agentOptions = false;
  assert.equal((await resolve({ ...f.input, requestedModel: "model-a" })).ready, true);
  await expectFailure({ ...f.input, requestedModel: "model-b" }, "native", "NATIVE_MODEL_OPTIONS_UNSUPPORTED");
  f.provider.capabilities.agentOptions = true;
  assert.equal((await resolve({ ...f.input, requestedModel: "model-b" })).ready, true);
});

test("native foreground requires scoped subagent route and every admission rechecks services", async () => {
  const f = fixture();
  assert.equal((await resolve(f.input)).selectedRoute, "team");
  exposeNativeOnly(f);
  assert.equal((await resolve({ ...f.input, role: "foreground" })).ready, true);
  f.definitions.delete("subagent");
  await expectFailure({ ...f.input, role: "foreground" }, "native", "NATIVE_FOREGROUND_TOOLS_UNAVAILABLE");
  f.services.tools.get = () => { throw new Error("disposed scope"); };
  await expectFailure({ ...f.input, role: "foreground" }, "unknown", "SCOPED_TOOL_INSPECTION_FAILED");
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
