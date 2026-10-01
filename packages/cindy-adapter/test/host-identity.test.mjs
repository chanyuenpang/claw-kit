import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../plugin/main.js", import.meta.url), "utf8");
const manifest = JSON.parse(await fs.readFile(new URL("../plugin/ghost.json", import.meta.url), "utf8"));

function harness({ result = { ok: true }, fail = false } = {}) {
  const sent = [], requests = [], timers = [];
  let handle;
  const functions = vm.runInNewContext(source + "\n;({goalContinuationPrompt});", {
    cindy: {
      onHostMessage(callback) { handle = callback; },
      send(value) { sent.push(value); return Promise.resolve({ ok: true }); },
      node: { async request(request) {
        requests.push(request);
        if (fail) return { ok: false, errorCode: "UNAVAILABLE", message: "worker unavailable" };
        if (request.method === "claw/catalog") return { ok: true, result: { categories: [{ name: "plan", operations: [] }] } };
        return { ok: true, result: { ok: true, result } };
      } },
      agent: { run() { throw new Error("No actual continuation during host identity tests"); } },
    },
    console: { error() {} },
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
  });
  return { handle, sent, requests, timers, ...functions };
}

const invocation = (id = "call") => ({
  type: "tool-call", tool: "call_tool", callId: id,
  model: "codex", provider: "openai", platform: "codex", skillPath: "/codex/skills/using-claw-kit",
  args: { name: "plan.show", args: {}, session_context: { session_id: "s", workdir: "/project", workdir_is_local: true } },
});

test("Cindy native metadata identifies its adapter independently of model", () => {
  for (const text of [manifest.description, ...manifest.tools.map((tool) => tool.description)]) {
    assert.match(text, /^\[claw host\]\nplatform: cindy\n/);
    assert.match(text, /independent of model\/provider/);
  }
  assert.deepEqual(manifest.subscribe.topics, ["session", "turn"]);
  assert.equal("hooks" in manifest.subscribe, false);
});

test("Cindy catalogs and repeated operation results override stale host hints without changing model", async () => {
  const h = harness({ result: { ok: true, clawHost: { platform: "codex" } } });
  await h.handle({ type: "tool-call", tool: "list_tools", callId: "catalog", model: "codex", args: {} });
  await h.handle({ type: "tool-call", tool: "list_tools", callId: "category", args: { category: "plan" } });
  const call = invocation();
  await h.handle(call);
  await h.handle(invocation("repeat"));
  assert.equal(h.sent.length, 4);
  for (const response of h.sent) assert.equal(response.result.clawHost.platform, "cindy");
  assert.equal(call.model, "codex");
  assert.equal(call.provider, "openai");
  for (const request of h.requests) {
    assert.equal(request.params.host, undefined);
    assert.equal(request.params.model, undefined);
  }
});

test("Cindy preserves primitive tool values inside the supported result envelope", async () => {
  for (const result of ["done", 7, null, ["value"]]) {
    const h = harness({ result });
    await h.handle(invocation());
    assert.equal(h.sent[0].result.clawHost.platform, "cindy");
    assert.equal(JSON.stringify(h.sent[0].result.value), JSON.stringify(result));
  }
});

test("Cindy unavailable tools and missing session identity expose host without fake recovery", async () => {
  const h = harness({ fail: true });
  await h.handle({ type: "tool-call", tool: "list_tools", callId: "catalog", args: {} });
  await h.handle(invocation());
  await h.handle({ type: "tool-call", tool: "call_tool", callId: "missing-session", args: { name: "plan.show" } });
  for (const response of h.sent) {
    assert.equal(response.ok, false);
    assert.match(response.message, /^\[claw host\]\nplatform: cindy\n/);
    assert.doesNotMatch(response.message, /workflow snapshot is recovered/);
  }
});

test("Cindy continuation identifies host but session-created does not invent prompt injection", async () => {
  const h = harness();
  assert.match(h.goalContinuationPrompt({ taskTitle: "Inspect Codex", model: "codex" }), /^\[claw host\]\nplatform: cindy\n/);
  assert.match(h.goalContinuationPrompt({}), /当前任务/);
  const result = await h.handle({ type: "event", name: "did-session-created", data: { sessionId: "s", workdir: "/project", model: "codex" } });
  assert.equal(result, undefined);
  assert.equal(h.sent.length, 0);
  assert.equal(h.timers.length, 1);
  assert.doesNotMatch(source, /will-user-message|additionalContext/);
});
