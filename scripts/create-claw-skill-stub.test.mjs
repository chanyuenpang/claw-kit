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
const repoVersion = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")).version;

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
      "--out",
      outDir,
    ],
    { cwd: repoRoot },
  );

  const skillText = await fs.readFile(path.join(outDir, "SKILL.md"), "utf8");
  const templateText = await fs.readFile(path.join(outDir, "TEMPLATE.json"), "utf8");
  const coverageText = await fs.readFile(path.join(outDir, "CONTENT-COVERAGE.md"), "utf8");

  assert.match(skillText, /Resolve `<skill-dir>` as the directory containing this loaded `SKILL\.md`/);
  assert.match(skillText, /Whole task:[\s\S]*claw plan create --template-file "<skill-dir>\/TEMPLATE\.json"/);
  assert.match(skillText, /Independent stage:[\s\S]*claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>\/TEMPLATE\.json"/);
  assert.match(skillText, /active parent goal completes before the child plan creates its own goal/i);
  assert.match(skillText, /batch is a repeated-stage case/i);
  assert.match(skillText, /Mixed stage:[\s\S]*Read `FALLBACK\.md`/);
  assert.doesNotMatch(skillText, /Recommended batch task|Batch or mixed request/);
  assert.doesNotMatch(skillText, /session scope|--scope session|no project context/i);
  assert.match(skillText, /Optional skill-local references: add files under `references\/` only when the source skill needs extra material/);
  const template = JSON.parse(templateText);
  assert.equal(template.id, "demo-skill");
  assert.equal(template.version, repoVersion);
  assert.equal("scope" in template, false);
  assert.equal(template.status, "process.active");
  assert.equal(template.tasks.length, 3);
  assert.equal(template.tasks.some((task) => task.guidance?.onPlanStart), false);
  assert.doesNotMatch(templateText, /"choices"/);
  assert.deepEqual(template.rules, ["Follow returned workflowGuidance before advancing."]);
  assert.match(template.tasks[0].detail, /task-specific constraint[\s\S]*owning sub-task's detail/i);
  assert.match(template.tasks[0].detail, /top-level rules for cross-task constraints/i);
  assert.match(template.tasks[0].detail, /guidance\.onPlanStart[\s\S]*process\.active/i);
  assert.match(template.tasks[2].detail, /template version matches the current claw CLI/i);
  assert.match(template.tasks[2].detail, /completionChoices[\s\S]*one claw task done[\s\S]*Do not repeat ids in nextsteps/i);
  assert.match(coverageText, /Skill-local template: `TEMPLATE\.json` with id `demo-skill`/);
  assert.match(coverageText, /Mixed-stage entry:[\s\S]*fallback/);
  assert.match(coverageText, /Unavailable-tooling entry:[\s\S]*same fallback/);
  assert.match(coverageText, /Information that does not fit template structure stays in `SKILL\.md` or optional skill-local references/);
  assert.match(coverageText, /Lifecycle handoff:[\s\S]*guidance\.onPlanStart/);
  await assert.doesNotReject(fs.access(path.join(outDir, "FALLBACK.md")));
  await assert.rejects(fs.access(path.join(outDir, "CLAW-KNOWLEDGE.md")));
});

test("create-claw-skill stub generator does not expose manual scope routing", async () => {
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "shared/skills/create-claw-skill/scripts/create-claw-skill-stub.mjs",
        "--skill-name",
        "demo-skill",
        "--scope",
        "session",
      ],
      { cwd: repoRoot },
    ),
    /Unknown option: --scope/,
  );
});
