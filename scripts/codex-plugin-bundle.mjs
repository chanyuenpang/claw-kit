import { createHash, randomUUID } from "node:crypto";
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
const defaultCacheRoot = path.join(os.homedir(), ".codex", "plugins", "cache", "claw-kit");
const defaultCodexConfigPath = path.join(os.homedir(), ".codex", "config.toml");

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
  return !sourcePath.endsWith(".test.mjs")
    && path.basename(sourcePath) !== "code-mode-host-action-consumer.mjs";
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
    if (entry.isSymbolicLink()) {
      throw new Error(`Codex plugin payload must not contain symbolic links: ${sourcePath}`);
    }
    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }

    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function copyPayloadTree(sourceDir, destinationDir, payloadRelativePaths) {
  await fs.mkdir(destinationDir, { recursive: true });

  for (const relativePath of payloadRelativePaths) {
    const sourcePath = path.join(sourceDir, relativePath);
    const destinationPath = path.join(destinationDir, relativePath);
    const sourceStat = await fs.lstat(sourcePath);
    if (sourceStat.isSymbolicLink()) {
      throw new Error(`Codex plugin payload must not contain symbolic links: ${sourcePath}`);
    }
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

async function collectPayloadHashes(rootDir, payloadRelativePaths) {
  const hashes = new Map();
  const visit = async (absolutePath, relativePath) => {
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Codex plugin payload must not contain symbolic links: ${absolutePath}`);
    }
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(absolutePath, { withFileTypes: true })) {
        const childAbsolute = path.join(absolutePath, entry.name);
        if (!shouldCopyEntry(childAbsolute)) continue;
        await visit(childAbsolute, path.join(relativePath, entry.name));
      }
      return;
    }
    const content = await fs.readFile(absolutePath);
    hashes.set(
      relativePath.replaceAll("\\", "/"),
      createHash("sha256").update(content).digest("hex"),
    );
  };
  for (const relativePath of payloadRelativePaths) {
    await visit(path.join(rootDir, relativePath), relativePath);
  }
  return hashes;
}

async function validateCopiedPayload(plugin, destinationDir) {
  const manifest = await readJson(path.join(destinationDir, ".codex-plugin", "plugin.json"));
  await readJson(path.join(destinationDir, "hooks", "hooks.json"));
  if (manifest.name !== plugin.name || manifest.version !== plugin.version) {
    throw new Error("Copied Codex plugin manifest identity does not match its source.");
  }
  const [sourceHashes, destinationHashes] = await Promise.all([
    collectPayloadHashes(plugin.sourceDir, plugin.payloadRelativePaths),
    collectPayloadHashes(destinationDir, plugin.payloadRelativePaths),
  ]);
  if (
    sourceHashes.size !== destinationHashes.size
    || [...sourceHashes].some(([relativePath, hash]) => destinationHashes.get(relativePath) !== hash)
  ) {
    throw new Error("Copied Codex plugin payload failed the source hash comparison.");
  }
}

async function replaceDirectoryAtomic(destinationDir, buildStaging, testHooks) {
  const parentDir = path.dirname(destinationDir);
  const baseName = path.basename(destinationDir);
  const nonce = randomUUID();
  const stagingDir = path.join(parentDir, `.${baseName}.installing-${nonce}`);
  const backupDir = path.join(parentDir, `.${baseName}.backup-${nonce}`);
  await fs.mkdir(parentDir, { recursive: true });
  try {
    await buildStaging(stagingDir);
    await testHooks?.beforeActivate?.({ stagingDir, destinationDir });
    const hadExisting = await pathExists(destinationDir);
    if (hadExisting) await fs.rename(destinationDir, backupDir);
    try {
      await fs.rename(stagingDir, destinationDir);
    } catch (error) {
      if (hadExisting && await pathExists(backupDir) && !(await pathExists(destinationDir))) {
        await fs.rename(backupDir, destinationDir);
      }
      throw error;
    }
    await fs.rm(backupDir, { recursive: true, force: true });
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
    if (await pathExists(backupDir) && !(await pathExists(destinationDir))) {
      await fs.rename(backupDir, destinationDir);
    } else {
      await fs.rm(backupDir, { recursive: true, force: true });
    }
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
  await replaceDirectoryAtomic(bundleDir, async (stagingDir) => {
    await copyPayloadTree(plugin.sourceDir, stagingDir, plugin.payloadRelativePaths);
    await validateCopiedPayload(plugin, stagingDir);
  });
  return { ...plugin, outDir, bundleDir };
}

export async function installCodexPluginBundle({
  sourceDir = defaultSourceDir,
  cacheRoot = defaultCacheRoot,
  testHooks,
} = {}) {
  const plugin = await readCodexPluginSource({ sourceDir });
  const installDir = path.join(cacheRoot, plugin.name, plugin.version);
  await replaceDirectoryAtomic(installDir, async (stagingDir) => {
    await copyPayloadTree(plugin.sourceDir, stagingDir, plugin.payloadRelativePaths);
    await validateCopiedPayload(plugin, stagingDir);
  }, testHooks);
  return { ...plugin, cacheRoot, installDir };
}

function setPluginEnabled(configText, identity, enabled) {
  const escapedIdentity = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(
    `(^\\[plugins\\."${escapedIdentity}"\\][\\t ]*(?:\\r?\\n|$))([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`,
    "m",
  );
  const match = configText.match(sectionPattern);
  if (!match) {
    return `${configText.trimEnd()}\n\n[plugins."${identity}"]\nenabled = ${enabled}\n`;
  }
  const body = match[2];
  const nextBody = /^enabled\s*=.*$/m.test(body)
    ? body.replace(/^enabled\s*=.*$/m, `enabled = ${enabled}`)
    : `${body.trimEnd()}\nenabled = ${enabled}\n\n`;
  return configText.replace(sectionPattern, `${match[1]}${nextBody}`);
}

export async function activateOfficialCodexPluginIdentity({ configPath = defaultCodexConfigPath } = {}) {
  let configText = await fs.readFile(configPath, "utf8");
  if (!/^\[marketplaces\.claw-kit\]$/m.test(configText)) {
    throw new Error("The official claw-kit Git marketplace is not registered in Codex. Add chanyuenpang/claw-kit before installing the plugin.");
  }
  configText = setPluginEnabled(configText, "claw-kit@claw-kit", true);
  configText = setPluginEnabled(configText, "claw-kit@claw-kit-local", false);
  await fs.writeFile(configPath, configText, "utf8");
  return { configPath, enabledIdentity: "claw-kit@claw-kit", disabledIdentity: "claw-kit@claw-kit-local" };
}
