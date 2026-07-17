import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_PLUGIN_PAYLOAD_PATHS,
  exportCodexPluginBundle,
  installCodexPluginBundle,
  installCodexPluginDevelopmentSurface,
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

test("Codex closeout contract keeps combined knowledge deposition asynchronous and fail-open", async () => {
  const skill = await fs.readFile(
    new URL("../packages/codex-adapter/skills/using-claw-kit/SKILL.md", import.meta.url),
    "utf8",
  );
  const reference = await fs.readFile(
    new URL("../packages/codex-adapter/references/workflow-guidance-consumption.md", import.meta.url),
    "utf8",
  );

  assert.match(skill, /do not wait for deposition/i);
  assert.match(skill, /combined `knowledge-writer` through the Codex SDK/i);
  assert.match(reference, /Hook, report, launcher, SDK, or writer failures never block or alter plan completion/i);
  assert.match(reference, /Do not dispatch `truth-writer`, `adr-writer`, or `knowledge-writer` from the main agent/i);
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

  for (const skillName of ["planning", "config", "update", "create-claw-skill"]) {
    await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", skillName, "SKILL.md")));
  }
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

test("installCodexPluginDevelopmentSurface refreshes the active marketplace source before its cache", async () => {
  const { sourceDir, root } = await makeFixture();
  const marketplaceRoot = path.join(root, ".agents", "plugins", "claw-kit-local");
  const marketplaceSourceDir = path.join(marketplaceRoot, "plugins", "claw-kit");
  const cacheRoot = path.join(root, ".codex", "plugins", "cache", "claw-kit-local");

  await fs.mkdir(marketplaceRoot, { recursive: true });
  await fs.writeFile(
    path.join(marketplaceRoot, "marketplace.json"),
    JSON.stringify({
      name: "claw-kit-local",
      plugins: [
        {
          name: "claw-kit",
          source: { source: "local", path: "./plugins/claw-kit" },
        },
      ],
    }, null, 2),
  );
  await fs.mkdir(path.join(marketplaceSourceDir, "skills"), { recursive: true });
  await fs.writeFile(path.join(marketplaceSourceDir, "skills", "stale.md"), "stale");

  const result = await installCodexPluginDevelopmentSurface({
    sourceDir,
    marketplaceRoot,
    cacheRoot,
  });

  assert.equal(result.marketplaceName, "claw-kit-local");
  assert.equal(result.marketplaceSourceDir, marketplaceSourceDir);
  assert.equal(result.installDir, path.join(cacheRoot, "claw-kit", "0.1.41+codex.test"));
  assert.equal(
    JSON.parse(await fs.readFile(path.join(marketplaceSourceDir, ".codex-plugin", "plugin.json"), "utf8")).version,
    "0.1.41+codex.test",
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(result.installDir, ".codex-plugin", "plugin.json"), "utf8")).version,
    "0.1.41+codex.test",
  );
  await assert.rejects(fs.access(path.join(marketplaceSourceDir, "skills", "stale.md")));
});

test("installCodexPluginDevelopmentSurface rejects a marketplace that does not expose the plugin", async () => {
  const { sourceDir, root } = await makeFixture();
  const marketplaceRoot = path.join(root, ".agents", "plugins", "claw-kit-local");

  await fs.mkdir(marketplaceRoot, { recursive: true });
  await fs.writeFile(
    path.join(marketplaceRoot, "marketplace.json"),
    JSON.stringify({ name: "claw-kit-local", plugins: [] }, null, 2),
  );

  await assert.rejects(
    installCodexPluginDevelopmentSurface({ sourceDir, marketplaceRoot }),
    /does not expose claw-kit/,
  );
});
