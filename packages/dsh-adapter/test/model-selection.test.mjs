import test from "node:test";
import assert from "node:assert/strict";
import { selectDshRoleModel } from "../lib/model-selection.js";

const agent = { id: "parent", options: { provider: "openai-codex", model: "gpt-6.1-sol" } };
function environment(overrides = {}) {
  const llm = {
    listModels: async () => [{ id: "gpt-6-astra" }, { id: "gpt-6-luna" }],
    resolveModelInfo: async (provider, id) => ({ provider, id, reasoning: { efforts: [{ id: "high" }, { id: "medium" }] } }),
    resolveCallConfig: async config => config,
    ...overrides,
  };
  return key => key === "llm" ? llm : undefined;
}

test("researcher inherits caller options and never discovers another model", async () => {
  const selection = await selectDshRoleModel({ agent, role: "researcher", supportsOptions: true,
    hints: { model: "other", reasoningEffort: "medium" },
    getService: () => { throw new Error("researcher must not consult a directory"); } });
  assert.equal(selection.requested.intent, "inherit");
  assert.deepEqual(selection.applied.options, agent.options);
  assert.equal(selection.applied.mode, "explicit");
  assert.equal(selection.resolved.known, false);
});

test("architect tries the advertised preferred example and supported high effort", async () => {
  const selection = await selectDshRoleModel({ agent, role: "feature-architect", supportsOptions: true, getService: environment() });
  assert.deepEqual(selection.applied.options, { provider: "openai-codex", model: "gpt-6-astra", reasoningEffort: "high" });
  assert.equal(selection.resolved.known, false);
});

test("finalizer tries Luna but unsupported effort is omitted rather than a gate", async () => {
  const selection = await selectDshRoleModel({ agent, role: "finalizer", supportsOptions: true,
    hints: { reasoningEffort: "unavailable" }, getService: environment() });
  assert.deepEqual(selection.applied.options, { provider: "openai-codex", model: "gpt-6-luna" });
  assert.equal(selection.reason, "effort-unavailable");
});

test("unknown directory and no options both have valid inherited recipes", async () => {
  for (const input of [
    { supportsOptions: false, getService: environment() },
    { supportsOptions: true, getService: () => undefined },
  ]) {
    const selection = await selectDshRoleModel({ agent, role: "finalizer", ...input });
    assert.equal(selection.applied.mode, "inherit");
    assert.equal(selection.resolved.known, false);
  }
});

test("unavailable preferred model can still apply a validated caller-route effort", async () => {
  const selection = await selectDshRoleModel({ agent, role: "finalizer", supportsOptions: true,
    hints: { model: "missing-model", reasoningEffort: "medium" }, getService: environment({
      resolveModelInfo: async (provider, id) => {
        if (id === "missing-model") throw new Error("unavailable preference");
        return { provider, id, reasoning: { efforts: [{ id: "medium" }] } };
      },
    }) });
  assert.deepEqual(selection.applied.options, { reasoningEffort: "medium" });
  assert.equal(selection.reason, "model-unavailable");
});

test("caller identity may come from a supported request-header observation", async () => {
  const llm = environment();
  const selection = await selectDshRoleModel({ agent: { id: "parent" }, role: "finalizer", supportsOptions: true,
    getService: key => key === "sessionQuery" ? {
      readSession: async id => { assert.equal(id, "parent"); return { events: [{ type: "request/header", data: {
        header: { config: agent.options },
      } }] }; },
    } : llm(key) });
  assert.equal(selection.applied.options.model, "gpt-6-luna");
  assert.equal(selection.resolved.known, false, "parent facts are not child proof");
});

test("unsupported preference metadata never triggers a trial launch", async () => {
  const selection = await selectDshRoleModel({ agent, role: "finalizer", supportsOptions: true,
    getService: environment({ resolveCallConfig: async () => { throw new Error("preflight unsupported"); } }) });
  assert.equal(selection.applied.mode, "inherit");
  assert.equal(selection.reason, "catalog-unavailable");
});
