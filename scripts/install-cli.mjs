import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function executableCandidates(name) {
  if (process.platform !== "win32") return [name];
  return [`${name}.cmd`, `${name}.exe`, `${name}.bat`, name];
}

function findOnPath(name) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const candidate of executableCandidates(name)) {
      const fullPath = path.join(directory, candidate);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  }
  return null;
}

function activeClawPrefix(clawPath) {
  if (!clawPath) return null;
  const executableDir = path.dirname(clawPath);
  const prefix = process.platform === "win32"
    ? executableDir
    : path.basename(executableDir) === "bin"
      ? path.dirname(executableDir)
      : null;
  if (!prefix) return null;
  const packageDir = process.platform === "win32"
    ? path.join(prefix, "node_modules", "@veewo", "claw")
    : path.join(prefix, "lib", "node_modules", "@veewo", "claw");
  return fs.existsSync(packageDir) ? prefix : null;
}

function npmGlobalPrefix(npmExecutable) {
  const result = spawnSync(npmExecutable, ["prefix", "-g"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Unable to resolve npm global prefix: ${result.stderr || result.stdout}`);
  }
  const prefix = result.stdout.trim();
  if (!prefix) throw new Error("npm prefix -g returned an empty path.");
  return prefix;
}

const npmExecutable = findOnPath("npm");
if (!npmExecutable) throw new Error("Required command not found: npm");

const installPrefix = activeClawPrefix(findOnPath("claw")) ?? npmGlobalPrefix(npmExecutable);
console.log(`Installing the published claw CLI into ${installPrefix}...`);
const install = spawnSync(
  npmExecutable,
  [
    "install",
    "-g",
    "@veewo/claw",
    "--prefix",
    installPrefix,
    "--no-audit",
    "--no-fund",
  ],
  { stdio: "inherit" },
);
if (install.error) throw install.error;
if (install.status !== 0) throw new Error("npm install -g @veewo/claw failed.");

console.log("claw CLI update completed.");
