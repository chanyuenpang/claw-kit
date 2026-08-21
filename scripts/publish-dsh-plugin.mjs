// Publish the @veewo/dsh-adapter npm package.
//
// Flow: build → test → stage npm manifest → pack → (--publish) npm publish.
// Without --publish this is a dry run that verifies the artifact.
// The adapter version follows `<cli-base>.<fourth>` (e.g. 0.2.25.0); npm
// cannot hold a four-segment release version, so the published npm version is
// the semver prerelease spelling `<cli-base>-rc.<fourth>` (0.2.25-rc.0).
// The git tag stays the four-segment `vdsh-<git-version>`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(repoRoot, "packages", "dsh-adapter");
const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const gitVersion = manifest.version;

/** Map a four-segment adapter version to the npm-legal prerelease spelling. */
function npmVersionOf(gitVersion) {
  const segments = String(gitVersion).split(".");
  if (segments.length !== 4) return String(gitVersion);
  return `${segments.slice(0, 3).join(".")}-rc.${segments[3]}`;
}

const npmVersion = npmVersionOf(gitVersion);
const distTag = process.argv.includes("--tag")
  ? process.argv[process.argv.indexOf("--tag") + 1]
  : "latest";

function run(args) {
  execFileSync("npm", args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
}

const publish = process.argv.includes("--publish");
const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  run(["run", "build", "-w", "@veewo/dsh-adapter"]);
  run(["test", "-w", "@veewo/dsh-adapter"]);
}

// Stage an npm publishable manifest: only the tarball's package.json carries
// the npm version; the working tree and git keep the four-segment version.
const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-publish-"));
const stagingManifest = { ...manifest, version: npmVersion };
fs.writeFileSync(path.join(stagingDir, "package.json"), JSON.stringify(stagingManifest, null, 2) + "\n");

// Copy the workspace (without node_modules) into staging so `npm pack` uses the
// staged version. Use the existing lib/skills built output.
fs.cpSync(path.join(pkgDir, "lib"), path.join(stagingDir, "lib"), { recursive: true });
fs.cpSync(path.join(pkgDir, "skills"), path.join(stagingDir, "skills"), { recursive: true });
fs.cpSync(path.join(pkgDir, "cordis.patch.yml"), path.join(stagingDir, "cordis.patch.yml"));
fs.cpSync(path.join(pkgDir, "README.md"), path.join(stagingDir, "README.md"));

const distDir = path.join(repoRoot, "dist", "dsh-plugin");
fs.mkdirSync(distDir, { recursive: true });
// Clear stale tarballs so the newest one is picked unambiguously.
for (const stale of fs.readdirSync(distDir).filter((file) => file.endsWith(".tgz"))) {
  fs.rmSync(path.join(distDir, stale), { force: true });
}
execFileSync("npm", ["pack", "--pack-destination", distDir], {
  cwd: stagingDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const tarballs = fs.readdirSync(distDir).filter((file) => file.endsWith(".tgz")).sort();
const tarball = path.join(distDir, tarballs.at(-1));
if (!tarball) throw new Error("npm pack produced no tarball.");

// Content gate: the installable surface is lib/, skills/, cordis.patch.yml.
const { execFileSync: exec } = await import("node:child_process");
const listing = exec("tar", ["-tzf", tarball], { cwd: repoRoot, encoding: "utf8" });
for (const required of ["package/lib/", "package/skills/", "package/cordis.patch.yml"]) {
  if (!listing.includes(required)) throw new Error(`tarball missing ${required}`);
}
const tarballManifest = JSON.parse(
  exec("tar", ["-xOf", tarball, "package/package.json"], { cwd: repoRoot, encoding: "utf8" }),
);
if (tarballManifest.version !== npmVersion) {
  throw new Error(`tarball version ${tarballManifest.version} does not match npm version ${npmVersion}`);
}

console.log(`@veewo/dsh-adapter git ${gitVersion} → npm ${npmVersion} artifact: ${tarball}`);

if (publish) {
  run(["publish", tarball, "--access", "public", "--tag", distTag]);
  console.log(`Published @veewo/dsh-adapter@${npmVersion} (dist-tag ${distTag}); git version ${gitVersion}`);
  console.log(`Next: tag the commit \`vdsh-${gitVersion}\` and verify in a real DSH profile (see packages/dsh-adapter/RELEASING.md).`);
} else {
  console.log("Dry run complete (no --publish). Run with --publish to publish to the npm registry.");
}
