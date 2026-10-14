import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareCandidateVersions, resumeCandidatePreparation, readPreparedCandidate, recoverCandidatePreparation, families } from "./candidate-versions.mjs";
import { packDshPluginArtifact, exportHostPluginArtifact, npmVersionOf } from "./host-plugin-artifacts.mjs";
import { publishFrozenNpmResource } from "./frozen-npm-promotion.mjs";
import { buildCindyPluginArtifact } from "./cindy-plugin-artifact.mjs";
import { buildSharedSkillsArtifact } from "./shared-skills-artifact.mjs";
import { exportCodexMarketplace, readCodexPluginSource } from "./codex-plugin-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const packageNames = ["@veewo/claw-core", "@veewo/claw-client", "@veewo/claw"];
const registry = "https://registry.npmjs.org";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (command, args, cwd = repoRoot) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
function npm(args, cwd = repoRoot) {
  assert(process.env.npm_execpath, "Run this command through an npm script.");
  return run(process.execPath, [process.env.npm_execpath, ...args], cwd);
}

// Hash every artifact file, including hidden marketplace metadata. Never follow links.
export async function inventory(root, relative = "") {
  const result = {};
  for (const entry of (await fs.readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), `Candidate contains a link: ${name}`);
    if (entry.isDirectory()) Object.assign(result, await inventory(root, name));
    else {
      assert(entry.isFile(), `Candidate contains a non-file: ${name}`);
      result[name] = digest(await fs.readFile(path.join(root, name)));
    }
  }
  return result;
}

function cleanMain(sourceRoot, expectedRevision) {
  assert(run("git", ["branch", "--show-current"], sourceRoot) === "main", "Candidate source must be on main.");
  assert(run("git", ["status", "--porcelain"], sourceRoot) === "", "Commit useful changes locally, remove disposable output, and ignore local artifacts before packing/releasing. Do not push or stash for beta.");
  const revision = run("git", ["rev-parse", "HEAD"], sourceRoot);
  if (expectedRevision) assert(revision === expectedRevision, "Source changed since beta. Select its exact source checkout or create and test a new candidate.");
  return revision;
}

export async function verifyCandidate(directory, { ready = false, now = Date.now() } = {}) {
  directory = path.resolve(directory);
  const manifestBytes = await fs.readFile(path.join(directory, "candidate.json"));
  const candidate = JSON.parse(manifestBytes);
  assert([1, 2].includes(candidate.schemaVersion) && /^\d+\.\d+\.\d+$/.test(candidate.version), "Invalid candidate format/version.");
  if (candidate.schemaVersion === 2) assert(candidate.state === "frozen", "Preparation is not a frozen, installable candidate.");
  assert(/^[a-f0-9]{40,64}$/.test(candidate.sourceRevision), "Invalid source revision.");
  const hasCli = candidate.schemaVersion === 1 || candidate.selected?.includes("cli");
  assert(candidate.packages?.length === (hasCli ? packageNames.length : 0) && candidate.packages.every((pkg, i) => pkg.name === packageNames[i] && pkg.file === `npm/${pkg.name.split("/")[1]}-${candidate.version}.tgz`), "Invalid candidate package list.");
  if (candidate.schemaVersion === 1 || candidate.codex) assert(candidate.codex?.directory === "marketplace" && /^\d+\.\d+\.\d+\.\d+$/.test(candidate.codex.version) && candidate.codex.version.startsWith(`${candidate.version}.`), "Invalid Codex candidate.");
  const actual = await inventory(path.join(directory, "artifacts"));
  assert(JSON.stringify(actual) === JSON.stringify(candidate.files), "Candidate artifacts changed. Create a new beta batch and restart testing.");
  for (const pkg of candidate.packages) assert(actual[pkg.file], `Missing ${pkg.file}`);
  if (candidate.codex) {
    const pluginDir = path.join(directory, "artifacts", "marketplace", "packages", "codex-adapter");
    const plugin = await json(path.join(pluginDir, ".codex-plugin", "plugin.json"));
    assert(plugin.version === candidate.codex.version, "Codex version does not match candidate.");
  }
  if (candidate.schemaVersion === 2) {
    assert(Array.isArray(candidate.selected) && candidate.selected.length && candidate.selected.every(f => families.includes(f)) && new Set(candidate.selected).size === candidate.selected.length, "Invalid selected artifacts.");
    assert(Object.keys(candidate.artifacts ?? {}).length === candidate.selected.length, "Missing artifact owner entries.");
    for (const family of candidate.selected) {
      const entry = candidate.artifacts[family];
      assert(entry && entry.version === candidate.versions?.[family]?.version, "Artifact version differs: " + family);
      if (family !== "cli") assert(entry.version.startsWith(candidate.version + ".") && /^\d+\.\d+\.\d+\.\d+$/.test(entry.version), "Invalid adapter version.");
      if (entry.directory) assert(Object.keys(actual).some(file => file.startsWith(entry.directory + "/")), "Missing frozen artifact directory.");
      if (family === "cli") assert(entry.version === candidate.version, "CLI artifact baseline differs.");
      if (family === "dsh") assert(entry.npmVersion === npmVersionOf(entry.version) && actual[entry.file], "Invalid frozen DSH identity.");
      if (family === "cindy" && entry.sharedSkills) {
        assert(entry.sharedSkills.name === "@veewo/claw-skills" && actual[entry.sharedSkills.file], "Missing frozen shared skills package.");
        const contract = await json(path.join(directory, "artifacts", entry.directory, "plugin/node/shared-skills-contract.json"));
        assert(contract.version === entry.sharedSkills.version && contract.sourceHash === entry.sharedSkills.sourceHash, "Cindy shared skills contract differs from frozen package.");
      }
    }
  }
  const manifestHash = digest(manifestBytes);
  if (ready) {
    const trial = await json(path.join(directory, "trial.json"));
    const started = Date.parse(trial.startedAt);
    assert(trial.candidateHash === manifestHash, "Trial does not identify this candidate.");
    assert(Number.isFinite(started) && started >= Date.parse(candidate.createdAt) && now - started >= WEEK_MS, "This beta has not completed seven days of testing.");
  }
  return { candidate, directory, manifestHash };
}

