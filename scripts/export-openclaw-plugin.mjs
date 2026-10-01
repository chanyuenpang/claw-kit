import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportHostPluginArtifact } from "./host-plugin-artifacts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error("Missing " + name + " value");
  return path.resolve(process.argv[index + 1]);
}
const result = await exportHostPluginArtifact({
  sourceRoot: option("--source-root") ?? repoRoot,
  targetHost: "openclaw",
  outputRoot: option("--out-dir") ?? path.join(repoRoot, "dist", "openclaw-plugin"),
});
console.log("Exported openclaw artifact: " + result.outputRoot);
