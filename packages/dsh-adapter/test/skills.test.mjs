import { test, after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildHostPluginArtifact } from "../../../scripts/host-plugin-artifacts.mjs";
import assert from "node:assert/strict";
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "claw-dsh-skill-provider-"));
after(() => fs.rm(temporary, { recursive: true, force: true }));
const artifact = await buildHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot: path.join(temporary, "package") });
const {
  discoverBundledSkills,
  parseSkillFrontmatter,
  registerBundledSkills,
  stripFrontmatter,
} = await import(pathToFileURL(path.join(artifact.outputRoot, "lib", "skills.js")).href);

test("parseSkillFrontmatter extracts name/description", () => {
  const content = `---
name: using-claw-kit
description: Use first whenever the claw-kit DSH adapter is enabled.
---

# Body`;
  assert.deepEqual(parseSkillFrontmatter(content), {
    name: "using-claw-kit",
    description: "Use first whenever the claw-kit DSH adapter is enabled.",
  });
});

test("parseSkillFrontmatter returns empty for missing frontmatter", () => {
  assert.deepEqual(parseSkillFrontmatter("# No frontmatter"), {});
});

test("stripFrontmatter removes the block and keeps the body", () => {
  const content = `---
name: x
description: y
---

# Body text
line two`;
  assert.equal(stripFrontmatter(content), "# Body text\nline two");
});

test("discoverBundledSkills finds the packaged claw-kit skills", () => {
  const skills = discoverBundledSkills();
  const names = skills.map((skill) => skill.name).sort();
  assert.deepEqual(names, artifact.skills.map((skill) => skill.id).sort());
  assert.ok(names.includes("using-claw-kit"), "shared using-claw-kit present");
  assert.ok(names.includes("researcher"), "host-specific researcher present");
  assert.ok(names.includes("planning"), "shared planning present");
  assert.ok(names.includes("claw-kit-doc"), "shared claw-kit-doc present");
  assert.ok(names.includes("config"), "shared config present");
  assert.ok(names.includes("create-claw-skill"), "shared create-claw-skill present");
  assert.ok(names.includes("update"), "host-specific update present");
  for (const skill of skills) {
    assert.ok(skill.description.length > 0, `${skill.name} has a description`);
  }
});

test("registerBundledSkills provider lists candidates and loads bodies", async () => {
  let registered;
  registerBundledSkills({
    registerProvider(create) {
      registered = create();
      return () => {};
    },
  });
  assert.ok(registered, "provider must be registered");
  assert.equal(registered.name, "claw-kit");

  const candidates = await registered.list({});
  assert.ok(Array.isArray(candidates), "list returns an array");
  assert.equal(candidates.length, artifact.skills.length);
  const using = candidates.find((candidate) => candidate.name === "using-claw-kit");
  assert.ok(using, "using-claw-kit candidate present");
  assert.equal(using.rank, 600);
  assert.equal(using.source, "bundled");
  assert.equal(using.invocation.modelInvocable, true);

  const loaded = await registered.get(using, {});
  assert.ok(loaded, "get loads the skill");
  assert.equal(loaded.name, "using-claw-kit");
  assert.match(loaded.content, /claw_run/);
  assert.equal(loaded.resourceBase.kind, "directory");
});

test("provider never falls back to repository skills when its explicit root is absent", () => {
  assert.deepEqual(discoverBundledSkills(path.join(temporary, "absent", "skills")), []);
});
