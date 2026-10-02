import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  assert(candidate.schemaVersion === 1 && /^\d+\.\d+\.\d+$/.test(candidate.version), "Invalid candidate format/version.");
  assert(/^[a-f0-9]{40,64}$/.test(candidate.sourceRevision), "Invalid source revision.");
  assert(candidate.packages?.length === packageNames.length && candidate.packages.every((pkg, i) => pkg.name === packageNames[i] && pkg.file === `npm/${pkg.name.split("/")[1]}-${candidate.version}.tgz`), "Invalid candidate package list.");
  assert(candidate.codex?.directory === "marketplace" && /^\d+\.\d+\.\d+\.\d+$/.test(candidate.codex.version) && candidate.codex.version.startsWith(`${candidate.version}.`), "Invalid Codex candidate.");
  const actual = await inventory(path.join(directory, "artifacts"));
  assert(JSON.stringify(actual) === JSON.stringify(candidate.files), "Candidate artifacts changed. Create a new beta batch and restart testing.");
  for (const pkg of candidate.packages) assert(actual[pkg.file], `Missing ${pkg.file}`);
  const pluginDir = path.join(directory, "artifacts", "marketplace", "packages", "codex-adapter");
  const plugin = await json(path.join(pluginDir, ".codex-plugin", "plugin.json"));
  assert(plugin.version === candidate.codex.version, "Codex version does not match candidate.");
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

