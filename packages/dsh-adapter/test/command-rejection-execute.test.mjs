import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { apply } from "../lib/index.js";
import { SessionCommandExecutor } from "../../cli/dist/session-command.js";
import { SessionRegistryV2 } from "../../cli/dist/session-registry-v2.js";
import { serializeCommandFailure } from "../../cli/dist/command-failure.js";

// Actual tool entry + wire decoder + business owner. Only Host transport is a
// fixture: it carries real CLI executor results, not pre-labelled rejections.
test("claw_run returns actionable no-write rejections, permits correction, and never replays unknown", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-done-entry-"));
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  const actor = { id: "closeout-agent", session: { header: { cwd: project }, append() {} } };
  const identity = { agentSessionId: actor.id, workdir: project, client: { kind: "adapter", host: "dsh" } };
  const executor = new SessionCommandExecutor(new SessionRegistryV2(path.join(root, "runtime")));
  executor.service.scheduleRefresh = () => {}; // No unrelated background maintenance in the fixture.
  const requests = [], businessCalls = [], handles = [], events = new Map();
  const execute = executor.service.execute.bind(executor.service);
  executor.service.execute = async (...args) => { businessCalls.push(args[1]); return execute(...args); };
  let tool, nextFailure;
  const services = {
    subprocess: { spawn(spec) {
      assert.equal(spec.cwd, project);
      assert.equal(spec.env.CLAW_SESSION_ID, actor.id);
      const stdout = new Readable({ read() {} });
      let finish;
      const done = new Promise(resolve => { finish = resolve; });
      const close = () => { stdout.push(null); finish({ exitCode: 0, signal: null }); };
      const handle = { stdout, done, terminate: close, stdin: { write(line) {
        if (line === "session close\n") { close(); return true; }
        const request = JSON.parse(line);
        requests.push(request);
        void (async () => {
          let response;
          if (nextFailure) { response = { ok: false, error: nextFailure }; nextFailure = undefined; }
          else try {
            response = { ok: true, command: request.operation, ...await executor.execute(identity, request) };
            // Worker dispatch has its own tests; never launch a finalizer from this fixture.
            delete response.knowledgeDispatch;
          } catch (error) {
            response = { ok: false, error: serializeCommandFailure(error, "unknown") };
          }
          stdout.push(JSON.stringify(response) + "\n");
        })().catch(error => stdout.destroy(error));
        return true;
      } } };
      handles.push(handle);
      queueMicrotask(() => stdout.push(JSON.stringify({ ok: true, command: "session.open" }) + "\n"));
      return handle;
    } },
    tools: { register(definition) { tool = definition; } },
    systemPrompt: { context() {}, section() {} },
    goals: { create: () => "fixture-goal", complete() {}, get: () => undefined },
  };
  apply({ get: name => services[name], on: (name, callback) => events.set(name, callback) });
  t.after(async () => {
    events.get("dispose")?.();
    for (const handle of handles) handle.terminate();
    await Promise.all(handles.map(handle => handle.done));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  const invoke = (operation, args = {}) => tool.execute({ operation, args }, { agent: actor });
  const created = await invoke("plan.create", { title: "Correct closeout", knowledge_capture: true });
  assert.ok(created.planPath, JSON.stringify(created));
  await invoke("plan.start", { add_tasks: [{ title: "Work" }] });
  await invoke("task.done", { id: 2 });
  const before = fs.readFileSync(created.planPath, "utf8");

  for (const [args, code] of [
    [{ retrospective: { summary: "done", what_worked: ["docs"] } }, "COMMAND_INPUT_INVALID"],
    [{}, "RETROSPECTIVE_REQUIRED"],
    [{ retrospective: "  " }, "RETROSPECTIVE_REQUIRED"],
  ]) {
    const sends = requests.length, calls = businessCalls.length;
    const rejected = await invoke("plan.done", args);
    assert.equal(requests.length, sends + 1, "one owner request, no automatic retry/fallback");
    assert.equal(businessCalls.length, calls + (code === "COMMAND_INPUT_INVALID" ? 0 : 1));
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, code);
    assert.equal(rejected.error.phase, "prepare");
    assert.equal(rejected.error.outcome, "known");
    assert.equal(rejected.error.effect, "none");
    assert.match(rejected.notes, /Correct the arguments and submit again/);
    assert.doesNotMatch(JSON.stringify(rejected), /CLAW_OUTCOME_UNKNOWN|do not replay/i);
    assert.equal(fs.readFileSync(created.planPath, "utf8"), before);
  }
  assert.equal(requests.find(r => r.input.retrospectiveSummary?.summary)?.input.retrospectiveSummary.summary, "done",
    "invalid input reaches the decoder instead of silently disappearing");
  const sends = requests.length;
  const corrected = await invoke("plan.done", { retrospective: "Work verified.", what_worked: ["Docs checked"] });
  assert.equal(requests.length, sends + 1);
  assert.equal(corrected.planStatus, "end.completed");
  assert.equal(JSON.parse(fs.readFileSync(created.planPath, "utf8")).retrospective.summary, "Work verified.");

  await invoke("plan.create", { title: "No capture needs no retrospective", knowledge_capture: false });
  await invoke("plan.start", { add_tasks: [{ title: "Work" }] });
  const noCaptureProgress = await invoke("task.done", { id: 2 });
  assert.ok(noCaptureProgress.commandHints.includes("claw plan done"));
  assert.doesNotMatch(JSON.stringify(noCaptureProgress), /--retrospective/);
  const noCaptureDone = await invoke("plan.done");
  assert.equal(noCaptureDone.planStatus, "end.completed");
  assert.equal(noCaptureDone.knowledgeDispatch, undefined);

  await invoke("plan.create", { title: "Unknown closeout", knowledge_capture: false });
  nextFailure = { code: "ECONNRESET", message: "response lost", phase: "commit", outcome: "unknown", effect: "unknown" };
  const unknownSends = requests.length;
  await assert.rejects(invoke("plan.done", { retrospective: "Do not resend" }), error => {
    assert.equal(error.code, "ECONNRESET");
    assert.equal(error.outcome, "unknown");
    assert.match(error.message, /do not replay an uncertain mutation/);
    assert.match(error.message, /limited to the affected attempt\/target/);
    assert.match(error.message, /read-only diagnosis and unrelated work may continue/);
    return true;
  });
  assert.equal(requests.length, unknownSends + 1, "unknown response must not cause a resend or baseline fallback");
  assert.equal((await invoke("plan.show", { simple: true })).planStatus, "process.discussing", "read-only diagnosis remains available");
});
