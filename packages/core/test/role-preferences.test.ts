import test from "node:test";
import assert from "node:assert/strict";
import { parseRoleSelection, roleLaunchRecipe, roleModelIntent, selectRoleModelPreference } from "../src/role-preferences.js";

test("role intent separates high capability, caller inheritance, and low cost", () => {
  assert.equal(roleModelIntent("feature-architect"), "high-capability");
  assert.equal(roleModelIntent("researcher"), "inherit");
  assert.equal(roleModelIntent("finalizer"), "low-cost");
});

test("researcher directly inherits without applying a competing model or effort", () => {
  const selection = selectRoleModelPreference({ role: "researcher", supportsOptions: true,
    inherited: { provider: "caller", model: "caller-model", reasoningEffort: "medium" },
    hints: { model: "other-model", reasoningEffort: "high" }, candidate: { model: "other-model" } });
  assert.deepEqual(selection.requested, { intent: "inherit" });
  assert.deepEqual(selection.applied, { mode: "explicit", options: {
    provider: "caller", model: "caller-model", reasoningEffort: "medium",
  } });
  assert.deepEqual(selection.resolved, { known: false });
});

test("architect applies a Host-validated high capability candidate and high effort", () => {
  const selection = selectRoleModelPreference({ role: "feature-architect", supportsOptions: true,
    candidate: { model: "host-advanced", reasoningEffort: "high" } });
  assert.equal(selection.requested.intent, "high-capability");
  assert.deepEqual(selection.applied.options, { model: "host-advanced", reasoningEffort: "high" });
  assert.equal(selection.resolved.known, false, "submitted options are not evidence of actual execution");
});

test("finalizer may use another validated low-cost route without exact brand matching", () => {
  const selection = selectRoleModelPreference({ role: "finalizer", supportsOptions: true,
    hints: { model: "preferred-small", reasoningEffort: "medium" },
    candidate: { model: "host-small" } });
  assert.equal(selection.requested.model, "preferred-small");
  assert.deepEqual(selection.applied.options, { model: "host-small" });
  assert.equal(selection.reason, "model-alternative");
});

test("missing catalog or options produces a transparent inherited recipe, not a gate", () => {
  for (const [capability, reason] of [
    [{ supportsOptions: false }, "options-unavailable"],
    [{ supportsOptions: true, catalogAvailable: false }, "catalog-unavailable"],
  ] as const) {
    const selection = selectRoleModelPreference({ role: "finalizer", hints: { model: "preferred-small" }, ...capability });
    assert.equal(selection.applied.mode, "inherit");
    assert.equal(selection.reason, reason);
    assert.equal(selection.resolved.known, false);
  }
});

test("independently validated options do not require a complete model directory", () => {
  const selection = selectRoleModelPreference({ role: "finalizer", supportsOptions: true, catalogAvailable: false,
    candidate: { model: "validated-route" } });
  assert.deepEqual(selection.applied.options, { model: "validated-route" });
});

test("unsupported model and unsupported effort degrade independently", () => {
  const selection = selectRoleModelPreference({ role: "finalizer", supportsOptions: true,
    hints: { model: "missing", reasoningEffort: "medium" }, candidate: { reasoningEffort: "low" } });
  assert.deepEqual(selection.applied.options, { reasoningEffort: "low" });
  assert.equal(selection.reason, "model-unavailable");
  const missingEffort = selectRoleModelPreference({ role: "finalizer", supportsOptions: true,
    hints: { reasoningEffort: "medium" }, candidate: { model: "validated-route" } });
  assert.equal(missingEffort.reason, "effort-unavailable");
  assert.deepEqual(missingEffort.applied.options, { model: "validated-route" });
});

test("unfulfilled preferences do not change a compatible launch recipe", () => {
  const select = (model: string) => selectRoleModelPreference({ role: "finalizer", supportsOptions: false, hints: { model } });
  assert.deepEqual(roleLaunchRecipe(select("preferred-a")), roleLaunchRecipe(select("preferred-b")));
});

test("selection metadata round-trips and unknown actual settings cannot be invented", () => {
  const selection = selectRoleModelPreference({ role: "finalizer", supportsOptions: false,
    hints: { model: "preferred" }, inherited: { provider: "caller", model: "actual-parent" } });
  assert.deepEqual(parseRoleSelection(JSON.parse(JSON.stringify(selection))), selection);
  assert.throws(() => parseRoleSelection({ ...selection,
    resolved: { known: false, model: "fabricated-child" } }), /Unknown model/);
  assert.throws(() => parseRoleSelection({ ...selection,
    requested: { ...selection.requested, extra: true } }), /Invalid role selection metadata/);
});

test("soft preferences do not turn malformed payloads into valid requests", () => {
  assert.throws(() => roleModelIntent("bad-role" as never), /Invalid delegation role/);
  assert.throws(() => selectRoleModelPreference({ role: "finalizer", supportsOptions: true,
    hints: { model: "" } }), /Invalid role model preference/);
});
