import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(hooksDir, "..");

function readPluginFile(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), "utf-8");
}

test("researcher dispatch contract stays explicit, host-light, and blocking for research work", () => {
  const researcherSkill = readPluginFile(path.join("skills", "researcher", "SKILL.md"));
  const dispatchReference = readPluginFile(path.join("references", "codex-subagent-dispatch.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(researcherSkill, /attach this researcher skill explicitly/i);
  assert.match(researcherSkill, /for research tasks, wait for the result/i);
  assert.match(researcherSkill, /do not skip ahead/i);

  assert.match(dispatchReference, /do not read (?:the )?search skill inline/i);
  assert.match(dispatchReference, /attach (?:the )?`claw-kit:researcher` skill item/i);
  assert.match(dispatchReference, /if the task is research, wait for completion/i);
  assert.match(dispatchReference, /do not skip ahead/i);

  assert.match(workflowReference, /the main agent does not need to read specialist skill files inline before dispatch/i);
  assert.match(workflowReference, /for a research delegate, the host must wait when the task is research/i);
});

test("writer skills stay delegated-subagent-only second-layer routers", () => {
  const cases = [
    {
      skill: path.join("skills", "truth-writer", "SKILL.md"),
      reference: path.join("references", "TRUTH-AGENT-SPEC.md"),
      referencePattern: /`\.\.\/\.\.\/references\/TRUTH-AGENT-SPEC\.md`/g,
    },
    {
      skill: path.join("skills", "adr-writer", "SKILL.md"),
      reference: path.join("references", "ADR-AGENT-SPEC.md"),
      referencePattern: /`\.\.\/\.\.\/references\/ADR-AGENT-SPEC\.md`/g,
    },
  ];

  for (const writer of cases) {
    const skill = readPluginFile(writer.skill);
    const nonEmptyLines = skill.split(/\r?\n/).filter((line) => line.trim()).length;

    assert.match(skill, /use inside an explicitly delegated .* subagent/i);
    assert.match(skill, /act as the delegated .* subagent/i);
    assert.match(skill, /read .* completely, then perform the deposition exactly as specified there/i);
    assert.match(skill, /keep the reference as internal execution guidance/i);
    assert.equal(skill.match(writer.referencePattern)?.length, 1);
    assert.ok(nonEmptyLines <= 12, `${writer.skill} must stay a compact router`);
    assert.ok(fs.existsSync(path.join(pluginRoot, writer.reference)), `${writer.reference} must exist`);
  }

  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  assert.match(mainRouter, /the writer skill remains inside the delegated subagent context/i);
  assert.match(mainRouter, /truth-value judgment stays on the main agent side/i);
});

test("writer references own canonical routing instead of burdening the main agent", () => {
  const truthReference = readPluginFile(path.join("references", "TRUTH-AGENT-SPEC.md"));
  const adrReference = readPluginFile(path.join("references", "ADR-AGENT-SPEC.md"));
  const dispatchReference = readPluginFile(path.join("references", "codex-subagent-dispatch.md"));

  for (const reference of [truthReference, adrReference]) {
    assert.match(reference, /writer-owned routing/i);
    assert.match(reference, /(?:canonical routing.*belong(?:s)? to this writer|this writer owns canonical routing)/i);
    assert.match(reference, /run `claw search` and read only relevant candidates/i);
    assert.match(reference, /widen inspection incrementally/i);
  }

  assert.doesNotMatch(adrReference, /1\. Read the existing ADRs\./);
  assert.match(dispatchReference, /canonical ADR routing belongs to the ADR writer/i);
  assert.match(dispatchReference, /main agent must not inspect the ADR corpus/i);
  assert.doesNotMatch(dispatchReference, /when known, `targetPath`/i);
  assert.match(dispatchReference, /dispatch: when_reusable_truth_confirmed/);
  assert.match(dispatchReference, /dispatch: required/);
  assert.doesNotMatch(dispatchReference, /required: false|dispatchCondition/);
});
