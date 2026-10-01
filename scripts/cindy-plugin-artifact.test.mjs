import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildCindyPluginArtifact } from "./cindy-plugin-artifact.mjs";
import { loadSkillInputs } from "./skill-artifacts.mjs";
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Cindy assembles the existing flat runtime and Git marketplace without source writes", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cindy-artifact-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const before = await loadSkillInputs({ sourceRoot, targetHost: "cindy" });
  const result = await buildCindyPluginArtifact({ sourceRoot, outputRoot: path.join(temp, "candidate") });
  assert.equal((await loadSkillInputs({ sourceRoot, targetHost: "cindy" })).sourceHash, before.sourceHash);
  assert.equal(result.skillSourceHash, before.sourceHash);
  assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
  const manifest = JSON.parse(await fs.readFile(path.join(result.pluginDir, "ghost.json"), "utf8"));
  assert.equal(manifest.entry, "main.js");
  assert.equal(manifest.node.entry, "node/claw-worker.cjs");
  assert.deepEqual(manifest.skill.items.map(s => s.name).sort(), ["claw-kit-doc", "planning", "researcher", "using-claw-kit"]);
  assert.equal((await fs.readdir(path.join(result.pluginDir, "skills"))).length, 6);
  await assert.rejects(fs.access(path.join(sourceRoot, "packages/cindy-adapter/plugin/skills/researcher/SKILL.md")));
  const moved = path.join(temp, "detached");
  await fs.rename(result.artifactRoot, moved);
  for (const item of manifest.skill.items) await fs.access(path.join(moved, "plugin", item.dir, "SKILL.md"));
  for (const skill of before.skills) for (const relative of skill.files) {
    assert.deepEqual(await fs.readFile(path.join(moved, "plugin", "skills", skill.id, relative)), await fs.readFile(path.join(skill.sourcePath, relative)));
  }
  const marketplace = JSON.parse(await fs.readFile(path.join(moved, ".agents/plugins/marketplace.json"), "utf8"));
  assert.equal(marketplace.plugins[0].source.path, "./plugin");
  await assert.rejects(buildCindyPluginArtifact({ sourceRoot, outputRoot: moved }), /already exists/);
});

test("Cindy rejects source overlap before assembly", async () => {
  await assert.rejects(buildCindyPluginArtifact({ sourceRoot, outputRoot: path.join(sourceRoot, "packages/cindy-adapter/plugin") }), /outside sourceRoot|overlap/);
});

test("Windows Cindy activation retries a bounded sharing violation without rebuilding the payload", { skip: process.platform !== "win32" }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cindy-rename-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const target = path.join(temp, "candidate");
  const rename = fs.rename.bind(fs);
  let attempts = 0;
  const stages = new Set();
  t.mock.method(fs, "rename", async (from, to) => {
    if (to === target) {
      stages.add(from);
      attempts++;
      if (attempts < 3) throw Object.assign(new Error("sharing violation"), { code: "EPERM" });
    }
    return rename(from, to);
  });
  const result = await buildCindyPluginArtifact({ sourceRoot, outputRoot: target });
  assert.equal(attempts, 3);
  assert.equal(stages.size, 1);
  await fs.access(path.join(result.pluginDir, "ghost.json"));
});

test("Cindy activation does not hide permanent filesystem errors or leave partial output", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cindy-rename-fail-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const target = path.join(temp, "candidate");
  const rename = fs.rename.bind(fs);
  let attempts = 0;
  t.mock.method(fs, "rename", async (from, to) => {
    if (to === target) { attempts++; throw Object.assign(new Error("permanent IO failure"), { code: "EIO" }); }
    return rename(from, to);
  });
  await assert.rejects(buildCindyPluginArtifact({ sourceRoot, outputRoot: target }), /permanent IO failure/);
  assert.equal(attempts, 1);
  assert.deepEqual(await fs.readdir(temp), []);
});
