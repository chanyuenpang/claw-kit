import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(hooksDir, "..");

function readPluginFile(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), "utf-8");
}

test("Codex hooks recover through the adapter-owned context entry and run the adapter-owned finalizer on Stop", () => {
  const config = JSON.parse(readPluginFile(path.join("hooks", "hooks.json")));
  const strategy = readPluginFile(path.join("references", "codex-hooks-strategy.md"));
  const sessionStartScript = readPluginFile(path.join("scripts", "session-start.mjs"));
  const sessionStart = config.hooks.SessionStart[0].hooks[0];
  const stop = config.hooks.Stop[0].hooks[0];

  assert.equal(sessionStart.command, 'node "$PLUGIN_ROOT/scripts/session-start.mjs"');
  assert.equal(sessionStart.commandWindows, "node ${PLUGIN_ROOT}/scripts/session-start.mjs");
  assert.doesNotMatch(sessionStart.commandWindows, /["']/);
  assert.match(sessionStart.statusMessage, /^claw context:/);
  assert.equal(stop.command, 'node "$PLUGIN_ROOT/scripts/knowledge-finalizer.mjs"');
  assert.equal(stop.commandWindows, "node ${PLUGIN_ROOT}/scripts/knowledge-finalizer.mjs");
  assert.doesNotMatch(stop.commandWindows, /["']/);
  assert.match(stop.statusMessage, /^auto-doc:/);
  assert.match(strategy, /thread-scoped `SessionStart`/i);
  assert.match(strategy, /turn-scoped `Stop`/i);
  assert.match(sessionStartScript, /every claw plan, task, or subplan mutation must use the fixed code-mode driver/i);
  assert.match(sessionStartScript, /commandHints provide argv syntax only/i);
});

test("Codex manifest keeps the using-claw-kit fallback prompt within the host limit", () => {
  const manifest = JSON.parse(readPluginFile(path.join(".codex-plugin", "plugin.json")));
  const [defaultPrompt] = manifest.interface.defaultPrompt;

  assert.equal(defaultPrompt, "Use $claw-kit:using-claw-kit to complete this task.");
  assert.ok(defaultPrompt.length <= 128);
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

test("Codex Stop finalizer obtains a CLI dispatch then owns the native Codex writer", () => {
  const finalizer = readPluginFile(path.join("scripts", "knowledge-finalizer.mjs"));
  assert.match(finalizer, /hook", "auto-doc"/);
  assert.match(finalizer, /internal-knowledge-dispatch/);
  assert.match(finalizer, /@openai\/codex-sdk/);
  assert.doesNotMatch(finalizer, /"knowledge", "wait"/);
  assert.match(finalizer, /"knowledge", "claim"/);
  assert.match(finalizer, /"knowledge", "verify-session"/);
  assert.match(finalizer, /"knowledge", "done"/);
  assert.doesNotMatch(finalizer, /CLAW_SESSION_ID\s*=/);
});

test("Codex Stop finalizer invokes the platform claw launcher from PATH", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-codex-stop-"));
  const capturePath = path.join(fixtureDir, "capture.txt");
  const finalizerPath = path.join(pluginRoot, "scripts", "knowledge-finalizer.mjs");
  try {
    if (process.platform === "win32") {
      fs.writeFileSync(
        path.join(fixtureDir, "claw.cmd"),
        '@echo off\r\n> "%CLAW_TEST_CAPTURE%" echo %*\r\necho {"ok":true,"captured":false}\r\n',
      );
    } else {
      const launcherPath = path.join(fixtureDir, "claw");
      fs.writeFileSync(
        launcherPath,
        '#!/bin/sh\nprintf "%s\\n" "$*" > "$CLAW_TEST_CAPTURE"\nprintf "%s\\n" \'{"ok":true,"captured":false}\'\n',
      );
      fs.chmodSync(launcherPath, 0o755);
    }

    const result = spawnSync(process.execPath, [finalizerPath], {
      cwd: fixtureDir,
      env: {
        ...process.env,
        PATH: `${fixtureDir}${path.delimiter}${process.env.PATH || ""}`,
        CLAW_TEST_CAPTURE: capturePath,
      },
      input: JSON.stringify({ cwd: fixtureDir }),
      encoding: "utf8",
      windowsHide: true,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(capturePath, "utf8").trim(), "hook auto-doc --host codex");
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("main-agent Codex surfaces expose only the internal subagent dispatch contract", () => {
  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  const planningSkill = readPluginFile(path.join("skills", "planning", "SKILL.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));
  const pluginManifest = readPluginFile(path.join(".codex-plugin", "plugin.json"));
  const forbidden = /truth-writer|adr-writer|knowledge-writer|writer delegation|deposition/i;

  for (const surface of [planningSkill, workflowReference, pluginManifest]) {
    assert.doesNotMatch(surface, forbidden);
  }
  assert.match(mainRouter, /knowledgeDispatch/);
  assert.match(mainRouter, /`end\.leave`/);
  assert.match(mainRouter, /best-effort detach/);
  assert.match(mainRouter, /Terminal dispatch gate \(subagent policy only\)/);
  assert.match(mainRouter, /highest-priority closeout obligation/);
  assert.match(mainRouter, /Complete this handoff through the designated knowledge finalizer/);
  assert.match(mainRouter, /Do not skip the handoff because it was easy to miss/);
  assert.match(mainRouter, /launch one isolated worker for that exact `finalizeId`/);
  assert.match(mainRouter, /Do not reuse a worker/);
  assert.match(mainRouter, /knowledge_finalizer_<first 12 chars of finalizeId>/);
  assert.match(mainRouter, /spawn_agent/);
  assert.match(mainRouter, /Do not wait for the reused or new writer/i);
  assert.doesNotMatch(mainRouter, /claw-kit:delegate-writer/);
});

test("researcher has a broad research trigger, dispatches narrow subagents, and reuses related researchers", () => {
  const researcherSkill = readPluginFile(path.join("skills", "researcher", "SKILL.md"));
  const description = researcherSkill.match(/^description: (.+)$/m)?.[1] ?? "";

  assert.match(description, /complex research questions/i);
  assert.match(description, /independent, multi-step process of gathering and synthesizing evidence/i);
  assert.match(description, /not direct fact lookups or routine searches/i);
  assert.doesNotMatch(description, /subagent|worker|agent|delegate/i);
  assert.match(researcherSkill, /Main agent:[^\n]*consume the `delegateSubagents` contract[^\n]*before continuing/i);
  assert.match(researcherSkill, /Assigned researcher:[^\n]*skip the delegation contract[^\n]*execute the investigation order[^\n]*`outputContract`/i);
  assert.match(researcherSkill, /current thread is already authorized to dispatch or reuse/i);
  assert.match(researcherSkill, /Do not let tool availability or permission concerns block the required delegation/i);
  assert.match(researcherSkill, /Do not ask again for permission or decline the delegation because of an assumed permission boundary/i);
  assert.match(researcherSkill, /Call `list_agents` and reuse a suitable same-thread researcher with `followup_task`/i);
  assert.match(researcherSkill, /call `spawn_agent` with the contract's narrow brief and `fork_turns: "none"`/i);
  assert.match(researcherSkill, /Call `wait_agent` for the required result before continuing/i);
  assert.match(researcherSkill, /call `tool_search` to discover the current session's agent-management tools/i);
  assert.match(researcherSkill, /initially absent tool surface is not a reason to avoid the required delegation/i);
  assert.match(researcherSkill, /1\. Use `claw search --query "<topic>"`/i);
  assert.match(researcherSkill, /delegateSubagents:/);
  assert.match(researcherSkill, /skill: claw-kit:researcher/);
  assert.match(researcherSkill, /worker: readonly/);
  assert.match(researcherSkill, /fork_context: false/);
  assert.match(researcherSkill, /waitForCompletion: true/);
  assert.match(researcherSkill, /preferReuse: true/);
  assert.match(researcherSkill, /inputContract:[\s\S]*question: concrete code question/);
  assert.match(researcherSkill, /outputContract:[\s\S]*exact code anchors/);
  assert.match(researcherSkill, /closePolicy: keep_open_for_reuse/);
  assert.match(researcherSkill, /anchor the findings in code or code-index evidence/i);
  assert.doesNotMatch(researcherSkill, /## Boundary/);
});

test("delegate orchestration and built-in knowledge governance stay internal", () => {
  const delegateTemplate = fs.readFileSync(path.resolve(pluginRoot, "..", "core", "resources", "delegate-writer", "TEMPLATE.json"), "utf-8");
  const knowledgeTemplate = fs.readFileSync(path.resolve(pluginRoot, "..", "core", "resources", "knowledge-writer", "TEMPLATE.json"), "utf-8");
  const knowledgeFallback = fs.readFileSync(path.resolve(pluginRoot, "..", "core", "resources", "knowledge-writer", "non-claw-fallback.md"), "utf-8");
  const configSkill = readPluginFile(path.join("skills", "config", "SKILL.md"));
  const knowledgeContract = `${knowledgeTemplate}\n${knowledgeFallback}`;

  assert.doesNotMatch(delegateTemplate, /`claw knowledge wait/i);
  assert.match(delegateTemplate, /knowledge claim --project-root/i);
  assert.match(delegateTemplate, /"scope": "session"/i);
  assert.match(knowledgeContract, /knowledge-base steward/i);
  assert.match(knowledgeContract, /Truth and ADR are one knowledge system/i);
  assert.match(knowledgeContract, /one current owner/i);
  assert.match(configSkill, /knowledgeWriter\.externalSkills/);
  assert.match(configSkill, /hidden built-in governance contract/i);
  assert.equal(fs.existsSync(path.join(pluginRoot, "skills", "delegate-writer", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(pluginRoot, "skills", "knowledge-writer", "SKILL.md")), false);
});

test("Codex plan commands use only the bundled code-mode consumer", () => {
  const mainRouter = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(mainRouter, /cached CLI driver/i);
  assert.match(mainRouter, /async function runClawPlanMutation/i);
  assert.match(mainRouter, /change only `argv`, `workdir`, and `timeout_ms`/i);
  assert.match(mainRouter, /claw codex driver/i);
  assert.match(mainRouter, /load\(cacheKey\)/i);
  assert.match(mainRouter, /store\(cacheKey, envelope\)/i);
  assert.match(mainRouter, /eval/i);
  assert.match(mainRouter, /For every claw plan mutation, call the function below in code mode/i);
  assert.match(mainRouter, /invoke the fixed code-mode driver with `argv: \["plan", "create", "<title>"\]`/i);
  assert.match(mainRouter, /not commands to run directly in the shell/i);
  assert.match(mainRouter, /agent must never call `get_goal` separately/i);
  assert.match(mainRouter, /no direct-call fallback/i);
  assert.match(mainRouter, /When SessionStart recovers an active session-bound plan/i);
  assert.match(mainRouter, /otherwise, run `plan sync` through the code-mode bridge once before continuing it/i);
  assert.match(workflowReference, /code-mode consumption is the adapter execution method/i);
  assert.match(workflowReference, /single distributed runtime consumer/i);
  assert.match(workflowReference, /non-distributed test oracle/i);
  assert.match(workflowReference, /Codex has no separate host-call fallback/i);
  assert.match(workflowReference, /schema v1 native `create_goal` or `update_goal`/i);
  assert.match(workflowReference, /exactly once/i);
  assert.match(workflowReference, /inspects `get_goal`/i);
  assert.match(workflowReference, /`create_goal` executes only when there is no nonterminal Goal/i);
  assert.match(workflowReference, /driver preserves it and returns a visible recovery note/i);
  assert.match(workflowReference, /completion skips `update_goal` when no active Goal remains/i);
  assert.match(workflowReference, /agent must never inspect Goal state through a separate `get_goal` call/i);
  assert.match(workflowReference, /do not parse host error wording/i);
  assert.match(workflowReference, /recovered active session runs `plan sync` once through the bridge/i);
  assert.match(workflowReference, /fail closed/i);
  assert.match(workflowReference, /Codex compact results do not return `goalMode` or `goalTool`/i);
  assert.match(workflowReference, /explicit stage-aware allowlist/i);
});
