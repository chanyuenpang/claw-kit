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
  const templatePaths = [
    path.join("shared", "skills", "demo", "TEMPLATE.json"),
    path.join("packages", "codex-adapter", "skills", "demo", "TEMPLATE.json"),
    path.join("packages", "opencode-adapter", "skills", "demo", "TEMPLATE.json"),
  ];
  for (const relativePath of templatePaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, '{"id":"demo","version":"1.2.2","status":"process.active","tasks":[]}\n', "utf8");
  }

  const defaultPath = path.join(repoRoot, "packages", "core", "src", "templates", "plans", "default.ts");
  await fs.mkdir(path.dirname(defaultPath), { recursive: true });
  await fs.writeFile(
    defaultPath,
    'export const defaultPlanTemplate = {\n  id: "default",\n  version: "1.2.2",\n};\n',
    "utf8",
  );

  const before = await inspectTemplateVersions({ repoRoot });
  assert.equal(before.templateCount, 3);
  assert.equal(before.issues.length, 4);
  await assert.rejects(
    assertTemplateVersionsAligned({ repoRoot }),
    /sync:template-versions[\s\S]*sync:shared-skills/u,
  );

  const update = await updateTemplateVersions({ repoRoot });
  assert.equal(update.version, "1.2.3");
  assert.equal(update.updated.length, 4);
  await assert.doesNotReject(assertTemplateVersionsAligned({ repoRoot }));

  for (const relativePath of templatePaths) {
    const template = JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
    assert.equal(template.version, "1.2.3");
  }
  assert.match(await fs.readFile(defaultPath, "utf8"), /version: "1\.2\.3"/u);

  const second = await updateTemplateVersions({ repoRoot });
  assert.deepEqual(second.updated, []);
});
