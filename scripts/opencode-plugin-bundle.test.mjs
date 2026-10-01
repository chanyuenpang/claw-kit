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
import { loadSkillInputs } from "./skill-artifacts.mjs";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const inputs = await loadSkillInputs({ sourceRoot: repositoryRoot, targetHost: "opencode" });
  await fs.copyFile(inputs.declarationPath, path.join(sourceDir, "skill-inputs.json"));
  for (const skill of inputs.skills) {
    await fs.cp(skill.sourcePath, path.join(root, skill.relativeSource), { recursive: true });
  }
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

  const plugin = await readOpencodePluginSource({ sourceRoot: root, sourceDir });

  assert.equal(plugin.name, "claw-kit");
  assert.equal(plugin.version, "0.1.41+opencode.test");
  assert.deepEqual(plugin.payloadRelativePaths, OPENCODE_PLUGIN_PAYLOAD_PATHS);
});

test("OpenCode plugin source includes the config skill entrypoint", async () => {
  const skillPath = new URL("../.agents/skills/config/SKILL.md", import.meta.url);
  const skillText = await fs.readFile(skillPath, "utf8");

  assert.match(skillText, /name: config/);
  assert.match(skillText, /team config/i);
  assert.match(skillText, /personal config/i);
  assert.match(skillText, /\.claw\/project-override\.json/);
});

test("OpenCode shared entry recovers before creating template or generic plans", async () => {
  const adapterRoot = new URL("../packages/opencode-adapter/", import.meta.url);
  const entry = await fs.readFile(new URL("../.agents/skills/using-claw-kit/SKILL.md", import.meta.url), "utf8");
  const host = await fs.readFile(new URL("../.agents/skills/using-claw-kit/references/hosts/opencode.md", import.meta.url), "utf8");

  assert.match(entry, /references\/hosts\/opencode\.md/);
  assert.match(entry, /reusable project\s+knowledge/i);
  assert.match(entry, /do not\s+create another plan/i);
  const recovery = entry.indexOf("Recovery first");
  const template = entry.indexOf("Template owner before generic plan");
  const creation = entry.indexOf("Otherwise create a plan");
  assert.ok(recovery >= 0 && template > recovery && creation > template);
  assert.match(host, /session-start\/compact recovery first/);
  assert.match(host, /claw context/);
  assert.match(host, /claw plan create "<title>"/);
  assert.match(host, /OpenCode host.s supported command tool/);
  assert.match(host, /do not import the Codex Goal\/code-mode bridge/);
});

test("OpenCode routed reference retains lifecycle and host-owned closeout", async () => {
  const adapterRoot = new URL("../packages/opencode-adapter/", import.meta.url);
  const entry = await fs.readFile(new URL("../.agents/skills/using-claw-kit/SKILL.md", import.meta.url), "utf8");
  const host = await fs.readFile(new URL("../.agents/skills/using-claw-kit/references/hosts/opencode.md", import.meta.url), "utf8");

  assert.match(entry, /workflowGuidance/);
  assert.match(entry, /commandHints/);
  assert.match(entry, /Keep harness mechanics out of normal replies/);
  for (const state of ["process.discussing", "process.active", "process.wait", "end.completed"]) {
    assert.ok(entry.includes(state), `missing shared lifecycle boundary: ${state}`);
  }
  assert.match(entry, /do not implement, enter Goal Mode, convert\s+discussion to wait, or close before it is settled/);
  assert.match(host, /session\.idle/);
  assert.match(host, /opencode run --agent claw-knowledge-writer/);
  assert.match(host, /Do not manually judge, duplicate, or dispatch the background writer/);
  assert.match(host, /Do not repeat plan completion as compensation/);
  assert.match(host, /OpenCode does not support the native subagent finalization policy/);
});

