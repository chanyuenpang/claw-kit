import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assembleSkills, loadSkillInputs, verifySkillSourceLayout, SKILL_HOSTS, CANONICAL_SKILL_SOURCES } from "./skill-artifacts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const common = ["planning", "config", "create-claw-skill", "feature-architecture", "researcher", "using-claw-kit", "claw-kit-doc"];
const matrix = {
  codex: [...common, "knowledge-capture", "update"],
  dsh: [...common, "knowledge-capture", "update"],
  opencode: [...common, "update"], standard: common,
  openclaw: ["claw-kit-doc"], cindy: common.filter((id) => id !== "feature-architecture"),
};

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-skill-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  for (const host of SKILL_HOSTS) {
    const adapter = path.join(sourceRoot, "packages", host + "-adapter");
    await fs.mkdir(adapter, { recursive: true });
    await fs.writeFile(path.join(adapter, "skill-inputs.json"), JSON.stringify({ schemaVersion: 1, host, skills: matrix[host] }));
  }
  const sources = [...Object.entries(CANONICAL_SKILL_SOURCES), ...["codex", "dsh", "opencode"].map((host) => ["update", "packages/" + host + "-adapter/skills/update"])];
  for (const [id, source] of sources) {
    const dir = path.join(sourceRoot, source);
    await fs.mkdir(path.join(dir, "references"), { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), "---\nname: " + id + "\ndescription: fixture\n---\n# Skill\n");
    await fs.writeFile(path.join(dir, "references", "guide.md"), "fixture resource\n");
    await fs.writeFile(path.join(dir, "payload.bin"), Buffer.from([0, 255, 128, 13, 10]));
  }
  return { root, sourceRoot };
}

async function treeDigest(root) {
  const hash = createHash("sha256");
  async function visit(dir, relative = "") {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      const name = path.join(relative, entry.name);
      hash.update(name);
      if (entry.isDirectory()) await visit(file, name);
      else hash.update(await fs.readFile(file));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

test("host declarations preserve public packages without widening registration", async () => {
  for (const host of SKILL_HOSTS) {
    const declaration = JSON.parse(await fs.readFile(path.join(repoRoot, "packages", host + "-adapter", "skill-inputs.json"), "utf8"));
    assert.deepEqual(declaration, { schemaVersion: 1, host, skills: matrix[host] });
  }
});

test("assembly copies complete binary-safe packages without source writes and survives detachment", async (t) => {
  const { root, sourceRoot } = await fixture(t);
  const before = await treeDigest(sourceRoot);
  for (const targetHost of SKILL_HOSTS) {
    const outputRoot = path.join(root, "artifacts", targetHost);
    const result = await assembleSkills({ sourceRoot, targetHost, outputRoot });
    assert.deepEqual((await fs.readdir(result.skillsRoot)).sort(), [...matrix[targetHost]].sort());
    for (const skill of result.skills) {
      assert.equal(await treeDigest(path.join(result.skillsRoot, skill.id)), await treeDigest(skill.sourcePath));
    }
  }
  assert.equal(await treeDigest(sourceRoot), before);
  await fs.rename(sourceRoot, path.join(root, "detached-source"));
  const file = path.join(root, "artifacts", "dsh", "skills", "knowledge-capture", "payload.bin");
  assert.deepEqual(await fs.readFile(file), Buffer.from([0, 255, 128, 13, 10]));
});

test("real host artifacts retain complete cross-host skills and every companion byte", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-complete-host-skills-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const targetHost of SKILL_HOSTS) {
    const result = await assembleSkills({ sourceRoot: repoRoot, targetHost, outputRoot: path.join(root, targetHost) });
    for (const skill of result.skills) {
      assert.equal(await treeDigest(path.join(result.skillsRoot, skill.id)), await treeDigest(skill.sourcePath), targetHost + ":" + skill.id);
    }
    if (result.skills.some(skill => skill.id === "using-claw-kit")) {
      for (const host of ["codex", "cindy", "dsh", "opencode", "standard"]) {
        await fs.access(path.join(result.skillsRoot, "using-claw-kit/references/hosts", host + ".md"));
      }
    }
  }
});

