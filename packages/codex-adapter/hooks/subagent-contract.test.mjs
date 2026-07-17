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

test("fixed Codex hook events use the auto-claw and auto-doc command names", () => {
  const config = JSON.parse(readPluginFile(path.join("hooks", "hooks.json")));
  const strategy = readPluginFile(path.join("references", "codex-hooks-strategy.md"));
  const sessionStart = config.hooks.SessionStart[0].hooks[0];
  const stop = config.hooks.Stop[0].hooks[0];

  assert.equal(sessionStart.command, "claw hook auto-claw --host codex");
  assert.equal(sessionStart.commandWindows, "claw hook auto-claw --host codex");
  assert.match(sessionStart.statusMessage, /^auto-claw:/);
  assert.equal(stop.command, "claw hook auto-doc --host codex");
  assert.equal(stop.commandWindows, "claw hook auto-doc --host codex");
  assert.match(stop.statusMessage, /^auto-doc:/);
  assert.match(strategy, /thread-scoped `SessionStart`/i);
  assert.match(strategy, /turn-scoped `Stop`/i);
});

test("Codex adapter owns the SDK and matching direct platform packages", () => {
  const packageJson = JSON.parse(readPluginFile("package.json"));
  const sdkVersion = packageJson.dependencies["@openai/codex-sdk"];
  assert.equal(sdkVersion, "0.144.5");
  for (const target of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"]) {
    assert.equal(
      packageJson.optionalDependencies[`@openai/codex-${target}`],
      `npm:@openai/codex@${sdkVersion}-${target}`,
    );
  }
});

test("researcher dispatch contract stays explicit, host-light, and blocking for research work", () => {
  const researcherSkill = readPluginFile(path.join("skills", "researcher", "SKILL.md"));
  const dispatchReference = readPluginFile(path.join("references", "codex-subagent-dispatch.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(researcherSkill, /attach this researcher skill explicitly/i);
  assert.match(researcherSkill, /for research tasks, wait for the result/i);
  assert.match(researcherSkill, /do not skip ahead/i);
  assert.match(researcherSkill, /claw search --query "<topic>"/);

  assert.match(dispatchReference, /do not read (?:the )?search skill inline/i);
  assert.match(dispatchReference, /attach (?:the )?`claw-kit:researcher` skill item/i);
  assert.match(dispatchReference, /if the task is research, wait for completion/i);
  assert.match(dispatchReference, /do not skip ahead/i);

  assert.match(workflowReference, /the main agent does not need to read specialist skill files inline before dispatch/i);
  assert.match(workflowReference, /for a research delegate, the host must wait when the task is research/i);
});

test("legacy writer skills stay self-contained while the main router forbids deposition dispatch", () => {
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
    assert.match(skill, /UTF-8 with BOM/i);
    assert.match(skill, /EF BB BF/i);
    assert.match(skill, /claw truth ingest/i);
    assert.match(skill, /`claw search` discoverability/i);
    assert.doesNotMatch(skill, /AGENT-SPEC|main agent|caller|timing rule|timing and boundaries|SUMMARY\.md/i);
  }

  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  assert.match(mainRouter, /Never dispatch `truth-writer`, `adr-writer`, or `knowledge-writer` from the main agent/i);
  assert.match(mainRouter, /Stop hook writes exactly one report/i);
});

test("SDK knowledge writer owns combined truth and ADR judgment", () => {
  const knowledgeSkill = readPluginFile(path.join("skills", "knowledge-writer", "SKILL.md"));
  const configSkill = readPluginFile(path.join("skills", "config", "SKILL.md"));
  const dispatchReference = readPluginFile(path.join("references", "codex-subagent-dispatch.md"));

  assert.match(knowledgeSkill, /main task agent does not invoke it/i);
  assert.match(knowledgeSkill, /truth only, ADR only, both, or neither/i);
  assert.match(knowledgeSkill, /Do not modify either file/i);
  assert.match(knowledgeSkill, /Do not launch another writer or refresh process/i);
  assert.match(dispatchReference, /Never dispatch `truth-writer`, `adr-writer`, or `knowledge-writer`/i);
  assert.match(dispatchReference, /Stop hook and Codex SDK worker own report-based truth and ADR closeout/i);
  assert.match(configSkill, /knowledgeWriter\.externalSkill/);
  assert.match(configSkill, /built-in `claw-kit:knowledge-writer`/i);
});

test("Codex plan commands use only the bundled code-mode consumer", () => {
  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(mainRouter, /code-mode-host-action-consumer\.mjs/i);
  assert.match(mainRouter, /async function runClawPlanMutation/i);
  assert.match(mainRouter, /change only `command`, `workdir`, and `timeout_ms`/i);
  assert.match(mainRouter, /claw codex driver/i);
  assert.match(mainRouter, /load\(cacheKey\)/i);
  assert.match(mainRouter, /store\(cacheKey, envelope\)/i);
  assert.match(mainRouter, /eval/i);
  assert.match(mainRouter, /must not interpret `hostActions`/i);
  assert.match(mainRouter, /no direct-call or split-call fallback path/i);
  assert.match(mainRouter, /`hostActions` is the only Codex host-execution source/i);

  assert.match(workflowReference, /code-mode consumption is the adapter execution method/i);
  assert.match(workflowReference, /code-mode-host-action-consumer\.mjs/i);
  assert.match(workflowReference, /Codex has no separate host-call fallback/i);
  assert.match(workflowReference, /schema v1 native `create_goal` or `update_goal`/i);
  assert.match(workflowReference, /exactly once/i);
  assert.match(workflowReference, /does not inspect current Goal state, parse host error wording/i);
  assert.match(workflowReference, /routes Codex Goal actions from the committed plan status/i);
  assert.match(workflowReference, /ordinary active progress emits no Goal action/i);
  assert.match(workflowReference, /resume can therefore create the next active Goal in its normal single code-mode call/i);
  assert.match(workflowReference, /fail closed/i);
  assert.match(workflowReference, /Codex compact results do not return `goalMode` or `goalTool`/i);
  assert.match(workflowReference, /explicit stage-aware allowlist/i);
});
