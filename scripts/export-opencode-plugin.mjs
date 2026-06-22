import path from "node:path";
import { exportOpencodePluginBundle } from "./opencode-plugin-bundle.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const outDirOption = readOption("--out-dir");
const outDir = outDirOption ? path.resolve(process.cwd(), outDirOption) : undefined;

const result = await exportOpencodePluginBundle({ outDir });
console.log(`Exported OpenCode plugin bundle to ${result.bundleDir}`);