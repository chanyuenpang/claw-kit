import test from "node:test";
import { fileURLToPath } from "node:url";
import { assert, fs, path, createFixture, runClaw } from "./cli-test-support.js";

test("Codex collector registration failure cannot hide a committed plan mutation", () => {
  const root = createFixture("codex-collector-fail-open");
  const pluginRoot = createFixture("codex-missing-collector");
  const encode = (text: string) => text.split("").map(character => character.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  runClaw(["init", "--name", "Collector Fail Open", "--planning", "false"], root);
  const result = runClaw(["codex", "invoke",
    encode(JSON.stringify(["plan", "create", "Collector-safe", "--goal", "Preserve canonical result"])),
    encode(pluginRoot)], root, { CLAW_SESSION_ID: "collector-fail-open", CLAW_HOST: "codex" });
  assert.equal(result.command, "plan.create");
  assert.equal(fs.existsSync(path.join(root, ".claw", "tasks")), true);
  assert.equal(fs.existsSync(path.join(root, ".claw", "runtime", "report-collectors", "codex.json")), false);
});

test("Codex invoke registers its actual adapter collector after first project initialization", () => {
  const root = createFixture("first-codex-collector");
  const adapterRoot = fileURLToPath(new URL("../../codex-adapter", import.meta.url));
  const encode = (text: string) => text.split("").map(character => character.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  const env = { CLAW_SESSION_ID: "first-codex-collector", CLAW_HOST: "codex" };
  const initialized = runClaw(["codex", "invoke", encode(JSON.stringify(["context"])), encode(adapterRoot)], root, env);
  assert.ok(initialized.output);
  assert.equal(fs.existsSync(path.join(root, ".claw", "project.json")), false);
  runClaw(["codex", "invoke", encode(JSON.stringify(["plan", "create", "First plan", "--goal", "Register collector"])), encode(adapterRoot)], root, env);
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, ".claw", "runtime", "report-collectors", "codex.json"), "utf8"));
  assert.equal(descriptor.host, "codex");
  assert.equal(descriptor.executable, process.execPath);
  assert.deepEqual(descriptor.args, [path.join(adapterRoot, "scripts", "report-collector.mjs")]);
  const result = runClaw(["codex", "invoke", encode(JSON.stringify(["context"])), encode(adapterRoot)], root, env);
  assert.equal(result.command, "context");
  assert.ok(result.output);
});
