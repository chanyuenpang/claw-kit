import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepareCandidateVersions, resumeCandidatePreparation, nextCandidateVersion, usedCandidateVersions, recoverCandidatePreparation, families } from "./candidate-versions.mjs";
const git = (root, ...args) => execFileSync("git", args, { cwd: root, stdio: "pipe", encoding: "utf8" }).trim();
const json = async file => JSON.parse(await fs.readFile(file, "utf8"));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claw-version-owner-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, value) => { const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
  await write("package.json", { name: "fixture", version: "0.2.43" });
  for (const name of ["core", "client", "cli"]) await write("packages/" + name + "/package.json", { name: "@veewo/claw-" + name, version: "0.2.43",
    ...(name === "cli" ? { dependencies: { "@veewo/claw-core": "0.2.43", "@veewo/claw-client": "0.2.43" } } : {}),
    ...(name === "client" ? { peerDependencies: { "@veewo/claw": "0.2.43" } } : {}) });
  for (const name of families.filter(f => f !== "cli")) await write("packages/" + name + "-adapter/package.json", { name, version: "0.2.43.0",
    ...(name === "openclaw" ? { dependencies: { "@veewo/claw-core": "0.2.43" } } : {}) });
  await write("packages/codex-adapter/.codex-plugin/plugin.json", { version: "0.2.43.0" });
  await write("packages/openclaw-adapter/openclaw.plugin.json", { version: "0.2.43.0" });
  await write("packages/cindy-adapter/plugin/ghost.json", { version: "0.2.43.0" });
  await write("package-lock.json", { version: "0.2.43", packages: { "": { version: "0.2.43" }, "packages/cli": { version: "0.2.43" } } });
  await fs.mkdir(path.join(root, ".agents/skills/using-claw-kit/references/hosts"), { recursive: true });
  await fs.writeFile(path.join(root, ".agents/skills/using-claw-kit/references/hosts/codex.md"), 'const pluginVersion = "0.2.43.0";\n');
  await fs.writeFile(path.join(root, "implementation.txt"), "same inputs");
  await fs.writeFile(path.join(root, ".gitignore"), "dist/\n");
  git(root, "init", "-b", "main"); git(root, "config", "user.email", "test@example.invalid"); git(root, "config", "user.name", "Test");
  const commit = () => { git(root, "add", "."); git(root, "commit", "-m", "candidate input"); };
  commit(); return { root, write, commit };
}

test("selection uses local and published high water without introducing beta versions", () => {
  assert.equal(nextCandidateVersion("cli", "0.2.43", ["0.2.44", "0.2.45", "0.1.99"]), "0.2.46");
  assert.equal(nextCandidateVersion("dsh", "0.2.43", ["0.2.42.99", "0.2.43.2"]), "0.2.43.3");
  assert.equal(nextCandidateVersion("dsh", "0.2.44", ["0.2.43.8"]), "0.2.44.0");
});

test("new combined preparations increment CLI and mirror dependencies, resume does not increment", async t => {
  const { root, commit } = await fixture(t);
  const first = await prepareCandidateVersions({ sourceRoot: root, artifacts: ["cli", "codex", "dsh"] });
  assert.deepEqual(first.record.versions, { cli: { version: "0.2.44" }, codex: { version: "0.2.44.0" }, dsh: { version: "0.2.44.0", npmVersion: "0.2.44-rc.0" } });
  const cli = await json(path.join(root, "packages/cli/package.json"));
  assert.equal(cli.dependencies["@veewo/claw-core"], "0.2.44");
  const bridge = ".agents/skills/using-claw-kit/references/hosts/codex.md";
  assert.match(await fs.readFile(path.join(root, bridge), "utf8"), /const pluginVersion = "0\.2\.44\.0";/);
  assert.ok(first.record.versionWrites[bridge], "bridge pin participates in resumable candidate bytes");
  assert.equal((await json(path.join(root, "packages/openclaw-adapter/package.json"))).dependencies["@veewo/claw-core"], "0.2.44");
  assert.equal((await json(path.join(root, "package-lock.json"))).packages["packages/cli"].version, "0.2.44");
  commit();
  const resumed = await resumeCandidatePreparation(first.directory);
  assert.deepEqual(resumed.record.versions, first.record.versions);
  const next = await prepareCandidateVersions({ sourceRoot: root, artifacts: ["cli", "codex", "dsh"] });
  assert.equal(next.record.versions.cli.version, "0.2.45");
});

