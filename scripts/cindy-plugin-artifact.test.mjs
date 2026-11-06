import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildCindyPluginArtifact } from "./cindy-plugin-artifact.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadSkillInputs } from "./skill-artifacts.mjs";
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Cindy assembles the existing flat runtime and Git marketplace without source writes", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cindy-artifact-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const before = await loadSkillInputs({ sourceRoot, targetHost: "standard" });
  const result = await buildCindyPluginArtifact({ sourceRoot, outputRoot: path.join(temp, "candidate") });
  assert.equal((await loadSkillInputs({ sourceRoot, targetHost: "standard" })).sourceHash, before.sourceHash);
  assert.equal(result.skillSourceHash, before.sourceHash);
  assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
  const manifest = JSON.parse(await fs.readFile(path.join(result.pluginDir, "ghost.json"), "utf8"));
  assert.equal(manifest.entry, "main.js");
  assert.equal(manifest.node.entry, "node/claw-worker.cjs");
  assert.equal(manifest.skill, undefined);
  await assert.rejects(fs.readdir(path.join(result.pluginDir, "skills")), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(sourceRoot, "packages/cindy-adapter/plugin/skills/researcher/SKILL.md")));
  const moved = path.join(temp, "detached");
  await fs.rename(result.artifactRoot, moved);
  const detachedManifest = JSON.parse(await fs.readFile(path.join(moved, "plugin/ghost.json"), "utf8"));
  const sharedPackage = JSON.parse(await fs.readFile(path.join(sourceRoot, "packages/shared-skills/package.json"), "utf8"));
  const adapterPackage = JSON.parse(await fs.readFile(path.join(sourceRoot, "packages/cindy-adapter/package.json"), "utf8"));
  assert.equal(detachedManifest.globalSkills, undefined);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(moved, "plugin/node/shared-skills.json"), "utf8")), adapterPackage.sharedSkills);
  assert.equal(adapterPackage.sharedSkills.package, sharedPackage.name);
  const helperFile = path.join(moved, "plugin/node/shared-skills.cjs");
  const helper = createRequire(import.meta.url)(helperFile);
  assert.match(await helper.fingerprint(path.join(moved, "plugin/assets")), /^[a-f0-9]{64}$/);
  // Fixture-only owner stub: no npm/network/home writes. Exercise the real moved
  // worker + packaged private config, including no replay after a rejected result.
  const counter = path.join(temp, "prepare-count");
  await fs.writeFile(helperFile, 'exports.prepareSharedSkills = async () => { require("node:fs").appendFileSync(' + JSON.stringify(counter) + ', "x"); await new Promise(r => setTimeout(r, 15)); throw Object.assign(new Error("sensitive detail"), { code: "EACCES", phase: "write" }); };');
  const child = spawn(process.execPath, [path.join(moved, "plugin/node/claw-worker.cjs")], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill()); child.stderr.resume();
  const replies = await new Promise((resolve, reject) => {
    let buffer = ""; const answers = [];
    const timeout = setTimeout(() => reject(new Error("Detached worker did not reply")), 5000);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.stdout.on("data", chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (line) answers.push(JSON.parse(line));
        if (answers.length === 2) { clearTimeout(timeout); resolve(answers); }
      }
    });
    for (const id of [1, 2]) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "claw/prepare-skills", params: {} }) + "\n");
  });
  assert.equal(await fs.readFile(counter, "utf8"), "x");
  for (const reply of replies) {
    assert.equal(reply.result.ok, false); assert.equal(reply.result.errorCode, "EACCES"); assert.equal(reply.result.phase, "write");
    assert.ok(!JSON.stringify(reply).includes("sensitive detail"));
  }
  await assert.rejects(fs.access(path.join(moved, "plugin/node/shared-skills-contract.json")), { code: "ENOENT" });
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

test("Cindy retains its tested minimum when the shared package receives a new version", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cindy-minimum-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const input = path.join(temp, "source");
  const assembly = await loadSkillInputs({ sourceRoot, targetHost: "standard" });
  const paths = ["packages/cindy-adapter", "packages/standard-adapter/skill-inputs.json",
    "packages/shared-skills/package.json", "packages/shared-skills/node-runtime.cjs", "packages/core/src/errors.ts",
    ...assembly.skills.map(skill => path.relative(sourceRoot, skill.sourcePath))];
  for (const relative of paths) {
    const target = path.join(input, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(path.join(sourceRoot, relative), target, { recursive: true });
  }
  const pkgFile = path.join(input, "packages/shared-skills/package.json");
  const pkg = JSON.parse(await fs.readFile(pkgFile, "utf8"));
  pkg.version = "99.0.0"; // Isolated fixture metadata, never a release candidate.
  await fs.writeFile(pkgFile, JSON.stringify(pkg));
  const required = JSON.parse(await fs.readFile(path.join(input, "packages/cindy-adapter/package.json"), "utf8")).sharedSkills;
  const artifact = await buildCindyPluginArtifact({ sourceRoot: input, outputRoot: path.join(temp, "artifact") });
  const result = JSON.parse(await fs.readFile(path.join(artifact.pluginDir, "ghost.json"), "utf8"));
  assert.equal(result.globalSkills, undefined);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(artifact.pluginDir, "node/shared-skills.json"), "utf8")), required);
});
