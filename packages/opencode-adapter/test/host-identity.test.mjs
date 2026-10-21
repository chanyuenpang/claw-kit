import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const pluginUrl = new URL("../plugin/index.ts", import.meta.url);
const source = await fs.readFile(pluginUrl, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  .replaceAll("import.meta.dirname", "__dirname")
  .replaceAll("import.meta.url", "__filenameUrl");
const failureSource = await fs.readFile(new URL("../plugin/failure-diagnostics.ts", import.meta.url), "utf8");
const failureExports = {};
vm.runInNewContext(ts.transpileModule(failureSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: failureExports });

async function harness({ project = true, context = {}, fail = false, commandResult, captureOutput, client = {} } = {}) {
  const calls = [];
  const warnings = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, __dirname: path.dirname(fileURLToPath(pluginUrl)), __filenameUrl: pluginUrl.href,
    process: { env: {} }, console: { ...console, warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === "./failure-diagnostics.js") return failureExports;
      if (name === "node:path") return path;
      if (name === "node:fs") return {
        existsSync: (file) => (typeof project === "function" ? project() : project) && (file.endsWith(".claw") || file.endsWith("project.json")),
        readFileSync: () => JSON.stringify({ id: "p", name: "Fixture" }),
        readdirSync: () => [], statSync: () => ({ isDirectory: () => false }),
      };
      if (name === "node:child_process") return {
        execSync(command, options) { calls.push({ command, options }); if (command.includes("hook auto-doc") && captureOutput !== undefined) return captureOutput; if (commandResult) return JSON.stringify(commandResult(command, options)); if (fail) throw new Error("CLI unavailable"); if (command.includes("internal-opencode-finalizer-execution")) return JSON.stringify({ executions: [] }); return JSON.stringify(typeof context === "function" ? context(options.env.CLAW_SESSION_ID) : context); },
        spawn() { throw new Error("No worker should launch during identity injection"); },
      };
      throw new Error("Unexpected import: " + name);
    },
  });
  const hooks = await exports.ClawKitPlugin({ directory: "/fixture", client, model: "codex", provider: "openai" });
  return { hooks, calls, exports, warnings };
}

test("OpenCode writer clears inherited identity and shell injects the child session", async () => {
  const { hooks, exports } = await harness();
  const inherited = { CLAW_HOST: "codex", CLAW_SESSION_ID: "parent", CODEX_THREAD_ID: "parent-thread", CODEX_SESSION_ID: "parent-codex", PATH: "keep" };
  const writer = exports.openCodeWriterEnvironment(inherited);
  assert.equal(writer.CLAW_HOST, "opencode");
  assert.equal(writer.PATH, "keep");
  for (const key of ["CLAW_SESSION_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID"]) assert.equal(writer[key], undefined);
  const output = { env: { ...inherited } };
  await hooks["shell.env"]({ sessionID: "child" }, output);
  assert.equal(output.env.CLAW_SESSION_ID, "child");
  assert.equal(output.env.CLAW_HOST, "opencode");
  assert.equal(output.env.CODEX_THREAD_ID, undefined);
  assert.equal(output.env.CODEX_SESSION_ID, undefined);
  assert.equal(inherited.CLAW_SESSION_ID, "parent");
});

for (const [name, options] of [
  ["non-project", { project: false }],
  ["empty context", { context: {} }],
  ["CLI-unavailable project fallback", { fail: true }],
  ["recovered workflow", { context: { activeWorkflow: { planStatus: "process.active", model: "codex", skillPath: "/codex/skills/using-claw-kit" } } }],
]) {
  test("OpenCode emits its own host marker for " + name, async () => {
    const { hooks, calls } = await harness(options);
    await hooks.event({ event: { type: "session.created" } });
    for (let round = 0; round < 2; round += 1) {
      const output = { system: [] };
      await hooks["experimental.chat.system.transform"]({ model: "codex", provider: "openai" }, output);
      const text = output.system.join("\n");
      assert.match(text, /^\[claw host\]\nplatform: opencode\n/);
      assert.equal(text.match(/\[claw host\]/g).length, 1);
    }
    for (const call of calls) assert.match(call.command, /^claw context --host opencode$/);
    if (options.project === false) assert.equal(calls.length, 0);
  });
}

