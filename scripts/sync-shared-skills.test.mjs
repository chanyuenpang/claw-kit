import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { syncSharedSkills } from "./sync-shared-skills.mjs";

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
});
