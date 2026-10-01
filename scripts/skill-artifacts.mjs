import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const SKILL_HOSTS = ["codex", "dsh", "opencode", "openclaw", "standard", "cindy"];
export const CANONICAL_SKILL_SOURCES = Object.freeze({
  planning: ".agents/skills/planning",
  config: ".agents/skills/config",
  "create-claw-skill": ".agents/skills/create-claw-skill",
  "feature-architecture": ".agents/skills/feature-architecture",
  researcher: ".agents/skills/researcher",
  "using-claw-kit": ".agents/skills/using-claw-kit",
  "claw-kit-doc": ".agents/skills/claw-kit-doc",
  "knowledge-capture": "shared/skills/knowledge-capture",
});

function requiredPath(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(name + " is required.");
  return path.resolve(value);
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

async function noSymlinkAncestors(file) {
  let current = file;
  for (;;) {
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error("Skill artifact paths must not contain symlinks: " + current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function collectFiles(root, relative = "") {
  const absolute = path.join(root, relative);
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error("Skill sources must not contain symlinks: " + absolute);
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory()) throw new Error("Skill sources must contain only regular files: " + absolute);
  const files = [];
  for (const name of (await fs.readdir(absolute)).sort()) {
    files.push(...await collectFiles(root, path.join(relative, name)));
  }
  return files;
}

/** Read the host's explicit declaration and validate the complete canonical packages. */
export async function loadSkillInputs({ sourceRoot, targetHost } = {}) {
  sourceRoot = requiredPath(sourceRoot, "sourceRoot");
  if (!SKILL_HOSTS.includes(targetHost)) throw new Error("Unknown targetHost: " + targetHost);
  const declarationPath = path.join(sourceRoot, "packages", targetHost + "-adapter", "skill-inputs.json");
  await noSymlinkAncestors(declarationPath);
  const declarationText = await fs.readFile(declarationPath, "utf8");
  const declaration = JSON.parse(declarationText);
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration) ||
      declaration.schemaVersion !== 1 || declaration.host !== targetHost ||
      !Array.isArray(declaration.skills) || declaration.skills.length === 0 ||
      Object.keys(declaration).some((key) => !["schemaVersion", "host", "skills"].includes(key))) {
    throw new Error("Invalid skill input declaration: " + declarationPath);
  }
  const skills = [];
  const seen = new Set();
  const hash = createHash("sha256").update(declarationText);
  for (const id of declaration.skills) {
    if (typeof id !== "string" || seen.has(id)) throw new Error("Invalid or duplicate skill id: " + id);
    seen.add(id);
    let relativeSource;
    if (id === "update" && ["codex", "dsh", "opencode"].includes(targetHost)) {
      relativeSource = "packages/" + targetHost + "-adapter/skills/update";
    } else if (Object.hasOwn(CANONICAL_SKILL_SOURCES, id)) {
      if (id === "knowledge-capture" && !["codex", "dsh"].includes(targetHost)) {
        throw new Error("Manual capture is not a declared public capability for " + targetHost);
      }
      relativeSource = CANONICAL_SKILL_SOURCES[id];
    } else {
      throw new Error("Unknown skill input: " + id);
    }
    const sourcePath = path.join(sourceRoot, relativeSource);
    await noSymlinkAncestors(sourcePath);
    const files = await collectFiles(sourcePath);
    if (!files.includes("SKILL.md")) throw new Error("Skill input is missing SKILL.md: " + sourcePath);
    for (const file of files) {
      hash.update(relativeSource + "/" + file.replaceAll("\\", "/") + "\0");
      hash.update(await fs.readFile(path.join(sourcePath, file)));
    }
    skills.push({ id, sourcePath, relativeSource, files });
  }
  return { sourceRoot, targetHost, declarationPath, skills, sourceHash: hash.digest("hex") };
}

/** Validate output location before any host asset copy; this function never writes. */
export async function assertArtifactOutput({ sourceRoot, outputRoot } = {}) {
  sourceRoot = requiredPath(sourceRoot, "sourceRoot");
  outputRoot = requiredPath(outputRoot, "outputRoot");
  if (contains(outputRoot, sourceRoot) ||
      (contains(sourceRoot, outputRoot) && !contains(path.join(sourceRoot, "dist"), outputRoot))) {
    throw new Error("Skill artifact output must be outside sourceRoot or inside its dist directory.");
  }
  await noSymlinkAncestors(sourceRoot);
  await noSymlinkAncestors(outputRoot);
  return { sourceRoot, outputRoot };
}

/** Write only outputRoot/skills, never source mirrors or a previous artifact. */
export async function assembleSkills({ sourceRoot, targetHost, outputRoot } = {}) {
  ({ sourceRoot, outputRoot } = await assertArtifactOutput({ sourceRoot, outputRoot }));
  const inputs = await loadSkillInputs({ sourceRoot, targetHost });
  const skillsRoot = path.join(outputRoot, "skills");
  for (const skill of inputs.skills) {
    if (contains(skill.sourcePath, outputRoot) || contains(outputRoot, skill.sourcePath)) {
      throw new Error("Skill artifact output overlaps a canonical source: " + skill.sourcePath);
    }
  }
  try {
    await fs.lstat(skillsRoot);
    throw new Error("Skill artifact skills directory already exists: " + skillsRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.mkdir(outputRoot, { recursive: true });
  const stage = await fs.mkdtemp(path.join(outputRoot, ".skills-stage-"));
  try {
    for (const skill of inputs.skills) {
      for (const file of skill.files) {
        const source = path.join(skill.sourcePath, file);
        await noSymlinkAncestors(source);
        const destination = path.join(stage, skill.id, file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(source, destination);
      }
    }
    // Source edits racing assembly invalidate the candidate instead of mixing revisions.
    if ((await loadSkillInputs({ sourceRoot, targetHost })).sourceHash !== inputs.sourceHash) {
      throw new Error("Skill source inputs changed during assembly.");
    }
    await fs.rename(stage, skillsRoot);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
  return { ...inputs, outputRoot, skillsRoot };
}

/** Check source ownership without constructing an artifact or writing any files. */
export async function verifySkillSourceLayout({ sourceRoot } = {}) {
  sourceRoot = requiredPath(sourceRoot, "sourceRoot");
  const inputs = [];
  for (const targetHost of SKILL_HOSTS) inputs.push(await loadSkillInputs({ sourceRoot, targetHost }));
  const forbidden = Object.entries(CANONICAL_SKILL_SOURCES)
    .filter(([, location]) => location.startsWith(".agents/"))
    .map(([id]) => path.join(sourceRoot, "shared", "skills", id));
  forbidden.push(path.join(sourceRoot, "shared", "docs", "claw-kit-doc"));
  for (const host of SKILL_HOSTS) {
    const adapter = path.join(sourceRoot, "packages", host + "-adapter");
    for (const dir of [path.join(adapter, "skills"), ...(host === "cindy" ? [path.join(adapter, "plugin", "skills")] : [])]) {
      let entries;
      try { entries = await fs.readdir(dir); } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      for (const name of entries) {
        if (name === "update" && ["codex", "dsh", "opencode"].includes(host)) continue;
        forbidden.push(path.join(dir, name));
      }
    }
  }
  const problems = [];
  for (const file of forbidden) {
    try {
      await fs.lstat(file);
      problems.push("Redundant source skill copy: " + path.relative(sourceRoot, file));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { ok: problems.length === 0, problems, hosts: inputs.map(({ targetHost, sourceHash }) => ({ targetHost, sourceHash })) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === "--check-source") { options.checkSource = true; continue; }
    const key = { "--source-root": "sourceRoot", "--host": "targetHost", "--output-root": "outputRoot" }[option];
    if (!key || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Invalid argument: " + option);
    options[key] = args[++i];
  }
  if (options.checkSource) {
    if (options.outputRoot || options.targetHost) throw new Error("--check-source accepts only --source-root.");
    const result = await verifySkillSourceLayout({ sourceRoot: options.sourceRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });
    if (!result.ok) throw new Error(result.problems.join("\n"));
    console.log("Canonical skill sources and host declarations are valid; no source copies found.");
  } else {
    const result = await assembleSkills(options);
    console.log(JSON.stringify({ targetHost: result.targetHost, skillsRoot: result.skillsRoot, sourceHash: result.sourceHash }, null, 2));
  }
}