test("OpenCode first-message synthetic context carries fixed identity once", async () => {
  const { hooks } = await harness({ context: { project: { projectName: "P" } } });
  await hooks.event({ event: { type: "session.created" } });
  const input = { sessionID: "s", messageID: "m", model: "codex" };
  const output = { parts: [], message: { id: "m" } };
  await hooks["chat.message"](input, output);
  await hooks["chat.message"](input, output);
  assert.equal(output.parts.length, 1);
  assert.equal(output.parts[0].synthetic, true);
  assert.match(output.parts[0].text, /^\[claw host\]\nplatform: opencode\n/);
  assert.equal(input.model, "codex");
});

test("startup is session-bound, lazy, and refreshed after compaction", async () => {
  const { hooks, calls } = await harness({ context: id => ({ project: { projectName: id } }) });
  const inject = async id => {
    const output = { parts: [], message: { id: "m" } };
    await hooks["chat.message"]({ sessionID: id }, output);
    return output.parts;
  };
  assert.match((await inject("alpha"))[0].text, /project alpha/);
  assert.match((await inject("beta"))[0].text, /project beta/);
  assert.equal((await inject("alpha")).length, 0);
  await hooks.event({ event: { type: "session.compacted", properties: { sessionID: "alpha" } } });
  assert.match((await inject("alpha"))[0].text, /project alpha/);
  assert.deepEqual(calls.filter(call => call.command.startsWith("claw context")).map(call => call.options.env.CLAW_SESSION_ID), ["alpha", "beta", "alpha"]);
});

test("uninitialized startup has an entry and detects mid-session initialization", async () => {
  let project = false;
  const { hooks, calls } = await harness({ project: () => project, context: () => project ? { project: { projectName: "Created" } } : {} });
  const first = { parts: [], message: { id: "m1" } };
  await hooks["chat.message"]({ sessionID: "s" }, first);
  assert.match(first.parts[0].text, /Small tasks may run directly/);
  project = true;
  const next = { parts: [], message: { id: "m2" } };
  await hooks["chat.message"]({ sessionID: "s" }, next);
  assert.match(next.parts[0].text, /project Created/);
  assert.equal(calls.filter(call => call.command.startsWith("claw context")).length, 2);
});

for (const [output, code] of [
  [JSON.stringify({ ok: true, captured: false }), undefined],
  [JSON.stringify({ ok: true, captured: true }), undefined],
  [JSON.stringify({ ok: false, error: { code: "EACCES", message: "Denied", operation: "report.write" } }), "EACCES"],
  ["", "OPENCODE_CAPTURE_FAILED"],
  ["{", "OPENCODE_CAPTURE_FAILED"],
]) {
  test("idle capture handles result without retry: " + output, async () => {
    const { hooks, calls, warnings } = await harness({ captureOutput: output });
    await hooks.event({ event: { type: "message.updated", properties: { info: { id: "m", role: "assistant", sessionID: "s" } } } });
    await hooks.event({ event: { type: "message.part.updated", properties: { part: { messageID: "m", type: "text", text: "Done" } } } });
    for (let i = 0; i < 2; i++) await hooks.event({ event: { type: "session.idle", properties: { sessionID: "s" } } });
    assert.equal(calls.filter(c => c.command.includes("hook auto-doc")).length, 1);
    const captureWarnings = warnings.filter(w => w[0].includes("report capture"));
    assert.equal(captureWarnings.length, code ? 1 : 0);
    if (code) assert.equal(JSON.parse(captureWarnings[0][1]).code, code);
  });
}

