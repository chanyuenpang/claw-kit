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

test("writer skills are delegated-subagent-only self-contained contracts", () => {
  const cases = [
    path.join("skills", "truth-writer", "SKILL.md"),
    path.join("skills", "adr-writer", "SKILL.md"),
  ];

  for (const skillPath of cases) {
    const skill = readPluginFile(skillPath);
    assert.match(skill, /use inside an explicitly delegated .* subagent/i);
    assert.match(skill, /act as the delegated .* subagent/i);
    assert.match(skill, /## Mission/);
    assert.match(skill, /## Input/);
    assert.match(skill, /## Canonical routing/);
    assert.match(skill, /## Writing rules/);
    assert.match(skill, /## Workflow/);
    assert.match(skill, /## Return/);
    assert.match(skill, /record repository locations only as project-relative paths/i);
    assert.match(skill, /`claw search` discoverability/i);
    assert.doesNotMatch(skill, /AGENT-SPEC|main agent|caller|timing rule|timing and boundaries|SUMMARY\.md/i);
  }

  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  assert.match(mainRouter, /the writer skill remains inside the delegated subagent context/i);
  assert.match(mainRouter, /truth-value judgment stays on the main agent side/i);
});

test("writer skills own routing without burdening the main agent", () => {
  const truthSkill = readPluginFile(path.join("skills", "truth-writer", "SKILL.md"));
  const adrSkill = readPluginFile(path.join("skills", "adr-writer", "SKILL.md"));
  const dispatchReference = readPluginFile(path.join("references", "codex-subagent-dispatch.md"));

  assert.match(truthSkill, /own canonical routing and deposition/i);
  assert.match(adrSkill, /own decision extraction, canonical routing, and deposition/i);
  assert.doesNotMatch(adrSkill, /truth corpus|truth deposition/i);
  assert.doesNotMatch(truthSkill, /adr-writer|route durable architecture decisions/i);
  assert.match(dispatchReference, /canonical ADR routing belongs to the ADR writer/i);
  assert.match(dispatchReference, /main agent must not inspect the ADR corpus/i);
  assert.doesNotMatch(dispatchReference, /when known, `targetPath`/i);
  assert.match(dispatchReference, /dispatch: when_reusable_truth_confirmed/);
  assert.match(dispatchReference, /dispatch: required/);
  assert.doesNotMatch(dispatchReference, /required: false|dispatchCondition/);
});
