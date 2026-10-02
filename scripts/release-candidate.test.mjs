import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exportCodexMarketplace } from "./codex-plugin-bundle.mjs";
import { inventory, verifyCandidate, startTrial, promoteCandidate, packCandidate, installCandidate, packageNames, WEEK_MS } from "./release-candidate.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
async function write(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-beta-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  await fs.mkdir(source);
  git(source, "init", "-b", "main");
  git(source, "config", "user.email", "beta-test@example.invalid");
  git(source, "config", "user.name", "Beta test");
  await write(path.join(source, "source.txt"), "candidate source");
  git(source, "add", ".");
  git(source, "commit", "-m", "candidate");
  const directory = path.join(root, "candidate");
  const artifacts = path.join(directory, "artifacts");
  const codex = await exportCodexMarketplace({ outDir: path.join(artifacts, "marketplace") });
  const version = codex.version.split(".").slice(0, 3).join(".");
  const packages = packageNames.map((name) => ({ name, file: `npm/${name.split("/")[1]}-${version}.tgz` }));
  for (const pkg of packages) await write(path.join(artifacts, pkg.file), `frozen bytes: ${pkg.name}`);
  const candidate = { schemaVersion: 1, batch: "test", version, sourceRevision: git(source, "rev-parse", "HEAD"), createdAt: new Date(Date.now() - 2 * WEEK_MS).toISOString(), packages, codex: { version: codex.version, directory: "marketplace" }, files: await inventory(artifacts) };
  await write(path.join(directory, "candidate.json"), candidate);
  return { root, source, directory, candidate };
}

test("trial starts without installation evidence and enforces seven days", async (t) => {
  const { directory } = await fixture(t);
  const start = Date.now();
  await startTrial(directory, undefined, start);
  await assert.rejects(verifyCandidate(directory, { ready: true, now: start + WEEK_MS - 1 }), /seven days/);
  await verifyCandidate(directory, { ready: true, now: start + WEEK_MS });
  await assert.rejects(startTrial(directory), /EEXIST/);
});

test("changed, missing and added artifacts cannot be promoted", async (t) => {
  const { directory, candidate } = await fixture(t);
  const file = path.join(directory, "artifacts", candidate.packages[0].file);
  const original = await fs.readFile(file);
  await fs.writeFile(file, "different package");
  await assert.rejects(verifyCandidate(directory), /artifacts changed/);
  await fs.rm(file);
  await assert.rejects(verifyCandidate(directory), /artifacts changed/);
  await fs.writeFile(file, original);
  await write(path.join(directory, "artifacts", "extra"), "extra");
  await assert.rejects(verifyCandidate(directory), /artifacts changed/);
});

test("manifest changes invalidate the recorded trial", async (t) => {
  const { directory, candidate } = await fixture(t);
  await startTrial(directory, undefined, Date.now() - WEEK_MS);
  await write(path.join(directory, "candidate.json"), { ...candidate, batch: "replacement" });
  await assert.rejects(verifyCandidate(directory, { ready: true }), /Trial does not identify/);
});

test("formal verification rejects changed source before remote operations", async (t) => {
  const { source, directory } = await fixture(t);
  await startTrial(directory, undefined, Date.now() - WEEK_MS);
  await promoteCandidate(directory, { sourceRoot: source }); // No remote needed for dry verification.
  await write(path.join(source, "source.txt"), "changed");
  await assert.rejects(promoteCandidate(directory, { sourceRoot: source, publish: true }), /Commit useful changes/);
});

