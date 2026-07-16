import fs from "node:fs";
import {
  DEFAULT_LOCAL_EMBEDDING_DIMENSIONS,
} from "./embedding-defaults.js";
import {
  PersistentEmbeddingModelError,
  requestPersistentEmbedding,
} from "./embedding-daemon-protocol.js";
import {
  createConfiguredLocalEmbeddingSession,
  resolveEmbeddingDimensions,
} from "./embedding-local-runtime.js";
import type { MemoryEmbeddingConfig } from "./types.js";

type WorkerInput = {
  embedding: MemoryEmbeddingConfig;
  texts: string[];
  outputPath?: string;
};

type WorkerOutput = {
  dimensions: number;
  vectors: number[][];
  runtime?: "mock" | "persistent_daemon" | "one_shot" | "remote";
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
    runtime: "mock",
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

  try {
    const persistent = await requestPersistentEmbedding({
      embedding: input.embedding,
      texts: input.texts,
      projectCwd: process.cwd(),
    });
    if (persistent) {
      return { ...persistent, runtime: "persistent_daemon" };
    }
  } catch (error) {
    if (error instanceof PersistentEmbeddingModelError) {
      throw error;
    }
    // Transport and startup failures fall back to the original one-shot path.
  }

  const session = await createConfiguredLocalEmbeddingSession(input.embedding, process.cwd());
  try {
    const output = await session.run(input.texts);
    return { dimensions: output.dimensions, vectors: output.vectors, runtime: "one_shot" };
  } finally {
    await session.dispose();
  }
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
    runtime: "remote",
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

function resolveDimensions(embedding: MemoryEmbeddingConfig, fallback: number): number {
  return resolveEmbeddingDimensions(embedding, fallback);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown embedding worker failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