export async function startTrial(directory, evidence = "Versions confirmed; local trial started.", now = Date.now()) {
  const { manifestHash } = await verifyCandidate(directory);
  const trial = { candidateHash: manifestHash, startedAt: new Date(now).toISOString(), evidence };
  await fs.writeFile(path.join(directory, "trial.json"), `${JSON.stringify(trial, null, 2)}\n`, { flag: "wx" });
  return trial;
}

export async function packCandidate({ sourceRoot = repoRoot, directory } = {}) {
  assert(directory, "Prepare and commit a new version first; supply pack --candidate <directory>.");
  directory = path.resolve(directory);
  const existing = await json(path.join(directory, "candidate.json"));
  if (existing.state === "frozen" || existing.schemaVersion === 1) { await verifyCandidate(directory); return directory; }
  const sourceRevision = cleanMain(sourceRoot);
  const preparation = await readPreparedCandidate(directory, sourceRoot);
  const selected = preparation.selected, versions = preparation.versions;
  const version = (await json(path.join(sourceRoot, "package.json"))).version;
  const artifacts = path.join(directory, "artifacts");
  const lockPath = path.join(directory, ".pack.lock");
  const lock = await fs.open(lockPath, "wx");
  try {
    await lock.writeFile(JSON.stringify({ schemaVersion: 1, pid: process.pid, token: directory + ":" + process.pid + ":" + Date.now() }));
    await lock.sync();
    const lockedRecord = await json(path.join(directory, "candidate.json"));
    if (lockedRecord.state === "frozen") { await verifyCandidate(directory); return directory; }
    assert(JSON.stringify(lockedRecord) === JSON.stringify(preparation), "Candidate preparation changed while acquiring its pack lock.");
    // Only an unfinished, exact-input preparation may reconstruct partial output.
    assert(path.dirname(artifacts) === directory, "Invalid candidate output.");
    await fs.rm(artifacts, { recursive: true, force: true });
    await fs.mkdir(artifacts, { recursive: true });
    npm(["run", "check:template-versions"], sourceRoot);
    npm(["run", "check:skill-sources"], sourceRoot);
    const packages = [], outputs = {};
    if (selected.includes("cli")) {
      const manifests = await Promise.all(["package.json", "packages/core/package.json", "packages/client/package.json", "packages/cli/package.json"].map(name => json(path.join(sourceRoot, name))));
      const [, core, client, cli] = manifests;
      assert(version === versions.cli.version && manifests.every(pkg => pkg.version === version), "Prepared CLI versions differ.");
      assert(core.name === packageNames[0] && client.name === packageNames[1] && cli.name === packageNames[2], "Unexpected package identity.");
      assert(cli.dependencies?.[packageNames[0]] === version && cli.dependencies?.[packageNames[1]] === version && client.peerDependencies?.[packageNames[2]] === version, "Internal pins differ.");
      await fs.mkdir(path.join(artifacts, "npm"));
      for (const name of packageNames) {
        npm(["run", "build", "-w", name], sourceRoot);
        const [packed] = JSON.parse(npm(["pack", "--workspace", name, "--ignore-scripts", "--json", "--pack-destination", path.join(artifacts, "npm")], sourceRoot));
        assert(packed.name === name && packed.version === version, "Unexpected packed identity.");
        const file = "npm/" + name.split("/")[1] + "-" + version + ".tgz";
        await fs.rename(path.join(artifacts, "npm", packed.filename), path.join(artifacts, file));
        packages.push({ name, file });
      }
      outputs.cli = { version, packages };
    }
    if (selected.includes("codex")) {
      const codex = await exportCodexMarketplace({ sourceRoot, outDir: path.join(artifacts, "marketplace") });
      assert(codex.version === versions.codex.version, "Prepared Codex version differs.");
      outputs.codex = { version: codex.version, directory: "marketplace" };
    }
    for (const family of selected.filter(f => !["cli", "codex"].includes(f))) {
      const manifest = await json(path.join(sourceRoot, "packages", family + "-adapter", "package.json"));
      assert(manifest.version === versions[family].version, "Prepared adapter version differs: " + family);
      if (family === "dsh") {
        npm(["run", "build", "-w", "@veewo/dsh-claw-kit"], sourceRoot);
        const packed = await packDshPluginArtifact({ sourceRoot, outDir: path.join(artifacts, "dsh") });
        outputs.dsh = { version: packed.gitVersion, npmVersion: packed.npmVersion, file: "dsh/" + path.basename(packed.tarball) };
      } else {
        if (family !== "cindy") npm(["run", "build", "-w", "@claw-kit/" + family + "-adapter"], sourceRoot);
        const outputRoot = path.join(artifacts, family);
        if (family === "cindy") await buildCindyPluginArtifact({ sourceRoot, outputRoot });
        else await exportHostPluginArtifact({ sourceRoot, targetHost: family, outputRoot });
        outputs[family] = { version: manifest.version, directory: family };
        if (family === "cindy") {
          const sharedRoot = path.join(artifacts, "shared-skills");
          const shared = await buildSharedSkillsArtifact({ sourceRoot, outputRoot: sharedRoot });
          const [packed] = JSON.parse(npm(["pack", sharedRoot, "--ignore-scripts", "--json", "--pack-destination", artifacts], sourceRoot));
          outputs.cindy.sharedSkills = { name: shared.manifest.name, version: shared.manifest.version, file: packed.filename, sourceHash: shared.manifest.sourceHash };
        }
      }
    }
    cleanMain(sourceRoot, sourceRevision);
    await readPreparedCandidate(directory, sourceRoot);
    const candidate = { schemaVersion: 2, state: "frozen", batch: preparation.batch, version, versions, selected,
      sourceRevision, createdAt: new Date().toISOString(), packages,
      ...(outputs.codex ? { codex: outputs.codex } : {}), artifacts: outputs, files: await inventory(artifacts) };
    const temporary = path.join(directory, "candidate.json.tmp-" + process.pid + "-" + Date.now());
    await fs.writeFile(temporary, JSON.stringify(candidate, null, 2) + "\n", { flag: "wx" });
    await fs.rename(temporary, path.join(directory, "candidate.json"));
    await verifyCandidate(directory);
    return directory;
  } finally { await lock.close(); await fs.unlink(lockPath); }
}

