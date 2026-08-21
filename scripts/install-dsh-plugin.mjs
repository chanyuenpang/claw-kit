// Install the exported @claw-kit/dsh-adapter tarball into a dsh profile via
// `dsh plugin --profile <name> add <tarball>`, then report the restart step.
// The profile bundle layer activates only after the Host restarts.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const profile = readOption("--profile") ?? "web";
const outDir = readOption("--out-dir")
  ? path.resolve(process.cwd(), readOption("--out-dir"))
  : path.join(repoRoot, "dist", "dsh-plugin");

const tarballs = fs
  .readdirSync(outDir)
  .filter((file) => file.endsWith(".tgz"))
  .sort();
if (tarballs.length === 0) {
  throw new Error(`No exported dsh-adapter tarball in ${outDir}; run "npm run export:dsh-plugin" first.`);
}
const tarball = path.join(outDir, tarballs.at(-1));

// `dsh plugin` forwards to pnpm inside the profile directory; an absolute
// tarball path passes through untouched (only relative specs get re-anchored).
execFileSync("dsh", ["plugin", "--profile", profile, "add", tarball], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

console.log(`Installed ${path.basename(tarball)} into profile "${profile}".`);
console.log("Restart the Host (dsh --profile " + profile + ") to mount the claw-adapter row; then verify with `dsh --profile " + profile + " --dump-config`.");
