import path from "node:path";
import { installOpencodePlugin } from "./opencode-plugin-bundle.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const sourceDirOption = readOption("--source-dir");
const installDirOption = readOption("--install-dir");

const result = await installOpencodePlugin({
  sourceDir: sourceDirOption ? path.resolve(process.cwd(), sourceDirOption) : undefined,
  installDir: installDirOption ? path.resolve(process.cwd(), installDirOption) : undefined,
});

console.log(`Installed OpenCode plugin to ${result.pluginDir}`);
console.log(`Created plugin shim at ${result.shimPath}`);
console.log(`Updated skills.paths in ${result.configPath}`);
console.log(`Installed agent definitions to ${result.agentDir}`);