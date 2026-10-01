import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildCindyPluginArtifact } from "./cindy-plugin-artifact.mjs";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function option(name) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
const sourceRoot = path.resolve(option("--source-root") ?? repoRoot);
const pkg = JSON.parse(await fs.readFile(path.join(sourceRoot, "packages/cindy-adapter/package.json"), "utf8"));
const outputRoot = path.resolve(option("--output-root") ?? path.join(repoRoot, "dist/cindy-plugin", pkg.version));
console.log(JSON.stringify(await buildCindyPluginArtifact({ sourceRoot, outputRoot }), null, 2));
