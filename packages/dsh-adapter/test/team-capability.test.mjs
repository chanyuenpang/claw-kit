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

// DSH 0.2.2-rc.2: TeamService owns only shared task boards. Teammate creation,
// messaging and the member roster are gone, so no Team surface is a role carrier.
function fixture() {
  const agent = { id: "lead-id", options: { model: "model-a", reasoningEffort: "high" } };
  const provider = { name: "spawn", inheritsParentContext: false, capabilities: { agentOptions: true }, start: never, prepareContinuable: never };
  const requestedServices = [];
  const services = {
    // Only reachable if a Team path is (wrongly) consulted again.
    agentTeams: {
      tryMembership: never, listMembers: never, spawnTeammate: never, sendMessage: never,
      isEnabled() { return true; }, setEnabled: never, createTask: never, getTask: never, listTasks: never, updateTask: never,
    },
    subagents: { getProvider: (name) => name === provider.name ? provider : undefined, startActivation: never, sendMessage: never },
  };
  const input = { agent, role: "managed", provider: "spawn", getService(name) { requestedServices.push(name); return services[name]; } };
  return { agent, provider, requestedServices, services, input };
}

async function expectFailure(input, reason) {
  const result = await resolve(input);
  assert.equal(result.ready, false);
  assert.equal(result.reason, reason);
  return result;
}

test("managed roles select the native subagents carrier and never consult rc.2 Team", async () => {
  const f = fixture();
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: true });
  assert.deepEqual(f.requestedServices, ["subagents"]);
});

test("foreground role needs the same native carrier as managed and finalizer roles", async () => {
  const f = fixture();
  assert.deepEqual(await resolve({ ...f.input, role: "foreground" }), { selectedRoute: "native", ready: true, provider: "spawn", reusable: true });
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: true, supportsOptions: true });
  assert.equal(f.requestedServices.includes("agentTeams"), false);
});

test("rc.2 task-board-only Team service is transparent and never a route gate", async () => {
  const f = fixture();
  for (const change of [
    () => { delete f.services.agentTeams; },
    () => { f.services.agentTeams = { isEnabled() { return false; } }; },
  ]) {
    change();
    assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: true });
    assert.equal(f.requestedServices.includes("agentTeams"), false);
  }
});

test("native preserves a valid one-shot route when continuation is absent", async () => {
  const f = fixture();
  delete f.provider.prepareContinuable;
  delete f.services.subagents.sendMessage;
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: false });
  delete f.services.subagents.startActivation;
  f.services.subagents.start = never;
  f.services.subagents.startContinuable = never;
  await expectFailure(f.input, "NATIVE_START_UNAVAILABLE");
});

test("provider catalog failure degrades route metadata without blocking a callable carrier", async () => {
  const f = fixture();
  f.services.subagents.getProvider = () => { throw new Error("catalog unavailable"); };
  assert.deepEqual(await resolve(f.input), { selectedRoute: "native", ready: true, provider: "spawn", reusable: false });
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: false, supportsOptions: false });
});

test("native option support is reported to finalizer selection without blocking hints", async () => {
  const f = fixture();
  f.provider.capabilities.agentOptions = false;
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer", requestedModel: "model-b" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: true, supportsOptions: false });
  f.provider.capabilities.agentOptions = true;
  assert.deepEqual(await resolve({ ...f.input, role: "finalizer", requestedModel: "model-b" }),
    { selectedRoute: "native", ready: true, provider: "spawn", reusable: true, supportsOptions: true });
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

test("an invalid provider is rejected before any carrier inspection", async () => {
  const f = fixture();
  await expectFailure({ ...f.input, provider: "" }, "INVALID_PROVIDER");
  assert.equal(f.requestedServices.includes("subagents"), false);
});
