// Publish the @veewo/dsh-claw-kit npm package.
//
// Flow: build → test → stage npm manifest → pack → (--publish) npm publish.
// Without --publish this is a dry run that verifies the artifact.
// The adapter version follows `<cli-base>.<fourth>` (e.g. 0.2.25.0); npm
// cannot hold a four-segment release version, so the published npm version is
// the semver prerelease spelling `<cli-base>-rc.<fourth>` (0.2.25-rc.0).
// The git tag stays the four-segment `vdsh-<git-version>`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillInputs } from "./skill-artifacts.mjs";
import { npmVersionOf, packDshPluginArtifact } from "./host-plugin-artifacts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(repoRoot, "packages", "dsh-adapter");
const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const gitVersion = manifest.version;

const npmVersion = npmVersionOf(gitVersion);
const distTag = process.argv.includes("--tag")
  ? process.argv[process.argv.indexOf("--tag") + 1]
  : "latest";

function run(args) {
  execFileSync("npm", args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
}

const publish = process.argv.includes("--publish");
const skipBuild = process.argv.includes("--skip-build");

function runGit(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", shell: process.platform === "win32" }).trim();
}

// Exact-source gate (mirrors publish-release.mjs): publishing must run from a
// clean main whose HEAD exactly matches origin/main, so the npm release always
// corresponds to committed, pushed source. Learned 2026-08-22: the first
// 0.2.25.x publishes ran before this gate existed.
if (publish) {
  const branch = runGit(["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`DSH publish must run from the repository owner's main branch; current branch is ${branch || "detached HEAD"}.`);
  }
  runGit(["fetch", "origin", "--prune"]);
  const localHead = runGit(["rev-parse", "HEAD"]);
  const remoteMain = runGit(["rev-parse", "origin/main"]);
  if (localHead !== remoteMain) {
    throw new Error("main must exactly match origin/main before publishing. Commit and push all useful release content first, then rerun.");
  }
  const dirty = runGit(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`DSH publish requires a clean worktree. Classify every local change first; do not use a stash to bypass this gate.\n${dirty}`);
  }
}

// Validate canonical inputs without writing any adapter source copies.
await loadSkillInputs({ sourceRoot: repoRoot, targetHost: "dsh" });

if (!skipBuild) {
  run(["run", "build", "-w", "@veewo/dsh-claw-kit"]);
  run(["test", "-w", "@veewo/dsh-claw-kit"]);
}

// Export and publish share one isolated, npm-versioned complete payload.
const { tarball } = await packDshPluginArtifact({ sourceRoot: repoRoot, outDir: path.join(repoRoot, "dist", "dsh-plugin") });

console.log(`@veewo/dsh-claw-kit git ${gitVersion} → npm ${npmVersion} artifact: ${tarball}`);

if (publish) {
  run(["publish", tarball, "--access", "public", "--tag", distTag]);
  console.log(`Published @veewo/dsh-claw-kit@${npmVersion} (dist-tag ${distTag}); git version ${gitVersion}`);
  console.log(`Next: tag the commit \`vdsh-${gitVersion}\` and verify in a real DSH profile (see packages/dsh-adapter/RELEASING.md).`);
} else {
  console.log("Dry run complete (no --publish). Run with --publish to publish to the npm registry.");
}
