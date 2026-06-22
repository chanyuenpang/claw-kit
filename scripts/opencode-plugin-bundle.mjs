import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPENCODE_PLUGIN_PAYLOAD_PATHS = [
  "plugin",
  "skills",
  "agents",
  "references",
  "workflow-guidance.opencode.json",
  "package.json",
  "tsconfig.json",
];

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
const defaultSourceDir = path.join(repoRoot, "packages", "opencode-adapter");
const defaultBundleOutDir = path.join(repoRoot, "dist", "opencode-plugin");
const defaultInstallDir = path.join(os.homedir(), ".config", "opencode");

async function readJson(jsonPath) {
  return JSON.parse(await fs.readFile(jsonPath, "utf8"));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function assertPayloadExists(sourceDir, relativePath) {
  const fullPath = path.join(sourceDir, relativePath);
  if (!(await pathExists(fullPath))) {
    throw new Error(`Missing OpenCode plugin payload path: ${relativePath}`);
  }
}

async function copyDirectoryContents(sourceDir, destinationDir) {
  await fs.mkdir(destinationDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }
    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function copyPayloadTree(sourceDir, destinationDir, payloadRelativePaths) {
  await fs.rm(destinationDir, { recursive: true, force: true });
  await fs.mkdir(destinationDir, { recursive: true });

  for (const relativePath of payloadRelativePaths) {
    const sourcePath = path.join(sourceDir, relativePath);
    const destinationPath = path.join(destinationDir, relativePath);
    const sourceStat = await fs.lstat(sourcePath);
    if (sourceStat.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }
}

export async function readOpencodePluginSource({ sourceDir = defaultSourceDir } = {}) {
  const manifestPath = path.join(sourceDir, "package.json");
  const manifest = await readJson(manifestPath);

  for (const relativePath of OPENCODE_PLUGIN_PAYLOAD_PATHS) {
    await assertPayloadExists(sourceDir, relativePath);
  }

  return {
    sourceDir,
    manifestPath,
    manifest,
    name: manifest.name,
    version: manifest.version,
    payloadRelativePaths: [...OPENCODE_PLUGIN_PAYLOAD_PATHS],
  };
}

export async function exportOpencodePluginBundle({ sourceDir = defaultSourceDir, outDir = defaultBundleOutDir } = {}) {
  const plugin = await readOpencodePluginSource({ sourceDir });
  const bundleDir = path.join(outDir, "claw-kit", plugin.version);
  await copyPayloadTree(plugin.sourceDir, bundleDir, plugin.payloadRelativePaths);
  return { ...plugin, outDir, bundleDir };
}

export async function installOpencodePlugin({ sourceDir = defaultSourceDir, installDir = defaultInstallDir } = {}) {
  const plugin = await readOpencodePluginSource({ sourceDir });

  // Plugin directory: ~/.config/opencode/plugins/claw-kit/
  const pluginDir = path.join(installDir, "plugins", "claw-kit");
  await copyPayloadTree(plugin.sourceDir, pluginDir, plugin.payloadRelativePaths);

  // Agent files: ~/.config/opencode/agent/
  const agentDir = path.join(installDir, "agent");
  await fs.mkdir(agentDir, { recursive: true });
  const agentSourceDir = path.join(sourceDir, "agents");
  if (await pathExists(agentSourceDir)) {
    const agentFiles = await fs.readdir(agentSourceDir);
    for (const file of agentFiles) {
      if (file.endsWith(".md")) {
        await fs.copyFile(path.join(agentSourceDir, file), path.join(agentDir, file));
      }
    }
  }

  return { ...plugin, installDir, pluginDir, agentDir };
}