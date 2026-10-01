// Build an installable tarball from the same isolated stage used for publish.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packDshPluginArtifact } from "./host-plugin-artifacts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error("Missing " + name + " value");
  return path.resolve(process.argv[index + 1]);
}
const result = await packDshPluginArtifact({ sourceRoot: option("--source-root") ?? repoRoot, outDir: option("--out-dir") ?? path.join(repoRoot, "dist", "dsh-plugin") });
console.log("Exported DSH plugin " + result.gitVersion + " → npm " + result.npmVersion + ": " + result.tarball);