export async function installCandidate(directory) {
  directory = path.resolve(directory);
  const { candidate } = await verifyCandidate(directory);
  assert(candidate.packages.length === packageNames.length, "Use the host installer for adapter-only candidates.");
  const runtime = path.join(directory, "runtime");
  await fs.mkdir(runtime, { recursive: true });
  await fs.writeFile(path.join(runtime, "package.json"), JSON.stringify({ private: true, dependencies: Object.fromEntries(packageNames.map((name) => [name, `file:${path.join(directory, "artifacts", "npm", `${name.split("/")[1]}-${candidate.version}.tgz`).replaceAll("\\", "/")}`])) }, null, 2));
  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], runtime);
  const bin = path.join(runtime, "node_modules", "@veewo", "claw", "dist", "bin.js");
  assert(run(process.execPath, [bin, "--version"], runtime) === candidate.version, "Installed beta CLI version mismatch.");
  if (!candidate.codex) return { version: candidate.version, binDirectory: path.join(runtime, "node_modules", ".bin"), next: "Confirm CLI version; no Codex artifact was selected." };
  // The test registration has its own identity; preserve the frozen official catalog.
  const localMarketplace = path.join(runtime, "marketplace");
  await fs.cp(path.join(directory, "artifacts", "marketplace"), localMarketplace, { recursive: true });
  const catalogPath = path.join(localMarketplace, ".agents", "plugins", "marketplace.json");
  const catalog = await json(catalogPath);
  catalog.name = "claw-kit-beta";
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { version: candidate.version, pluginVersion: candidate.codex.version, binDirectory: path.join(runtime, "node_modules", ".bin"), marketplace: localMarketplace, identity: "claw-kit@claw-kit-beta", next: "Install this local marketplace using the host's plugin installer and confirm the CLI and plugin versions." };
}

