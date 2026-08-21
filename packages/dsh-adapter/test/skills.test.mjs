import { test } from "node:test";
import assert from "node:assert/strict";
import {
  discoverBundledSkills,
  parseSkillFrontmatter,
  registerBundledSkills,
  stripFrontmatter,
} from "../lib/skills.js";

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
  assert.ok(names.includes("using-claw-kit"), "host-specific using-claw-kit present");
  assert.ok(names.includes("researcher"), "host-specific researcher present");
  assert.ok(names.includes("planning"), "shared planning present");
  assert.ok(names.includes("claw-kit-doc"), "shared claw-kit-doc present");
  assert.ok(names.includes("config"), "shared config present");
  assert.ok(names.includes("create-claw-skill"), "shared create-claw-skill present");
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
  assert.ok(candidates.length >= 6, `expected >= 6 bundled skills, got ${candidates.length}`);
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
