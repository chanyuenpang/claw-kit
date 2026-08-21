// Publish the @claw-kit/dsh-adapter npm package.
//
// Flow: build → test → export local tarball → (--publish) npm publish.
// Without --publish this is a dry run that verifies the artifact.
// The adapter version follows `<cli-base>.<fourth>`; see packages/dsh-adapter/RELEASING.md.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(repoRoot, "packages", "dsh-adapter");
const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const version = manifest.version;

function run(args) {
  execFileSync("npm", args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
}

const publish = process.argv.includes("--publish");
const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  run(["run", "build", "-w", "@claw-kit/dsh-adapter"]);
  run(["test", "-w", "@claw-kit/dsh-adapter"]);
}

run(["run", "export:dsh-plugin"]);

const distDir = path.join(repoRoot, "dist", "dsh-plugin");
const tarballs = fs.readdirSync(distDir).filter((file) => file.endsWith(".tgz")).sort();
const tarball = path.join(distDir, tarballs.at(-1));
if (!tarball) throw new Error("export:dsh-plugin produced no tarball.");

// Content gate: the installable surface is lib/, skills/, cordis.patch.yml.
const { execFileSync: exec } = await import("node:child_process");
const listing = exec("tar", ["-tzf", tarball], { cwd: repoRoot, encoding: "utf8" });
for (const required of ["package/lib/", "package/skills/", "package/cordis.patch.yml"]) {
  if (!listing.includes(required)) throw new Error(`tarball missing ${required}`);
}

console.log(`@claw-kit/dsh-adapter@${version} artifact: ${tarball}`);

if (publish) {
  run(["publish", tarball, "--access", "public"]);
  console.log(`Published @claw-kit/dsh-adapter@${version}`);
  console.log("Next: tag the commit `vdsh-" + version + "` and verify in a real DSH profile (see packages/dsh-adapter/RELEASING.md).");
} else {
  console.log("Dry run complete (no --publish). Run with --publish to publish to the npm registry.");
}