// Remote publication is reachable only from the explicit formal-release entrypoint.
export async function verifyCliPromotionCandidate(directory, { trialWaiver } = {}) {
  assert(trialWaiver === undefined || typeof trialWaiver === "string" && trialWaiver.trim().length > 0,
    "Trial waiver requires the owner's explicit authorization evidence.");
  const verified = await verifyCandidate(directory, { ready: trialWaiver === undefined });
  assert(verified.candidate.packages.length === packageNames.length, "CLI promotion requires the CLI artifact family.");
  if (trialWaiver !== undefined) {
    const waiverPath = path.join(verified.directory, "trial-waiver-cli.json");
    const waiver = { schemaVersion: 1, candidateHash: verified.manifestHash,
      identities: packageNames.map(name => name + "@" + verified.candidate.version),
      authorizedAt: new Date().toISOString(), evidence: trialWaiver.trim() };
    try { await fs.writeFile(waiverPath, JSON.stringify(waiver, null, 2) + "\n", { flag: "wx" }); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await json(waiverPath);
      assert(existing.candidateHash === waiver.candidateHash && existing.evidence === waiver.evidence
        && JSON.stringify(existing.identities) === JSON.stringify(waiver.identities),
        "Existing CLI trial waiver differs from this candidate or authorization.");
    }
  }
  return verified;
}

export async function promoteCandidate(directory, { publish = false, sourceRoot = repoRoot, trialWaiver } = {}) {
  const verified = await verifyCliPromotionCandidate(directory, { trialWaiver });
  const { candidate } = verified;
  cleanMain(sourceRoot, candidate.sourceRevision);
  if (candidate.codex) await readCodexPluginSource({ sourceDir: path.join(verified.directory, "artifacts", "marketplace", "packages", "codex-adapter") });
  if (!publish) return verified;
  assert(candidate.packages.length === packageNames.length, "Use the artifact-specific promotion owner for adapter-only candidates.");
  assert(process.env.npm_execpath, "Run publication through npm run publish:release.");
  run("git", ["fetch", "origin", "main"], sourceRoot);
  run("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"], sourceRoot);
  for (const pkg of candidate.packages) {
    await verifyCliPromotionCandidate(directory, { trialWaiver });
    await publishFrozenNpmResource({ directory: verified.directory, candidateHash: verified.manifestHash,
      identity: pkg.name + "@" + candidate.version,
      tarball: path.join(verified.directory, "artifacts", pkg.file), expectedHash: candidate.files[pkg.file],
      receiptName: "promotion-" + pkg.name.split("/")[1] + ".json",
      runNpm: args => npm(args, sourceRoot) });
    assert(JSON.parse(npm(["view", pkg.name, "dist-tags.latest", "--json", "--registry=" + registry], sourceRoot)) === candidate.version,
      "latest differs; resolve explicitly before GitHub publication.");
  }
  cleanMain(sourceRoot, candidate.sourceRevision);
  run("git", ["push", "origin", "main"], sourceRoot);
  run("git", ["fetch", "origin", "main"], sourceRoot);
  assert(run("git", ["rev-parse", "origin/main"], sourceRoot) === candidate.sourceRevision, "Remote main changed; resolve before releasing GitHub artifacts.");
  return verified;
}

