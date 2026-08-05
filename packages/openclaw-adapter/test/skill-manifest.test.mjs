import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("OpenClaw manifest declares its claw-kit documentation skill root", async () => {
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
      await assert.doesNotReject(fs.access(path.join(packageRoot, skillRoot, relativePath)));
    }
  }
});
