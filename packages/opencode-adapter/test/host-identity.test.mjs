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

async function harness({ project = true, context = {}, fail = false } = {}) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, __dirname: path.dirname(fileURLToPath(pluginUrl)), __filenameUrl: pluginUrl.href,
    process: { env: {} }, console,
    require(name) {
      if (name === "./failure-diagnostics.js") return failureExports;
      if (name === "node:path") return path;
      if (name === "node:fs") return {
        existsSync: (file) => project && (file.endsWith(".claw") || file.endsWith("project.json")),
        readFileSync: () => JSON.stringify({ id: "p", name: "Fixture" }),
        readdirSync: () => [], statSync: () => ({ isDirectory: () => false }),
      };
      if (name === "node:child_process") return {
        execSync(command, options) { calls.push({ command, options }); if (fail) throw new Error("CLI unavailable"); return JSON.stringify(context); },
        spawn() { throw new Error("No worker should launch during identity injection"); },
      };
      throw new Error("Unexpected import: " + name);
    },
  });
  const hooks = await exports.ClawKitPlugin({ directory: "/fixture", client: {}, model: "codex", provider: "openai" });
  return { hooks, calls, exports };
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