export async function main(args = process.argv.slice(2)) {
  const [operation, ...options] = args;
  const allowed = operation === "prepare" ? ["--artifacts", "--versions", "--known-versions", "--cindy-artifact-root"] : operation === "start-test" ? ["--candidate", "--evidence"] : ["--candidate"];
  const parsed = {};
  for (let i = 0; i < options.length; i += 2) {
    assert(allowed.includes(options[i]) && options[i + 1] && !options[i + 1].startsWith("--") && !(options[i] in parsed), "Invalid beta arguments.");
    parsed[options[i]] = options[i + 1];
  }
  if (operation === "prepare") {
    const selected = parsed["--artifacts"]?.split(",") ?? ["cli", "codex"];
    const published = parsed["--known-versions"] ? await json(path.resolve(parsed["--known-versions"])) : {};
    assert(published && typeof published === "object" && !Array.isArray(published) && Object.entries(published).every(([family, values]) => families.includes(family) && Array.isArray(values) && values.every(value => /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value))), "Known version facts must map artifact families to formal version arrays.");
    // Published versions are allocation facts, not permission preflights.
    // Owner/local candidates still provide a high water if a read is unavailable.
    for (const family of ["cli", ...(selected.includes("dsh") ? ["dsh"] : [])]) {
      try {
        const name = family === "cli" ? "@veewo/claw" : "@veewo/dsh-claw-kit";
        const values = JSON.parse(npm(["view", name, "versions", "--json", "--registry=" + registry]));
        published[family] = [...(published[family] ?? []), ...(Array.isArray(values) ? values : [values]).map(value => family === "dsh"
          ? String(value).replace(/^(\d+\.\d+\.\d+)-rc\.(\d+)$/, "$1.$2") : value)];
      } catch { console.warn("Published " + family + " version read unavailable; allocating from known source/local history, not authorizing any publication."); }
    }
    try {
      const remoteTags = run("git", ["ls-remote", "--tags", "origin"], repoRoot).split(/\r?\n/);
      for (const family of selected.filter(f => !["cli", "cindy"].includes(f))) {
        const prefix = "refs/tags/v" + family + "-";
        published[family] = [...(published[family] ?? []), ...remoteTags.map(line => line.split("\t")[1]).filter(ref => ref?.startsWith(prefix) && !ref.endsWith("^{}" )).map(ref => ref.slice(prefix.length))];
      }
    } catch { console.warn("Remote tag read unavailable; known local candidate numbers remain reserved."); }
    if (selected.includes("cindy")) {
      try {
        // vcindy belongs to its artifact repository, not source origin.
        const refs = parsed["--cindy-artifact-root"]
          ? run("git", ["tag", "--list", "vcindy-*"], path.resolve(parsed["--cindy-artifact-root"])).split(/\r?\n/)
          : run("git", ["ls-remote", "--tags", "https://github.com/chanyuenpang/claw-kit-cindy-adapter.git"], repoRoot).split(/\r?\n/).map(line => line.split("\t")[1]?.replace("refs/tags/", ""));
        published.cindy = [...(published.cindy ?? []), ...refs.filter(ref => ref?.startsWith("vcindy-") && !ref.endsWith("^{}" )).map(ref => ref.slice("vcindy-".length))];
      } catch { console.warn("Cindy artifact tag read unavailable; supply --known-versions or --cindy-artifact-root to include additional known artifact allocations."); }
    }
    const targets = parsed["--versions"] ? JSON.parse(parsed["--versions"]) : {};
    const prepared = await prepareCandidateVersions({ sourceRoot: repoRoot, artifacts: selected, published, targets });
    console.log(JSON.stringify({ directory: prepared.directory, versions: prepared.record.versions, next: prepared.next }, null, 2));
    return;
  }
  if (operation === "recover") {
    assert(parsed["--candidate"], "Supply --candidate <directory>.");
    console.log(JSON.stringify(await recoverCandidatePreparation(parsed["--candidate"], { sourceRoot: repoRoot }), null, 2));
    return;
  }
  if (operation === "resume") {
    assert(parsed["--candidate"], "Supply --candidate <preparing-directory>.");
    const prepared = await resumeCandidatePreparation(parsed["--candidate"], { sourceRoot: repoRoot });
    console.log(JSON.stringify({ directory: prepared.directory, versions: prepared.record.versions, next: prepared.next }, null, 2));
    return;
  }
  if (operation === "pack") {
    assert(parsed["--candidate"], "Prepare and commit a new version first; supply --candidate <directory>.");
    console.log(await packCandidate({ directory: parsed["--candidate"] }));
    return;
  }
  assert(parsed["--candidate"], "Supply --candidate <directory>.");
  if (operation === "verify") console.log(JSON.stringify(await verifyCandidate(parsed["--candidate"]), null, 2));
  else if (operation === "install") console.log(JSON.stringify(await installCandidate(parsed["--candidate"]), null, 2));
  else if (operation === "start-test") console.log(JSON.stringify(await startTrial(parsed["--candidate"], parsed["--evidence"]), null, 2));
  else throw new Error("Use pack, verify, install, or start-test. Beta commands never publish or push.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
