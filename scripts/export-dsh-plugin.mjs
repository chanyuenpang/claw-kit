// Export the installable @veewo/dsh-claw-kit tarball into dist/dsh-plugin/.
// The DSH plugin manager (`dsh plugin --profile <name> add <pkg>`) is a pnpm
// forwarder, so the distribution surface is a plain npm tarball — no
// marketplace cache or identity switching needed.
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

const outDir = readOption("--out-dir")
  ? path.resolve(process.cwd(), readOption("--out-dir"))
  : path.join(repoRoot, "dist", "dsh-plugin");

fs.mkdirSync(outDir, { recursive: true });
execFileSync("npm", ["pack", "-w", "@veewo/dsh-claw-kit", "--pack-destination", outDir], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const tarballs = fs.readdirSync(outDir).filter((file) => file.endsWith(".tgz"));
if (tarballs.length === 0) {
  throw new Error("npm pack produced no tarball.");
}
console.log(`Exported DSH plugin tarball(s) to ${outDir}:`);
for (const file of tarballs) console.log(`  ${file}`);
