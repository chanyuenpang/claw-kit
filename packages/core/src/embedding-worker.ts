import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  resolveLocalExecutionDevice,
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
  const dimensions = resolveDimensions(input.embedding, 384);
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
      dimensions: resolveDimensions(input.embedding, 384),
      vectors: [],
    };
  }

  if (!process.env.ORT_LOG_LEVEL) {
    process.env.ORT_LOG_LEVEL = "3";
  }

  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  if (input.embedding.local?.modelCacheDir?.trim()) {
    env.cacheDir = path.resolve(input.embedding.local.modelCacheDir);
  }

  const modelId = input.embedding.local?.modelPath?.trim() || input.embedding.model;
  const requestedDevice = resolveLocalExecutionDevice(input.embedding, {
    cudaAvailable: isCudaAvailable(),
  });
  const output = await runLocalEmbeddingWithFallback({
    texts: input.texts,
    dimensions: resolveDimensions(input.embedding, 384),
    requestedDevice,
    createExtractor: async (device) =>
      (pipeline as unknown as (
        task: "feature-extraction",
        model: string,
        options: Record<string, unknown>,
      ) => Promise<{
        (input: string[] | string, options: { pooling: "mean"; normalize: true }): Promise<{ data: ArrayLike<number> }>;
        dispose?: () => Promise<void> | void;
      }>)("feature-extraction", modelId, {
        device,
        dtype: "fp32",
        session_options: { logSeverityLevel: 3 },
      }),
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
    return 384;
  }
  return fallback > 0 ? fallback : 1536;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown embedding worker failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