test("OpenCode researcher includes the search query syntax", async () => {
  const skill = await fs.readFile(
    new URL("../.agents/skills/researcher/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /claw search --query "<topic>"/);
});

test("OpenCode main-agent guidance leaves automatic closeout to the host", async () => {
  const adapterRoot = new URL("../packages/opencode-adapter/", import.meta.url);
  const guidance = JSON.parse(await fs.readFile(new URL("workflow-guidance.opencode.json", adapterRoot), "utf8"));
  const agent = await fs.readFile(new URL("agents/claw-knowledge-writer.md", adapterRoot), "utf8");
  const allDone = guidance.states["process.allTasksDone"];

  assert.equal("delegates" in guidance, false);
  assert.equal("delegateSubagents" in allDone, false);
  assert.match(allDone.notes, /requires no main-agent action/i);
  assert.doesNotMatch(JSON.stringify(allDone), /truth-writer|adr-writer|knowledge-writer|subagent|deposition/i);

  assert.doesNotMatch(agent, /claw-kit:delegate-writer/i);
  assert.match(agent, /mode: primary/i);
  assert.match(agent, /internal knowledge-delegate bootstrap prompt/i);
  assert.doesNotMatch(agent, /session-scoped|through \d+\/\d+|supplied plan|report conclusions/i);
  await assert.rejects(fs.access(new URL("skills/delegate-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(new URL("skills/knowledge-writer/SKILL.md", adapterRoot)));

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

test("OpenCode declares canonical inputs instead of checked-in shared skill copies", async () => {
  const inputs = await loadSkillInputs({ sourceRoot: repositoryRoot, targetHost: "opencode" });
  assert.equal(inputs.skills.length, 8);
  for (const skill of inputs.skills) {
    if (skill.id === "update") continue;
    assert.match(skill.relativeSource, /^\.agents\/skills\//);
    await assert.rejects(fs.access(path.join(repositoryRoot, "packages", "opencode-adapter", "skills", skill.id)));
  }
});

test("exportOpencodePluginBundle copies the expected payload and filters *.test.mjs", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(async () => {
    await cleanup(root);
  });
  const outDir = path.join(root, "dist", "opencode-plugin");

  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.test.mjs"), "export const testRuntime = true;\n");

  const result = await exportOpencodePluginBundle({ sourceRoot: root, sourceDir, outDir });

  assert.equal(result.bundleDir, path.join(outDir, "claw-kit", "0.1.41+opencode.test"));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "plugin", "index.ts")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "using-claw-kit", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "config", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "claw-kit-doc", "SKILL.md")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "skills", "claw-kit-doc", "references", "update.md")));
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
  const installDir = path.join(root, "dist", "installed-opencode");

  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.mjs"), "export const ok = true;\n");
  await fs.writeFile(path.join(sourceDir, "plugin", "runtime.test.mjs"), "export const testRuntime = true;\n");

  const result = await installOpencodePlugin({ sourceRoot: root, sourceDir, installDir });

  assert.equal(result.pluginDir, path.join(installDir, "plugins", "claw-kit"));
  assert.equal(result.shimPath, path.join(installDir, "plugins", "claw-kit.ts"));
  assert.equal(result.agentDir, path.join(installDir, "agent"));

  const manifest = JSON.parse(await fs.readFile(path.join(result.pluginDir, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.1.41+opencode.test");

  const installedSkill = await fs.readFile(path.join(result.pluginDir, "skills", "using-claw-kit", "SKILL.md"), "utf8");
  assert.match(installedSkill, /name: using-claw-kit/);

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
  const installDir = path.join(root, "dist", "installed-opencode");
  const retiredTruthDir = path.join(installDir, "skills", "truth-writer");
  const retiredAdrDir = path.join(installDir, "skills", "adr-writer");
  await fs.mkdir(path.join(sourceDir, "skills", "truth-writer", "agents"), { recursive: true });
  await fs.mkdir(path.join(sourceDir, "skills", "adr-writer", "agents"), { recursive: true });
  await fs.mkdir(retiredTruthDir, { recursive: true });
  await fs.mkdir(retiredAdrDir, { recursive: true });
  await fs.writeFile(path.join(retiredTruthDir, "SKILL.md"), "# retired truth writer");
  await fs.writeFile(path.join(retiredAdrDir, "SKILL.md"), "# retired adr writer");

  const result = await installOpencodePlugin({ sourceRoot: root, sourceDir, installDir });

  // opencode discovers skills only from convention directories (~/.config/opencode/skills).
  // Each skill subfolder is copied to <installDir>/skills/<name>/SKILL.md.
  assert.equal(result.skillsDir, path.join(installDir, "skills"));
  const copiedSkill = await fs.readFile(path.join(result.skillsDir, "config", "SKILL.md"), "utf8");
  assert.match(copiedSkill, /name: config/);
  const copiedDocs = await fs.readFile(path.join(result.skillsDir, "claw-kit-doc", "SKILL.md"), "utf8");
  assert.match(copiedDocs, /name: claw-kit-doc/);
  await assert.rejects(fs.access(path.join(result.skillsDir, "delegate-writer", "SKILL.md")));
  await assert.rejects(fs.access(path.join(result.skillsDir, "knowledge-writer", "SKILL.md")));
  await assert.rejects(fs.access(retiredTruthDir));
  await assert.rejects(fs.access(retiredAdrDir));

  // No opencode.json config injection happens: there is no `skills.paths` option in opencode.
  await assert.rejects(fs.access(path.join(installDir, "opencode.json")));

  // Idempotent: reinstall overwrites the skill content correctly without duplication.
  await fs.writeFile(path.join(result.skillsDir, "config", "SKILL.md"), "# stale");
  await installOpencodePlugin({ sourceRoot: root, sourceDir, installDir });
  const refreshed = await fs.readFile(path.join(result.skillsDir, "config", "SKILL.md"), "utf8");
  assert.match(refreshed, /name: config/);
});

test("OpenCode rejects custom adapter-only inputs without an explicit canonical source root", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(() => cleanup(root));
  await assert.rejects(exportOpencodePluginBundle({ sourceDir, outDir: path.join(root, "out") }), /explicit canonical --source-root/);
});

test("OpenCode exported payload is detached and source hashes stay unchanged", async (t) => {
  const { root, sourceDir } = await makeFixture();
  t.after(() => cleanup(root));
  const before = await loadSkillInputs({ sourceRoot: root, targetHost: "opencode" });
  const result = await exportOpencodePluginBundle({ sourceRoot: root, sourceDir, outDir: path.join(root, "dist", "opencode") });
  assert.equal((await loadSkillInputs({ sourceRoot: root, targetHost: "opencode" })).sourceHash, before.sourceHash);
  assert.deepEqual(await fs.readdir(path.join(sourceDir, "skills")), ["update"]);
  await fs.rename(path.join(root, ".agents"), path.join(root, "hidden-canonical-input"));
  for (const skill of before.skills) {
    for (const file of skill.files) await fs.access(path.join(result.bundleDir, "skills", skill.id, file));
  }
});
