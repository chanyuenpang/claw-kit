import path from "node:path";

import { installCodexPluginDevelopmentSurface } from "./codex-plugin-bundle.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

const sourceDirOption = readOption("--source-dir");
const cacheRootOption = readOption("--cache-root");
const marketplaceRootOption = readOption("--marketplace-root");

const result = await installCodexPluginDevelopmentSurface({
  sourceDir: sourceDirOption ? path.resolve(process.cwd(), sourceDirOption) : undefined,
  cacheRoot: cacheRootOption ? path.resolve(process.cwd(), cacheRootOption) : undefined,
  marketplaceRoot: marketplaceRootOption ? path.resolve(process.cwd(), marketplaceRootOption) : undefined,
});

console.log(`Updated Codex marketplace source at ${result.marketplaceSourceDir}`);
console.log(`Installed Codex plugin cache at ${result.installDir}`);