function nativeFixture(failure) {
  let execution;
  const requests = [];
  const permission = [{ permission: "bash", pattern: "*", action: "deny" }];
  const client = { session: {
    get: async () => ({ data: { id: "parent", permission } }),
    create: async request => { requests.push(["create", request]); if (failure === "create") throw new Error("connection lost"); if (failure === "create-reject") return { error: { code: "CREATE_DENIED" } }; return { data: { id: "child" } }; },
    promptAsync: async request => { requests.push(["prompt", request]); if (failure === "send") throw new Error("connection lost"); return failure === "reject" ? { error: { code: "DENIED" } } : {}; },
  } };
  function commandResult(command) {
    if (command.includes("internal-knowledge-dispatch")) return { dispatch: { prompt: "canonical bootstrap" }, writer: { model: "provider/model", reasoningEffort: "high" } };
    if (!command.includes("internal-opencode-finalizer-execution")) return {};
    const action = command.match(/--action (\S+)/)[1];
    if (action === "inspect") return { executions: execution ? [{ finalizeId: "fin", status: "queued", execution }] : [] };
    if (action === "reserve") { if (execution) return { execute: false, execution }; execution = { parentSessionId: "parent", messageId: "msg_fixture", state: "create-attempted" }; return { execute: true, execution }; }
    if (action === "bind") { execution.childSessionId = "child"; execution.state = "created"; }
    if (action === "attempt") { execution.state = "send-attempted"; return { execute: true, execution }; }
    if (["accepted", "rejected", "unknown"].includes(action) && ["create-attempted", "send-attempted"].includes(execution.state)) execution.state = action;
    return { execute: false, execution };
  }
  return { client, commandResult, requests, permission, execution: () => execution };
}

for (const failure of [undefined, "create", "create-reject", "send", "reject"]) {
  test("native writer reserves once and never resends after " + (failure ?? "acceptance"), async () => {
    const fixture = nativeFixture(failure);
    const first = await harness(fixture);
    await first.exports.dispatchOpenCodeKnowledgeWriter(fixture.client, "/fixture", "parent", "/fixture/job.json", "fin");
    const restarted = await harness(fixture);
    await restarted.exports.dispatchOpenCodeKnowledgeWriter(fixture.client, "/fixture", "parent", "/fixture/job.json", "fin");
    assert.equal(fixture.requests.filter(([kind]) => kind === "create").length, 1);
    assert.equal(fixture.requests.filter(([kind]) => kind === "prompt").length, failure?.startsWith("create") ? 0 : 1);
    assert.equal(fixture.execution().state, failure?.includes("reject") ? "rejected" : failure ? "unknown" : "accepted");
    assert.equal(JSON.stringify(fixture.requests[0][1].body.permission), JSON.stringify(fixture.permission));
    if (!failure) {
      const request = fixture.requests[1][1];
      assert.equal(request.path.id, "child");
      assert.equal(request.body.agent, "claw-knowledge-writer");
      assert.equal(request.body.messageID, "msg_fixture");
      assert.equal(request.body.parts[0].text, "canonical bootstrap");
      assert.equal(request.body.model.providerID, "provider");
      assert.equal(request.body.variant, "high");
      const env = { env: {} };
      await restarted.hooks["shell.env"]({ sessionID: "child" }, env);
      assert.equal(env.env.CLAW_KNOWLEDGE_FINALIZER, "1");
      const output = { parts: [], message: { id: "m" } };
      await restarted.hooks["chat.message"]({ sessionID: "child" }, output);
      await restarted.hooks.event({ event: { type: "session.idle", properties: { sessionID: "child" } } });
      assert.equal(output.parts.length, 0);
      assert.equal(restarted.calls.some(c => c.command.includes("hook auto-doc")), false);
      await restarted.hooks["shell.env"]({ sessionID: "parent" }, env);
      assert.equal(env.env.CLAW_KNOWLEDGE_FINALIZER, "0");
    }
  });
}

test("inspection outage suppresses automation without breaking host shell or caching failure", async () => {
  let unavailable = true;
  const { hooks } = await harness({ commandResult: command => {
    if (command.includes("internal-opencode-finalizer-execution")) {
      if (unavailable) throw new Error("CLI unavailable");
      return { executions: [] };
    }
    return {};
  } });
  const output = { env: {} };
  await hooks["shell.env"]({ sessionID: "ordinary" }, output);
  assert.equal(output.env.CLAW_KNOWLEDGE_FINALIZER, "1");
  unavailable = false;
  await hooks["shell.env"]({ sessionID: "ordinary" }, output);
  assert.equal(output.env.CLAW_KNOWLEDGE_FINALIZER, "0");
});