test("missing input and source-overlapping outputs fail without creating destinations", async (t) => {
  const { root, sourceRoot } = await fixture(t);
  for (const outputRoot of [sourceRoot, root, path.join(sourceRoot, "packages", "dsh-adapter"), path.join(sourceRoot, ".agents", "skills")]) {
    await assert.rejects(assembleSkills({ sourceRoot, targetHost: "dsh", outputRoot }), /outside sourceRoot|overlaps/);
  }
  await assert.rejects(loadSkillInputs({ sourceRoot, targetHost: "toString" }), /Unknown targetHost/);
  await assert.rejects(assembleSkills({ targetHost: "dsh", outputRoot: path.join(root, "bad") }), /sourceRoot is required/);
  await assert.rejects(assembleSkills({ sourceRoot, targetHost: "dsh" }), /outputRoot is required/);
  await fs.rm(path.join(sourceRoot, ".agents", "skills", "planning", "SKILL.md"));
  const outputRoot = path.join(root, "missing-input-output");
  await assert.rejects(assembleSkills({ sourceRoot, targetHost: "dsh", outputRoot }), /missing SKILL.md/);
  await assert.rejects(fs.access(outputRoot), { code: "ENOENT" });
});

test("invalid declarations and unknown or duplicate skills are rejected", async (t) => {
  const { sourceRoot } = await fixture(t);
  const declaration = path.join(sourceRoot, "packages", "standard-adapter", "skill-inputs.json");
  for (const skills of [["../escape"], ["toString"], ["planning", "planning"], ["knowledge-capture"]]) {
    await fs.writeFile(declaration, JSON.stringify({ schemaVersion: 1, host: "standard", skills }));
    await assert.rejects(loadSkillInputs({ sourceRoot, targetHost: "standard" }), /Unknown skill|duplicate|Manual capture/);
  }
  for (const invalid of [null, [], { schemaVersion: 2, host: "standard", skills: common }]) {
    await fs.writeFile(declaration, JSON.stringify(invalid));
    await assert.rejects(loadSkillInputs({ sourceRoot, targetHost: "standard" }), /Invalid skill input/);
  }
});

test("symlink inputs and output ancestors are rejected without writes", async (t) => {
  const { root, sourceRoot } = await fixture(t);
  const target = path.join(root, "link-target");
  await fs.mkdir(target);
  const link = path.join(sourceRoot, ".agents", "skills", "planning", "linked");
  await fs.symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(loadSkillInputs({ sourceRoot, targetHost: "dsh" }), /symlinks/);
  await fs.rm(link);
  const outputLink = path.join(root, "output-link");
  await fs.symlink(target, outputLink, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(assembleSkills({ sourceRoot, targetHost: "dsh", outputRoot: path.join(outputLink, "artifact") }), /symlinks/);
  assert.deepEqual(await fs.readdir(target), []);
});

test("existing artifact is never replaced and source-only checker detects old copies", async (t) => {
  const { root, sourceRoot } = await fixture(t);
  const outputRoot = path.join(sourceRoot, "dist", "candidate");
  await assembleSkills({ sourceRoot, targetHost: "dsh", outputRoot });
  const before = await treeDigest(outputRoot);
  await assert.rejects(assembleSkills({ sourceRoot, targetHost: "dsh", outputRoot }), /already exists/);
  assert.equal(await treeDigest(outputRoot), before);
  assert.equal((await verifySkillSourceLayout({ sourceRoot })).ok, true);
  const stale = path.join(sourceRoot, "packages", "dsh-adapter", "skills", "planning");
  await fs.mkdir(stale, { recursive: true });
  await fs.writeFile(path.join(stale, "SKILL.md"), "stale");
  const result = await verifySkillSourceLayout({ sourceRoot });
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Redundant source skill copy/);
});
