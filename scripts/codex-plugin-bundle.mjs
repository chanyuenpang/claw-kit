import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertArtifactOutput, assembleSkills } from "./skill-artifacts.mjs";

export const CODEX_PLUGIN_PAYLOAD_PATHS = [
  ".codex-plugin", "assets", "hooks", "references", "scripts", "skills",
  "package.json", "skill-inputs.json",
];
const runtimePaths = CODEX_PLUGIN_PAYLOAD_PATHS.filter((entry) => entry !== "skills");
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
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

async function copyDirectoryContents(sourceDir, destinationDir, filterRuntime = true) {
  await fs.mkdir(destinationDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    if (filterRuntime && !shouldCopyEntry(sourcePath)) {
      continue;
    }

    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Codex plugin payload must not contain symbolic links: ${sourcePath}`);
    }
    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath, filterRuntime);
      continue;
    }

    if (!entry.isFile()) throw new Error(`Codex payload must contain regular files: ${sourcePath}`);
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
      await copyDirectoryContents(sourcePath, destinationPath, relativePath !== "skills");
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
        if (relativePath.split(path.sep)[0] !== "skills" && !shouldCopyEntry(childAbsolute)) continue;
        await visit(childAbsolute, path.join(relativePath, entry.name));
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`Codex payload must contain regular files: ${absolutePath}`);
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
  await readCodexPluginSource({ sourceDir: destinationDir });
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

/** Read a complete detached artifact, never an adapter source mirror. */
export async function readCodexPluginSource({ sourceDir } = {}) {
  if (!sourceDir) throw new Error("sourceDir must name a composed Codex artifact; use sourceRoot with export/install to build from source.");
  sourceDir = path.resolve(sourceDir);
  for (const relativePath of CODEX_PLUGIN_PAYLOAD_PATHS) await assertPayloadExists(sourceDir, relativePath);
  const manifestPath = path.join(sourceDir, ".codex-plugin", "plugin.json");
  const manifest = await readJson(manifestPath);
  if (manifest.skills !== "./skills/") throw new Error("Codex artifact must retain the installed ./skills/ interface.");
  if (!/^[a-z0-9-]+$/.test(manifest.name ?? "") || !/^[a-zA-Z0-9.+-]+$/.test(manifest.version ?? "")) throw new Error("Invalid Codex artifact identity.");
  const declaration = await readJson(path.join(sourceDir, "skill-inputs.json"));
  const actual = (await fs.readdir(path.join(sourceDir, "skills"))).sort();
  if (declaration.schemaVersion !== 1 || declaration.host !== "codex" || !Array.isArray(declaration.skills) ||
      declaration.skills.length !== 9 || new Set(declaration.skills).size !== 9 || JSON.stringify(actual) !== JSON.stringify([...declaration.skills].sort())) {
    throw new Error("Codex artifact must contain exactly its nine declared skill packages.");
  }
  for (const name of actual) await assertPayloadExists(sourceDir, `skills/${name}/SKILL.md`);
  const hooks = await readJson(path.join(sourceDir, "hooks", "hooks.json"));
  for (const [event, script] of [["SessionStart", "session-start.mjs"], ["Stop", "knowledge-finalizer.mjs"]]) {
    const hook = hooks.hooks?.[event]?.[0]?.hooks?.[0];
    if (hook?.command !== `node "$PLUGIN_ROOT/scripts/${script}"` || hook?.commandWindows !== "node ${PLUGIN_ROOT}/scripts/" + script) throw new Error(`Invalid installed Codex ${event} hook.`);
    await assertPayloadExists(sourceDir, `scripts/${script}`);
  }
  await collectPayloadHashes(sourceDir, CODEX_PLUGIN_PAYLOAD_PATHS);
  return { sourceDir, manifestPath, manifest, name: manifest.name, version: manifest.version, payloadRelativePaths: [...CODEX_PLUGIN_PAYLOAD_PATHS] };
}

async function withArtifact({ sourceRoot = repoRoot, sourceDir }, run) {
  if (sourceDir) return run(await readCodexPluginSource({ sourceDir }));
  sourceRoot = path.resolve(sourceRoot);
  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claw-kit-codex-stage-"));
  try {
    await assertArtifactOutput({ sourceRoot, outputRoot: stageRoot });
    const adapterDir = path.join(sourceRoot, "packages", "codex-adapter");
    for (const relative of runtimePaths) await assertPayloadExists(adapterDir, relative);
    await copyPayloadTree(adapterDir, stageRoot, runtimePaths);
    await assembleSkills({ sourceRoot, targetHost: "codex", outputRoot: stageRoot });
    return await run(await readCodexPluginSource({ sourceDir: stageRoot }));
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true });
  }
}

export async function exportCodexPluginBundle({ sourceRoot = repoRoot, sourceDir, outDir = defaultBundleOutDir } = {}) {
  return withArtifact({ sourceRoot, sourceDir }, async (plugin) => {
    const bundleDir = path.join(outDir, plugin.name, plugin.version);
    await assertArtifactOutput({ sourceRoot: sourceDir ?? sourceRoot, outputRoot: bundleDir });
    await replaceDirectoryAtomic(bundleDir, async (stagingDir) => {
      await copyPayloadTree(plugin.sourceDir, stagingDir, plugin.payloadRelativePaths);
      await validateCopiedPayload(plugin, stagingDir);
    });
    return { ...plugin, manifestPath: path.join(bundleDir, ".codex-plugin", "plugin.json"), sourceDir: sourceDir ?? undefined, sourceRoot: sourceDir ? undefined : path.resolve(sourceRoot), outDir, bundleDir };
  });
}

export async function installCodexPluginBundle({ sourceRoot = repoRoot, sourceDir, cacheRoot = defaultCacheRoot, testHooks } = {}) {
  return withArtifact({ sourceRoot, sourceDir }, async (plugin) => {
    const installDir = path.join(cacheRoot, plugin.name, plugin.version);
    await assertArtifactOutput({ sourceRoot: sourceDir ?? sourceRoot, outputRoot: installDir });
    await replaceDirectoryAtomic(installDir, async (stagingDir) => {
      await copyPayloadTree(plugin.sourceDir, stagingDir, plugin.payloadRelativePaths);
      await validateCopiedPayload(plugin, stagingDir);
    }, testHooks);
    return { ...plugin, manifestPath: path.join(installDir, ".codex-plugin", "plugin.json"), sourceDir: sourceDir ?? undefined, sourceRoot: sourceDir ? undefined : path.resolve(sourceRoot), cacheRoot, installDir };
  });
}

/** Compose the existing Git marketplace layout without choosing a publication target. */
export async function exportCodexMarketplace({ sourceRoot = repoRoot, outDir } = {}) {
  if (!outDir) throw new Error("outDir is required for the isolated Codex marketplace artifact.");
  const guarded = await assertArtifactOutput({ sourceRoot, outputRoot: outDir });
  sourceRoot = guarded.sourceRoot;
  outDir = guarded.outputRoot;
  const catalogPath = path.join(sourceRoot, ".agents", "plugins", "marketplace.json");
  for (let current = catalogPath; current !== sourceRoot; current = path.dirname(current)) {
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Marketplace catalog path must not contain symbolic links.");
  }
  const catalog = await readJson(catalogPath);
  const entry = catalog.plugins?.[0];
  if (catalog.plugins?.length !== 1 || entry?.name !== "claw-kit" || entry.source?.source !== "local" || entry.source?.path !== "./packages/codex-adapter") {
    throw new Error("Codex marketplace must retain its existing local adapter path.");
  }
  return withArtifact({ sourceRoot }, async (plugin) => {
    await replaceDirectoryAtomic(outDir, async (stageRoot) => {
      const catalogOutput = path.join(stageRoot, ".agents", "plugins", "marketplace.json");
      await fs.mkdir(path.dirname(catalogOutput), { recursive: true });
      await fs.copyFile(catalogPath, catalogOutput);
      const pluginOutput = path.join(stageRoot, "packages", "codex-adapter");
      await copyPayloadTree(plugin.sourceDir, pluginOutput, plugin.payloadRelativePaths);
      await validateCopiedPayload(plugin, pluginOutput);
    });
    return { marketplaceDir: outDir, pluginDir: path.join(outDir, "packages", "codex-adapter"), version: plugin.version };
  });
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

function removeTomlSection(configText, sectionName) {
  const escapedSectionName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(
    `^\\[${escapedSectionName}\\][\\t ]*(?:\\r?\\n|$)[\\s\\S]*?(?=^\\[|(?![\\s\\S]))`,
    "m",
  );
  return configText.replace(sectionPattern, "").replace(/\\r?\\n{3,}/gu, "\n\n").trimEnd() + "\n";
}

const localPluginIdentities = [
  "claw-kit@claw-kit-local",
  "claw-kit-local@personal",
  "claw-kit@claw-kit-hookfix-local",
];
const localMarketplaceNames = ["claw-kit-hookfix-local"];
const localCacheNames = ["claw-kit-hookfix-local", "claw-kit-local"];

export async function activateOfficialCodexPluginIdentity({ configPath = defaultCodexConfigPath, localCacheRoot } = {}) {
  let configText = await fs.readFile(configPath, "utf8");
  if (!/^\[marketplaces\.claw-kit\]$/m.test(configText)) {
    throw new Error("The official claw-kit Git marketplace is not registered in Codex. Add chanyuenpang/claw-kit before installing the plugin.");
  }
  configText = setPluginEnabled(configText, "claw-kit@claw-kit", true);
  for (const identity of localPluginIdentities) {
    configText = removeTomlSection(configText, `plugins."${identity}"`);
    configText = removeTomlSection(configText, `hooks.state."${identity}:hooks/hooks.json:session_start:0:0"`);
    configText = removeTomlSection(configText, `hooks.state."${identity}:hooks/hooks.json:stop:0:0"`);
  }
  for (const marketplaceName of localMarketplaceNames) {
    configText = removeTomlSection(configText, `marketplaces.${marketplaceName}`);
  }
  await fs.writeFile(configPath, configText, "utf8");
  if (localCacheRoot) {
    for (const cacheName of localCacheNames) {
      await fs.rm(path.join(localCacheRoot, cacheName), { recursive: true, force: true });
    }
  }
  return { configPath, enabledIdentity: "claw-kit@claw-kit", removedIdentities: localPluginIdentities };
}
