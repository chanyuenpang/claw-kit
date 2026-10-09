// Promotion only: publish the tested frozen package, never rebuild it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { promoteFrozenDsh } from "./frozen-npm-promotion.mjs";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const publish = args.includes("--publish");
const candidateIndex = args.indexOf("--candidate");
if (candidateIndex < 0 || !args[candidateIndex + 1] || args[candidateIndex + 1].startsWith("--")) {
  throw new Error("Prepare and test a candidate first, then use publish:dsh-plugin -- --candidate <directory> [--publish]. No workspace rebuild is permitted for promotion.");
}
if (args.some((arg, index) => index !== candidateIndex + 1 && !["--candidate", "--publish"].includes(arg))) throw new Error("Unsupported DSH promotion argument.");
const git = args => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const result = await promoteFrozenDsh(args[candidateIndex + 1], {
  publish,
  validateSource: revision => {
    if (git(["branch", "--show-current"]) !== "main" || git(["status", "--porcelain"]) !== "" || git(["rev-parse", "HEAD"]) !== revision) {
      throw new Error("DSH promotion requires clean local main at the exact tested source revision.");
    }
    git(["fetch", "origin", "main"]);
    git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
  },
  runNpm: args => {
    if (!process.env.npm_execpath) throw new Error("Run publication through the npm script.");
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  },
});
console.log(JSON.stringify({ candidate: result.directory, version: result.artifact.version, npmVersion: result.artifact.npmVersion,
  tarball: result.tarball, published: publish, receipt: result.receipt }, null, 2));
if (publish) console.log("Complete the authorized source/tag delivery through the DSH release owner; publication never rebuilds the frozen package.");
