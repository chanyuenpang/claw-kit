import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildHostPluginArtifact, exportHostPluginArtifact, packDshPluginArtifact, npmVersionOf } from "./host-plugin-artifacts.mjs";
import { loadSkillInputs } from "./skill-artifacts.mjs";

async function write(root, relative, content) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function fixture(t, host) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "claw-host-artifact-test-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const sourceRoot = path.join(temporary, "source");
  const adapter = "packages/" + host + "-adapter/";
  await write(sourceRoot, adapter + "skill-inputs.json", JSON.stringify({ schemaVersion: 1, host, skills: ["config"] }));
  await write(sourceRoot, ".agents/skills/config/SKILL.md", "---\nname: config\ndescription: fixture\n---\n# Config\n");
  await write(sourceRoot, ".agents/skills/config/references/contract.md", "# Adjacent resource\n");
  await write(sourceRoot, ".agents/skills/config/assets/icon.bin", Buffer.from([0, 255, 1]));
  await write(sourceRoot, adapter + "package.json", JSON.stringify({ name: "@veewo/dsh-claw-kit", version: "0.2.41.7", type: "module", main: "lib/index.js", files: ["lib", "skills", "cordis.patch.yml"], scripts: { prepare: "must-not-run" }, devDependencies: { fake: "*" } }));
  if (host === "dsh") {
    await write(sourceRoot, adapter + "lib/index.js", "export const fixture = true;\n");
    await write(sourceRoot, adapter + "cordis.patch.yml", "plugins: {}\n");
    await write(sourceRoot, adapter + "README.md", "# DSH\n");
  } else if (host === "openclaw") {
    await write(sourceRoot, adapter + "dist/index.js", "export const fixture = true;\n");
    await write(sourceRoot, adapter + "openclaw.plugin.json", JSON.stringify({ id: "claw-kit", skills: ["skills"] }));
  } else if (host === "standard") {
    await write(sourceRoot, adapter + "README.md", "# Standard\n");
    await write(sourceRoot, adapter + "docs/entry-contract.md", "# Entry\n");
  }
  await write(sourceRoot, adapter + "private-not-payload.txt", "not an artifact input");
  return { sourceRoot, temporary, adapterRoot: path.join(sourceRoot, adapter), outputRoot: path.join(temporary, "artifact") };
}

for (const host of ["dsh", "openclaw", "standard"]) {
  test(host + " stage copies the declared closure and survives source removal", async (t) => {
    const fixtureData = await fixture(t, host);
    const { sourceRoot, outputRoot, temporary } = fixtureData;
    const before = await loadSkillInputs({ sourceRoot, targetHost: host });
    const artifact = await buildHostPluginArtifact({ sourceRoot, targetHost: host, outputRoot });
    assert.equal((await loadSkillInputs({ sourceRoot, targetHost: host })).sourceHash, before.sourceHash);
    assert.equal(artifact.sourceHash, before.sourceHash);
    await assert.rejects(fs.access(path.join(outputRoot, "private-not-payload.txt")));
    await assert.rejects(fs.access(path.join(fixtureData.adapterRoot, "skills", "config")));
    if (host === "dsh") {
      assert.equal(artifact.version, "0.2.41-rc.7");
      assert.equal(artifact.gitVersion, "0.2.41.7");
      assert.equal(artifact.manifest.scripts, undefined);
      assert.equal(artifact.manifest.devDependencies, undefined);
    }
    await fs.rename(sourceRoot, path.join(temporary, "hidden-source"));
    await fs.rename(outputRoot, path.join(temporary, "moved-artifact"));
    for (const file of before.skills[0].files) await fs.access(path.join(temporary, "moved-artifact", "skills", "config", file));
    assert.deepEqual(await fs.readFile(path.join(temporary, "moved-artifact", "skills", "config", "assets", "icon.bin")), Buffer.from([0, 255, 1]));
  });
}