test("adapter-only preparation changes only its family and counts unshipped historical supplements", async t => {
  const { root, write } = await fixture(t);
  await write("dist/beta-dsh/old/dsh-beta.json", { kind: "dsh-local-beta-supplement", gitVersion: "0.2.43.7" });
  const result = await prepareCandidateVersions({ sourceRoot: root, artifacts: ["dsh"] });
  assert.equal(result.record.versions.dsh.version, "0.2.43.8");
  assert.equal((await json(path.join(root, "package.json"))).version, "0.2.43");
  assert.equal((await json(path.join(root, "packages/codex-adapter/package.json"))).version, "0.2.43.0");
  assert.equal((await usedCandidateVersions([path.join(root, "dist/beta")])).dsh[0], "0.2.43.8");
});

test("partial version writes resume, changed inputs reject before further writes", async t => {
  const { root } = await fixture(t);
  const result = await prepareCandidateVersions({ sourceRoot: root, artifacts: ["cli", "codex"] });
  await fs.writeFile(path.join(root, "package.json"), result.record.versionWrites["package.json"].before);
  await resumeCandidatePreparation(result.directory);
  assert.equal((await json(path.join(root, "package.json"))).version, "0.2.44");
  await fs.writeFile(path.join(root, "implementation.txt"), "changed work");
  const before = await fs.readFile(path.join(root, "package.json"));
  await assert.rejects(resumeCandidatePreparation(result.directory), /inputs changed/);
  assert.deepEqual(await fs.readFile(path.join(root, "package.json")), before);
});

test("frozen preparation cannot be rebuilt or mutated, allocation contention is local", async t => {
  const { root } = await fixture(t);
  await fs.mkdir(path.join(root, "dist/beta"), { recursive: true });
  await fs.writeFile(path.join(root, "dist/beta/.prepare.lock"), "owned");
  await assert.rejects(prepareCandidateVersions({ sourceRoot: root }), /allocation lock/);
  assert.equal((await json(path.join(root, "package.json"))).version, "0.2.43");
  await fs.unlink(path.join(root, "dist/beta/.prepare.lock"));
  const result = await prepareCandidateVersions({ sourceRoot: root });
  await fs.writeFile(path.join(result.directory, "candidate.json"), JSON.stringify({ ...result.record, state: "frozen" }));
  await assert.rejects(resumeCandidatePreparation(result.directory), /frozen candidates are reused/);
});

test("interrupted local preparation recovers only a proven dead lock owner", async t => {
  const { root } = await fixture(t);
  const prepared = await prepareCandidateVersions({ sourceRoot: root });
  const deadPid = Number(execFileSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).trim());
  const file = path.join(prepared.directory, ".pack.lock");
  await fs.writeFile(file, JSON.stringify({ pid: process.pid, token: "live" }));
  await assert.rejects(recoverCandidatePreparation(prepared.directory), /still alive/);
  assert.equal((await json(file)).token, "live");
  await fs.writeFile(file, JSON.stringify({ pid: deadPid, token: "dead" }));
  const recovery = await recoverCandidatePreparation(prepared.directory);
  assert.deepEqual(recovery.recovered, [file]);
  assert.equal((await resumeCandidatePreparation(prepared.directory)).record.versions.cli.version, "0.2.44");
});

test("Cindy supplied artifact facts and independent OpenClaw dependency alignment stay family-local", async t => {
  const { root, write, commit } = await fixture(t);
  const cindy = await prepareCandidateVersions({ sourceRoot: root, artifacts: ["cindy"], published: { cindy: ["0.2.43.9"] } });
  assert.equal(cindy.record.versions.cindy.version, "0.2.43.10");
  assert.equal((await json(path.join(root, "packages/dsh-adapter/package.json"))).version, "0.2.43.0");
  commit();
  const file = "packages/openclaw-adapter/package.json";
  const old = await json(path.join(root, file)); old.dependencies["@veewo/claw-core"] = "0.2.42";
  await write(file, old); commit();
  await prepareCandidateVersions({ sourceRoot: root, artifacts: ["openclaw"] });
  assert.equal((await json(path.join(root, file))).dependencies["@veewo/claw-core"], "0.2.43");
  assert.equal((await json(path.join(root, "package.json"))).version, "0.2.43");
});

test("explicit owner target versions are honored, without permitting reuse or unrelated bumps", async t => {
  const { root } = await fixture(t);
  await assert.rejects(prepareCandidateVersions({ sourceRoot: root, artifacts: ["cli"], targets: { cli: "0.2.43" } }), /high water/);
  assert.equal((await json(path.join(root, "package.json"))).version, "0.2.43");
  const next = await prepareCandidateVersions({ sourceRoot: root, artifacts: ["cli", "dsh"], targets: { cli: "0.3.0", dsh: "0.3.0.2" } });
  assert.equal(next.record.versions.cli.version, "0.3.0");
  assert.equal(next.record.versions.dsh.version, "0.3.0.2");
});
