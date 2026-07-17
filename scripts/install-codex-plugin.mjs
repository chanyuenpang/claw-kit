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
const cacheRootOption = readOption("--cache-root");
const configPathOption = readOption("--config-path");

if (!sourceDirOption) {
  throw new Error("--source-dir must point at packages/codex-adapter from a freshly cloned GitHub marketplace checkout.");
}

const result = await installCodexPluginBundle({
  sourceDir: sourceDirOption ? path.resolve(process.cwd(), sourceDirOption) : undefined,
  cacheRoot: cacheRootOption ? path.resolve(process.cwd(), cacheRootOption) : undefined,
});
const identity = await activateOfficialCodexPluginIdentity({
  configPath: configPathOption ? path.resolve(process.cwd(), configPathOption) : undefined,
});

console.log(`Installed GitHub marketplace plugin cache at ${result.installDir}`);
console.log(`Enabled ${identity.enabledIdentity} and disabled ${identity.disabledIdentity}.`);
