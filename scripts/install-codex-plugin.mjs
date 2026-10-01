import path from "node:path";

import { activateOfficialCodexPluginIdentity, installCodexPluginBundle } from "./codex-plugin-bundle.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

const sourceDirOption = readOption("--source-dir");
const sourceRootOption = readOption("--source-root");
const cacheRootOption = readOption("--cache-root");
const configPathOption = readOption("--config-path");

if (Boolean(sourceDirOption) === Boolean(sourceRootOption)) {
  throw new Error("Supply --source-root for a source checkout or --source-dir for a composed Codex artifact, not both.");
}

const result = await installCodexPluginBundle({
  sourceRoot: sourceRootOption ? path.resolve(process.cwd(), sourceRootOption) : undefined,
  sourceDir: sourceDirOption ? path.resolve(process.cwd(), sourceDirOption) : undefined,
  cacheRoot: cacheRootOption ? path.resolve(process.cwd(), cacheRootOption) : undefined,
});
const identity = await activateOfficialCodexPluginIdentity({
  configPath: configPathOption ? path.resolve(process.cwd(), configPathOption) : undefined,
  localCacheRoot: path.dirname(result.cacheRoot),
});

console.log(`Installed GitHub marketplace plugin cache at ${result.installDir}`);
console.log(`Enabled ${identity.enabledIdentity} and removed local identities: ${identity.removedIdentities.join(", ")}.`);
