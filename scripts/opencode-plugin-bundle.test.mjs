import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  OPENCODE_PLUGIN_PAYLOAD_PATHS,
  exportOpencodePluginBundle,
  installOpencodePlugin,
  readOpencodePluginSource,
} from "./opencode-plugin-bundle.mjs";
import { verifySharedSkillsSynced } from "./sync-shared-skills.mjs";

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-opencode-plugin-"));
  const sourceDir = path.join(root, "packages", "opencode-adapter");

  await fs.mkdir(path.join(sourceDir, "plugin"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "skills"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "agents"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "references"), { recursive: true });

  await fs.writeFile(
    path.join(sourceDir, "package.json"),
    JSON.stringify({ name: "claw-kit", version: "0.1.41+opencode.test" }, null, 2),
  );
  await fs.writeFile(
    path.join(sourceDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: {} }, null, 2),
  );
  await fs.writeFile(
    path.join(sourceDir, "workflow-guidance.opencode.json"),
    JSON.stringify({ guidance: "ok" }, null, 2),
  );
  await fs.writeFile(path.join(sourceDir, "plugin", "index.ts"), "export default {};\n");
  await fs.writeFile(path.join(sourceDir, "skills", "SKILL.md"), "# skill");
  await fs.mkdir(path.join(sourceDir, "skills", "config"), { recursive: true });
  await fs.writeFile(path.join(sourceDir, "skills", "config", "SKILL.md"), "# config skill");
  await fs.writeFile(path.join(sourceDir, "agents", "team-coder.md"), "# agent");
  await fs.writeFile(path.join(sourceDir, "references", "note.md"), "# note");

  return { root, sourceDir };
}

async function cleanup(root) {
  await fs.rm(root, { recursive: true, force: true });
}

test("readOpencodePluginSource returns manifest metadata and stable payload list", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });

  const plugin = await readOpencodePluginSource({ sourceDir });

  assert.equal(plugin.name, "claw-kit");
  assert.equal(plugin.version, "0.1.41+opencode.test");
  assert.deepEqual(plugin.payloadRelativePaths, OPENCODE_PLUGIN_PAYLOAD_PATHS);
});

test("OpenCode plugin source includes the config skill entrypoint", async () => {
  const skillPath = new URL("../shared/skills/config/SKILL.md", import.meta.url);
  const skillText = await fs.readFile(skillPath, "utf8");

  assert.match(skillText, /name: config/);
  assert.match(skillText, /team config/i);
  assert.match(skillText, /personal config/i);
  assert.match(skillText, /\.claw\/project-override\.json/);
});

test("OpenCode entry keeps knowledge routing separate from active readiness", async () => {
  const adapterRoot = new URL("../packages/opencode-adapter/", import.meta.url);
  const skill = await fs.readFile(new URL("skills/using-claw-kit/SKILL.md", adapterRoot), "utf8");
  const sessionEntry = await fs.readFile(new URL("references/opencode-session-entry.md", adapterRoot), "utf8");
  const contract = `${skill}\n${sessionEntry}`;

  assert.match(contract, /reusable project knowledge/i);
  assert.match(contract, /process\.discussing/i);
  assert.match(contract, /downstream tasks are explicit/i);
  assert.match(contract, /handoff-ready|hand off execution/i);
  assert.match(skill, /stable cross-turn state/i);
  assert.match(skill, /convert it to `(?:process\.)?wait`/i);
  assert.doesNotMatch(skill, /--scope session|session scope|projectless harness/i);
});

