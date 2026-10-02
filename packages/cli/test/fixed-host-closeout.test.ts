import test from "node:test";
import { assert, fs, path, createFixture, runClaw } from "./cli-test-support.js";

test("Codex invoke registers its actual adapter collector after first project initialization", () => {
  const root = createFixture("first-codex-collector");
  const adapterRoot = path.resolve("packages/codex-adapter");
  const encode = (text: string) => text.split("").map(character => character.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  const env = { CLAW_SESSION_ID: "first-codex-collector", CLAW_HOST: "codex" };
  runClaw(["codex", "invoke", encode(JSON.stringify(["context"])), encode(adapterRoot)], root, env);
  runClaw(["init", "--name", "First project"], root, env);
  runClaw(["codex", "invoke", encode(JSON.stringify(["plan", "create", "First plan", "--goal", "Register collector"])), encode(adapterRoot)], root, env);
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, ".claw", "runtime", "report-collectors", "codex.json"), "utf8"));
  assert.equal(descriptor.host, "codex");
  assert.equal(descriptor.executable, process.execPath);
  assert.deepEqual(descriptor.args, [path.join(adapterRoot, "scripts", "report-collector.mjs")]);
  const result = runClaw(["codex", "invoke", encode(JSON.stringify(["context"])), encode(adapterRoot)], root, env);
  assert.equal(result.command, "context");
  assert.ok(result.output);
});
