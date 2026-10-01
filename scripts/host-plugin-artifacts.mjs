import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { assembleSkills, loadSkillInputs, assertArtifactOutput as assertSkillArtifactOutput } from "./skill-artifacts.mjs";

// Runtime allowlists only. Skill packages always come from the source catalog.
export const HOST_RUNTIME_PATHS = {
  dsh: ["package.json", "lib", "cordis.patch.yml", "README.md"],
  opencode: ["package.json", "plugin", "agents", "references", "workflow-guidance.opencode.json", "tsconfig.json"],
  openclaw: ["package.json", "dist", "openclaw.plugin.json"],
  standard: ["package.json", "README.md", "docs"],
};

export function npmVersionOf(version) {
  const match = /^(\d+\.\d+\.\d+)\.(\d+)$/.exec(String(version));
  return match ? match[1] + "-rc." + match[2] : String(version);
}

async function rejectSymlinkAncestors(target) {
  let current = path.resolve(target);
  while (true) {
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Artifact path contains a symlink: " + current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function assertArtifactOutput({ sourceRoot, outputRoot }) {
  const guarded = await assertSkillArtifactOutput({ sourceRoot, outputRoot });
  if (guarded.outputRoot === path.join(guarded.sourceRoot, "dist")) throw new Error("Choose a host artifact subdirectory, not the entire dist root");
  return guarded.outputRoot;
}

async function copyRuntime(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error("Runtime source contains a symlink: " + source);
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const name of (await fs.readdir(source)).sort()) {
      if (name.endsWith(".test.mjs")) continue;
      await copyRuntime(path.join(source, name), path.join(destination, name));
    }
  } else if (stat.isFile()) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  } else {
    throw new Error("Runtime source is not a regular file or directory: " + source);
  }
}

/** Build one fresh, self-contained host package; never populate adapter source. */
export async function buildHostPluginArtifact({ sourceRoot, targetHost, outputRoot }) {
  const runtimePaths = HOST_RUNTIME_PATHS[targetHost];
  if (!runtimePaths) throw new Error("Unsupported staged host: " + targetHost);
  const output = await assertArtifactOutput({ sourceRoot, outputRoot });
  const source = path.resolve(sourceRoot);
  const adapterRoot = path.join(source, "packages", targetHost + "-adapter");
  const inputs = await loadSkillInputs({ sourceRoot: source, targetHost });
  await rejectSymlinkAncestors(adapterRoot);
  const manifest = JSON.parse(await fs.readFile(path.join(adapterRoot, "package.json"), "utf8"));
  if (typeof manifest.version !== "string" || !/^[a-zA-Z0-9.+-]+$/.test(manifest.version)) throw new Error("Invalid artifact version");
  // mkdir without recursive/exist_ok prevents accidental reuse of stale payloads.
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output);
  try {
    for (const relative of runtimePaths) await copyRuntime(path.join(adapterRoot, relative), path.join(output, relative));
    const assembled = await assembleSkills({ sourceRoot: source, targetHost, outputRoot: output });
    if (assembled.sourceHash !== inputs.sourceHash) throw new Error("Skill source inputs changed during host staging");
    const artifactManifest = targetHost === "dsh" ? { ...manifest, version: npmVersionOf(manifest.version) } : manifest;
    if (targetHost === "dsh") {
      // Pack/install must not invoke repository-only build scripts.
      delete artifactManifest.scripts;
      delete artifactManifest.devDependencies;
      await fs.writeFile(path.join(output, "package.json"), JSON.stringify(artifactManifest, null, 2) + "\n");
    }
    return { targetHost, outputRoot: output, adapterRoot, manifest: artifactManifest, gitVersion: manifest.version, version: artifactManifest.version, skills: inputs.skills, sourceHash: assembled.sourceHash, skillsRoot: assembled.skillsRoot };
  } catch (error) {
    // output was validated and created by this invocation only.
    await fs.rm(output, { recursive: true, force: true });
    throw error;
  }
}

/** Atomically replace a validated artifact directory, leaving old output on failure. */
export async function exportHostPluginArtifact({ sourceRoot, targetHost, outputRoot }) {
  const output = await assertArtifactOutput({ sourceRoot, outputRoot });
  const stage = output + ".stage-" + randomUUID();
  const backup = output + ".backup-" + randomUUID();
  const artifact = await buildHostPluginArtifact({ sourceRoot, targetHost, outputRoot: stage });
  let backedUp = false;
  try {
    try { await fs.rename(output, backup); backedUp = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    try { await fs.rename(stage, output); } catch (error) {
      if (backedUp) await fs.rename(backup, output);
      throw error;
    }
    if (backedUp) await fs.rm(backup, { recursive: true, force: true });
    return { ...artifact, outputRoot: output, skillsRoot: path.join(output, "skills") };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

/** Export and publish deliberately share this exact DSH staging/pack path. */
export async function packDshPluginArtifact({ sourceRoot, outDir }) {
  const output = await assertArtifactOutput({ sourceRoot, outputRoot: outDir });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "claw-dsh-artifact-"));
  try {
    const artifact = await buildHostPluginArtifact({ sourceRoot, targetHost: "dsh", outputRoot: path.join(temporary, "package") });
    const packDir = path.join(temporary, "pack");
    await fs.mkdir(packDir);
    execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir], {
      cwd: artifact.outputRoot, stdio: "inherit", shell: process.platform === "win32",
    });
    const tarballs = (await fs.readdir(packDir)).filter((name) => name.endsWith(".tgz"));
    if (tarballs.length !== 1) throw new Error("npm pack must produce exactly one DSH tarball");
    const packed = path.join(packDir, tarballs[0]);
    const listing = execFileSync("tar", ["-tzf", packed], { encoding: "utf8" });
    for (const required of ["package/lib/", "package/cordis.patch.yml", ...artifact.skills.flatMap((skill) => skill.files.map((file) => "package/skills/" + skill.id + "/" + file.replaceAll("\\", "/")))]) {
      if (!listing.includes(required)) throw new Error("DSH tarball missing " + required);
    }
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", packed, "package/package.json"], { encoding: "utf8" }));
    if (manifest.version !== artifact.version) throw new Error("DSH tarball version mismatch");
    await fs.mkdir(output, { recursive: true });
    const tarball = path.join(output, tarballs[0]);
    await rejectSymlinkAncestors(tarball);
    const pending = tarball + ".tmp-" + randomUUID();
    try {
      await fs.copyFile(packed, pending);
      await fs.rename(pending, tarball);
    } finally {
      await fs.rm(pending, { force: true });
    }
    // Keep the existing filename-based installer unambiguous only after success.
    for (const entry of await fs.readdir(output, { withFileTypes: true })) {
      if (entry.isFile() && /^veewo-dsh-claw-kit-.*\.tgz$/.test(entry.name) && entry.name !== tarballs[0]) {
        await fs.rm(path.join(output, entry.name));
      }
    }
    return { tarball, gitVersion: artifact.gitVersion, npmVersion: artifact.version };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
