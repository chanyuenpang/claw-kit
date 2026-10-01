import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { assembleSkills, assertArtifactOutput } from "./skill-artifacts.mjs";

const pluginAssets = ["ghost.json", "main.js", "panel.html", "assets", "node"];

async function copyTree(source, target) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error("Cindy artifact inputs must not contain symlinks: " + source);
  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    for (const name of (await fs.readdir(source)).sort()) await copyTree(path.join(source, name), path.join(target, name));
  } else if (stat.isFile()) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  } else throw new Error("Unsupported Cindy artifact input: " + source);
}

async function hashTree(root, current = root, hash = createHash("sha256")) {
  for (const name of (await fs.readdir(current)).sort()) {
    const file = path.join(current, name);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error("Cindy artifacts must contain regular files only.");
    if (stat.isDirectory()) await hashTree(root, file, hash);
    else hash.update(path.relative(root, file).replaceAll("\\", "/") + "\0").update(await fs.readFile(file));
  }
  return hash;
}

async function activateFreshArtifact(stage, outputRoot) {
  // Windows scanners can briefly hold a just-written directory without rename sharing.
  // Retry only that final activation, keeping the same validated stage and never
  // deleting/replacing an output that appeared concurrently. Other errors fail closed.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(stage, outputRoot);
      return;
    } catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EBUSY"].includes(error?.code) || attempt >= 5) throw error;
      try { await fs.lstat(outputRoot); throw new Error("Cindy output appeared during activation: " + outputRoot); }
      catch (targetError) { if (targetError?.code !== "ENOENT") throw targetError; }
      await delay(25 * 2 ** attempt);
    }
  }
}

/** Assemble a fresh artifact-only Git repository tree; never publish or mutate source. */
export async function buildCindyPluginArtifact({ sourceRoot, outputRoot } = {}) {
  ({ sourceRoot, outputRoot } = await assertArtifactOutput({ sourceRoot, outputRoot }));
  try { await fs.lstat(outputRoot); throw new Error("Cindy output already exists: " + outputRoot); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const adapter = path.join(sourceRoot, "packages", "cindy-adapter");
  const manifest = JSON.parse(await fs.readFile(path.join(adapter, "plugin", "ghost.json"), "utf8"));
  const pkg = JSON.parse(await fs.readFile(path.join(adapter, "package.json"), "utf8"));
  if (manifest.id !== "claw-kit" || manifest.version !== pkg.version) throw new Error("Cindy manifest identity/version mismatch.");
  const parent = path.dirname(outputRoot);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(parent, ".cindy-artifact-"));
  try {
    const pluginDir = path.join(stage, "plugin");
    const assembly = await assembleSkills({ sourceRoot, targetHost: "cindy", outputRoot: pluginDir });
    for (const asset of pluginAssets) await copyTree(path.join(adapter, "plugin", asset), path.join(pluginDir, asset));
    const declared = new Set(assembly.skills.map(skill => skill.id));
    const registered = new Set();
    for (const item of manifest.skill?.items ?? []) {
      if (!declared.has(item.name) || item.dir !== "skills/" + item.name || registered.has(item.name)) throw new Error("Cindy registered skill is outside assembled inputs.");
      registered.add(item.name);
      await fs.access(path.join(pluginDir, item.dir, "SKILL.md"));
    }
    if ([...registered].sort().join(",") !== "claw-kit-doc,planning,researcher,using-claw-kit") throw new Error("Cindy public registration set changed.");
    await copyTree(path.join(adapter, ".agents", "plugins", "marketplace.json"), path.join(stage, ".agents", "plugins", "marketplace.json"));
    const market = JSON.parse(await fs.readFile(path.join(stage, ".agents", "plugins", "marketplace.json"), "utf8"));
    if (!market.plugins?.some(item => item.name === "claw-kit-cindy" && item.source?.source === "local" && item.source.path === "./plugin")) throw new Error("Invalid Cindy artifact marketplace.");
    await fs.writeFile(path.join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    const payloadHash = (await hashTree(stage)).digest("hex");
    await fs.writeFile(path.join(stage, "artifact.json"), JSON.stringify({ schemaVersion: 1, host: "cindy", version: manifest.version, skillSourceHash: assembly.sourceHash, payloadHash, sourceRepository: "https://github.com/chanyuenpang/claw-kit", publicationRepository: "https://github.com/chanyuenpang/claw-kit-cindy-adapter" }, null, 2) + "\n");
    await activateFreshArtifact(stage, outputRoot);
    return { artifactRoot: outputRoot, pluginDir: path.join(outputRoot, "plugin"), version: manifest.version, skillSourceHash: assembly.sourceHash, payloadHash };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
