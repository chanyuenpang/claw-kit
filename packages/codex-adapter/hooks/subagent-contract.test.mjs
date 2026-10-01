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
  const normalized = relativePath.replaceAll("\\", "/");
  const source = normalized.startsWith("skills/") ? path.resolve(pluginRoot, "../..", ".agents", normalized)
    : path.join(pluginRoot, relativePath);
  return fs.readFileSync(source, "utf-8");
}

function readCodexWorkflowRoute() {
  const entry = readPluginFile(path.join("skills", "using-claw-kit", "SKILL.md"));
  assert.match(entry, /references\/hosts\/codex\.md/);
  const route = readPluginFile(path.join("skills", "using-claw-kit", "references", "hosts", "codex.md"));
  return { entry, route };
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
  const { entry, route: mainRouter } = readCodexWorkflowRoute();
  const [defaultPrompt] = manifest.interface.defaultPrompt;

  assert.equal(defaultPrompt, "Use $claw-kit:using-claw-kit to complete this task.");
  assert.ok(defaultPrompt.length <= 128);
  assert.match(mainRouter, new RegExp(`const pluginVersion = "${manifest.version.replaceAll(".", "\\.")}"`));
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
  const { entry, route: mainRouter } = readCodexWorkflowRoute();
  const planningSkill = readPluginFile(path.join("skills", "planning", "SKILL.md"));
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));
  const pluginManifest = readPluginFile(path.join(".codex-plugin", "plugin.json"));
  const forbidden = /truth-writer|adr-writer|knowledge-writer|writer delegation|deposition/i;

  for (const surface of [planningSkill, workflowReference, pluginManifest]) {
    assert.doesNotMatch(surface, forbidden);
  }
  assert.match(mainRouter, /knowledgeDispatch/);
  assert.match(entry, /Cancellation\/replacement uses the host's supported leave transition/);
  assert.match(entry, /Do not require successful finalization to\s+detach canceled work/);
  assert.match(mainRouter, /Terminal dispatch gate \(subagent policy only\)/);
  assert.match(mainRouter, /highest-priority closeout obligation/);
  assert.match(mainRouter, /Complete this handoff through the designated knowledge finalizer/);
  assert.match(mainRouter, /Do not skip the handoff because it was easy to miss/);
  assert.match(mainRouter, /launch one isolated worker for that exact `finalizeId`/);
  assert.match(mainRouter, /Do not reuse a worker/);
  assert.match(mainRouter, /knowledge_finalizer_<first 12 chars of finalizeId>/);
  assert.match(mainRouter, /spawn_agent/);
  assert.match(mainRouter, /Do not wait for the new writer/i);
  assert.doesNotMatch(mainRouter, /claw-kit:delegate-writer/);
});

