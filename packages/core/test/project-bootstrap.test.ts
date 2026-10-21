import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDefaultProjectConfig, ensureProjectEnvironment } from "../src/index.js";

function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), "claw-bootstrap-")); }

test("automatic setup creates local defaults and is byte-preserving when repeated", () => {
  const cwd = fixture();
  const first = ensureProjectEnvironment(cwd);
  assert.equal(first.created, true);
  assert.equal(first.projectRoot, cwd);
  assert.equal(fs.existsSync(path.join(first.clawDir, "memory.md")), false);
  assert.equal(fs.existsSync(path.join(first.clawDir, ".knowledge")), false);
  const files = [first.projectJsonPath, path.join(cwd, ".gitignore")];
  const before = files.map((file) => fs.readFileSync(file, "utf8"));
  const second = ensureProjectEnvironment(cwd);
  assert.equal(second.created, false);
  assert.deepEqual(second.createdPaths, []);
  assert.deepEqual(files.map((file) => fs.readFileSync(file, "utf8")), before);
});

test("automatic setup reuses an ancestor project and preserves custom configuration", () => {
  const cwd = fixture();
  const first = ensureProjectEnvironment(cwd);
  const config = { ...buildDefaultProjectConfig({ cwd }), name: "User project", planning: false, maxTasksToKeep: 19 };
  const source = JSON.stringify(config);
  fs.writeFileSync(first.projectJsonPath, source);
  const overridePath = path.join(first.clawDir, "project-override.json");
  fs.writeFileSync(overridePath, JSON.stringify({ goalMode: false }));
  const override = fs.readFileSync(overridePath, "utf8");
  const child = path.join(cwd, "src", "nested");
  fs.mkdirSync(child, { recursive: true });
  const result = ensureProjectEnvironment(child);
  assert.equal(result.projectRoot, cwd);
  assert.equal(result.projectName, "User project");
  assert.equal(fs.existsSync(path.join(child, ".claw")), false);
  assert.equal(fs.readFileSync(first.projectJsonPath, "utf8"), source);
  assert.equal(fs.readFileSync(overridePath, "utf8"), override);
});

test("partial setup fills missing config without replacing user files or old task data", () => {
  const cwd = fixture(), claw = path.join(cwd, ".claw");
  fs.mkdirSync(path.join(claw, "tasks", "legacy"), { recursive: true });
  const oldTask = path.join(claw, "tasks", "legacy", "plan.json");
  fs.writeFileSync(oldTask, "legacy fixture bytes");
  fs.writeFileSync(path.join(claw, "notes.txt"), "User-owned notes\n");
  ensureProjectEnvironment(cwd);
  assert.ok(fs.existsSync(path.join(claw, "project.json")));
  assert.equal(fs.readFileSync(path.join(claw, "notes.txt"), "utf8"), "User-owned notes\n");
  assert.equal(fs.readFileSync(oldTask, "utf8"), "legacy fixture bytes");
});

test("interrupted setup preserves a complete config and can finish missing scaffolding", (t) => {
  const cwd = fixture(), truth = path.join(cwd, ".claw", "truth");
  const original = fs.mkdirSync;
  t.mock.method(fs, "mkdirSync", ((dir: fs.PathLike, options: any) => {
    if (String(dir) === truth) throw new Error("fixture interruption after config commit");
    return original(dir, options);
  }) as typeof fs.mkdirSync);
  assert.throws(() => ensureProjectEnvironment(cwd), (error: any) => {
    assert.equal(error.execution.phase, "initialize");
    assert.notEqual(error.execution.effect, "none"); return true;
  });
  const file = path.join(cwd, ".claw", "project.json");
  const bytes = fs.readFileSync(file, "utf8");
  assert.ok(JSON.parse(bytes).id);
  t.mock.restoreAll();
  ensureProjectEnvironment(cwd);
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.ok(fs.existsSync(truth));
});

test("an existing initializer lock rejects without overwriting config", () => {
  const cwd = fixture(), claw = path.join(cwd, ".claw");
  fs.mkdirSync(claw);
  fs.writeFileSync(path.join(claw, "project.json.lock"), "owned by another initializer");
  assert.throws(() => ensureProjectEnvironment(cwd), (error: any) => {
    assert.equal(error.code, "PLAN_WRITE_CONFLICT");
    assert.deepEqual(error.execution, { phase: "initialize", outcome: "known", effect: "none" }); return true;
  });
  assert.deepEqual(fs.readdirSync(claw), ["project.json.lock"]);
});

test("invalid existing config is rejected before creating missing scaffolding", () => {
  const cwd = fixture(), claw = path.join(cwd, ".claw");
  fs.mkdirSync(claw);
  const config = path.join(claw, "project.json");
  fs.writeFileSync(config, "{broken");
  assert.throws(() => ensureProjectEnvironment(cwd), (error: unknown) => {
    assert.deepEqual((error as { execution: unknown }).execution, { phase: "prepare", outcome: "known", effect: "none" });
    return true;
  });
  assert.equal(fs.readFileSync(config, "utf8"), "{broken");
  assert.deepEqual(fs.readdirSync(claw), ["project.json"]);
});
