import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDefaultProjectConfig, buildDirectKnowledgeAssignments, createProjectPlan, ensureProjectEnvironment, initProject, resolveProjectContext } from "../src/index.js";

function fixture(t: test.TestContext): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "claw-project-skills-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const hosts = [".agents", ".claude"];
const files = ["SKILL.md", "agents/openai.yaml", "references/knowledge-format.md"];
function skill(root: string, host: string, file: string): string {
  return path.join(root, host, "skills", "knowledge-capture", file);
}

for (const mode of ["explicit", "automatic"]) {
  test(`${mode} initialization installs complete, standalone Claude and OpenAI capture skills`, (t) => {
    const root = fixture(t);
    const result = mode === "explicit" ? initProject({ cwd: root }) : ensureProjectEnvironment(root);
    const canonical = fs.readFileSync(new URL("../../../../shared/skills/knowledge-capture/SKILL.md", import.meta.url), "utf8");
    const finalizerFormat = fs.readFileSync(buildDirectKnowledgeAssignments({})[0].formatPath!, "utf8");
    assert.equal(finalizerFormat, fs.readFileSync(new URL("../../../../.agents/skills/claw-kit-doc/references/knowledge-format.md", import.meta.url), "utf8"));
    for (const host of hosts) {
      for (const file of files) assert.ok(result.createdPaths.includes(skill(root, host, file)));
      const content = fs.readFileSync(skill(root, host, "SKILL.md"), "utf8");
      assert.equal(content, canonical);
      assert.match(content, /disable-model-invocation: true/);
      assert.match(content, /No claw CLI, plugin/);
      assert.match(content, /\.claw\/truth\/adr\//);
      assert.equal(resolveProjectContext(root).truthDir, path.join(root, ".claw", "truth"));
      assert.match(fs.readFileSync(skill(root, host, "agents/openai.yaml"), "utf8"), /allow_implicit_invocation: false/);
      assert.equal(fs.readFileSync(skill(root, host, "references/knowledge-format.md"), "utf8"), finalizerFormat);
    }
    assert.deepEqual(ensureProjectEnvironment(root).createdPaths, []);
  });
}

for (const entry of ["init", "plan creation"]) {
  test(`an older initialized project gains capture skills through ${entry} without resetting content`, async (t) => {
    const root = fixture(t), claw = path.join(root, ".claw");
    fs.mkdirSync(path.join(claw, "truth"), { recursive: true });
    const configPath = path.join(claw, "project.json");
    const overridePath = path.join(claw, "project-override.json");
    const truthPath = path.join(claw, "truth", "existing.md");
    fs.writeFileSync(configPath, JSON.stringify({ ...buildDefaultProjectConfig({ cwd: root }),
      version: "0.2.60", name: "Existing project", planning: false,
      knowledgeWriter: { externalSkills: ["team-knowledge"], datedSectionsToKeep: 12 } }));
    fs.writeFileSync(overridePath, JSON.stringify({ goalMode: false }));
    fs.writeFileSync(truthPath, "# Existing knowledge\n");
    fs.mkdirSync(path.dirname(skill(root, ".agents", "SKILL.md")), { recursive: true });
    fs.writeFileSync(skill(root, ".agents", "SKILL.md"), "user capture skill\n");
    const preserved = [configPath, overridePath, truthPath, skill(root, ".agents", "SKILL.md")];
    const bytes = preserved.map(file => fs.readFileSync(file));
    if (entry === "init") {
      const result = initProject({ cwd: root, projectName: "Must not replace existing name", planning: true });
      assert.equal(result.created, false);
      assert.equal(result.projectName, "Existing project");
    } else {
      await createProjectPlan({ title: "Upgrade old project", knowledgeCapture: false }, { cwd: root });
    }
    for (const host of hosts) for (const file of files) assert.ok(fs.existsSync(skill(root, host, file)));
    assert.deepEqual(preserved.map(file => fs.readFileSync(file)), bytes);
    assert.deepEqual(initProject({ cwd: root }).createdPaths, []);
  });
}

test("force init and automatic repair preserve existing skill edits and unrelated files", (t) => {
  const root = fixture(t);
  initProject({ cwd: root });
  for (const host of hosts) {
    fs.writeFileSync(skill(root, host, "SKILL.md"), "user skill\n");
    fs.writeFileSync(skill(root, host, "references/knowledge-format.md"), "user appendix\n");
    fs.writeFileSync(skill(root, host, "custom.txt"), "user companion\n");
    fs.unlinkSync(skill(root, host, "agents/openai.yaml"));
  }
  initProject({ cwd: root, force: true });
  const nested = path.join(root, "src", "nested"); fs.mkdirSync(nested, { recursive: true });
  assert.equal(ensureProjectEnvironment(nested).projectRoot, root);
  for (const host of hosts) {
    assert.equal(fs.readFileSync(skill(root, host, "SKILL.md"), "utf8"), "user skill\n");
    assert.equal(fs.readFileSync(skill(root, host, "references/knowledge-format.md"), "utf8"), "user appendix\n");
    assert.equal(fs.readFileSync(skill(root, host, "custom.txt"), "utf8"), "user companion\n");
    assert.match(fs.readFileSync(skill(root, host, "agents/openai.yaml"), "utf8"), /allow_implicit_invocation: false/);
  }
});

for (const level of ["host", "skills"]) {
  test(`existing internal ${level} directory links are reused without replacing them`, (t) => {
    const root = fixture(t);
    const target = path.join(root, ".claude", ...(level === "skills" ? ["skills"] : []));
    fs.mkdirSync(target, { recursive: true });
    if (level === "skills") fs.mkdirSync(path.join(root, ".agents"));
    const link = path.join(root, ".agents", ...(level === "skills" ? ["skills"] : []));
    fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    initProject({ cwd: root });
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    for (const file of files) assert.equal(fs.realpathSync(skill(root, ".agents", file)), fs.realpathSync(skill(root, ".claude", file)));
    assert.deepEqual(ensureProjectEnvironment(root).createdPaths, []);
  });
}

test("an external skill-directory link never receives project skill writes", (t) => {
  const root = fixture(t), outside = fixture(t);
  fs.mkdirSync(path.join(root, ".agents"));
  fs.symlinkSync(outside, path.join(root, ".agents", "skills"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => initProject({ cwd: root }), { code: "PATH_OUTSIDE_ROOT" });
  assert.deepEqual(fs.readdirSync(outside), []);
});
