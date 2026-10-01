import path from "node:path";
import { exportCodexMarketplace } from "./codex-plugin-bundle.mjs";

const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  if (!["--source-root", "--out-dir"].includes(key) || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error("Usage: node scripts/export-codex-marketplace.mjs --out-dir <isolated-output> [--source-root <checkout>]");
  }
  options[key === "--source-root" ? "sourceRoot" : "outDir"] = path.resolve(args[index + 1]);
}
const result = await exportCodexMarketplace(options);
console.log(`Exported local Codex marketplace artifact to ${result.marketplaceDir}`);
console.log("No remote, branch, tag, publication or installed plugin was changed.");
