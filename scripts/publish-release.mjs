import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportCodexPluginBundle } from "./codex-plugin-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publish = process.argv.includes("--publish");
const requiredSharedSkills = ["planning", "config", "update", "create-claw-skill"];

function command(command, args) {
  return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCleanWorktree(phase) {
  assert(
    command("git", ["status", "--porcelain"]) === "",
    `${phase}: release worktree must be clean. Classify every local change before continuing: commit useful release content to main, remove disposable output, or add intentional local-only artifacts to .gitignore. Do not use a stash to bypass this gate.`,
  );
}

function assertDirectMainCheckout() {
  const branch = command("git", ["branch", "--show-current"]);
  assert(
    branch === "main",
    `Release must run from the repository owner's main branch; current branch is ${branch || "detached HEAD"}. Do not create a branch or pull request unless the owner explicitly requests review.`,
  );

  command("git", ["fetch", "origin", "--prune"]);
  const localHead = command("git", ["rev-parse", "HEAD"]);
  const remoteMain = command("git", ["rev-parse", "origin/main"]);
  assert(
    localHead === remoteMain,
    "main must exactly match origin/main before publishing. Commit and push all useful release content first, then rerun verification.",
  );
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function verifyReleaseReadiness() {
  const root = await readJson("package.json");
  const core = await readJson("packages/core/package.json");
  const cli = await readJson("packages/cli/package.json");
  const codex = await readJson("packages/codex-adapter/package.json");
  const openclaw = await readJson("packages/openclaw-adapter/package.json");
  const opencode = await readJson("packages/opencode-adapter/package.json");
  const plugin = await readJson("packages/codex-adapter/.codex-plugin/plugin.json");
  const version = root.version;

  assert([core, cli, codex, openclaw, opencode].every((pkg) => pkg.version === version), `Release versions must all equal ${version}.`);
  assert(cli.dependencies?.["@veewo/claw-core"] === version, "CLI must depend on the same @veewo/claw-core version.");
  assert(plugin.version.startsWith(`${version}+codex.`), "Codex plugin version must use the release version plus a +codex timestamp.");
  assertCleanWorktree("Before publishing");
  assertDirectMainCheckout();

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-release-plugin-"));
  const bundle = await exportCodexPluginBundle({ outDir });
  for (const skillName of requiredSharedSkills) {
    await fs.access(path.join(bundle.bundleDir, "skills", skillName, "SKILL.md"));
  }
  await fs.access(path.join(bundle.bundleDir, "skills", "update", "TEMPLATE.json"));
  await fs.access(path.join(bundle.bundleDir, "skills", "create-claw-skill", "TEMPLATE.json"));
  await fs.rm(outDir, { recursive: true, force: true });

  return { version, pluginVersion: plugin.version };
}

const release = await verifyReleaseReadiness();
console.log(`Release ${release.version} is committed, pushed, version-aligned, and contains all required Codex skills.`);

if (!publish) {
  console.log("Dry run complete. Re-run with --publish to publish @veewo/claw-core and @veewo/claw.");
  process.exit(0);
}

for (const workspace of ["@veewo/claw-core", "@veewo/claw"]) {
  const result = spawnSync("npm", ["publish", "--workspace", workspace, "--access", "public"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

assertCleanWorktree("After publishing");
console.log(`Published @veewo/claw-core and @veewo/claw ${release.version}.`);
