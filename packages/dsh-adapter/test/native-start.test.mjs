import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const source = await fs.readFile(new URL("../src/native-start.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { startNativeActivation } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const spec = () => ({ provider: "spawn", label: "writer", signal: new AbortController().signal, request: { parent: { id: "lead" }, prompt: [{ type: "text", text: "write" }] } });
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

