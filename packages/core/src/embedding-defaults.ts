import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_LOCAL_EMBEDDING_MODEL = "Snowflake/snowflake-arctic-embed-m-v2.0";
export const DEFAULT_LOCAL_EMBEDDING_CACHE_DIR = ".claw/models";
export const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 768;
export const LEGACY_LOCAL_EMBEDDING_DIMENSIONS = 384;

type LocalEmbeddingCacheOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homedir?: string;
  cwd?: string;
  globalCacheDir?: string;
  fallbackCacheDir?: string;
};

export function resolveDefaultLocalEmbeddingDimensions(model: string | null | undefined): number {
  const normalized = model?.trim();
  if (!normalized || normalized === DEFAULT_LOCAL_EMBEDDING_MODEL) {
    return DEFAULT_LOCAL_EMBEDDING_DIMENSIONS;
  }
  if (normalized === "Snowflake/snowflake-arctic-embed-xs") {
    return LEGACY_LOCAL_EMBEDDING_DIMENSIONS;
  }
  return LEGACY_LOCAL_EMBEDDING_DIMENSIONS;
}

export function resolveDefaultLocalEmbeddingCacheDir(options: LocalEmbeddingCacheOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homedir ?? os.homedir();

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim();
    if (localAppData) {
      return path.join(localAppData, "claw", "models");
    }
    return path.join(homeDir, "AppData", "Local", "claw", "models");
  }

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Caches", "claw", "models");
  }

  const xdgCacheHome = env.XDG_CACHE_HOME?.trim();
  if (xdgCacheHome) {
    return path.join(xdgCacheHome, "claw", "models");
  }
  return path.join(homeDir, ".cache", "claw", "models");
}

export function resolveLocalEmbeddingCacheDir(
  modelId: string,
  configuredModelCacheDir?: string | null,
  options: LocalEmbeddingCacheOptions = {},
): string {
  const configured = configuredModelCacheDir?.trim();
  const fallbackCwd = options.cwd ?? process.cwd();
  const globalCache = options.globalCacheDir
    ? path.resolve(options.globalCacheDir)
    : resolveDefaultLocalEmbeddingCacheDir(options);
  const legacyFallback = options.fallbackCacheDir
    ? path.resolve(options.fallbackCacheDir)
    : path.resolve(fallbackCwd, DEFAULT_LOCAL_EMBEDDING_CACHE_DIR);

  if (configured) {
    const configuredCache = path.resolve(configured);
    if (cacheContainsModel(configuredCache, modelId)) {
      return configuredCache;
    }
    if (cacheContainsModel(globalCache, modelId)) {
      return globalCache;
    }
    if (cacheContainsModel(legacyFallback, modelId)) {
      return legacyFallback;
    }
    if (ensureDirectory(configuredCache)) {
      return configuredCache;
    }
    if (ensureDirectory(globalCache)) {
      return globalCache;
    }
    if (ensureDirectory(legacyFallback)) {
      return legacyFallback;
    }
    return configuredCache;
  }

  if (cacheContainsModel(globalCache, modelId)) {
    return globalCache;
  }
  if (cacheContainsModel(legacyFallback, modelId)) {
    return legacyFallback;
  }
  if (ensureDirectory(globalCache)) {
    return globalCache;
  }
  if (ensureDirectory(legacyFallback)) {
    return legacyFallback;
  }
  return globalCache;
}

function ensureDirectory(targetDir: string): boolean {
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function cacheContainsModel(cacheDir: string, modelId: string): boolean {
  const normalizedModelId = modelId.trim().replace(/[\\/]+/g, path.sep);
  if (!normalizedModelId) {
    return false;
  }
  const modelDir = path.join(cacheDir, normalizedModelId);
  if (!fs.existsSync(modelDir)) {
    return false;
  }
  try {
    return fs.statSync(modelDir).isDirectory();
  } catch {
    return false;
  }
}
