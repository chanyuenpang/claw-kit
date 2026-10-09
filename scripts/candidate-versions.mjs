import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { npmVersionOf } from "./host-plugin-artifacts.mjs";

export const families = ["cli", "codex", "dsh", "opencode", "openclaw", "cindy"];
const adapterFiles = {
  codex: ["packages/codex-adapter/package.json", "packages/codex-adapter/.codex-plugin/plugin.json"],
  dsh: ["packages/dsh-adapter/package.json"],
  opencode: ["packages/opencode-adapter/package.json"],
  openclaw: ["packages/openclaw-adapter/package.json", "packages/openclaw-adapter/openclaw.plugin.json"],
  cindy: ["packages/cindy-adapter/package.json", "packages/cindy-adapter/plugin/ghost.json"],
};
const cliFiles = ["package.json", "packages/core/package.json", "packages/client/package.json", "packages/cli/package.json"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const assert = (value, message) => { if (!value) throw new Error(message); };
const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const serialize = value => JSON.stringify(value, null, 2) + "\n";
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const numbers = version => /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version) ? version.split(".").map(Number) : undefined;

function compareFormal(a, b) {
  const x = numbers(a), y = numbers(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const difference = (x[i] ?? 0) - (y[i] ?? 0); if (difference) return difference; }
  return 0;
}

