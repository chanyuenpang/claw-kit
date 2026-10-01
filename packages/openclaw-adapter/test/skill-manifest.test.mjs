import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { assembleSkills } from "../../../scripts/skill-artifacts.mjs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("OpenClaw manifest declares its assembled documentation skill root", async (t) => {
  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claw-openclaw-skills-"));
  t.after(() => fs.rm(artifactRoot, { recursive: true, force: true }));
  await assembleSkills({ sourceRoot: path.resolve(packageRoot, "../.."), targetHost: "openclaw", outputRoot: artifactRoot });
  assert.deepEqual(await fs.readdir(path.join(artifactRoot, "skills")), ["claw-kit-doc"]);
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, "openclaw.plugin.json"), "utf8"));
  const packageJson = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.id, "claw-kit");
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(manifest.skills, ["skills"]);
  assert.deepEqual(manifest.configSchema, {
    type: "object",
    additionalProperties: false,
    properties: {},
  });

  for (const skillRoot of manifest.skills) {
    for (const relativePath of [
      "claw-kit-doc/SKILL.md",
      "claw-kit-doc/references/update.md",
      "claw-kit-doc/references/configuration.md",
      "claw-kit-doc/references/knowledge-format.md",
    ]) {
      await assert.doesNotReject(fs.access(path.join(artifactRoot, skillRoot, relativePath)));
    }
  }
});
