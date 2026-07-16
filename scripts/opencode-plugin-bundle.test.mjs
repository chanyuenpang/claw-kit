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

test("OpenCode writer contracts use direct dispatch semantics and writer-owned routing", async () => {
  const adapterRoot = new URL("../packages/opencode-adapter/", import.meta.url);
  const guidance = JSON.parse(await fs.readFile(new URL("workflow-guidance.opencode.json", adapterRoot), "utf8"));
  const truthSkill = await fs.readFile(new URL("skills/truth-writer/SKILL.md", adapterRoot), "utf8");
  const adrSkill = await fs.readFile(new URL("skills/adr-writer/SKILL.md", adapterRoot), "utf8");
  const truthAgent = await fs.readFile(new URL("agents/claw-truth-writer.md", adapterRoot), "utf8");
  const adrAgent = await fs.readFile(new URL("agents/claw-adr-writer.md", adapterRoot), "utf8");

  assert.equal(guidance.delegates.truthWriter.dispatch, "when_reusable_truth_confirmed");
  assert.equal(guidance.delegates.adrWriter.dispatch, "required");
  assert.equal(guidance.delegates.truthWriter.waitForCompletion, false);
  assert.equal(guidance.delegates.adrWriter.waitForCompletion, false);
  assert.equal("required" in guidance.delegates.truthWriter, false);
  assert.equal("dispatchCondition" in guidance.delegates.truthWriter, false);

  for (const text of [truthSkill, adrSkill, truthAgent, adrAgent]) {
    assert.match(text, /writer|writer 自己负责/i);
    assert.match(text, /claw search/);
    assert.match(text, /widen inspection|扩大检查范围/i);
  }

  for (const text of [truthSkill, adrSkill]) {
    assert.match(text, /record repository locations only as project-relative paths/i);
  }

  for (const agent of [truthAgent, adrAgent]) {
    assert.match(agent, /项目根目录相对路径/);
  }

  for (const text of [truthSkill, adrSkill, truthAgent, adrAgent]) {
    assert.doesNotMatch(text, /SUMMARY\.md|Summary discipline|Summary 规则/i);
  }

  for (const skill of [truthSkill, adrSkill]) {
    assert.match(skill, /act as the delegated .* subagent/i);
    assert.match(skill, /## Mission/);
    assert.match(skill, /## Input/);
    assert.match(skill, /## Canonical routing/);
    assert.match(skill, /## Writing rules/);
    assert.match(skill, /## Workflow/);
    assert.match(skill, /## Return/);
    assert.doesNotMatch(skill, /main agent|caller|timing rule|use this skill after|use this skill at/i);
    assert.doesNotMatch(skill, /AGENT-SPEC|references\//i);
  }

  assert.match(truthSkill, /own canonical routing and deposition/i);
  assert.match(adrSkill, /own decision extraction, canonical routing, and deposition/i);
  assert.doesNotMatch(adrSkill, /truth corpus|truth deposition/i);
  assert.doesNotMatch(adrAgent, /truth-writer|truth corpus/i);
  assert.doesNotMatch(truthSkill, /adr-writer|route durable architecture decisions/i);
  assert.doesNotMatch(truthAgent, /adr-writer|交给 adr/i);
  assert.match(adrAgent, /记录范围/);
  assert.match(guidance.delegates.truthWriter.inputContract, /reusable facts and evidence/i);
  assert.match(guidance.delegates.adrWriter.inputContract, /active root plan\.json path/i);
  assert.match(guidance.delegates.adrWriter.inputContract, /retains this path for at least one hour/i);
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