export async function packCandidate({ sourceRoot = repoRoot } = {}) {
  const sourceRevision = cleanMain(sourceRoot);
  const manifests = await Promise.all(["package.json", "packages/core/package.json", "packages/client/package.json", "packages/cli/package.json"].map((name) => json(path.join(sourceRoot, name))));
  const [root, core, client, cli] = manifests;
  const version = root.version;
  assert(/^\d+\.\d+\.\d+$/.test(version) && manifests.every((pkg) => pkg.version === version), "Beta must use the intended aligned stable version, without a prerelease suffix.");
  assert(core.name === packageNames[0] && client.name === packageNames[1] && cli.name === packageNames[2], "Unexpected package identity.");
  assert(cli.dependencies?.[packageNames[0]] === version && cli.dependencies?.[packageNames[1]] === version && client.peerDependencies?.[packageNames[2]] === version, "Internal version pins must match the candidate.");
  npm(["run", "check:template-versions"], sourceRoot);
  npm(["run", "check:skill-sources"], sourceRoot);
  for (const name of packageNames) npm(["run", "build", "-w", name], sourceRoot);
  const batch = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const directory = path.join(sourceRoot, "dist", "beta", version, batch);
  const artifacts = path.join(directory, "artifacts");
  await fs.mkdir(path.join(artifacts, "npm"), { recursive: true });
  // A failed build/export leaves no candidate.json, so it can never be promoted.
  const packages = [];
  for (const name of packageNames) {
    const [packed] = JSON.parse(npm(["pack", "--workspace", name, "--ignore-scripts", "--json", "--pack-destination", path.join(artifacts, "npm")], sourceRoot));
    assert(packed.name === name && packed.version === version, `Unexpected packed identity: ${name}`);
    const filename = `${name.split("/")[1]}-${version}.tgz`;
    await fs.rename(path.join(artifacts, "npm", packed.filename), path.join(artifacts, "npm", filename));
    packages.push({ name, file: `npm/${filename}` });
  }
  const codex = await exportCodexMarketplace({ sourceRoot, outDir: path.join(artifacts, "marketplace") });
  assert(codex.version.startsWith(`${version}.`), "Codex must target the beta CLI version.");
  cleanMain(sourceRoot, sourceRevision);
  const candidate = { schemaVersion: 1, batch, version, sourceRevision, createdAt: new Date().toISOString(), packages, codex: { version: codex.version, directory: "marketplace" }, files: await inventory(artifacts) };
  await fs.writeFile(path.join(directory, "candidate.json"), `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  await verifyCandidate(directory);
  return directory;
}

export async function installCandidate(directory) {
  directory = path.resolve(directory);
  const candidate = await json(path.join(directory, "candidate.json"));
  assert(/^\d+\.\d+\.\d+$/.test(candidate.version), "Invalid candidate version.");
  const runtime = path.join(directory, "runtime");
  await fs.mkdir(runtime, { recursive: true });
  await fs.writeFile(path.join(runtime, "package.json"), JSON.stringify({ private: true, dependencies: Object.fromEntries(packageNames.map((name) => [name, `file:${path.join(directory, "artifacts", "npm", `${name.split("/")[1]}-${candidate.version}.tgz`).replaceAll("\\", "/")}`])) }, null, 2));
  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], runtime);
  const bin = path.join(runtime, "node_modules", "@veewo", "claw", "dist", "bin.js");
  assert(run(process.execPath, [bin, "--version"], runtime) === candidate.version, "Installed beta CLI version mismatch.");
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
export async function promoteCandidate(directory, { publish = false, sourceRoot = repoRoot } = {}) {
  const verified = await verifyCandidate(directory, { ready: true });
  const { candidate } = verified;
  cleanMain(sourceRoot, candidate.sourceRevision);
  await readCodexPluginSource({ sourceDir: path.join(verified.directory, "artifacts", "marketplace", "packages", "codex-adapter") });
  if (!publish) return verified;
  assert(process.env.npm_execpath, "Run publication through npm run publish:release.");
  run("git", ["fetch", "origin", "main"], sourceRoot);
  run("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"], sourceRoot);
  // Preflight every package before mutating the registry. E404 alone means absent.
  const published = [];
  for (const pkg of candidate.packages) {
    try {
      const metadata = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, "view", `${pkg.name}@${candidate.version}`, "dist.integrity", "--json", `--registry=${registry}`], { cwd: sourceRoot, encoding: "utf8", stdio: "pipe" }));
      const bytes = await fs.readFile(path.join(verified.directory, "artifacts", pkg.file));
      assert(metadata === `sha512-${createHash("sha512").update(bytes).digest("base64")}`, `${pkg.name}@${candidate.version} already exists with different bytes. Select a new version and beta batch.`);
      published.push(pkg.name);
    } catch (error) {
      let code;
      try { code = JSON.parse(String(error.stdout)).error?.code; } catch { /* Preserve the original error. */ }
      if (code !== "E404") throw error;
    }
  }
  for (const pkg of candidate.packages) {
    await verifyCandidate(directory, { ready: true });
    if (!published.includes(pkg.name)) npm(["publish", path.join(verified.directory, "artifacts", pkg.file), "--ignore-scripts", "--access", "public", "--tag", "latest", `--registry=${registry}`], sourceRoot);
    // Retrieval is checked before any GitHub push. Exact matches allow safe resume.
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "claw-beta-retrieval-"));
    try {
      const [packed] = JSON.parse(npm(["pack", `${pkg.name}@${candidate.version}`, "--ignore-scripts", "--json", "--pack-destination", temp, `--registry=${registry}`], temp));
      assert(digest(await fs.readFile(path.join(temp, packed.filename))) === candidate.files[pkg.file], `Registry bytes differ for ${pkg.name}. Stop before GitHub publication.`);
      assert(JSON.parse(npm(["view", pkg.name, "dist-tags.latest", "--json", `--registry=${registry}`], temp)) === candidate.version, `latest differs for ${pkg.name}; resolve explicitly before GitHub publication.`);
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  }
  cleanMain(sourceRoot, candidate.sourceRevision);
  run("git", ["push", "origin", "main"], sourceRoot);
  run("git", ["fetch", "origin", "main"], sourceRoot);
  assert(run("git", ["rev-parse", "origin/main"], sourceRoot) === candidate.sourceRevision, "Remote main changed; resolve before releasing GitHub artifacts.");
  return verified;
}

export async function main(args = process.argv.slice(2)) {
  const [operation, ...options] = args;
  const allowed = operation === "start-test" ? ["--candidate", "--evidence"] : ["--candidate"];
  const parsed = {};
  for (let i = 0; i < options.length; i += 2) {
    assert(allowed.includes(options[i]) && options[i + 1] && !options[i + 1].startsWith("--") && !(options[i] in parsed), "Invalid beta arguments.");
    parsed[options[i]] = options[i + 1];
  }
  if (operation === "pack") {
    assert(options.length === 0, "pack takes no arguments; output is dist/beta/<version>/<batch>.");
    console.log(await packCandidate());
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