test("source overlap and existing stage are rejected without changing sources", async (t) => {
  const { sourceRoot, adapterRoot, outputRoot } = await fixture(t, "dsh");
  const before = await loadSkillInputs({ sourceRoot, targetHost: "dsh" });
  await assert.rejects(buildHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot: adapterRoot }), /output|source/i);
  await fs.mkdir(outputRoot);
  await write(outputRoot, "keep.txt", "prior output");
  await assert.rejects(buildHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot }), /EEXIST/);
  assert.equal(await fs.readFile(path.join(outputRoot, "keep.txt"), "utf8"), "prior output");
  assert.equal((await loadSkillInputs({ sourceRoot, targetHost: "dsh" })).sourceHash, before.sourceHash);
});

test("failed replacement keeps the previous artifact and removes only new stage", async (t) => {
  const { sourceRoot, adapterRoot, outputRoot, temporary } = await fixture(t, "dsh");
  await exportHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot });
  await fs.rename(path.join(adapterRoot, "lib"), path.join(adapterRoot, "unavailable-lib"));
  await assert.rejects(exportHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot }), /ENOENT/);
  assert.match(await fs.readFile(path.join(outputRoot, "lib", "index.js"), "utf8"), /fixture/);
  assert.deepEqual((await fs.readdir(temporary)).filter((name) => name.includes(".stage-") || name.includes(".backup-")), []);
});

test("runtime symlinks are rejected rather than shipped or dereferenced", async (t) => {
  const { sourceRoot, adapterRoot, outputRoot } = await fixture(t, "dsh");
  await fs.symlink(path.join(sourceRoot, ".agents"), path.join(adapterRoot, "lib", "linked"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(buildHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot }), /symlink/);
  await assert.rejects(fs.access(outputRoot));
});

test("failed DSH packaging leaves the previous tarball and unrelated output untouched", async (t) => {
  const { sourceRoot, adapterRoot, temporary } = await fixture(t, "dsh");
  const outDir = path.join(temporary, "packed");
  const previous = "veewo-dsh-claw-kit-0.2.9-rc.0.tgz";
  await write(outDir, previous, "prior validated artifact");
  await write(outDir, "unrelated.tgz", "another package");
  await fs.rename(path.join(adapterRoot, "lib"), path.join(adapterRoot, "unavailable-lib"));
  await assert.rejects(packDshPluginArtifact({ sourceRoot, outDir }), /ENOENT/);
  assert.equal(await fs.readFile(path.join(outDir, previous), "utf8"), "prior validated artifact");
  assert.equal(await fs.readFile(path.join(outDir, "unrelated.tgz"), "utf8"), "another package");
  assert.deepEqual((await fs.readdir(outDir)).sort(), ["unrelated.tgz", previous].sort());
});

test("DSH export packs the same staged npm version with every adjacent skill asset", async (t) => {
  const { sourceRoot, temporary } = await fixture(t, "dsh");
  const before = await loadSkillInputs({ sourceRoot, targetHost: "dsh" });
  const outDir = path.join(temporary, "packed");
  await write(outDir, "veewo-dsh-claw-kit-0.2.9-rc.0.tgz", "stale lexical-last artifact");
  await write(outDir, "keep.txt", "unrelated output");
  const result = await packDshPluginArtifact({ sourceRoot, outDir });
  await assert.rejects(fs.access(path.join(outDir, "veewo-dsh-claw-kit-0.2.9-rc.0.tgz")));
  assert.equal(await fs.readFile(path.join(outDir, "keep.txt"), "utf8"), "unrelated output");
  assert.equal(result.npmVersion, npmVersionOf(result.gitVersion));
  const listing = execFileSync("tar", ["-tzf", result.tarball], { encoding: "utf8" });
  assert.match(listing, /package\/skills\/config\/references\/contract.md/);
  assert.match(listing, /package\/skills\/config\/assets\/icon.bin/);
  assert.doesNotMatch(listing, /private-not-payload|node_modules|skill-inputs.json/);
  assert.equal((await loadSkillInputs({ sourceRoot, targetHost: "dsh" })).sourceHash, before.sourceHash);
});
