import { test, assert, fs, path, createFixture, runClaw, runClawHook } from "./cli-test-support.js";

const env = { CLAW_HOST: "opencode", CLAW_SESSION_ID: "capture-test", CLAW_KNOWLEDGE_CAPTURE_RESULT: "1", CLAW_KNOWLEDGE_FINALIZER: "0" };
test("capture machine result covers skips, errors, and successful deduplicated reports", () => {
  const root = createFixture("capture-protocol");
  const payload = { cwd: root, session_id: "capture-test", turn_id: "turn-1", message: "Final report" };
  const capture = (extra = {}, settings = env) => {
    const result = runClawHook("auto-doc", root, { ...payload, ...extra }, settings);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(capture(), { ok: true, captured: false });
  runClaw(["init"], root, env);
  assert.deepEqual(capture(), { ok: true, captured: false });
  assert.deepEqual(capture({ message: "" }), { ok: true, captured: false });
  assert.deepEqual(capture({}, { ...env, CLAW_KNOWLEDGE_FINALIZER: "1" }), { ok: true, captured: false });
  assert.equal(runClawHook("auto-doc", root, payload, { ...env, CLAW_KNOWLEDGE_CAPTURE_RESULT: "0" }).stdout, "");
  runClaw(["plan", "create", "capture-test"], root, env);
  const captured = capture();
  assert.equal(captured.captured, true);
  assert.equal(capture().duplicate, true);
  const config = path.join(root, ".claw", "project.json");
  fs.writeFileSync(config, "{");
  const failure = capture();
  assert.equal(failure.ok, false);
  assert.equal(typeof failure.error.code, "string");
  assert.equal(failure.error.operation, "report.capture");
});
