import path from "node:path";

import { exportCodexPluginBundle } from "./codex-plugin-bundle.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

const outDirOption = readOption("--out-dir");
const outDir = outDirOption ? path.resolve(process.cwd(), outDirOption) : undefined;

const result = await exportCodexPluginBundle({ outDir });

console.log(`Exported Codex plugin bundle to ${result.bundleDir}`);
