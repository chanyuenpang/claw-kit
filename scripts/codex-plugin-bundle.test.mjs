import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_PLUGIN_PAYLOAD_PATHS,
  activateOfficialCodexPluginIdentity,
  exportCodexPluginBundle,
  installCodexPluginBundle,
  readCodexPluginSource,
} from "./codex-plugin-bundle.mjs";
import { verifySharedSkillsSynced } from "./sync-shared-skills.mjs";

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
  await fs.writeFile(path.join(sourceDir, "skills", "config", "TEMPLATE.json"), '{"id":"config-default","status":"process.active","tasks":[]}');
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

test("Codex plugin manifest starts with the guidance contract instead of a static workflow", async () => {
  const manifestPath = new URL("../packages/codex-adapter/.codex-plugin/plugin.json", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const promptText = [
    manifest.interface?.longDescription,
    ...(manifest.interface?.defaultPrompt ?? []),
  ].join("\n");

  assert.doesNotMatch(promptText, /first read the planning skill/i);
  assert.doesNotMatch(promptText, /start by reading the planning skill/i);
  assert.match(promptText, /When no task scope exists/i);
  assert.match(promptText, /workflowGuidance/i);
  assert.match(promptText, /code-mode driver/i);
  assert.doesNotMatch(promptText, /seeded planning task|claw plan start|claw task done|claw plan done/i);
});

test("Codex entry keeps knowledge routing separate from Goal Mode readiness", async () => {
  const adapterRoot = new URL("../packages/codex-adapter/", import.meta.url);
  const skill = await fs.readFile(new URL("skills/using-claw-kit/SKILL.md", adapterRoot), "utf8");
  const manifest = await fs.readFile(new URL(".codex-plugin/plugin.json", adapterRoot), "utf8");
  const contract = `${skill}\n${manifest}`;

  assert.match(contract, /reusable project knowledge/i);
  assert.match(contract, /process\.discussing/i);
  assert.match(contract, /downstream tasks are explicit/i);
  assert.match(contract, /handoff-ready|hand off execution/i);
  assert.match(skill, /stable cross-turn state/i);
  assert.match(skill, /convert it to `(?:process\.)?wait`/i);
});

test("Codex entry stays compact without dropping guidance, lifecycle, or the mutation bridge", async () => {
  const skill = await fs.readFile(
    new URL("../packages/codex-adapter/skills/using-claw-kit/SKILL.md", import.meta.url),
    "utf8",
  );
  const lineCount = skill.trimEnd().split(/\r?\n/).length;

  assert.ok(lineCount >= 50 && lineCount <= 65, `expected 50-65 lines, received ${lineCount}`);
  assert.match(skill, /workflowGuidance` is the only next-step contract/i);
  for (const state of ["process.discussing", "process.active", "process.wait", "end.completed"]) {
    assert.match(skill, new RegExp(state.replace(".", "\\."), "i"));
  }
  assert.doesNotMatch(skill, /^\s*-\s*`?done`?:/im);
  assert.match(skill, /```javascript[\s\S]*runClawPlanMutation[\s\S]*```/i);
  assert.doesNotMatch(skill, /Core execution chain|Detailed call flow|## First action|claw plan start|claw task done|claw plan done/i);
});

test("Codex main-agent bundle excludes retired workflow skills and closeout routing language", async () => {
  const adapterRoot = new URL("../packages/codex-adapter/", import.meta.url);
  const skill = await fs.readFile(
    new URL("skills/using-claw-kit/SKILL.md", adapterRoot),
    "utf8",
  );
  const reference = await fs.readFile(
    new URL("references/workflow-guidance-consumption.md", adapterRoot),
    "utf8",
  );
  const manifest = await fs.readFile(new URL(".codex-plugin/plugin.json", adapterRoot), "utf8");
  const forbidden = /truth-writer|adr-writer|knowledge-writer|writer delegation|deposition|delegated subagents?|dispatch[^\n]*subagent/i;

  assert.doesNotMatch(skill, forbidden);
  assert.doesNotMatch(reference, forbidden);
  assert.doesNotMatch(manifest, forbidden);
  await assert.doesNotReject(fs.access(new URL("skills/knowledge-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/truth-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/adr-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/search-workflow/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/init/SKILL.md", adapterRoot)));
});

test("combined knowledge writer enforces trusted evidence and cross-document ownership", async () => {
  const skill = await fs.readFile(new URL("../shared/skills/knowledge-writer/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /knowledge-base steward/i);
  assert.match(skill, /completed `plan\.json`/i);
  assert.match(skill, /trusted verified evidence/i);
  assert.match(skill, /Truth and ADR are one knowledge system/i);
  assert.match(skill, /one current owner/i);
  assert.match(skill, /open every plausible candidate/i);
  assert.match(skill, /exhaustive text search/i);
  assert.match(skill, /Do not report completion while/i);
  assert.match(skill, /Re-run focused and exhaustive searches/i);
  assert.match(skill, /Trusted evidence is authoritative for what was verified at its own point in time/i);
  assert.match(skill, /read-only check of its implementation anchors/i);
  assert.match(skill, /Current implementation outranks older report wording/i);
  assert.match(skill, /incomplete, superseded, or conflicts with newer implementation/i);
});

test("Codex plugin source includes the config skill entrypoint", async () => {
  const skillPath = new URL("../shared/skills/config/SKILL.md", import.meta.url);
  const skillText = await fs.readFile(skillPath, "utf8");

  assert.match(skillText, /name: config/);
  assert.match(skillText, /team config/i);
  assert.match(skillText, /personal config/i);
  assert.match(skillText, /\.claw\/project-override\.json/);
});

test("exported Codex plugin contains every shared workflow skill", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-plugin-shared-workflows-"));
  const outDir = path.join(root, "dist");
  const result = await exportCodexPluginBundle({ outDir });

  for (const skillName of ["planning", "config", "update", "create-claw-skill", "knowledge-writer"]) {
    await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", skillName, "SKILL.md")));
  }
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "knowledge-writer", "agents", "openai.yaml")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "skills", "truth-writer", "SKILL.md")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "skills", "adr-writer", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "update", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "create-claw-skill", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "scripts", "code-mode-host-action-consumer.mjs")));
});

test("repository Codex plugin source is fully materialized from shared skills", async () => {
  const adapterDir = fileURLToPath(new URL("../packages/codex-adapter", import.meta.url));
  const result = await verifySharedSkillsSynced({ adapterDirs: [adapterDir] });
  assert.deepEqual(result, { ok: true, problems: [] });
});

test("repo marketplace points Codex at the materialized adapter source", async () => {
  const marketplace = JSON.parse(
    await fs.readFile(new URL("../.agents/plugins/marketplace.json", import.meta.url), "utf8"),
  );
  const plugin = marketplace.plugins.find((entry) => entry.name === "claw-kit");

  assert.equal(marketplace.name, "claw-kit");
  assert.equal(plugin.source.source, "local");
  assert.equal(plugin.source.path, "./packages/codex-adapter");
  assert.equal(plugin.policy.installation, "AVAILABLE");
  assert.equal(plugin.category, "Developer Tools");
});

test("release protocol publishes the committed Git marketplace snapshot without a ZIP requirement", async () => {
  const distribution = await fs.readFile(new URL("../DISTRIBUTION.md", import.meta.url), "utf8");
  const releaseScript = await fs.readFile(new URL("./publish-release.mjs", import.meta.url), "utf8");

  assert.match(distribution, /committed Git ref containing those paths -> official Codex plugin release artifact/);
  assert.match(distribution, /create the GitHub release without a plugin ZIP asset/);
  assert.doesNotMatch(distribution, /attach the exported Codex plugin bundle to the GitHub release/);
  assert.match(releaseScript, /assertRepositoryMarketplaceSnapshot/);
  assert.match(releaseScript, /no GitHub Release ZIP is required/);
  assert.match(releaseScript, /Next: invoke the claw-kit update skill/);
});

test("update contract publishes first and supports only the official Codex identity", async () => {
  const skill = await fs.readFile(new URL("../shared/skills/update/SKILL.md", import.meta.url), "utf8");
  const template = await fs.readFile(new URL("../shared/skills/update/TEMPLATE.json", import.meta.url), "utf8");
  const fallback = await fs.readFile(new URL("../shared/skills/update/non-claw-fallback.md", import.meta.url), "utf8");
  const installer = await fs.readFile(new URL("./install-codex-plugin.ps1", import.meta.url), "utf8");
  const combined = [skill, template, fallback, installer].join("\n");

  assert.match(combined, /publish and verify/i);
  assert.match(combined, /claw-kit@claw-kit/);
  assert.doesNotMatch(combined, /direct development install/i);
  assert.doesNotMatch(combined, /cache\\claw-kit-local/i);
  assert.match(installer, /github\.com\/chanyuenpang\/claw-kit\.git/i);
});

test("official marketplace-style cache copy contains all shared skills and resources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-marketplace-install-"));
  const cacheRoot = path.join(root, ".codex", "plugins", "cache", "claw-kit");
  const sourceDir = fileURLToPath(new URL("../packages/codex-adapter", import.meta.url));
  const result = await installCodexPluginBundle({ sourceDir, cacheRoot });

  for (const skillName of ["planning", "config", "update", "create-claw-skill"]) {
    await assert.doesNotReject(fs.access(path.join(result.installDir, "skills", skillName, "SKILL.md")));
  }
  await assert.doesNotReject(fs.access(path.join(result.installDir, "skills", "update", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(path.join(result.installDir, "skills", "create-claw-skill", "TEMPLATE.json")));
  await assert.doesNotReject(
    fs.access(path.join(result.installDir, "skills", "create-claw-skill", "scripts", "create-claw-skill-stub.mjs")),
  );
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
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "config", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "package.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "hooks", "session-start-recovery.mjs")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "hooks", "session-start-recovery.test.mjs")));
});

test("installCodexPluginBundle copies a payload source into the versioned Codex cache layout", async () => {
  const { sourceDir, root } = await makeFixture();
  const cacheRoot = path.join(root, ".codex", "plugins", "cache");
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  try {
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
    await assert.doesNotReject(fs.access(path.join(result.installDir, "skills", "config", "TEMPLATE.json")));
    await assert.rejects(fs.access(path.join(root, ".claw", "templates", "team-default.json")));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
});

test("official installer enables the GitHub identity and disables the local identity", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-identity-"));
  const configPath = path.join(root, "config.toml");
  await fs.writeFile(configPath, [
    "[marketplaces.claw-kit]",
    'source_type = "git"',
    'source = "https://github.com/chanyuenpang/claw-kit.git"',
    "",
    '[plugins."claw-kit@claw-kit"]',
    "enabled = false",
    "",
    '[plugins."claw-kit@claw-kit-local"]',
    "enabled = true",
    "",
  ].join("\n"));

  const result = await activateOfficialCodexPluginIdentity({ configPath });
  const config = await fs.readFile(configPath, "utf8");

  assert.equal(result.enabledIdentity, "claw-kit@claw-kit");
  assert.match(config, /\[plugins\."claw-kit@claw-kit"\]\nenabled = true/);
  assert.match(config, /\[plugins\."claw-kit@claw-kit-local"\]\nenabled = false/);
});
