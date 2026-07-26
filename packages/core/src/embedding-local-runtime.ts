import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  DEFAULT_LOCAL_EMBEDDING_DIMENSIONS,
  resolveDefaultLocalEmbeddingDimensions,
  resolveLocalEmbeddingCacheDir,
} from "./embedding-defaults.js";
import {
  createLocalEmbeddingSession,
  resolveLocalExecutionDevice,
  resolveLocalTokenizerMaxLength,
  type LocalEmbeddingSession,
} from "./embedding-local.js";
import { resolveTransformersModule } from "./embedding-transformers.js";
import type { MemoryEmbeddingConfig } from "./types.js";

const DEFAULT_EMBEDDING_MAX_TOKENS = 2048;

type LocalPipelineExtractor = {
  (input: string[] | string, options: { pooling: "mean"; normalize: true }): Promise<{ data: ArrayLike<number> }>;
  dispose?: () => Promise<void> | void;
  tokenizer?: { model_max_length?: number };
  model?: { config?: { max_position_embeddings?: number } };
};

export type ConfiguredLocalEmbeddingSession = LocalEmbeddingSession & {
  fingerprint: string;
};

export async function createConfiguredLocalEmbeddingSession(
  embedding: MemoryEmbeddingConfig,
  projectCwd: string,
): Promise<ConfiguredLocalEmbeddingSession> {
  if (!process.env.ORT_LOG_LEVEL) {
    process.env.ORT_LOG_LEVEL = "3";
  }
  const projectRequire = createRequire(path.join(projectCwd, "package.json"));
  const workerRequire = createRequire(import.meta.url);
  const resolvedModulePath = resolveTransformersModulePath(projectRequire, workerRequire);
  const { pipeline, env } = resolveTransformersModule(projectRequire, workerRequire);
  env.allowLocalModels = false;
  const modelId = embedding.local?.modelPath?.trim() || embedding.model;
  const cacheDir = resolveLocalEmbeddingCacheDir(modelId, embedding.local?.modelCacheDir, { cwd: projectCwd });
  env.cacheDir = cacheDir;
  const requestedDevice = resolveLocalExecutionDevice(embedding, { cudaAvailable: isCudaAvailable() });
  const dimensions = resolveEmbeddingDimensions(embedding, DEFAULT_LOCAL_EMBEDDING_DIMENSIONS);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      version: 1,
      resolvedModulePath,
      modelId,
      modelSignature: resolveModelSignature(embedding.local?.modelPath),
      cacheDir,
      dimensions,
      requestedDevice,
      dtype: "fp32",
      pooling: "mean",
      normalize: true,
      tokenizerMaxLength: DEFAULT_EMBEDDING_MAX_TOKENS,
    }))
    .digest("hex");

  const session = await createLocalEmbeddingSession({
    dimensions,
    requestedDevice,
    createExtractor: async (device) => {
      const extractor = await (pipeline as unknown as (
        task: "feature-extraction",
        model: string,
        options: Record<string, unknown>,
      ) => Promise<LocalPipelineExtractor>)("feature-extraction", modelId, {
        device,
        dtype: "fp32",
        session_options: { logSeverityLevel: 3 },
      });
      const safeTokenizerMaxLength = resolveLocalTokenizerMaxLength(
        extractor.tokenizer?.model_max_length,
        extractor.model?.config?.max_position_embeddings,
        DEFAULT_EMBEDDING_MAX_TOKENS,
      );
      if (safeTokenizerMaxLength !== null && extractor.tokenizer) {
        extractor.tokenizer.model_max_length = safeTokenizerMaxLength;
      }
      return extractor;
    },
  });
  return Object.assign(session, { fingerprint });
}

export function resolveConfiguredLocalEmbeddingFingerprint(
  embedding: MemoryEmbeddingConfig,
  projectCwd: string,
): string {
  const projectRequire = createRequire(path.join(projectCwd, "package.json"));
  const workerRequire = createRequire(import.meta.url);
  const modelId = embedding.local?.modelPath?.trim() || embedding.model;
  const cacheDir = resolveLocalEmbeddingCacheDir(modelId, embedding.local?.modelCacheDir, { cwd: projectCwd });
  return createHash("sha256")
    .update(JSON.stringify({
      version: 1,
      resolvedModulePath: resolveTransformersModulePath(projectRequire, workerRequire),
      modelId,
      modelSignature: resolveModelSignature(embedding.local?.modelPath),
      cacheDir,
      dimensions: resolveEmbeddingDimensions(embedding, DEFAULT_LOCAL_EMBEDDING_DIMENSIONS),
      requestedDevice: resolveLocalExecutionDevice(embedding, { cudaAvailable: isCudaAvailable() }),
      dtype: "fp32",
      pooling: "mean",
      normalize: true,
      tokenizerMaxLength: DEFAULT_EMBEDDING_MAX_TOKENS,
    }))
    .digest("hex");
}

export function resolveEmbeddingDimensions(embedding: MemoryEmbeddingConfig, fallback: number): number {
  if (typeof embedding.outputDimensionality === "number" && embedding.outputDimensionality > 0) {
    return embedding.outputDimensionality;
  }
  if (embedding.provider === "local") {
    return resolveDefaultLocalEmbeddingDimensions(embedding.model);
  }
  return fallback > 0 ? fallback : 1536;
}

function resolveTransformersModulePath(
  projectRequire: NodeJS.Require,
  workerRequire: NodeJS.Require,
): string {
  try {
    return projectRequire.resolve("@huggingface/transformers");
  } catch {
    return workerRequire.resolve("@huggingface/transformers");
  }
}

function resolveModelSignature(modelPath: string | undefined): string | null {
  if (!modelPath?.trim()) {
    return null;
  }
  try {
    const stats = fs.statSync(modelPath);
    return `${stats.size}:${stats.mtimeMs}`;
  } catch {
    return "missing";
  }
}

function isCudaAvailable(): boolean {
  try {
    const out = execFileSync("ldconfig", ["-p"], { timeout: 3000, encoding: "utf-8" });
    if (out.includes("libcublasLt.so.12")) {
      return true;
    }
  } catch {
    // Ignore.
  }
  for (const envVar of ["CUDA_PATH", "LD_LIBRARY_PATH"]) {
    const value = process.env[envVar];
    if (!value) {
      continue;
    }
    for (const candidate of value.split(path.delimiter).filter(Boolean)) {
      if (
        fs.existsSync(path.join(candidate, "lib64", "libcublasLt.so.12"))
        || fs.existsSync(path.join(candidate, "lib", "libcublasLt.so.12"))
        || fs.existsSync(path.join(candidate, "libcublasLt.so.12"))
      ) {
        return true;
      }
    }
  }
  return false;
}
