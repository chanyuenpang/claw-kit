import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  DEFAULT_LOCAL_EMBEDDING_DIMENSIONS,
  resolveDefaultLocalEmbeddingDimensions,
  resolveLocalEmbeddingCacheDir,
} from "./embedding-defaults.js";
import {
  resolveLocalExecutionDevice,
  resolveLocalTokenizerMaxLength,
  runLocalEmbeddingWithFallback,
} from "./embedding-local.js";
import type { MemoryEmbeddingConfig } from "./types.js";

type WorkerInput = {
  embedding: MemoryEmbeddingConfig;
  texts: string[];
  outputPath?: string;
};

type WorkerOutput = {
  dimensions: number;
  vectors: number[][];
};

const DEFAULT_EMBEDDING_MAX_TOKENS = 2048;

type LocalPipelineExtractor = {
  (input: string[] | string, options: { pooling: "mean"; normalize: true }): Promise<{ data: ArrayLike<number> }>;
  dispose?: () => Promise<void> | void;
  tokenizer?: {
    model_max_length?: number;
  };
  model?: {
    config?: {
      max_position_embeddings?: number;
    };
  };
};

async function main(): Promise<void> {
  const raw = fs.readFileSync(0, "utf-8").trim();
  if (!raw) {
    throw new Error("Missing embedding worker input.");
  }
  const input = JSON.parse(raw) as WorkerInput;
  const output =
    process.env.CLAW_EMBEDDING_MOCK === "1"
      ? buildMockOutput(input)
      : input.embedding.provider === "local"
        ? await buildLocalOutput(input)
        : await buildOpenAiOutput(input);
  if (input.outputPath?.trim()) {
    fs.writeFileSync(input.outputPath, `${JSON.stringify(output)}\n`, "utf-8");
    process.stdout.write(`${JSON.stringify({
      dimensions: output.dimensions,
      vectorCount: output.vectors.length,
      outputPath: input.outputPath,
    })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function buildMockOutput(input: WorkerInput): WorkerOutput {
  const dimensions = resolveDimensions(input.embedding, DEFAULT_LOCAL_EMBEDDING_DIMENSIONS);
  return {
    dimensions,
    vectors: input.texts.map((text, textIndex) => buildMockVector(text, dimensions, textIndex)),
  };
}

function buildMockVector(text: string, dimensions: number, textIndex: number): number[] {
  let seed = textIndex + 1;
  for (let index = 0; index < text.length; index += 1) {
    seed = (seed * 31 + text.charCodeAt(index)) % 104729;
  }
  return Array.from({ length: dimensions }, (_, index) => ((seed + index * 17) % 1000) / 1000);
}

async function buildLocalOutput(input: WorkerInput): Promise<WorkerOutput> {
  if (!input.texts.length) {
    return {
      dimensions: resolveDimensions(input.embedding, DEFAULT_LOCAL_EMBEDDING_DIMENSIONS),
      vectors: [],
    };
  }

  if (!process.env.ORT_LOG_LEVEL) {
    process.env.ORT_LOG_LEVEL = "3";
  }

  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  const modelId = input.embedding.local?.modelPath?.trim() || input.embedding.model;
  env.cacheDir = resolveLocalEmbeddingCacheDir(modelId, input.embedding.local?.modelCacheDir, {
    cwd: process.cwd(),
  });
  const requestedDevice = resolveLocalExecutionDevice(input.embedding, {
    cudaAvailable: isCudaAvailable(),
  });
  const output = await runLocalEmbeddingWithFallback({
    texts: input.texts,
    dimensions: resolveDimensions(input.embedding, DEFAULT_LOCAL_EMBEDDING_DIMENSIONS),
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

  return {
    dimensions: output.dimensions,
    vectors: output.vectors,
  };
}

async function buildOpenAiOutput(input: WorkerInput): Promise<WorkerOutput> {
  if (!input.texts.length) {
    return {
      dimensions: resolveDimensions(input.embedding, 1536),
      vectors: [],
    };
  }

  const apiKeyEnvVar = input.embedding.remote?.apiKeyEnvVar?.trim();
  const apiKey = apiKeyEnvVar ? process.env[apiKeyEnvVar]?.trim() : "";
  if (!apiKey) {
    throw new Error(`Missing OpenAI embedding API key from env var: ${apiKeyEnvVar || "<unset>"}`);
  }

  const response = await fetch(resolveOpenAiBaseUrl(input.embedding), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: input.embedding.model,
      input: input.texts,
      ...(typeof input.embedding.outputDimensionality === "number" && input.embedding.outputDimensionality > 0
        ? { dimensions: input.embedding.outputDimensionality }
        : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vectors = payload.data?.map((entry) => entry.embedding ?? []) ?? [];
  const dimensions = vectors[0]?.length ?? resolveDimensions(input.embedding, 1536);
  return {
    dimensions,
    vectors,
  };
}

function resolveOpenAiBaseUrl(embedding: MemoryEmbeddingConfig): string {
  const configured = embedding.remote?.baseUrl?.trim();
  if (!configured) {
    return "https://api.openai.com/v1/embeddings";
  }
  return configured.endsWith("/embeddings")
    ? configured
    : `${configured.replace(/\/+$/, "")}/embeddings`;
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
    for (const candidate of value.split(":").filter(Boolean)) {
      if (
        fs.existsSync(path.join(candidate, "lib64", "libcublasLt.so.12")) ||
        fs.existsSync(path.join(candidate, "lib", "libcublasLt.so.12")) ||
        fs.existsSync(path.join(candidate, "libcublasLt.so.12"))
      ) {
        return true;
      }
    }
  }

  return false;
}

function resolveDimensions(embedding: MemoryEmbeddingConfig, fallback: number): number {
  if (typeof embedding.outputDimensionality === "number" && embedding.outputDimensionality > 0) {
    return embedding.outputDimensionality;
  }
  if (embedding.provider === "local") {
    return resolveDefaultLocalEmbeddingDimensions(embedding.model);
  }
  return fallback > 0 ? fallback : 1536;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown embedding worker failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