test("OpenCode entry stays compact and guidance-led", async () => {
  const skill = await fs.readFile(
    new URL("../packages/opencode-adapter/skills/using-claw-kit/SKILL.md", import.meta.url),
    "utf8",
  );
  const lineCount = skill.trimEnd().split(/\r?\n/).length;

  assert.ok(lineCount >= 20 && lineCount <= 40, `expected 20-40 lines, received ${lineCount}`);
  assert.match(skill, /## First Action/i);
  assert.match(skill, /skip this skill and work directly/i);
  assert.match(skill, /claw plan create "<title>"/i);
  assert.match(skill, /claw plan create --template <template-id> --title "<title>"/i);
  assert.match(skill, /Follow the returned `workflowGuidance` as the only next-step execution contract/i);
  assert.equal((skill.match(/workflowGuidance/g) ?? []).length, 1);
  assert.doesNotMatch(skill, /current prompt contains/i);
  assert.match(skill, /Keep claw harness mechanics out of normal thread replies/i);
  assert.doesNotMatch(skill, /recovered plan|recovered `workflowGuidance`|If a recovered|workflow recovery|claw context|claw search/i);
  for (const state of ["process.discussing", "process.active", "process.wait", "end.completed"]) {
    assert.match(skill, new RegExp(state.replace(".", "\\."), "i"));
  }
  assert.doesNotMatch(skill, /^\s*-\s*`?done`?:/im);
  assert.doesNotMatch(skill, /Core execution chain|Detailed call flow|claw plan start|claw task done|claw plan done/i);
});

test("OpenCode researcher includes the search query syntax", async () => {
  const skill = await fs.readFile(
    new URL("../packages/opencode-adapter/skills/researcher/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /claw search --query "<topic>"/);
});

test("OpenCode main-agent guidance leaves automatic closeout to the host", async () => {
  const adapterRoot = new URL("../packages/opencode-adapter/", import.meta.url);
  const guidance = JSON.parse(await fs.readFile(new URL("workflow-guidance.opencode.json", adapterRoot), "utf8"));
  const knowledgeSkill = await fs.readFile(new URL("skills/knowledge-writer/SKILL.md", adapterRoot), "utf8");
  const agent = await fs.readFile(new URL("agents/claw-knowledge-writer.md", adapterRoot), "utf8");
  const allDone = guidance.states["process.allTasksDone"];

  assert.equal("delegates" in guidance, false);
  assert.equal("delegateSubagents" in allDone, false);
  assert.match(allDone.notes, /requires no main-agent action/i);
  assert.doesNotMatch(JSON.stringify(allDone), /truth-writer|adr-writer|knowledge-writer|subagent|deposition/i);

  assert.match(agent, /claw-kit:knowledge-writer/i);
  assert.match(agent, /mode: primary/i);
  assert.match(agent, /Do not load `using-claw-kit`/i);
  assert.match(agent, /self-contained claw harness/i);
  assert.match(agent, /claw plan create --template knowledge-writer/i);
  assert.match(agent, /through 4\/4/i);
  assert.match(agent, /Do not\s+dispatch another writer or split the pass/i);
  assert.match(knowledgeSkill, /knowledge-base steward/i);
  assert.match(knowledgeSkill, /Truth and ADR are one knowledge system/i);
  assert.match(knowledgeSkill, /one current owner/i);
  assert.match(knowledgeSkill, /exhaustive text search/i);

  await assert.rejects(fs.access(new URL("skills/truth-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/adr-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/search-workflow/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/init/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("agents/claw-truth-writer.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("agents/claw-adr-writer.md", adapterRoot)));
});

test("OpenCode update contract is platform-specific", async () => {
  const skillRoot = new URL("../packages/opencode-adapter/skills/update/", import.meta.url);
  const skill = await fs.readFile(new URL("SKILL.md", skillRoot), "utf8");
  const template = await fs.readFile(new URL("TEMPLATE.json", skillRoot), "utf8");
  const fallback = await fs.readFile(new URL("non-claw-fallback.md", skillRoot), "utf8");
  const combined = [skill, template, fallback].join("\n");

  assert.match(combined, /install:opencode-plugin/i);
  assert.match(combined, /global CLI/i);
  assert.match(combined, /restart OpenCode/i);
  assert.doesNotMatch(combined, /Codex|claw-kit@claw-kit|conservative fallback|choose (?:the )?host route|"choices"/i);
});

test("repository OpenCode plugin source is fully materialized from shared skills", async () => {
  const adapterDir = path.resolve("packages", "opencode-adapter");
  const result = await verifySharedSkillsSynced({ adapterDirs: [adapterDir] });
  assert.deepEqual(result, { ok: true, problems: [] });
});

test("exportOpencodePluginBundle copies the expected payload and filters *.test.mjs", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const outDir = path.join(root, "dist", "opencode-plugin");

  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.test.mjs"), "export const testRuntime = true;\n");

  const result = await exportOpencodePluginBundle({ sourceDir, outDir });

  assert.equal(result.bundleDir, path.join(outDir, "claw-kit", "0.1.41+opencode.test"));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "plugin", "index.ts")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "config", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "package.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "workflow-guidance.opencode.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "plugin", "runtime.mjs")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "plugin", "runtime.test.mjs")));
});