test("researcher preserves bounded read-only delegation with a selected Codex route", () => {
  const researcherSkill = readPluginFile(path.join("skills", "researcher", "SKILL.md"));
  assert.match(researcherSkill, /references\/host-execution\.md/);
  const hostReference = readPluginFile(path.join("skills", "researcher", "references", "host-execution.md"));
  const codexRoute = hostReference.match(/## Codex\r?\n([\s\S]*?)(?=\r?\n## |$)/)?.[1];
  assert.ok(codexRoute, "the installed researcher must include its Codex host route");
  const description = researcherSkill.match(/^description: (.+)$/m)?.[1] ?? "";

  assert.match(description, /complex research questions/i);
  assert.match(description, /independent, multi-step process of gathering and synthesizing evidence/i);
  assert.match(description, /not direct fact lookups or routine searches/i);
  assert.doesNotMatch(description, /subagent|worker|agent|delegate/i);
  assert.match(researcherSkill, /concrete, bounded question/i);
  assert.match(researcherSkill, /do not write code, Truth, ADR,\s+plan state/i);
  assert.match(researcherSkill, /Assigned researcher[\s\S]*do not delegate again/i);
  assert.match(researcherSkill, /Before every dispatch or reuse assignment, briefly tell the user/i);
  assert.match(researcherSkill, /Actual session authorization and tool schemas\s+still take precedence/i);
  assert.match(researcherSkill, /Use project recall before broader source investigation/i);
  assert.match(codexRoute, /list_agents/);
  assert.match(codexRoute, /same-thread researcher via `followup_task`/);
  assert.match(codexRoute, /spawn_agent[\s\S]*fork_turns: "none"[\s\S]*wait_agent/);
  assert.match(codexRoute, /tool_search/);
  assert.match(codexRoute, /do not invent tools\s+or bypass a real denial/i);
  assert.match(codexRoute, /claw search --query[\s\S]*permitted Codex shell tool/i);
  assert.match(codexRoute, /driver accepts\s+context and plan\/task\/subplan commands, not search/i);
  for (const field of ["delegateSubagents:", "skill: researcher", "worker: readonly", "fork_context: false", "waitForCompletion: true", "preferReuse: true", "closePolicy: keep_open_for_reuse"]) {
    assert.ok(researcherSkill.includes(field), "missing delegation field: " + field);
  }
  assert.match(researcherSkill, /inputContract:[\s\S]*question: concrete bounded investigation question/);
  assert.match(researcherSkill, /outputContract:[\s\S]*exact paths, symbols, and line anchors/);
  assert.match(researcherSkill, /uncertainty: explicit gaps/);
  assert.match(researcherSkill, /Separate confirmed behavior from inference/i);
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
  const { entry, route: mainRouter } = readCodexWorkflowRoute();
  const workflowReference = readPluginFile(path.join("references", "workflow-guidance-consumption.md"));

  assert.match(mainRouter, /cached CLI driver/i);
  assert.match(mainRouter, /async function runClawPlanMutation/i);
  assert.match(mainRouter, /change only `argv`, `workdir`, and `timeout_ms`/i);
  assert.match(mainRouter, /claw codex driver/i);
  assert.match(mainRouter, /load\(cacheKey\)/i);
  assert.match(mainRouter, /store\(cacheKey, envelope\)/i);
  assert.match(mainRouter, /eval/i);
  assert.match(mainRouter, /For context recovery and every claw plan mutation/i);
  assert.match(mainRouter, /argv: \["context"\]/);
  assert.match(mainRouter, /argv: \["plan", "create", "<title>"\]/);
  assert.match(mainRouter, /Read-only `claw search[\s\S]*supported shell tool, not this mutation bridge/i);
  assert.match(mainRouter, /agent must never call `get_goal` separately/i);
  assert.match(mainRouter, /no direct-call fallback/i);
  assert.match(mainRouter, /Consume SessionStart recovery before creating any plan/i);
  assert.match(mainRouter, /Otherwise run `plan sync` through the bridge\s+once before continuing/i);
  assert.match(entry, /commandHints[\s\S]*not commands to run through another transport/i);
  assert.match(workflowReference, /code-mode consumption is the adapter execution method/i);
  assert.match(workflowReference, /single distributed runtime consumer/i);
  assert.match(workflowReference, /non-distributed test oracle/i);
  assert.match(workflowReference, /Codex has no separate host-call fallback/i);
  assert.match(workflowReference, /schema v1 native `create_goal` or `update_goal`/i);
  assert.match(workflowReference, /exactly once/i);
  assert.match(workflowReference, /inspects `get_goal`/i);
  assert.match(workflowReference, /`create_goal` executes only when there is no unfinished Goal/i);
  assert.match(workflowReference, /driver preserves it and returns a visible recovery note/i);
  assert.match(workflowReference, /`blocked` is allowed only from `active`/i);
  assert.match(workflowReference, /`complete` is allowed only from `active` or `blocked`/i);
  assert.match(workflowReference, /missing, already complete, unknown, or otherwise mismatched Goal consumes the action as a no-op/i);
  assert.match(workflowReference, /agent must never inspect Goal state through a separate `get_goal` call/i);
  assert.match(workflowReference, /do not parse host error wording/i);
  assert.match(workflowReference, /recovered active session runs `plan sync` once through the bridge/i);
  assert.match(workflowReference, /fail closed/i);
  assert.match(workflowReference, /Codex compact results do not return `goalMode` or `goalTool`/i);
  assert.match(workflowReference, /explicit stage-aware allowlist/i);
});
