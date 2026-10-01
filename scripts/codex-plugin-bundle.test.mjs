import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_PLUGIN_PAYLOAD_PATHS,
  activateOfficialCodexPluginIdentity,
  exportCodexPluginBundle,
  exportCodexMarketplace,
  installCodexPluginBundle,
  readCodexPluginSource,
} from "./codex-plugin-bundle.mjs";
import { loadSkillInputs } from "./skill-artifacts.mjs";

const ADAPTER = "packages/codex-adapter";
const sourceSkillPath = (name) => name === "update" ? `${ADAPTER}/skills/update`
  : name === "knowledge-capture" ? "shared/skills/knowledge-capture" : `.agents/skills/${name}`;
const artifactSkill = (root, name, ...parts) => path.join(root, "skills", name, ...parts);
const skillUrl = (relative, root) => {
  const [name, ...parts] = relative.split("/");
  return new URL(`${sourceSkillPath(name)}/${parts.join("/")}`, root);
};

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-plugin-"));
  const result = await exportCodexPluginBundle({ outDir: path.join(root, "composed") });
  const sourceDir = result.bundleDir;
  const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, ".codex-plugin/plugin.json"), "utf8"));
  await fs.writeFile(path.join(sourceDir, ".codex-plugin/plugin.json"), JSON.stringify({ ...manifest, version: "0.1.41+codex.test" }, null, 2));
  await fs.writeFile(artifactSkill(sourceDir, "config", "SKILL.md"), "# config skill");
  await fs.writeFile(artifactSkill(sourceDir, "config", "TEMPLATE.json"), JSON.stringify({ id: "config-default", status: "process.active", tasks: [] }));
  return { root, sourceDir };
}

test("readCodexPluginSource returns manifest metadata and stable payload list", async () => {
  const { sourceDir } = await makeFixture();

  const plugin = await readCodexPluginSource({ sourceDir });

  assert.equal(plugin.name, "claw-kit");
  assert.equal(plugin.version, "0.1.41+codex.test");
  assert.deepEqual(plugin.payloadRelativePaths, CODEX_PLUGIN_PAYLOAD_PATHS);
});

