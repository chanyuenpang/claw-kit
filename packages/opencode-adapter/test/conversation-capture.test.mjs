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
  .replaceAll("import.meta.dirname", "__dirname").replaceAll("import.meta.url", "__filenameUrl");
const failureExports = {};
vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL("../plugin/failure-diagnostics.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: failureExports });

function info(id, role = "assistant", sessionID = "s", created = 1000) {
  return { id, role, sessionID, time: { created } };
}
function part(messageID, id, text, extra = {}) {
  return { id, sessionID: "s", messageID, type: "text", text, ...extra };
}
async function fixture({ history = async () => ({ data: [] }), queue = false } = {}) {
  const captures = [], order = [], warnings = [], requests = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, __dirname: path.dirname(fileURLToPath(pluginUrl)), __filenameUrl: pluginUrl.href,
    process: { env: {} }, console: { info() {}, warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === "./failure-diagnostics.js") return failureExports;
      if (name === "node:path") return path;
      if (name === "node:fs") return { existsSync: file => file.endsWith(".claw") };
      if (name === "node:child_process") return { execSync(command, options) {
        if (command.includes("hook auto-doc")) {
          order.push("capture"); captures.push(JSON.parse(options.input));
          return JSON.stringify(queue ? { ok: true, jobPath: "/fixture/job.json", finalizeId: "fin" } : { ok: true, captured: true });
        }
        if (command.includes("internal-knowledge-dispatch")) { order.push("dispatch"); return JSON.stringify({ dispatch: { prompt: "bootstrap" } }); }
        if (command.includes("--action reserve")) return JSON.stringify({ execute: false });
        return JSON.stringify({ executions: [] });
      } };
      throw new Error("Unexpected import: " + name);
    },
  });
  const hooks = await exports.ClawKitPlugin({ directory: "/fixture", client: { session: {
    messages: async request => { requests.push(request); order.push("history"); return history(request); },
    get: async () => ({ data: { id: "s" } }),
  } } });
  const event = (type, properties) => hooks.event({ event: { type, properties } });
  return { event, captures, order, warnings, requests,
    message: value => event("message.updated", { info: value }),
    part: value => event("message.part.updated", { part: value }),
    idle: (sessionID = "s") => event("session.idle", { sessionID }),
  };
}

test("aggregates user plus every assistant message and text part without duplicating streaming", async () => {
  const f = await fixture();
  await f.message(info("u", "user", "s", 1000));
  await f.part(part("u", "u1", "Please implement"));
  // Parts can arrive before message metadata; role is never guessed from a part.
  await f.part(part("a1", "p1", "I will"));
  await f.message(info("a1", "assistant", "s", 2000));
  await f.part(part("a1", "p1", "I will inspect first"));
  await f.part(part("a1", "p2", "Commentary stays"));
  await f.message(info("a2", "assistant", "s", 3000));
  await f.part(part("a2", "p3", "Final stays"));
  await f.message(info("other", "assistant", "other", 4000));
  await f.part(part("other", "op", "Other session", { sessionID: "other" }));
  await f.idle();
  assert.deepEqual(f.captures[0].conversation_entries.map(e => [e.message_id, e.role, e.message]), [
    ["u", "user", "Please implement"], ["a1", "assistant", "I will inspect first\n\nCommentary stays"], ["a2", "assistant", "Final stays"],
  ]);
  assert.equal(f.captures[0].conversation_entries[0].occurred_at, "1970-01-01T00:00:01.000Z");
  await f.idle();
  assert.equal(f.captures.length, 1, "duplicate idle must not replay capture");
});

test("strictly excludes reasoning, tools, system, synthetic, ignored and compaction content", async () => {
  const f = await fixture();
  for (const [id, role] of [["u", "user"], ["a", "assistant"], ["sys", "system"], ["tool", "tool"]]) {
    await f.message(info(id, role));
    await f.part(part(id, id + "text", id === "u" ? "Request" : id === "a" ? "Ordinary answer" : "SECRET"));
  }
  await f.message({ ...info("summary"), summary: true });
  await f.part(part("summary", "sum", "SECRET summary"));
  await f.part(part("a", "reason", "SECRET reasoning", { type: "reasoning" }));
  await f.part(part("a", "call", "SECRET tool", { type: "tool", state: { output: "SECRET output" } }));
  await f.part(part("u", "inject", "SECRET injected", { synthetic: true }));
  await f.part(part("u", "ignore", "SECRET ignored", { ignored: true }));
  await f.part(part("unknown", "orphan", "SECRET unknown role"));
  await f.idle();
  const entries = f.captures[0].conversation_entries;
  assert.deepEqual(entries.map(e => e.message), ["Request", "Ordinary answer"]);
  assert.doesNotMatch(JSON.stringify(f.captures), /SECRET/);
});

test("history backfills missed messages and capture precedes queue dispatch", async () => {
  const f = await fixture({ queue: true, history: async () => ({ data: [
    { info: info("old-user", "user"), parts: [part("old-user", "u", "Historical request")] },
    { info: info("answer", "assistant", "s", 2000), parts: [part("answer", "a", "Historical answer")] },
    { info: info("foreign", "user", "foreign"), parts: [part("foreign", "f", "Foreign secret", { sessionID: "foreign" })] },
  ] }) });
  await f.idle();
  assert.deepEqual(f.captures[0].conversation_entries.map(e => e.message), ["Historical request", "Historical answer"]);
  assert.deepEqual(f.order, ["history", "capture", "dispatch"]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0])), { path: { id: "s" }, query: { directory: "/fixture" } });
});

for (const failure of ["throw", "resolved-error"]) {
  test("history failure remains best effort: " + failure, async () => {
    const f = await fixture({ history: async () => {
      if (failure === "throw") throw new Error("Unavailable");
      return { error: { code: "HISTORY_DENIED", message: "Unavailable" } };
    } });
    await f.message(info("a"));
    await f.part(part("a", "p", "Event fallback"));
    await f.idle();
    assert.equal(f.captures[0].conversation_entries[0].message, "Event fallback");
    assert.equal(f.warnings.length, 1);
    if (failure === "resolved-error") assert.equal(JSON.parse(f.warnings[0][1]).code, "HISTORY_DENIED");
  });
}
