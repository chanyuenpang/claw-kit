import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = (await fs.readFile(new URL("../scripts/session-start.mjs", import.meta.url), "utf8"))
  .replace(/^import .*?;\r?\n/gm, "");

async function invoke(context, { status = 0, raw, payload = {} } = {}) {
  const calls = [];
  const output = [];
  const fakeProcess = {
    platform: "linux", env: {}, cwd: () => "/project",
    stdin: (async function* () { yield JSON.stringify(payload); })(),
    stdout: { write(value) { output.push(value); } },
  };
  const run = vm.runInNewContext("(async () => {\n" + source + "\n})", {
    process: fakeProcess,
    spawnSync(command, args, options) {
      calls.push({ command, args: [...args], options });
      return { status, stdout: raw ?? JSON.stringify(context), stderr: "" };
    },
  });
  await run();
  assert.equal(output.length, 1);
  return { result: JSON.parse(output[0]), calls };
}

for (const [name, context, options] of [
  ["empty context", {}, {}],
  ["project", { project: { projectName: "P" } }, {}],
  ["workflow", { activeWorkflow: { planStatus: "process.active", workflowGuidance: { stage: "execution" } } }, {}],
  ["CLI error", {}, { status: 1, raw: "" }],
  ["malformed CLI output", {}, { raw: "not-json" }],
]) {
  test("Codex SessionStart emits host identity for " + name, async () => {
    const { result, calls } = await invoke(context, options);
    assert.equal(result.hookSpecificOutput.hookEventName, "SessionStart");
    const text = result.hookSpecificOutput.additionalContext;
    assert.match(text, /^\[claw host\]\nplatform: codex\n/);
    assert.equal(text.match(/\[claw host\]/g).length, 1);
    assert.deepEqual(calls[0].args, ["context", "--host", "codex"]);
    if (!context.activeWorkflow) assert.doesNotMatch(text, /snapshot is recovered/);
  });
}

test("Codex identity ignores model and stale host-looking input paths", async () => {
  const payload = { cwd: "/project", session_id: "host-session", model: "claude", provider: "other", platform: "cindy", skillPath: "/opencode/skills/using-claw-kit" };
  const { result, calls } = await invoke({ project: { projectName: "P" } }, { payload });
  assert.match(result.hookSpecificOutput.additionalContext, /^\[claw host\]\nplatform: codex\n/);
  assert.equal(calls[0].options.env.CLAW_SESSION_ID, "host-session");
  assert.equal(calls[0].options.env.CLAW_HOST, undefined);
  assert.equal(payload.model, "claude");
  assert.equal(payload.provider, "other");
});
