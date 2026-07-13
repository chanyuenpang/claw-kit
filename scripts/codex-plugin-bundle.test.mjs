import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CODEX_PLUGIN_PAYLOAD_PATHS,
  exportCodexPluginBundle,
  installCodexPluginBundle,
  readCodexPluginSource,
} from "./codex-plugin-bundle.mjs";

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-plugin-"));
  const sourceDir = path.join(root, "packages", "codex-adapter");

  await fs.mkdir(path.join(sourceDir, ".codex-plugin"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "hooks"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "references"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "scripts"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "skills"), { recursive: true });

  await fs.writeFile(
    path.join(sourceDir, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "claw-kit", version: "0.1.41+codex.test" }, null, 2),
  );
  await fs.writeFile(path.join(sourceDir, "hooks", "hooks.json"), '{"ok":true}');
  await fs.writeFile(path.join(sourceDir, "references", "note.md"), "# note");
  await fs.writeFile(path.join(sourceDir, "scripts", "helper.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "skills", "SKILL.md"), "# skill");
  await fs.mkdir(path.join(sourceDir, "skills", "config"), { recursive: true });
  await fs.writeFile(path.join(sourceDir, "skills", "config", "SKILL.md"), "# config skill");
  await fs.writeFile(path.join(sourceDir, "package.json"), '{"name":"@claw-kit/codex-adapter"}');

  return { root, sourceDir };
}

test("readCodexPluginSource returns manifest metadata and stable payload list", async () => {
  const { sourceDir } = await makeFixture();

  const plugin = await readCodexPluginSource({ sourceDir });

  assert.equal(plugin.name, "claw-kit");
  assert.equal(plugin.version, "0.1.41+codex.test");
  assert.deepEqual(plugin.payloadRelativePaths, CODEX_PLUGIN_PAYLOAD_PATHS);
});

test("Codex plugin manifest starts with using-claw-kit instead of pre-reading planning", async () => {
  const manifestPath = new URL("../packages/codex-adapter/.codex-plugin/plugin.json", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const promptText = [
    manifest.interface?.longDescription,
    ...(manifest.interface?.defaultPrompt ?? []),
  ].join("\n");

  assert.doesNotMatch(promptText, /first read the planning skill/i);
  assert.doesNotMatch(promptText, /start by reading the planning skill/i);
  assert.match(promptText, /When no task scope exists/i);
  assert.match(promptText, /seeded planning task/i);
});

test("Codex plugin source includes the config skill entrypoint", async () => {
  const skillPath = new URL("../shared/skills/config/SKILL.md", import.meta.url);
  const skillText = await fs.readFile(skillPath, "utf8");

  assert.match(skillText, /name: config/);
  assert.match(skillText, /team config/i);
  assert.match(skillText, /personal config/i);
  assert.match(skillText, /\.claw\/project-override\.json/);
});

test("exportCodexPluginBundle copies the expected payload into a versioned bundle directory", async () => {
  const { sourceDir, root } = await makeFixture();
  const outDir = path.join(root, "dist", "codex-plugin");

  await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.mjs"), "export const hook = true;\n");
  await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.test.mjs"), "export const testHook = true;\n");

  const result = await exportCodexPluginBundle({ sourceDir, outDir });

  assert.equal(result.bundleDir, path.join(outDir, "claw-kit", "0.1.41+codex.test"));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, ".codex-plugin", "plugin.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "hooks", "hooks.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "config", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "package.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "hooks", "session-start-recovery.mjs")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "hooks", "session-start-recovery.test.mjs")));
});

test("installCodexPluginBundle copies a payload source into the versioned Codex cache layout", async () => {
  const { sourceDir, root } = await makeFixture();
  const cacheRoot = path.join(root, ".codex", "plugins", "cache");

  await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.mjs"), "export const hook = true;\n");
  await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.test.mjs"), "export const testHook = true;\n");

  const result = await installCodexPluginBundle({ sourceDir, cacheRoot });

  assert.equal(result.installDir, path.join(cacheRoot, "claw-kit", "0.1.41+codex.test"));
  const manifest = JSON.parse(await fs.readFile(path.join(result.installDir, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.version, "0.1.41+codex.test");
  const installedSkill = await fs.readFile(path.join(result.installDir, "skills", "SKILL.md"), "utf8");
  assert.equal(installedSkill, "# skill");
  await assert.doesNotReject(fs.access(path.join(result.installDir, "hooks", "session-start-recovery.mjs")));
  await assert.rejects(fs.access(path.join(result.installDir, "hooks", "session-start-recovery.test.mjs")));
});
