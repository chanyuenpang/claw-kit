import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const source = await fs.readFile(new URL("../src/native-start.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { startNativeActivation, nativeActivationSpec, nativeChildName } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const signal = new AbortController().signal;
const spec = () => nativeActivationSpec({ parent: { id: "lead" }, prompt: [{ type: "text", text: "write" }] },
  { provider: "spawn", label: "writer", signal });
const start = startNativeActivation;
{
  test(start.name + " prefers current API and preserves receipt and live request", async () => {
    const input = spec(); let calls = 0;
    const receipt = { childId: "child", result: Promise.resolve(), dispose: async () => {} };
    const service = { async startActivation(value) { calls++; assert.equal(this, service); assert.equal(value, input); return receipt; },
      start() { assert.fail("no legacy fallback"); }, startContinuable() { assert.fail("no legacy fallback"); } };
    assert.equal(await start(service, input), receipt);
    assert.equal(calls, 1);
  });
  test(start.name + " never retries owner rejection through another API", async () => {
    const failure = Object.assign(new Error("owner outcome unknown"), { code: "OWNER_UNKNOWN", outcome: "unknown" });
    let calls = 0;
    await assert.rejects(start({ async startActivation() { calls++; throw failure; },
      start() { assert.fail("no replay"); }, startContinuable() { assert.fail("no replay"); } }, spec()), error => error === failure);
    assert.equal(calls, 1);
  });
  test(start.name + " marks missing API as known pre-call no effect", async () => {
    await assert.rejects(start({}, spec()), error => error.code === "NATIVE_START_UNAVAILABLE" && error.outcome === "known" && error.effect === "none" && error.phase === "before-call");
  });
}
test("legacy-only services are rejected without invoking them", async () => {
  await assert.rejects(start({ start() { assert.fail("legacy call"); }, startContinuable() { assert.fail("legacy call"); } }, spec()),
    error => error.code === "NATIVE_START_UNAVAILABLE" && error.outcome === "known" && error.effect === "none");
});

// DSH 0.2.2-rc.2 flattened the activation request and made delivery explicit.
test("rc.2 activation spec is flat with explicit delivery and no nested request", () => {
  const value = spec();
  assert.equal(value.request, undefined, "rc.2 rejects a nested request");
  assert.equal(value.parent.id, "lead");
  assert.deepEqual(value.prompt, [{ type: "text", text: "write" }]);
  assert.equal(value.provider, "spawn");
  assert.equal(value.label, "writer");
  assert.equal(value.signal, signal);
  assert.equal(value.delivery, "caller", "adapter owns the result instead of model notification");
  assert.equal("agentOptions" in value, false, "empty agentOptions must stay absent, not {}");
  assert.equal("childId" in value, false);
  assert.equal("name" in value, false);
});

test("rc.2 activation spec carries optional reserved identity and options", () => {
  const value = nativeActivationSpec({
    parent: { id: "lead" }, prompt: [{ type: "text", text: "go" }],
    agentOptions: { provider: "p", model: "m", reasoningEffort: "high" },
    childId: "0b6f9f4e-1111-5aaa-a222-333344445555", name: "claw-researcher",
  }, { provider: "spawn", label: "role", signal, delivery: "parent" });
  assert.deepEqual(value.agentOptions, { provider: "p", model: "m", reasoningEffort: "high" });
  assert.equal(value.childId, "0b6f9f4e-1111-5aaa-a222-333344445555");
  assert.equal(value.name, "claw-researcher");
  assert.equal(value.delivery, "parent");
});

test("rc.2 child names satisfy the host name rules or defer to the host", () => {
  assert.equal(nativeChildName("claw-kit:delegate:researcher:abc"), "claw-kit-delegate-researcher-abc");
  assert.equal(nativeChildName("knowledge-source-abc"), "knowledge-source-abc");
  assert.match(nativeChildName("claw-kit:delegate-once:" + "f".repeat(64)), /^[a-z][a-z0-9-]{0,31}$/);
  assert.equal(nativeChildName("lead"), undefined, "the root name is reserved");
  assert.equal(nativeChildName("---"), undefined);
  assert.equal(nativeChildName(undefined), undefined);
});
