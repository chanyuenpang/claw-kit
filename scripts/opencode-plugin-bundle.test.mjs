import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  OPENCODE_PLUGIN_PAYLOAD_PATHS,
  exportOpencodePluginBundle,
  installOpencodePlugin,
  readOpencodePluginSource,
} from "./opencode-plugin-bundle.mjs";

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-opencode-plugin-"));
  const sourceDir = path.join(root, "packages", "opencode-adapter");

  await fs.mkdir(path.join(sourceDir, "plugin"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "skills"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "agents"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "references"), { recursive: true });

  await fs.writeFile(
    path.join(sourceDir, "package.json"),
    JSON.stringify({ name: "claw-kit", version: "0.1.41+opencode.test" }, null, 2),
  );
  await fs.writeFile(
    path.join(sourceDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: {} }, null, 2),
  );
  await fs.writeFile(
    path.join(sourceDir, "workflow-guidance.opencode.json"),
    JSON.stringify({ guidance: "ok" }, null, 2),
  );
  await fs.writeFile(path.join(sourceDir, "plugin", "index.ts"), "export default {};\n");
  await fs.writeFile(path.join(sourceDir, "skills", "SKILL.md"), "# skill");
  await fs.mkdir(path.join(sourceDir, "skills", "config"), { recursive: true });
  await fs.writeFile(path.join(sourceDir, "skills", "config", "SKILL.md"), "# config skill");
  await fs.writeFile(path.join(sourceDir, "agents", "team-coder.md"), "# agent");
  await fs.writeFile(path.join(sourceDir, "references", "note.md"), "# note");

  return { root, sourceDir };
}

async function cleanup(root) {
  await fs.rm(root, { recursive: true, force: true });
}

test("readOpencodePluginSource returns manifest metadata and stable payload list", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });

  const plugin = await readOpencodePluginSource({ sourceDir });

  assert.equal(plugin.name, "claw-kit");
  assert.equal(plugin.version, "0.1.41+opencode.test");
  assert.deepEqual(plugin.payloadRelativePaths, OPENCODE_PLUGIN_PAYLOAD_PATHS);
});

test("OpenCode plugin source includes the config skill entrypoint", async () => {
  const skillPath = new URL("../shared/skills/config/SKILL.md", import.meta.url);
  const skillText = await fs.readFile(skillPath, "utf8");

  assert.match(skillText, /name: config/);
  assert.match(skillText, /team config/i);
  assert.match(skillText, /personal config/i);
  assert.match(skillText, /\.claw\/project-override\.json/);
});

test("exportOpencodePluginBundle copies the expected payload and filters *.test.mjs", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const outDir = path.join(root, "dist", "opencode-plugin");

  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.test.mjs"), "export const testRuntime = true;\n");

  const result = await exportOpencodePluginBundle({ sourceDir, outDir });

  assert.equal(result.bundleDir, path.join(outDir, "claw-kit", "0.1.41+opencode.test"));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "plugin", "index.ts")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "config", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "package.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "workflow-guidance.opencode.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "plugin", "runtime.mjs")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "plugin", "runtime.test.mjs")));
});

test("installOpencodePlugin copies payload, shim, agents and filters *.test.mjs", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const installDir = path.join(root, ".config", "opencode");

  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.test.mjs"), "export const testRuntime = true;\n");

  const result = await installOpencodePlugin({ sourceDir, installDir });

  assert.equal(result.pluginDir, path.join(installDir, "plugins", "claw-kit"));
  assert.equal(result.shimPath, path.join(installDir, "plugins", "claw-kit.ts"));
  assert.equal(result.agentDir, path.join(installDir, "agent"));

  const manifest = JSON.parse(await fs.readFile(path.join(result.pluginDir, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.1.41+opencode.test");

  const installedSkill = await fs.readFile(path.join(result.pluginDir, "skills", "SKILL.md"), "utf8");
  assert.equal(installedSkill, "# skill");

  const installedAgent = await fs.readFile(path.join(result.agentDir, "team-coder.md"), "utf8");
  assert.equal(installedAgent, "# agent");

  const shim = await fs.readFile(result.shimPath, "utf8");
  assert.match(shim, /export \{ default, ClawKitPlugin \} from "\.\/claw-kit\/plugin\/index\.ts";/);

  await assert.doesNotReject(fs.access(path.join(result.pluginDir, "plugin", "runtime.mjs")));
  await assert.rejects(fs.access(path.join(result.pluginDir, "plugin", "runtime.test.mjs")));
});

test("installOpencodePlugin copies skills into the opencode skills discovery directory idempotently", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const installDir = path.join(root, ".config", "opencode");

  const result = await installOpencodePlugin({ sourceDir, installDir });

  // opencode discovers skills only from convention directories (~/.config/opencode/skills).
  // Each skill subfolder is copied to <installDir>/skills/<name>/SKILL.md.
  assert.equal(result.skillsDir, path.join(installDir, "skills"));
  const copiedSkill = await fs.readFile(path.join(result.skillsDir, "config", "SKILL.md"), "utf8");
  assert.match(copiedSkill, /name: config/);

  // No opencode.json config injection happens: there is no `skills.paths` option in opencode.
  await assert.rejects(fs.access(path.join(installDir, "opencode.json")));

  // Idempotent: reinstall overwrites the skill content correctly without duplication.
  await fs.writeFile(path.join(result.skillsDir, "config", "SKILL.md"), "# stale");
  await installOpencodePlugin({ sourceDir, installDir });
  const refreshed = await fs.readFile(path.join(result.skillsDir, "config", "SKILL.md"), "utf8");
  assert.match(refreshed, /name: config/);
});
