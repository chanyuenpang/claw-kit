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

test("main-agent Codex surfaces contain no writer or subagent-dispatch workflow", () => {
  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  const planningSkill = readPluginFile(path.join("skills", "planning", "SKILL.md"));
  const researcherSkill = readPluginFile(path.join("skills", "researcher", "SKILL.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));
  const pluginManifest = readPluginFile(path.join(".codex-plugin", "plugin.json"));
  const forbidden = /truth-writer|adr-writer|knowledge-writer|writer delegation|deposition|delegated subagents?|dispatch[^\n]*subagent/i;

  for (const surface of [mainRouter, planningSkill, researcherSkill, workflowReference, pluginManifest]) {
    assert.doesNotMatch(surface, forbidden);
  }
  assert.match(researcherSkill, /claw search --query "<topic>"/);
});

test("background finalizer owns one combined knowledge stewardship contract", () => {
  const knowledgeSkill = readPluginFile(path.join("skills", "knowledge-writer", "SKILL.md"));
  const configSkill = readPluginFile(path.join("skills", "config", "SKILL.md"));

  assert.match(knowledgeSkill, /knowledge-base steward/i);
  assert.match(knowledgeSkill, /Truth and ADR are one knowledge system/i);
  assert.match(knowledgeSkill, /one current owner/i);
  assert.match(knowledgeSkill, /dispatch another writer/i);
  assert.match(configSkill, /knowledgeWriter\.externalSkill/);
  assert.match(configSkill, /built-in `claw-kit:knowledge-writer`/i);
});

test("Codex plan commands use only the bundled code-mode consumer", () => {
  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(mainRouter, /cached CLI driver/i);
  assert.match(mainRouter, /async function runClawPlanMutation/i);
  assert.match(mainRouter, /change only `command`, `workdir`, and `timeout_ms`/i);
  assert.match(mainRouter, /claw codex driver/i);
  assert.match(mainRouter, /load\(cacheKey\)/i);
  assert.match(mainRouter, /store\(cacheKey, envelope\)/i);
  assert.match(mainRouter, /eval/i);
  assert.match(mainRouter, /Never run a plan mutation outside the code-mode bridge/i);
  assert.match(mainRouter, /no direct-call fallback/i);
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
