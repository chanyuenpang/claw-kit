import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("create-claw-skill stub generator writes standard fill-in surfaces", async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-skill-stub-test-"));
  t.after(async () => {
    await fs.rm(outDir, { recursive: true, force: true });
  });

  await execFileAsync(
    process.execPath,
    [
      "shared/skills/create-claw-skill/scripts/create-claw-skill-stub.mjs",
      "--skill-name",
      "demo-skill",
      "--template-id",
      "demo-template",
      "--target-work",
      "process demo targets",
      "--fallback-doc",
      "DEMO-FALLBACK.md",
      "--out",
      outDir,
    ],
    { cwd: repoRoot },
  );

  const skillText = await fs.readFile(path.join(outDir, "SKILL.md"), "utf8");
  const templateText = await fs.readFile(path.join(outDir, "TEMPLATE.json"), "utf8");
  const coverageText = await fs.readFile(path.join(outDir, "CONTENT-COVERAGE.md"), "utf8");

  assert.match(skillText, /Run a demo-skill subplan, complete process demo targets/);
  assert.match(skillText, /claw subplan create --parent <root-task-name> --task-id <id> --template demo-template/);
  assert.match(skillText, /Optional skill-local references: add files under `references\/` only when the source skill needs extra material/);
  assert.equal(JSON.parse(templateText).id, "demo-template");
  assert.match(coverageText, /Skill-local template: `TEMPLATE\.json` with id `demo-template`/);
  assert.match(coverageText, /standard subplan route for process demo targets/);
  assert.match(coverageText, /Information that does not fit template structure stays in `SKILL\.md` or optional skill-local references/);
  await assert.doesNotReject(fs.access(path.join(outDir, "DEMO-FALLBACK.md")));
  await assert.rejects(fs.access(path.join(outDir, "CLAW-KNOWLEDGE.md")));
});
