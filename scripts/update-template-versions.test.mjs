import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertTemplateVersionsAligned, collectReleaseTemplatePaths, inspectTemplateVersions, updateTemplateVersions } from "./update-template-versions.mjs";

test("template updater edits canonical sources only and leaves obsolete copies untouched", async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claw-template-sources-"));
  t.after(() => fs.rm(repoRoot, { recursive: true, force: true }));
  async function put(relative, text) {
    const file = path.join(repoRoot, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
    return file;
  }
  await put("package.json", '{"version":"1.2.3"}\n');
  await put("packages/core/src/plan-templates.ts", 'export const TEMPLATE_DRIVER_VERSION = "7.0.0";\n');
  const defaultPath = await put("packages/core/src/templates/plans/default.ts", 'export const defaultPlanTemplate = { id: "default", version: "1.0.0" };\n');
  const templates = [
    ".agents/skills/release-demo/TEMPLATE.json",
    ".agents/skills/create-claw-skill/TEMPLATE.json",
    "packages/core/resources/delegate-writer/TEMPLATE.json",
    "packages/core/resources/knowledge-writer/TEMPLATE.json",
    "packages/codex-adapter/skills/update/TEMPLATE.json",
    "packages/dsh-adapter/skills/update/TEMPLATE.json",
    "packages/opencode-adapter/skills/update/TEMPLATE.json",
  ];
  const obsolete = [
    "shared/skills/create-claw-skill/TEMPLATE.json",
    "packages/codex-adapter/skills/create-claw-skill/TEMPLATE.json",
    "packages/standard-adapter/skills/create-claw-skill/TEMPLATE.json",
    "packages/cindy-adapter/plugin/skills/create-claw-skill/TEMPLATE.json",
    "dist/dsh-plugin/skills/create-claw-skill/TEMPLATE.json",
  ];
  for (const file of [...templates, ...obsolete]) await put(file, '{"id":"demo","version":"1.0.0","tasks":[]}\n');
  const runtimePath = await put("shared/skills/knowledge-capture/runtime.json", '{"package":"@veewo/claw","version":"1.2.2"}\n');
  const oldPins = [];
  for (const host of ["codex", "dsh"]) oldPins.push(await put("packages/" + host + "-adapter/skills/knowledge-capture/runtime.json", '{"version":"1.2.2"}\n'));

  assert.equal((await collectReleaseTemplatePaths(repoRoot)).length, templates.length);
  const before = await inspectTemplateVersions({ repoRoot });
  assert.equal(before.templateCount, templates.length);
  assert.equal(before.issues.length, templates.length + 2);
  await assert.rejects(assertTemplateVersionsAligned({ repoRoot }), /canonical source changes/);
  const update = await updateTemplateVersions({ repoRoot });
  assert.equal(update.version, "7.0.0");
  assert.equal(update.updated.length, templates.length + 2);
  await assert.doesNotReject(assertTemplateVersionsAligned({ repoRoot }));
  for (const file of templates) assert.equal(JSON.parse(await fs.readFile(path.join(repoRoot, file), "utf8")).version, "7.0.0");
  for (const file of obsolete) assert.equal(JSON.parse(await fs.readFile(path.join(repoRoot, file), "utf8")).version, "1.0.0");
  for (const file of oldPins) assert.equal(JSON.parse(await fs.readFile(file, "utf8")).version, "1.2.2");
  assert.match(await fs.readFile(defaultPath, "utf8"), /version: "7\.0\.0"/);
  assert.equal(JSON.parse(await fs.readFile(runtimePath, "utf8")).version, "1.2.3");
  assert.deepEqual((await updateTemplateVersions({ repoRoot })).updated, []);
  await fs.rm(runtimePath);
  const missing = await inspectTemplateVersions({ repoRoot });
  assert.equal(missing.issues.length, 1);
  assert.equal(missing.issues[0].actualVersion, null);
});
