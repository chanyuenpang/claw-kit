import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertTemplateVersionsAligned,
  inspectTemplateVersions,
  updateTemplateVersions,
} from "./update-template-versions.mjs";

test("template release updater aligns plugin and built-in template versions", async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claw-template-versions-"));
  t.after(() => fs.rm(repoRoot, { recursive: true, force: true }));

  await fs.writeFile(path.join(repoRoot, "package.json"), '{"version":"1.2.3"}\n', "utf8");
  const templateDriverPath = path.join(repoRoot, "packages", "core", "src", "plan-templates.ts");
  await fs.mkdir(path.dirname(templateDriverPath), { recursive: true });
  await fs.writeFile(templateDriverPath, 'export const TEMPLATE_DRIVER_VERSION = "7.0.0";\n', "utf8");
  const templatePaths = [
    path.join(".agents", "skills", "release-demo", "TEMPLATE.json"),
    path.join("shared", "skills", "demo", "TEMPLATE.json"),
    path.join("packages", "codex-adapter", "skills", "demo", "TEMPLATE.json"),
    path.join("packages", "core", "resources", "delegate-writer", "TEMPLATE.json"),
    path.join("packages", "core", "resources", "cindy-delegate-writer", "TEMPLATE.json"),
    path.join("packages", "core", "resources", "doc-updater", "TEMPLATE.json"),
    path.join("packages", "core", "resources", "knowledge-writer", "TEMPLATE.json"),
    path.join("packages", "opencode-adapter", "skills", "demo", "TEMPLATE.json"),
  ];
  for (const relativePath of templatePaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, '{"id":"demo","version":"1.2.2","status":"process.active","tasks":[]}\n', "utf8");
  }
  const runtimePath = path.join(
    repoRoot,
    "packages",
    "codex-adapter",
    "skills",
    "knowledge-capture",
    "runtime.json",
  );
  await fs.mkdir(path.dirname(runtimePath), { recursive: true });
  await fs.writeFile(runtimePath, '{"version":"1.2.2"}\n', "utf8");

  const runtimeSpecPath = path.join(repoRoot, "packages", "codex-adapter", "skills", "knowledge-capture", "runtime.json");
  await fs.mkdir(path.dirname(runtimeSpecPath), { recursive: true });
  await fs.writeFile(runtimeSpecPath, '{"version":"1.2.2"}\n', "utf8");

  const defaultPath = path.join(repoRoot, "packages", "core", "src", "templates", "plans", "default.ts");
  await fs.mkdir(path.dirname(defaultPath), { recursive: true });
  await fs.writeFile(
    defaultPath,
    'export const defaultPlanTemplate = {\n  id: "default",\n  version: "1.2.2",\n};\n',
    "utf8",
  );

  const before = await inspectTemplateVersions({ repoRoot });
  assert.equal(before.templateCount, 8);
  assert.equal(before.issues.length, 10);
  await assert.rejects(
    assertTemplateVersionsAligned({ repoRoot }),
    /sync:template-versions[\s\S]*sync:shared-skills/u,
  );

  const update = await updateTemplateVersions({ repoRoot });
  assert.equal(update.version, "7.0.0");
  assert.equal(update.updated.length, 10);
  await assert.doesNotReject(assertTemplateVersionsAligned({ repoRoot }));

  for (const relativePath of templatePaths) {
    const template = JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
    assert.equal(template.version, "7.0.0");
  }
  assert.match(await fs.readFile(defaultPath, "utf8"), /version: "7\.0\.0"/u);
  assert.equal(JSON.parse(await fs.readFile(runtimePath, "utf8")).version, "1.2.3");

  const second = await updateTemplateVersions({ repoRoot });
  assert.deepEqual(second.updated, []);
});
