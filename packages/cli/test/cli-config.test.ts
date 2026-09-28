import {
  test,
  assert,
  fs,
  path,
  createFixture,
  runClaw,
  runClawExpectFailure,
} from "./cli-test-support.js";

test("cli config gets and writes typed key values", () => {
  const root = createFixture("config-keys");
  runClaw(["init", "--name", "Config Keys"], root);

  const initial = runClaw(["config", "get", "--layer", "personal", "--key", "var.feature"], root);
  assert.equal(initial.layer, "personal");
  assert.equal(initial.path, "var.feature");
  assert.equal(initial.present, false);

  const falseSet = runClaw([
    "config", "set", "--layer", "personal", "--key", "var.feature", "--value", "false",
    "--revision", String(initial.revision),
  ], root);
  assert.equal(((falseSet.personal as Record<string, unknown>).var as Record<string, unknown>).feature, false);

  const nullSet = runClaw([
    "config", "set", "--layer", "personal", "--key", "var.nullable", "--value", "null",
    "--revision", String((falseSet.revisions as Record<string, unknown>).personal),
  ], root);
  assert.equal(((nullSet.personal as Record<string, unknown>).var as Record<string, unknown>).nullable, null);

  const unset = runClaw([
    "config", "unset", "--layer", "personal", "--key", "var.nullable",
    "--revision", String((nullSet.revisions as Record<string, unknown>).personal),
  ], root);
  assert.equal(((unset.personal as Record<string, unknown>).var as Record<string, unknown>).nullable, undefined);

  const readUnset = runClaw(["config", "get", "--layer", "personal", "--key", "var.nullable"], root);
  assert.equal(readUnset.present, false);
});

test("cli config rejects invalid JSON without modifying configuration", () => {
  const root = createFixture("config-invalid-json");
  runClaw(["init", "--name", "Config Invalid JSON"], root);
  const configPath = path.join(root, ".claw", "project.json");
  const before = fs.readFileSync(configPath, "utf-8");

  const failure = runClawExpectFailure([
    "config", "set", "--layer", "team", "--key", "var.feature", "--value", "{not json}", "--revision", "unused",
  ], root);
  assert.equal((failure.error as { code: string }).code, "PROJECT_CONFIG_INVALID");
  assert.equal((failure.error as { message: string }).message, "config set --value must be complete JSON text.");
  assert.equal(fs.readFileSync(configPath, "utf-8"), before);

  const missingRevision = runClawExpectFailure([
    "config", "set", "--layer", "team", "--key", "var.feature", "--value", "true",
  ], root);
  assert.equal((missingRevision.error as { code: string }).code, "PROJECT_CONFIG_INVALID");
  assert.equal((missingRevision.error as { message: string }).message, "config set requires --revision.");
  assert.equal(fs.readFileSync(configPath, "utf-8"), before);
});

test("cli config rejects stale revisions", () => {
  const root = createFixture("config-stale-revision");
  runClaw(["init", "--name", "Config Stale Revision"], root);
  const initial = runClaw(["config", "get", "--layer", "personal", "--key", "var.first"], root);

  runClaw([
    "config", "set", "--layer", "personal", "--key", "var.first", "--value", "true",
    "--revision", String(initial.revision),
  ], root);
  const failure = runClawExpectFailure([
    "config", "set", "--layer", "personal", "--key", "var.second", "--value", "false",
    "--revision", String(initial.revision),
  ], root);
  assert.equal((failure.error as { code: string }).code, "PROJECT_CONFIG_CONFLICT");
});
