import path from "node:path";

import { installCodexPluginBundle } from "./codex-plugin-bundle.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

const sourceDirOption = readOption("--source-dir");
const cacheRootOption = readOption("--cache-root");

const result = await installCodexPluginBundle({
  sourceDir: sourceDirOption ? path.resolve(process.cwd(), sourceDirOption) : undefined,
  cacheRoot: cacheRootOption ? path.resolve(process.cwd(), cacheRootOption) : undefined,
});

console.log(`Installed Codex plugin to ${result.installDir}`);
