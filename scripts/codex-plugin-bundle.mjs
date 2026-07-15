import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CODEX_PLUGIN_PAYLOAD_PATHS = [
  ".codex-plugin",
  "hooks",
  "references",
  "scripts",
  "skills",
  "package.json",
];

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
const defaultSourceDir = path.join(repoRoot, "packages", "codex-adapter");
const defaultBundleOutDir = path.join(repoRoot, "dist", "codex-plugin");
const defaultCacheRoot = path.join(os.homedir(), ".codex", "plugins", "cache", "claw-kit-local");

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
    throw new Error(`Missing Codex plugin payload path: ${relativePath}`);
  }
}

function shouldCopyEntry(sourcePath) {
  return !sourcePath.endsWith(".test.mjs");
}

async function copyDirectoryContents(sourceDir, destinationDir) {
  await fs.mkdir(destinationDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    if (!shouldCopyEntry(sourcePath)) {
      continue;
    }

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

    if (!shouldCopyEntry(sourcePath)) {
      continue;
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }
}

export async function readCodexPluginSource({ sourceDir = defaultSourceDir } = {}) {
  const manifestPath = path.join(sourceDir, ".codex-plugin", "plugin.json");
  const manifest = await readJson(manifestPath);

  for (const relativePath of CODEX_PLUGIN_PAYLOAD_PATHS) {
    await assertPayloadExists(sourceDir, relativePath);
  }

  return {
    sourceDir,
    manifestPath,
    manifest,
    name: manifest.name,
    version: manifest.version,
    payloadRelativePaths: [...CODEX_PLUGIN_PAYLOAD_PATHS],
  };
}

export async function exportCodexPluginBundle({ sourceDir = defaultSourceDir, outDir = defaultBundleOutDir } = {}) {
  const plugin = await readCodexPluginSource({ sourceDir });
  const bundleDir = path.join(outDir, plugin.name, plugin.version);
  await copyPayloadTree(plugin.sourceDir, bundleDir, plugin.payloadRelativePaths);
  return { ...plugin, outDir, bundleDir };
}

export async function installCodexPluginBundle({ sourceDir = defaultSourceDir, cacheRoot = defaultCacheRoot } = {}) {
  const plugin = await readCodexPluginSource({ sourceDir });
  const installDir = path.join(cacheRoot, plugin.name, plugin.version);
  await copyPayloadTree(plugin.sourceDir, installDir, plugin.payloadRelativePaths);
  return { ...plugin, cacheRoot, installDir };
}
