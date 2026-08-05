import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  SHARED_DOCUMENTATION_NAMES,
  SHARED_SKILL_NAMES,
  syncSharedSkills,
  verifySharedSkillsSynced,
} from "./sync-shared-skills.mjs";

test("platform-specific update skills are not shared-generated", () => {
  assert.equal(SHARED_SKILL_NAMES.includes("update"), false);
  assert.equal(SHARED_SKILL_NAMES.includes("claw-kit-doc"), false);
  assert.deepEqual(SHARED_DOCUMENTATION_NAMES, ["claw-kit-doc"]);
});

test("researcher adapters share one invocation description", async () => {
  const expected =
    "Use for complex research questions that require an independent, multi-step process of gathering and synthesizing evidence—not direct fact lookups or routine searches.";
  const skillUrls = [
    new URL("../packages/codex-adapter/skills/researcher/SKILL.md", import.meta.url),
    new URL("../packages/opencode-adapter/skills/researcher/SKILL.md", import.meta.url),
    new URL("../packages/cindy-adapter/plugin/skills/researcher/SKILL.md", import.meta.url),
  ];

  for (const skillUrl of skillUrls) {
    const skill = await fs.readFile(skillUrl, "utf8");
    assert.equal(skill.match(/^description: (.+)$/m)?.[1], expected);
  }

  const cindyManifest = JSON.parse(
    await fs.readFile(new URL("../packages/cindy-adapter/plugin/ghost.json", import.meta.url), "utf8"),
  );
  assert.equal(
    cindyManifest.skill.items.find((item) => item.name === "researcher")?.description,
    expected,
  );
});

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-sync-shared-skills-"));
  const sharedSkillDir = path.join(root, "shared", "skills", "demo");
  const codexSkillDir = path.join(root, "packages", "codex-adapter", "skills", "demo");
  const opencodeSkillDir = path.join(root, "packages", "opencode-adapter", "skills", "demo");

  await fs.mkdir(path.join(sharedSkillDir, "scripts"), { recursive: true });
  await fs.mkdir(codexSkillDir, { recursive: true });
  await fs.mkdir(opencodeSkillDir, { recursive: true });

  await fs.writeFile(
    path.join(sharedSkillDir, "SKILL.md"),
    ["---", "name: demo", "description: demo", "---", "# demo", ""].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(sharedSkillDir, "guide.md"), "guide", "utf8");
  await fs.writeFile(path.join(sharedSkillDir, "scripts", "helper.js"), "export const ok = true;\n", "utf8");

  await fs.writeFile(path.join(codexSkillDir, "stale.txt"), "stale", "utf8");
  await fs.writeFile(path.join(opencodeSkillDir, "stale.txt"), "stale", "utf8");

  return { root, codexSkillDir, opencodeSkillDir };
}

test("syncSharedSkills copies whole skill directories and refreshes top-level SKILL banners", async (t) => {
  const { root, codexSkillDir, opencodeSkillDir } = await makeFixture();
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  await syncSharedSkills({ repoRoot: root, skillNames: ["demo"] });

  for (const skillDir of [codexSkillDir, opencodeSkillDir]) {
    const skillText = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8");
    assert.match(skillText, /AUTO-GENERATED from shared\/skills\/demo\/SKILL\.md/);
    await assert.doesNotReject(fs.access(path.join(skillDir, "guide.md")));
    await assert.doesNotReject(fs.access(path.join(skillDir, "scripts", "helper.js")));
    await assert.rejects(fs.access(path.join(skillDir, "stale.txt")));
  }

  assert.deepEqual(
    await verifySharedSkillsSynced({ repoRoot: root, skillNames: ["demo"] }),
    { ok: true, problems: [] },
  );
});

test("verifySharedSkillsSynced reports a missing materialized skill without rewriting it", async (t) => {
  const { root, codexSkillDir, opencodeSkillDir } = await makeFixture();
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  await fs.rm(codexSkillDir, { recursive: true, force: true });
  await fs.rm(opencodeSkillDir, { recursive: true, force: true });
  const result = await verifySharedSkillsSynced({ repoRoot: root, skillNames: ["demo"] });

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0], /incomplete file set/);
  await assert.rejects(fs.access(codexSkillDir));
});

test("syncSharedSkills can target an isolated adapter staging directory", async (t) => {
  const { root } = await makeFixture();
  const stagedAdapter = path.join(root, "staged-adapter");
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  await syncSharedSkills({ repoRoot: root, skillNames: ["demo"], adapterDirs: [stagedAdapter] });

  const stagedSkill = path.join(stagedAdapter, "skills", "demo");
  await assert.doesNotReject(fs.access(path.join(stagedSkill, "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(stagedSkill, "guide.md")));
  await assert.doesNotReject(fs.access(path.join(stagedSkill, "scripts", "helper.js")));
});

test("claw-kit-doc sync copies references while preserving adapter-owned entries", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-doc-sync-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const sourceDir = path.join(root, "shared", "docs", "claw-kit-doc");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "update.md"), "updates\n", "utf8");
  await fs.writeFile(path.join(sourceDir, "configuration.md"), "config\n", "utf8");
  await fs.writeFile(path.join(sourceDir, "knowledge-format.md"), "format\n", "utf8");

  const adapterRoots = [
    path.join(root, "packages", "codex-adapter"),
    path.join(root, "packages", "opencode-adapter"),
    path.join(root, "packages", "cindy-adapter", "plugin"),
    path.join(root, "packages", "openclaw-adapter"),
  ];
  for (const [index, adapterRoot] of adapterRoots.entries()) {
    const skillDir = path.join(adapterRoot, "skills", "claw-kit-doc");
    await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), `# adapter entry ${index}\n`, "utf8");
  }
  const staleDir = path.join(adapterRoots[2], "skills", "claw-kit-doc", "references");
  await fs.writeFile(path.join(staleDir, "stale.md"), "stale", "utf8");
  await fs.mkdir(path.join(root, "packages", "core", "resources", "knowledge-writer"), { recursive: true });

  await syncSharedSkills({ repoRoot: root, skillNames: [], documentationNames: ["claw-kit-doc"] });

  for (const [index, adapterRoot] of adapterRoots.entries()) {
    const targetDir = path.join(adapterRoot, "skills", "claw-kit-doc");
    assert.equal(await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8"), `# adapter entry ${index}\n`);
    await assert.doesNotReject(fs.access(path.join(targetDir, "references", "knowledge-format.md")));
  }
  await assert.rejects(fs.access(path.join(staleDir, "stale.md")));
  assert.equal(
    await fs.readFile(path.join(root, "packages", "core", "resources", "knowledge-writer", "knowledge-format.md"), "utf8"),
    "format\n",
  );
  assert.deepEqual(
    await verifySharedSkillsSynced({ repoRoot: root, skillNames: [], documentationNames: ["claw-kit-doc"] }),
    { ok: true, problems: [] },
  );
});