test("installOpencodePlugin copies payload, shim, agents and filters *.test.mjs", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const installDir = path.join(root, ".config", "opencode");

  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.test.mjs"), "export const testRuntime = true;\n");

  const result = await installOpencodePlugin({ sourceDir, installDir });

  assert.equal(result.pluginDir, path.join(installDir, "plugins", "claw-kit"));
  assert.equal(result.shimPath, path.join(installDir, "plugins", "claw-kit.ts"));
  assert.equal(result.agentDir, path.join(installDir, "agent"));

  const manifest = JSON.parse(await fs.readFile(path.join(result.pluginDir, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.1.41+opencode.test");

  const installedSkill = await fs.readFile(path.join(result.pluginDir, "skills", "SKILL.md"), "utf8");
  assert.equal(installedSkill, "# skill");

  const installedAgent = await fs.readFile(path.join(result.agentDir, "team-coder.md"), "utf8");
  assert.equal(installedAgent, "# agent");

  const shim = await fs.readFile(result.shimPath, "utf8");
  assert.match(shim, /export \{ default, ClawKitPlugin \} from "\.\/claw-kit\/plugin\/index\.ts";/);

  await assert.doesNotReject(fs.access(path.join(result.pluginDir, "plugin", "runtime.mjs")));
  await assert.rejects(fs.access(path.join(result.pluginDir, "plugin", "runtime.test.mjs")));
});

test("installOpencodePlugin copies skills into the opencode skills discovery directory idempotently", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const installDir = path.join(root, ".config", "opencode");
  const retiredTruthDir = path.join(installDir, "skills", "truth-writer");
  const retiredAdrDir = path.join(installDir, "skills", "adr-writer");
  await fs.mkdir(path.join(sourceDir, "skills", "truth-writer", "agents"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "skills", "adr-writer", "agents"), { recursive: true });
  await fs.mkdir(retiredTruthDir, { recursive: true });
  await fs.mkdir(retiredAdrDir, { recursive: true });
  await fs.writeFile(path.join(retiredTruthDir, "SKILL.md"), "# retired truth writer");
  await fs.writeFile(path.join(retiredAdrDir, "SKILL.md"), "# retired adr writer");

  const result = await installOpencodePlugin({ sourceDir, installDir });

  // opencode discovers skills only from convention directories (~/.config/opencode/skills).
  // Each skill subfolder is copied to <installDir>/skills/<name>/SKILL.md.
  assert.equal(result.skillsDir, path.join(installDir, "skills"));
  const copiedSkill = await fs.readFile(path.join(result.skillsDir, "config", "SKILL.md"), "utf8");
  assert.match(copiedSkill, /name: config/);
  await assert.doesNotReject(fs.access(path.join(result.skillsDir, "knowledge-writer", "SKILL.md")));
  await assert.rejects(fs.access(retiredTruthDir));
  await assert.rejects(fs.access(retiredAdrDir));

  // No opencode.json config injection happens: there is no `skills.paths` option in opencode.
  await assert.rejects(fs.access(path.join(installDir, "opencode.json")));

  // Idempotent: reinstall overwrites the skill content correctly without duplication.
  await fs.writeFile(path.join(result.skillsDir, "config", "SKILL.md"), "# stale");
  await installOpencodePlugin({ sourceDir, installDir });
  const refreshed = await fs.readFile(path.join(result.skillsDir, "config", "SKILL.md"), "utf8");
  assert.match(refreshed, /name: config/);
});