/** Shared selection rule. Local allocated but unpublished versions are used. */
export function nextCandidateVersion(family, base, used) {
  assert(families.includes(family) && /^\d+\.\d+\.\d+$/.test(base), "Invalid artifact family or CLI base.");
  if (family === "cli") {
    const values = [base, ...used].filter(v => numbers(v)?.length === 3).sort((a, b) => {
      const x = numbers(a), y = numbers(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
    const [major, minor, patch] = numbers(values.at(-1));
    return [major, minor, patch + 1].join(".");
  }
  const values = used.filter(v => numbers(v)?.length === 4 && v.startsWith(base + "."));
  return base + "." + (values.length ? Math.max(...values.map(v => numbers(v)[3])) + 1 : 0);
}

/** Read only candidate manifests, not a second version registry. Skip artifact trees. */
export async function usedCandidateVersions(roots) {
  const result = Object.fromEntries(families.map(f => [f, []]));
  const visit = async directory => {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error("Candidate history must not contain links.");
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !["artifacts", "runtime", "marketplace", "npm"].includes(entry.name)) await visit(file);
      else if (entry.isFile() && ["candidate.json", "dsh-beta.json"].includes(entry.name)) {
        const record = await read(file);
        for (const [family, artifact] of Object.entries(record.versions ?? {})) {
          if (family in result && numbers(artifact.version)) result[family].push(artifact.version);
        }
        if (record.schemaVersion === 1 && numbers(record.version)?.length === 3) result.cli.push(record.version);
        if (numbers(record.codex?.version)) result.codex.push(record.codex.version);
        if (record.kind === "dsh-local-beta-supplement" && numbers(record.gitVersion)) result.dsh.push(record.gitVersion);
      }
    }
  };
  for (const root of roots) await visit(root);
  return result;
}

async function atomicJson(file, value) {
  const temporary = file + ".tmp-" + randomUUID();
  try { await fs.writeFile(temporary, serialize(value), { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
function inside(root, relative) {
  const target = path.resolve(root, relative), rel = path.relative(root, target);
  assert(rel && !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep), "Candidate path escapes its owner.");
  return target;
}
async function sourceFiles(root) {
  const names = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
  return Object.fromEntries(await Promise.all(names.map(async name => [name, hash(await fs.readFile(inside(root, name)))])));
}

/** Resume a reserved preparation after partial version writes. Validate all
 * source bytes first, so changed inputs never silently reuse a number. */
export async function resumeCandidatePreparation(directory, { sourceRoot } = {}) {
  directory = path.resolve(directory);
  const record = await read(path.join(directory, "candidate.json"));
  assert(record.schemaVersion === 2 && record.state === "preparing", "Only an unfinished preparation may resume; frozen candidates are reused, not rebuilt.");
  const root = path.resolve(sourceRoot ?? record.sourceRoot);
  assert(root === path.resolve(record.sourceRoot), "Preparation belongs to a different source checkout.");
  const actual = await sourceFiles(root);
  assert(Object.keys(actual).length === Object.keys(record.sourceFiles).length, "Candidate inputs changed; allocate a new version.");
  for (const [name, beforeHash] of Object.entries(record.sourceFiles)) {
    const write = record.versionWrites[name];
    assert(actual[name] === beforeHash || write && actual[name] === hash(write.after), "Candidate inputs changed: " + name + ". Allocate a new version.");
  }
  for (const [name, write] of Object.entries(record.versionWrites)) {
    const file = inside(root, name);
    if (actual[name] !== hash(write.after)) {
      const temporary = file + ".candidate-" + randomUUID();
      try { await fs.writeFile(temporary, write.after, { flag: "wx" }); await fs.rename(temporary, file); }
      finally { await fs.rm(temporary, { force: true }); }
    }
  }
  return { directory, record, next: "Review and commit prepared manifests on local main, then pack --candidate this directory." };
}

/** Require exact prepared source after local commit, before packaging writes. */
export async function readPreparedCandidate(directory, sourceRoot) {
  const record = await read(path.join(path.resolve(directory), "candidate.json"));
  assert(record.schemaVersion === 2 && record.state === "preparing", "Pack requires an unfinished preparation; reuse an existing frozen candidate without rebuilding.");
  const root = path.resolve(sourceRoot);
  assert(root === path.resolve(record.sourceRoot), "Preparation belongs to another checkout.");
  const actual = await sourceFiles(root);
  assert(Object.keys(actual).length === Object.keys(record.sourceFiles).length, "Prepared source changed; allocate a new candidate.");
  for (const [name, before] of Object.entries(record.sourceFiles)) {
    assert(actual[name] === (record.versionWrites[name] ? hash(record.versionWrites[name].after) : before), "Prepared source changed: " + name);
  }
  return record;
}

/** Prepare only. No build, commit, remote writes, installation or trial. The
 * caller supplies any known published facts; absence is not a shadow gate. */
export async function prepareCandidateVersions({ sourceRoot, artifacts = ["cli", "codex"], published = {}, targets = {}, candidateRoot } = {}) {
  const root = path.resolve(sourceRoot), selected = [...new Set(artifacts)];
  assert(selected.length && selected.every(f => families.includes(f)), "Select supported artifact families.");
  assert(targets && typeof targets === "object" && !Array.isArray(targets) && Object.keys(targets).every(f => selected.includes(f)), "Explicit versions must target selected artifact families only.");
  assert(git(root, ["branch", "--show-current"]) === "main", "Candidate source must be on main.");
  assert(git(root, ["status", "--porcelain"]) === "", "Classify and commit source changes before preparing a new candidate.");
  const historyRoot = path.resolve(candidateRoot ?? path.join(root, "dist", "beta"));
  await fs.mkdir(historyRoot, { recursive: true });
  const lockPath = path.join(historyRoot, ".prepare.lock");
  let lock;
  try { lock = await fs.open(lockPath, "wx"); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Another candidate preparation owns the local allocation lock; resume it or retry after completion."); throw error; }
  try {
    await lock.writeFile(JSON.stringify({ schemaVersion: 1, pid: process.pid, token: randomUUID() }));
    await lock.sync();
    const used = await usedCandidateVersions([historyRoot, path.join(root, "dist", "beta-dsh")]);
    const tags = git(root, ["tag", "--list"]).split(/\r?\n/);
    const current = {};
    for (const family of families) {
      const file = family === "cli" ? "package.json" : adapterFiles[family][0];
      try { current[family] = (await read(path.join(root, file))).version; }
      catch (error) { if (error.code !== "ENOENT" || selected.includes(family)) throw error; }
      if (numbers(current[family])) used[family].push(current[family]);
      used[family].push(...(published[family] ?? []));
      const prefix = family === "cli" ? "v" : "v" + family + "-";
      used[family].push(...tags.filter(t => t.startsWith(prefix)).map(t => t.slice(prefix.length)).filter(v => numbers(v)?.length === (family === "cli" ? 3 : 4)));
    }
    let base = current.cli;
    assert(numbers(base)?.length === 3, "Current CLI baseline is required.");
    const versions = {};
    if (selected.includes("cli")) {
      const next = nextCandidateVersion("cli", base, used.cli);
      base = targets.cli ?? next;
      assert(numbers(base)?.length === 3 && compareFormal(base, next) >= 0, "Explicit CLI target must be a new formal version beyond the allocated high water.");
      versions.cli = { version: base };
    }
    for (const family of selected.filter(f => f !== "cli")) {
      const next = nextCandidateVersion(family, base, used[family]);
      const version = targets[family] ?? next;
      assert(numbers(version)?.length === 4 && version.startsWith(base + ".") && compareFormal(version, next) >= 0, "Explicit adapter target must use the selected CLI base and a fresh number.");
      versions[family] = { version, ...(family === "dsh" ? { npmVersion: npmVersionOf(version) } : {}) };
    }
    const documents = {};
    const update = async (name, change, optional = false) => {
      let before; try { before = await fs.readFile(path.join(root, name), "utf8"); }
      catch (error) { if (optional && error.code === "ENOENT") return; throw error; }
      const data = JSON.parse(before); change(data); documents[name] = { before, after: serialize(data) };
    };
    if (versions.cli) {
      for (const file of cliFiles) await update(file, data => {
        data.version = base;
        if (data.dependencies?.["@veewo/claw-core"]) data.dependencies["@veewo/claw-core"] = base;
        if (data.dependencies?.["@veewo/claw-client"]) data.dependencies["@veewo/claw-client"] = base;
        if (data.peerDependencies?.["@veewo/claw"]) data.peerDependencies["@veewo/claw"] = base;
      });
    }
    // Baseline resets are source compatibility updates, not permission to ship
    // every adapter. Never reset a previously allocated coordinate to .0.
    for (const family of families.filter(f => f !== "cli")) {
      const version = versions[family]?.version ?? (versions.cli && current[family] ? nextCandidateVersion(family, base, used[family]) : undefined);
      if (!version) continue;
      for (const file of adapterFiles[family]) await update(file, data => { data.version = version;
        if (family === "openclaw" && data.dependencies?.["@veewo/claw-core"]) data.dependencies["@veewo/claw-core"] = base;
      });
    }
    await update("package-lock.json", data => {
      if (versions.cli) data.version = base;
      for (const [file, change] of Object.entries(documents)) {
        if (!file.endsWith("package.json")) continue;
        const key = file === "package.json" ? "" : path.dirname(file).replaceAll("\\", "/");
        if (data.packages?.[key]) {
          const manifest = JSON.parse(change.after);
          for (const field of ["version", "dependencies", "peerDependencies"]) if (manifest[field] !== undefined) data.packages[key][field] = manifest[field];
        }
      }
    }, true);
    const batch = new Date().toISOString().replaceAll(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
    const directory = path.join(historyRoot, versions.cli?.version ?? base, batch);
    const record = { schemaVersion: 2, state: "preparing", batch, createdAt: new Date().toISOString(), sourceRoot: root, allocationRoot: historyRoot,
      preparationRevision: git(root, ["rev-parse", "HEAD"]), selected, versions,
      sourceFiles: await sourceFiles(root), versionWrites: documents };
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "candidate.json"), serialize(record), { flag: "wx" });
    return await resumeCandidatePreparation(directory, { sourceRoot: root });
  } finally { await lock.close(); await fs.unlink(lockPath); }
}

/** Explicit local interrupted-work recovery. Never reclaim a live or unknown
 * owner, never change candidate content, and never infer upload permission. */
export async function recoverCandidatePreparation(directory, { sourceRoot } = {}) {
  directory = path.resolve(directory);
  const record = await read(path.join(directory, "candidate.json"));
  assert(record.schemaVersion === 2, "Select the version-owned candidate.");
  if (sourceRoot) assert(path.resolve(sourceRoot) === path.resolve(record.sourceRoot), "Candidate belongs to another checkout.");
  const allocationRoot = path.resolve(record.allocationRoot ?? path.dirname(path.dirname(directory)));
  const rel = path.relative(allocationRoot, directory);
  assert(rel && !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep), "Allocation root does not own this candidate.");
  const recovered = [];
  for (const file of [path.join(directory, ".pack.lock"), path.join(allocationRoot, ".prepare.lock")]) {
    let owner; try { owner = await read(file); }
    catch (error) { if (error.code === "ENOENT") continue; throw new Error("Unidentified lock owner; inspect locally rather than guessing: " + file); }
    assert(Number.isSafeInteger(owner.pid) && owner.pid > 0 && typeof owner.token === "string", "Unidentified lock owner.");
    let dead = false;
    try { process.kill(owner.pid, 0); }
    catch (error) { if (error.code === "ESRCH") dead = true; else throw error; }
    assert(dead, "The preparation owner is still alive; do not remove its lock.");
    const current = await read(file);
    assert(current.token === owner.token && current.pid === owner.pid, "Lock ownership changed; do not remove it.");
    await fs.unlink(file); recovered.push(file);
  }
  return { directory, recovered, next: record.state === "frozen" ? "Reuse the verified frozen candidate." : "Resume this exact preparation, then pack after its local source commit." };
}