test("Codex plugin starter prompt invokes the main workflow skill", async () => {
  const manifestPath = new URL("../packages/codex-adapter/.codex-plugin/plugin.json", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const promptText = [
    manifest.interface?.longDescription,
    ...(manifest.interface?.defaultPrompt ?? []),
  ].join("\n");

  assert.doesNotMatch(promptText, /first read the planning skill/i);
  assert.deepEqual(manifest.interface?.defaultPrompt, [
    "Use $claw-kit:using-claw-kit to complete this task.",
  ]);
  assert.ok(manifest.interface.defaultPrompt.every((prompt) => prompt.length <= 128));
  assert.doesNotMatch(promptText, /start by reading the planning skill/i);
  assert.match(promptText, /workflowGuidance/i);
  assert.match(promptText, /code-mode driver/i);
  assert.doesNotMatch(promptText, /seeded planning task|claw plan start|claw task done|claw plan done/i);
});

test("Codex shared entry orders recovery, template ownership and new planning", async () => {
  const adapterRoot = new URL("../", import.meta.url);
  const entry = await fs.readFile(skillUrl("using-claw-kit/SKILL.md", adapterRoot), "utf8");
  const host = await fs.readFile(skillUrl("using-claw-kit/references/hosts/codex.md", adapterRoot), "utf8");

  assert.match(entry, /references\/hosts\/codex\.md/);
  assert.match(entry, /active adapter and actual tools/i);
  assert.match(entry, /do not\s+create another plan/i);
  const recovery = entry.indexOf("Recovery first");
  const template = entry.indexOf("Template owner before generic plan");
  const creation = entry.indexOf("Otherwise create a plan");
  assert.ok(recovery >= 0 && template > recovery && creation > template, "recover before selecting template or generic plan");
  assert.match(entry, /reusable project\s+knowledge/i);
  assert.match(entry, /workflowGuidance/);
  assert.match(entry, /commandHints/);
  assert.match(host, /SessionStart recovery before creating any plan/);
  assert.match(host, /explicit user goal\s+change\/replacement\/cancellation/);
  assert.match(host, /Otherwise run `plan sync` through the bridge/);
});

test("Codex routed reference preserves lifecycle and the exact mutation bridge", async () => {
  const adapterRoot = new URL("../", import.meta.url);
  const entry = await fs.readFile(skillUrl("using-claw-kit/SKILL.md", adapterRoot), "utf8");
  const host = await fs.readFile(skillUrl("using-claw-kit/references/hosts/codex.md", adapterRoot), "utf8");
  const manifest = JSON.parse(await fs.readFile(new URL("packages/codex-adapter/.codex-plugin/plugin.json", adapterRoot), "utf8"));

  for (const state of ["process.discussing", "process.active", "process.wait", "end.completed"]) {
    assert.ok(entry.includes(state), `missing shared lifecycle boundary: ${state}`);
  }
  assert.match(entry, /do not implement, enter Goal Mode, convert\s+discussion to wait, or close before it is settled/);
  assert.match(entry, /Keep harness mechanics out of normal replies/);
  assert.match(host, /argv: \["plan", "create", "<title>"\]/);
  assert.match(host, /```javascript[\s\S]*runClawPlanMutation[\s\S]*```/);
  assert.match(host, /claw-kit:codex-driver:v22:s1/);
  assert.match(host, /envelope\?\.driverVersion !== 22/);
  assert.match(host, /envelope\?\.hostActionSchemaVersion !== 1/);
  assert.ok(host.includes(`const pluginVersion = "${manifest.version}";`), "bridge pins its published adapter version");
  assert.match(host, /no direct-call fallback/);
  assert.match(host, /must never call `get_goal` separately/);
  assert.match(host, /goalRecovery\.command/);
});

test("Codex main-agent bundle exposes only structured internal closeout dispatch", async () => {
  const adapterRoot = new URL("../", import.meta.url);
  const entry = await fs.readFile(skillUrl("using-claw-kit/SKILL.md", adapterRoot), "utf8");
  const host = await fs.readFile(skillUrl("using-claw-kit/references/hosts/codex.md", adapterRoot), "utf8");
  const skill = `${entry}\n${host}`;
  const reference = await fs.readFile(
    new URL("packages/codex-adapter/references/workflow-guidance-consumption.md", adapterRoot),
    "utf8",
  );
  const manifest = await fs.readFile(new URL("packages/codex-adapter/.codex-plugin/plugin.json", adapterRoot), "utf8");
  const forbidden = /truth-writer|adr-writer|knowledge-writer|writer delegation|deposition|delegated subagents?|dispatch[^\n]*subagent/i;

  assert.doesNotMatch(skill, /truth-writer|adr-writer|claw-kit:knowledge-writer|claw-kit:delegate-writer/i);
  assert.match(skill, /knowledgeDispatch/);
  assert.match(host, /spawn_agent/);
  assert.match(host, /for that exact `finalizeId`/);
  assert.match(host, /Do not reuse a worker/);
  assert.match(host, /immediately end the main turn after the accepted handoff/);
  assert.match(host, /Do not wait for the new writer/);
  assert.doesNotMatch(reference, forbidden);
  assert.doesNotMatch(manifest, forbidden);
  await assert.rejects(fs.access(skillUrl("delegate-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(skillUrl("knowledge-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(skillUrl("truth-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(skillUrl("adr-writer/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(skillUrl("search-workflow/SKILL.md", adapterRoot)));
  await assert.rejects(fs.access(skillUrl("init/SKILL.md", adapterRoot)));
});

test("Codex role recall does not send search through the mutation driver", async () => {
  const adapterRoot = new URL("../", import.meta.url);
  for (const role of ["researcher", "feature-architecture"]) {
    const host = await fs.readFile(skillUrl(`${role}/references/host-execution.md`, adapterRoot), "utf8");
    const codex = host.split("## Codex\n")[1]?.split("\n## ")[0];
    assert.ok(codex, `${role} has a Codex route`);
    assert.match(codex, /claw search --query/);
    assert.match(codex, /permitted Codex shell tool/);
    assert.match(codex, /not search/);
    assert.doesNotMatch(codex, /argv: \["search"/);
  }
});

test("Codex plugin exposes an explicit same-agent knowledge-capture skill", async () => {
  const adapterRoot = new URL("../", import.meta.url);
  const skill = await fs.readFile(skillUrl("knowledge-capture/SKILL.md", adapterRoot), "utf8");
  assert.match(skill, /name: knowledge-capture/);
  assert.match(skill, /user explicitly asks/i);
  assert.match(skill, /Never invoke automatically/i);
  assert.match(skill, /run-knowledge-capture\.mjs" prepare --source agent-memory/i);
  assert.match(skill, /run-knowledge-capture\.mjs" complete --source agent-memory/i);
  assert.doesNotMatch(skill, /`claw knowledge (prepare|complete)/i);
  const runtime = JSON.parse(await fs.readFile(skillUrl("knowledge-capture/runtime.json", adapterRoot), "utf8"));
  const rootPackage = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(runtime, { schemaVersion: 1, package: "@veewo/claw", version: rootPackage.version });
  await fs.access(skillUrl("knowledge-capture/scripts/run-knowledge-capture.mjs", adapterRoot));
  assert.match(skill, /Do not create a plan, report, subplan.*subagent/i);
  assert.doesNotMatch(skill, /spawn_agent|create_thread|knowledgeDispatch/);
});

test("hidden built-in knowledge contract enforces trusted evidence and cross-document ownership", async () => {
  const skill = await fs.readFile(new URL("../packages/core/resources/knowledge-writer/SKILL.md", import.meta.url), "utf8");
  const template = JSON.parse(await fs.readFile(new URL("../packages/core/resources/knowledge-writer/TEMPLATE.json", import.meta.url), "utf8"));
  const fallback = await fs.readFile(new URL("../packages/core/resources/knowledge-writer/non-claw-fallback.md", import.meta.url), "utf8");
  const contract = `${JSON.stringify(template)}\n${fallback}`;
  assert.doesNotMatch(skill, /end\.\*|session-scoped|parent-plan|source plan/i);
  assert.match(skill, /Use only when explicitly invoked with supplied materials; do not trigger this skill implicitly/i);
  assert.match(skill, /plan create --template-file/i);
  assert.match(skill, /subplan create --parent/i);
  await assert.rejects(fs.access(new URL("../packages/core/resources/knowledge-writer/agents/openai.yaml", import.meta.url)));
  assert.match(contract, /knowledge-base steward/i);
  assert.match(contract, /filename, field, record shape, or serialization format/i);
  assert.match(contract, /retrospective lessons, key decisions/i);
  assert.match(contract, /task status is present/i);
  assert.match(contract, /task titles or descriptions as an execution log/i);
  assert.match(contract, /Truth and ADR are one knowledge system/i);
  assert.match(contract, /Maintain Truth first and ADR second|Truth is maintained before ADR/i);
  assert.match(contract, /one current owner/i);
  assert.match(contract, /open every plausible/i);
  assert.match(contract, /exhaustive text search/i);
  assert.match(contract, /Do not report completion while/i);
  assert.match(contract, /Re-run focused and exhaustive searches/i);
  assert.match(contract, /Trusted means the evidence was verified at the revision or worktree state it describes/i);
  assert.match(contract, /read-only freshness check/i);
  assert.match(contract, /Current implementation outranks older material wording/i);
  assert.match(contract, /add(?:s)? no durable reusable knowledge/i);
  assert.match(contract, /repair nonconforming structure in the same edit/i);
  assert.deepEqual(template.tasks.map((task) => task.title), [
    "Read all supplied materials and extract conclusions",
    "Qualify evidence and resolve freshness",
    "Locate canonical Truth and ADR owners",
    "Maintain canonical Truth",
    "Maintain canonical ADRs",
    "Run the cross-document consistency review",
    "Prepare the final project index refresh",
  ]);
  assert.equal(template.tasks.every((task) => task.guidance?.onDone?.default), true);
  assert.equal(template.tasks.some((task) => task.guidance?.onDone?.choices), false);

  const docSkill = await fs.readFile(new URL("../packages/core/resources/doc-updater/SKILL.md", import.meta.url), "utf8");
  const docTemplate = JSON.parse(await fs.readFile(new URL("../packages/core/resources/doc-updater/TEMPLATE.json", import.meta.url), "utf8"));
  const docContract = `${docSkill}\n${JSON.stringify(docTemplate)}`;
  assert.match(docSkill, /subplan create --parent/i);
  assert.match(docSkill, /claw plan create --template-file/i);
  assert.match(docSkill, /FALLBACK\.md/i);
  assert.match(docContract, /existing documents/i);
  assert.match(docContract, /never create, move, or rename/i);
  assert.match(docContract, /requirement, future design/i);
  assert.match(docContract, /Do not assume an owner/i);
});

test("Codex plugin source includes the config skill entrypoint", async () => {
  const skillPath = new URL("../.agents/skills/config/SKILL.md", import.meta.url);
  const skillText = await fs.readFile(skillPath, "utf8");

  assert.match(skillText, /name: config/);
  assert.match(skillText, /team config/i);
  assert.match(skillText, /personal config/i);
  assert.match(skillText, /\.claw\/project-override\.json/);
});

test("exported Codex plugin contains every shared workflow and documentation skill", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-plugin-shared-workflows-"));
  const outDir = path.join(root, "dist");
  const result = await exportCodexPluginBundle({ outDir });

  for (const skillName of ["planning", "config", "update", "create-claw-skill", "feature-architecture", "claw-kit-doc"]) {
    await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, skillName, "SKILL.md")));
  }
  await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "knowledge-capture", "SKILL.md")));
  for (const referenceName of ["update.md", "configuration.md", "knowledge-format.md"]) {
    await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "claw-kit-doc", "references", referenceName)));
  }
  await assert.rejects(fs.access(artifactSkill(result.bundleDir, "delegate-writer", "SKILL.md")));
  await assert.rejects(fs.access(artifactSkill(result.bundleDir, "knowledge-writer", "SKILL.md")));
  await assert.rejects(fs.access(artifactSkill(result.bundleDir, "truth-writer", "SKILL.md")));
  await assert.rejects(fs.access(artifactSkill(result.bundleDir, "adr-writer", "SKILL.md")));
  await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "update", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "create-claw-skill", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "create-claw-skill", "FALLBACK.md")));
  await fs.access(artifactSkill(result.bundleDir, "using-claw-kit", "references", "hosts", "codex.md"));
  await fs.access(artifactSkill(result.bundleDir, "researcher", "references", "host-execution.md"));
  await fs.access(artifactSkill(result.bundleDir, "feature-architecture", "references", "host-execution.md"));
  for (const skillName of ["release-claw-kit", "release-claw-cli", "release-codex-plugin", "release-cindy-plugin", "release-openclaw-plugin", "release-opencode-plugin"]) {
    await assert.rejects(fs.access(artifactSkill(result.bundleDir, skillName, "SKILL.md")));
  }
  await assert.rejects(fs.access(path.join(result.bundleDir, "scripts", "code-mode-host-action-consumer.mjs")));
});

test("composed Codex artifact selects exactly the declared skill packages", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-codex-catalog-"));
  const result = await exportCodexPluginBundle({ outDir: root });
  const inputs = await loadSkillInputs({ sourceRoot: fileURLToPath(new URL("../", import.meta.url)), targetHost: "codex" });
  assert.deepEqual((await fs.readdir(path.join(result.bundleDir, "skills"))).sort(), inputs.skills.map(({ id }) => id).sort());
  const artifact = await readCodexPluginSource({ sourceDir: result.bundleDir });
  assert.equal(artifact.manifest.skills, "./skills/");
});

test("canonical documentation entry contains adjacent references", async () => {
  const configReference = await fs.readFile(new URL("../.agents/skills/claw-kit-doc/references/configuration.md", import.meta.url), "utf8");
  assert.match(configReference, /accepts `main-agent`, `background`, or `subagent`/);
  assert.match(configReference, /knowledgeWriterByHost/);
});

test("source marketplace retains the established adapter path", async () => {
  const marketplace = JSON.parse(
    await fs.readFile(new URL("../.agents/plugins/marketplace.json", import.meta.url), "utf8"),
  );
  const plugin = marketplace.plugins.find((entry) => entry.name === "claw-kit");

  assert.equal(marketplace.name, "claw-kit");
  assert.equal(plugin.source.source, "local");
  assert.equal(plugin.source.path, "./packages/codex-adapter");
  assert.equal(plugin.policy.installation, "AVAILABLE");
  assert.equal(plugin.category, "Developer Tools");
});

test("release protocol keeps CLI and coordinated platform gates distinct", async () => {
  const distribution = await fs.readFile(new URL("../DISTRIBUTION.md", import.meta.url), "utf8");
  const releaseScript = await fs.readFile(new URL("./publish-release.mjs", import.meta.url), "utf8");

  assert.match(distribution, /published Git artifact ref containing that composed tree/);
  assert.match(distribution, /never tag raw incomplete adapter source as if it were an artifact/);
  assert.match(distribution, /verify:batch-release/);
  assert.doesNotMatch(distribution, /attach the exported Codex plugin bundle to the GitHub release/);
  assert.match(releaseScript, /assertRepositorySourceSnapshot/);
  assert.match(releaseScript, /never certify raw adapter source as a complete marketplace payload/);
  assert.match(releaseScript, /assertTemplateVersionsAligned/);
  assert.match(releaseScript, /includePlatformArtifacts/);
  assert.match(releaseScript, /--batch/);
  assert.doesNotMatch(releaseScript, /"delegate-writer"/);
  assert.doesNotMatch(releaseScript, /requiredPluginSkills[^\n]*release-claw-kit/);
  assert.match(releaseScript, /Refresh a platform plugin only when that platform artifact was separately released/);
});

test("Codex update contract is platform-specific and supports only the official identity", async () => {
  const skill = await fs.readFile(new URL("../packages/codex-adapter/skills/update/SKILL.md", import.meta.url), "utf8");
  const template = await fs.readFile(new URL("../packages/codex-adapter/skills/update/TEMPLATE.json", import.meta.url), "utf8");
  const fallback = await fs.readFile(new URL("../packages/codex-adapter/skills/update/non-claw-fallback.md", import.meta.url), "utf8");
  const installer = await fs.readFile(new URL("./install-codex-plugin.ps1", import.meta.url), "utf8");
  const combined = [skill, template, fallback, installer].join("\n");

  assert.match(combined, /publish and verify/i);
  assert.match(combined, /claw-kit@claw-kit/);
  assert.doesNotMatch(combined, /direct development install/i);
  assert.doesNotMatch(combined, /cache\\claw-kit-local/i);
  assert.doesNotMatch(combined, /OpenCode|conservative fallback|choose (?:the )?host route|"choices"/i);
  assert.match(installer, /github\.com\/chanyuenpang\/claw-kit\.git/i);
  assert.match(installer, /git ls-remote \$repositoryUrl \$Ref/i);
  assert.match(installer, /\$resolvedLines = @\(git ls-remote \$repositoryUrl \$Ref\)/i);
  assert.match(installer, /\$gitExitCode = \$LASTEXITCODE/i);
  assert.doesNotMatch(installer, /git ls-remote \$repositoryUrl \$Ref\s*\|\s*Select-Object/i);
  assert.match(installer, /fetch --depth 1 origin \$resolvedCommit/i);
  assert.match(installer, /checkout --quiet --detach FETCH_HEAD/i);
  assert.doesNotMatch(installer, /clone --depth 1 --branch main/i);
});

test("repository-local release skills split CLI and platform publication contracts", async () => {
  const root = new URL("../.agents/skills/", import.meta.url);
  const router = await fs.readFile(new URL("release-claw-kit/SKILL.md", root), "utf8");
  const names = [
    "release-claw-cli",
    "release-codex-plugin",
    "release-dsh-plugin",
    "release-cindy-plugin",
    "release-openclaw-plugin",
    "release-opencode-plugin",
  ];
  const payloads = await Promise.all(names.map(async (name) => {
    const skillRoot = new URL(`${name}/`, root);
    const skill = await fs.readFile(new URL("SKILL.md", skillRoot), "utf8");
    const template = JSON.parse(await fs.readFile(new URL("TEMPLATE.json", skillRoot), "utf8"));
    const fallback = await fs.readFile(new URL("FALLBACK.md", skillRoot), "utf8");
    const artifact = await fs.readFile(new URL("references/artifact.md", skillRoot), "utf8");
    return { name, skill, template, fallback, artifact };
  }));

  for (const name of names) assert.match(router, new RegExp(name));
  assert.match(router, /routes only/i);
  await assert.rejects(fs.access(new URL("release-claw-kit/TEMPLATE.json", root)));

  for (const payload of payloads) {
    assert.equal(payload.template.id, payload.name);
    assert.equal(payload.template.status, "process.active");
    const hasTemplateCompatibilityGate = [
      "release-claw-cli",
      "release-codex-plugin",
      "release-dsh-plugin",
    ].includes(payload.name);
    assert.equal(payload.template.tasks.length, hasTemplateCompatibilityGate ? 6 : 5);
    if (hasTemplateCompatibilityGate) {
      const templateCompatibilityGate = payload.template.tasks.find(
        (task) => task.title === "Verify built-in templated skill compatibility",
      );
      assert.ok(templateCompatibilityGate, `${payload.name} includes the template compatibility gate`);
      assert.match(templateCompatibilityGate.detail, /npm run check:template-versions/);
    }
    assert.doesNotMatch(JSON.stringify(payload.template), /"choices"/);
  }

  const combined = payloads.map(({ skill, template, fallback, artifact }) =>
    `${skill}\n${JSON.stringify(template)}\n${fallback}\n${artifact}`).join("\n");
  assert.match(combined, /npm run verify:release/);
  assert.match(combined, /Verify built-in templated skill compatibility/);
  assert.match(combined, /@veewo\/claw-core.*before @veewo\/claw/is);
  assert.match(combined, /HEAD == origin\/main/);
  assert.match(combined, /vcodex-<version>/);
  assert.match(combined, /vcindy-<version>/);
  assert.match(combined, /vopenclaw-<version>/);
  assert.match(combined, /vopencode-<version>/);
  const cindy = payloads.find((payload) => payload.name === "release-cindy-plugin");
  assert.ok(cindy);
  const cindyContract = `${cindy.skill}\n${JSON.stringify(cindy.template)}\n${cindy.fallback}\n${cindy.artifact}`;
  assert.match(cindyContract, /claw-kit-cindy-adapter/i);
  assert.match(cindyContract, /Independent distribution does \*\*not\*\* create an independent version line/);
  assert.match(cindyContract, /<cli-base>\.<next-fourth-segment>/);
  assert.doesNotMatch(cindyContract, /single rollback package/i);
});

test("official marketplace-style cache copy contains all shared skills and resources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-marketplace-install-"));
  const cacheRoot = path.join(root, ".codex", "plugins", "cache", "claw-kit");
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  const result = await installCodexPluginBundle({ sourceRoot, cacheRoot });

  for (const skillName of ["planning", "config", "update", "create-claw-skill", "feature-architecture"]) {
    await assert.doesNotReject(fs.access(artifactSkill(result.installDir, skillName, "SKILL.md")));
  }
  await assert.doesNotReject(fs.access(artifactSkill(result.installDir, "feature-architecture", "references", "design-artifacts.md")));
  await assert.doesNotReject(fs.access(artifactSkill(result.installDir, "update", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(artifactSkill(result.installDir, "create-claw-skill", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(artifactSkill(result.installDir, "create-claw-skill", "FALLBACK.md")));
  await fs.access(artifactSkill(result.installDir, "using-claw-kit", "references", "hosts", "codex.md"));
  await fs.access(artifactSkill(result.installDir, "researcher", "references", "host-execution.md"));
  await fs.access(artifactSkill(result.installDir, "feature-architecture", "references", "host-execution.md"));
  for (const skillName of ["release-claw-kit", "release-claw-cli", "release-codex-plugin", "release-cindy-plugin", "release-openclaw-plugin", "release-opencode-plugin"]) {
    await assert.rejects(fs.access(artifactSkill(result.installDir, skillName, "SKILL.md")));
  }
  await assert.doesNotReject(
    fs.access(artifactSkill(result.installDir, "create-claw-skill", "scripts", "create-claw-skill-stub.mjs")),
  );
});

test("exportCodexPluginBundle copies the expected payload into a versioned bundle directory", async () => {
  const { sourceDir, root } = await makeFixture();
  const outDir = path.join(root, "dist", "codex-plugin");

  await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.mjs"), "export const hook = true;\n");
  await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.test.mjs"), "export const testHook = true;\n");

  const result = await exportCodexPluginBundle({ sourceDir, outDir });

  assert.equal(result.bundleDir, path.join(outDir, "claw-kit", "0.1.41+codex.test"));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, ".codex-plugin", "plugin.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "assets", "icon.png")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "hooks", "hooks.json")));
  await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "config", "SKILL.md")));
  await assert.doesNotReject(fs.access(artifactSkill(result.bundleDir, "config", "TEMPLATE.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "package.json")));
  await assert.doesNotReject(fs.access(path.join(result.bundleDir, "hooks", "session-start-recovery.mjs")));
  await assert.rejects(fs.access(path.join(result.bundleDir, "hooks", "session-start-recovery.test.mjs")));
});

test("installCodexPluginBundle copies a payload source into the versioned Codex cache layout", async () => {
  const { sourceDir, root } = await makeFixture();
  const cacheRoot = path.join(root, ".codex", "plugins", "cache");
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  try {
    await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.mjs"), "export const hook = true;\n");
    await fs.writeFile(path.join(sourceDir, "hooks", "session-start-recovery.test.mjs"), "export const testHook = true;\n");

    const result = await installCodexPluginBundle({ sourceDir, cacheRoot });

    assert.equal(result.installDir, path.join(cacheRoot, "claw-kit", "0.1.41+codex.test"));
    const manifest = JSON.parse(await fs.readFile(path.join(result.installDir, ".codex-plugin", "plugin.json"), "utf8"));
    assert.equal(manifest.version, "0.1.41+codex.test");
    await assert.doesNotReject(fs.access(path.join(result.installDir, "assets", "icon.png")));
    const installedSkill = await fs.readFile(artifactSkill(result.installDir, "config", "SKILL.md"), "utf8");
    assert.equal(installedSkill, "# config skill");
    await assert.doesNotReject(fs.access(path.join(result.installDir, "hooks", "session-start-recovery.mjs")));
    await assert.rejects(fs.access(path.join(result.installDir, "hooks", "session-start-recovery.test.mjs")));
    await assert.doesNotReject(fs.access(artifactSkill(result.installDir, "config", "TEMPLATE.json")));
    await assert.rejects(fs.access(path.join(root, ".claw", "templates", "team-default.json")));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
});

test("Codex cache activation is atomic and preserves the previous version on failure", async () => {
  const { sourceDir, root } = await makeFixture();
  const cacheRoot = path.join(root, ".codex", "plugins", "cache");
  const first = await installCodexPluginBundle({ sourceDir, cacheRoot });
  const sentinelPath = path.join(first.installDir, "previous-install.txt");
  await fs.writeFile(sentinelPath, "stable");

  await assert.rejects(
    installCodexPluginBundle({
      sourceDir,
      cacheRoot,
      testHooks: {
        beforeActivate: async () => {
          throw new Error("simulated activation interruption");
        },
      },
    }),
    /simulated activation interruption/,
  );

  assert.equal(await fs.readFile(sentinelPath, "utf8"), "stable");
  const versionParent = path.dirname(first.installDir);
  const leftovers = (await fs.readdir(versionParent))
    .filter((entry) => entry.includes(".installing-") || entry.includes(".backup-"));
  assert.deepEqual(leftovers, []);
});

test("official installer removes local identities, hooks, marketplaces, and caches", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-identity-"));
  const configPath = path.join(root, "config.toml");
  const cacheRoot = path.join(root, "plugins", "cache");
  await fs.mkdir(path.join(cacheRoot, "claw-kit-hookfix-local"), { recursive: true });
  await fs.mkdir(path.join(cacheRoot, "claw-kit-local"), { recursive: true });
  await fs.writeFile(configPath, [
    "[marketplaces.claw-kit]",
    'source_type = "git"',
    'source = "https://github.com/chanyuenpang/claw-kit.git"',
    "",
    '[plugins."claw-kit@claw-kit"]',
    "enabled = false",
    "",
    '[plugins."claw-kit@claw-kit-local"]',
    "enabled = true",
    "",
    '[plugins."claw-kit-local@personal"]',
    "enabled = true",
    "",
    "[marketplaces.claw-kit-hookfix-local]",
    'source_type = "local"',
    'source = "C:\\\\temp\\\\claw-kit-hookfix-local"',
    "",
    '[plugins."claw-kit@claw-kit-hookfix-local"]',
    "enabled = true",
    "",
    '[hooks.state."claw-kit@claw-kit-hookfix-local:hooks/hooks.json:session_start:0:0"]',
    'trusted_hash = "sha256:test"',
    "enabled = true",
    "",
  ].join("\n"));

  const result = await activateOfficialCodexPluginIdentity({ configPath, localCacheRoot: cacheRoot });
  const config = await fs.readFile(configPath, "utf8");

  assert.equal(result.enabledIdentity, "claw-kit@claw-kit");
  assert.deepEqual(result.removedIdentities, ["claw-kit@claw-kit-local", "claw-kit-local@personal", "claw-kit@claw-kit-hookfix-local"]);
  assert.match(config, /\[plugins\."claw-kit@claw-kit"\]\nenabled = true/);
  assert.doesNotMatch(config, /claw-kit-local|claw-kit-hookfix-local/);
  await assert.rejects(fs.access(path.join(cacheRoot, "claw-kit-hookfix-local")));
  await assert.rejects(fs.access(path.join(cacheRoot, "claw-kit-local")));
});

test("official installer updates plugin identity sections idempotently", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-identity-idempotent-"));
  const configPath = path.join(root, "config.toml");
  await fs.writeFile(configPath, [
    '[plugins."claw-kit@claw-kit-local"]',
    "enabled = true",
    "",
    '[plugins."unrelated@marketplace"]',
    "enabled = true",
    "",
    '[plugins."claw-kit@claw-kit"]',
    "enabled = false",
    "",
    "[marketplaces.claw-kit]",
    'source_type = "git"',
    'source = "https://github.com/chanyuenpang/claw-kit.git"',
    "",
  ].join("\n"));

  await activateOfficialCodexPluginIdentity({ configPath });
  await activateOfficialCodexPluginIdentity({ configPath });
  const config = await fs.readFile(configPath, "utf8");

  assert.equal((config.match(/\[plugins\."claw-kit@claw-kit"\]/g) ?? []).length, 1);
  assert.equal((config.match(/claw-kit-local/g) ?? []).length, 0);
  assert.equal((config.match(/^enabled = true$/gm) ?? []).length, 2);
  assert.equal((config.match(/^enabled = false$/gm) ?? []).length, 0);
});

test("Codex flat export is relocatable, complete and does not mutate canonical sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-codex-detached-"));
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  const before = await loadSkillInputs({ sourceRoot, targetHost: "codex" });
  const result = await exportCodexPluginBundle({ sourceRoot, outDir: path.join(root, "export") });
  const after = await loadSkillInputs({ sourceRoot, targetHost: "codex" });
  assert.equal(after.sourceHash, before.sourceHash);
  const detached = path.join(root, "detached");
  assert.equal(path.dirname(detached), root);
  await fs.rename(result.bundleDir, detached);
  const plugin = await readCodexPluginSource({ sourceDir: detached });
  assert.equal(plugin.manifest.skills, "./skills/");
  assert.deepEqual((await fs.readdir(path.join(detached, "skills"))).sort(), before.skills.map(({ id }) => id).sort());
  for (const excluded of [".claw", "node_modules", ".agents", ".git", "packages", "shared", "skills/release-claw-kit"]) {
    await assert.rejects(fs.access(path.join(detached, excluded)));
  }
  for (const relative of ["skills/knowledge-capture/runtime.json", "skills/knowledge-capture/scripts/run-knowledge-capture.mjs", "skills/create-claw-skill/TEMPLATE.json", "skills/create-claw-skill/FALLBACK.md", "skills/claw-kit-doc/references/knowledge-format.md"]) await fs.access(path.join(detached, relative));
  // Artifact-to-artifact copying works without consulting a repository catalog.
  const copied = await exportCodexPluginBundle({ sourceDir: detached, sourceRoot: path.join(root, "nonexistent-source"), outDir: path.join(root, "copied") });
  await readCodexPluginSource({ sourceDir: copied.bundleDir });
});

test("Codex export refuses source writes, raw-source installation and extra skill exposure", async () => {
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  await assert.rejects(exportCodexPluginBundle({ sourceRoot, outDir: path.join(sourceRoot, "packages/codex-adapter") }), /output|source/i);
  await assert.rejects(readCodexPluginSource({ sourceDir: path.join(sourceRoot, "packages/codex-adapter") }), /missing|exactly/i);
  const { sourceDir } = await makeFixture();
  await fs.mkdir(path.join(sourceDir, "skills", "release-claw-kit"));
  await assert.rejects(readCodexPluginSource({ sourceDir }), /exactly its nine declared skill packages/);
});

test("Codex Git marketplace artifact resolves a detached flat plugin without source copies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-codex-marketplace-"));
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  const before = await loadSkillInputs({ sourceRoot, targetHost: "codex" });
  const catalogBefore = await fs.readFile(path.join(sourceRoot, ".agents/plugins/marketplace.json"), "utf8");
  const result = await exportCodexMarketplace({ sourceRoot, outDir: path.join(root, "marketplace") });
  const detached = path.join(root, "detached-marketplace");
  assert.equal(path.dirname(detached), root);
  await fs.rename(result.marketplaceDir, detached);
  const catalog = JSON.parse(await fs.readFile(path.join(detached, ".agents/plugins/marketplace.json"), "utf8"));
  const entry = catalog.plugins.find(({ name }) => name === "claw-kit");
  assert.equal(entry.source.path, "./packages/codex-adapter");
  const pluginDir = path.resolve(detached, entry.source.path);
  assert.ok(pluginDir.startsWith(detached + path.sep));
  const plugin = await readCodexPluginSource({ sourceDir: pluginDir });
  assert.equal(plugin.manifest.skills, "./skills/");
  assert.equal((await fs.readdir(path.join(pluginDir, "skills"))).length, 9);
  await fs.access(path.join(pluginDir, "skills/create-claw-skill/TEMPLATE.json"));
  await assert.rejects(fs.access(path.join(detached, ".agents/skills")));
  await assert.rejects(fs.access(path.join(detached, "shared")));
  assert.equal((await loadSkillInputs({ sourceRoot, targetHost: "codex" })).sourceHash, before.sourceHash);
  assert.equal(await fs.readFile(path.join(sourceRoot, ".agents/plugins/marketplace.json"), "utf8"), catalogBefore);
});