test("promotion uploads original tarballs in dependency order and pushes only after retrieval", async (t) => {
  const { root, source, directory, candidate } = await fixture(t);
  const remote = path.join(root, "remote.git");
  git(root, "init", "--bare", remote);
  git(source, "remote", "add", "origin", remote);
  git(source, "push", "origin", "main");
  // Candidate remains local until all registry retrieval checks have succeeded.
  await write(path.join(source, "source.txt"), "new beta source");
  git(source, "commit", "-am", "local beta");
  candidate.sourceRevision = git(source, "rev-parse", "HEAD");
  await write(path.join(directory, "candidate.json"), candidate);
  await startTrial(directory, undefined, Date.now() - WEEK_MS);
  const fakeNpm = path.join(root, "npm.mjs");
  await write(fakeNpm, `import fs from 'node:fs'; import path from 'node:path';
const root=${JSON.stringify(root)}; const c=${JSON.stringify(candidate)}; const dir=${JSON.stringify(directory)};
const args=process.argv.slice(2); fs.appendFileSync(path.join(root,'calls.jsonl'),JSON.stringify(args)+'\\n');
if(args[0]==='view' && args[2]==='dist.integrity'){ console.log(JSON.stringify({error:{code:'E404'}}));process.exit(1); }
if(args[0]==='view'){console.log(JSON.stringify(c.version));}
else if(args[0]==='publish'){if(!args.includes('--ignore-scripts') || !fs.existsSync(args[1]))process.exit(2);}
else if(args[0]==='pack'){const p=c.packages.find(p=>args[1]===p.name+'@'+c.version);const dest=args[args.indexOf('--pack-destination')+1];const filename=path.basename(p.file);fs.copyFileSync(path.join(dir,'artifacts',p.file),path.join(dest,filename));if(fs.existsSync(path.join(root,'corrupt')))fs.writeFileSync(path.join(dest,filename),'wrong');console.log(JSON.stringify([{filename}]));}
else {throw Error('unexpected command '+args.join(' '));}`);
  const previous = process.env.npm_execpath;
  process.env.npm_execpath = fakeNpm;
  t.after(() => { if (previous === undefined) delete process.env.npm_execpath; else process.env.npm_execpath = previous; });
  await write(path.join(root, "corrupt"), "yes");
  await assert.rejects(promoteCandidate(directory, { sourceRoot: source, publish: true }), /Registry bytes differ/);
  assert.notEqual(git(remote, "rev-parse", "main"), candidate.sourceRevision);
  await fs.rm(path.join(root, "corrupt"));
  await fs.rm(path.join(root, "calls.jsonl"));
  await promoteCandidate(directory, { sourceRoot: source, publish: true });
  assert.equal(git(remote, "rev-parse", "main"), candidate.sourceRevision);
  const calls = (await fs.readFile(path.join(root, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls.filter(([op]) => op === "publish").map((args) => args[1]), candidate.packages.map((pkg) => path.join(directory, "artifacts", pkg.file)));
  assert.ok(calls.every(([op]) => ["publish", "pack", "view"].includes(op)));
  assert.ok(calls.filter(([op]) => op === "pack").every((args) => !args.includes("--workspace")));
});

test("real npm packing and local installation preserve candidate bytes without a remote", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-beta-pack-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  // Small npm workspaces exercise real pack/install; Codex uses actual source inputs.
  for (const relative of [".agents/skills", ".agents/plugins", "shared", "packages/codex-adapter"]) {
    await fs.cp(path.join(repo, relative), path.join(root, relative), { recursive: true, filter: (name) => !["node_modules", "dist", ".git"].includes(path.basename(name)) });
  }
  const { version } = JSON.parse(await fs.readFile(path.join(repo, "package.json")));
  const noop = 'node -e ""';
  await write(path.join(root, "package.json"), { name: "beta-fixture", private: true, version, workspaces: ["packages/core", "packages/client", "packages/cli"], scripts: { "check:template-versions": noop, "check:skill-sources": noop } });
  await write(path.join(root, ".gitignore"), "dist/\nnode_modules/\n");
  for (const [index, folder] of ["core", "client", "cli"].entries()) {
    await write(path.join(root, "packages", folder, "package.json"), { name: packageNames[index], version, scripts: { build: noop }, ...(folder === "client" ? { peerDependencies: { "@veewo/claw": version }, peerDependenciesMeta: { "@veewo/claw": { optional: true } } } : {}), ...(folder === "cli" ? { bin: { claw: "dist/bin.js" }, dependencies: { "@veewo/claw-core": version, "@veewo/claw-client": version } } : {}) });
    if (folder === "cli") await write(path.join(root, "packages", folder, "dist", "bin.js"), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(version)});\n`);
  }
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "beta-test@example.invalid");
  git(root, "config", "user.name", "Beta test");
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture");
  const directory = await packCandidate({ sourceRoot: root });
  const before = (await verifyCandidate(directory)).candidate.files;
  const installed = await installCandidate(directory);
  assert.equal(installed.version, version);
  assert.deepEqual((await verifyCandidate(directory)).candidate.files, before);
  assert.equal(git(root, "remote"), "");
});
