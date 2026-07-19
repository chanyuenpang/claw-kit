import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCAL_EMBEDDING_DIMENSIONS,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  resolveDefaultLocalEmbeddingDimensions,
} from "../src/embedding-defaults.js";
import {
  buildLocalDeviceAttemptOrder,
  createLocalEmbeddingSession,
  resolveLocalExecutionDevice,
  resolveLocalTokenizerMaxLength,
  runLocalEmbeddingWithFallback,
} from "../src/embedding-local.js";
import type { MemoryEmbeddingConfig } from "../src/types.js";

function createEmbedding(local: MemoryEmbeddingConfig["local"] = {}): MemoryEmbeddingConfig {
  return {
    provider: "local",
    model: "Snowflake/snowflake-arctic-embed-xs",
    local,
  };
}

test("default local embedding uses Jina at 768 dimensions while preserving Snowflake alternatives", () => {
  assert.equal(DEFAULT_LOCAL_EMBEDDING_MODEL, "jinaai/jina-embeddings-v2-base-zh");
  assert.equal(DEFAULT_LOCAL_EMBEDDING_DIMENSIONS, 768);
  assert.equal(resolveDefaultLocalEmbeddingDimensions("jinaai/jina-embeddings-v2-base-zh"), 768);
  assert.equal(resolveDefaultLocalEmbeddingDimensions("Snowflake/snowflake-arctic-embed-m-v2.0"), 768);
  assert.equal(resolveDefaultLocalEmbeddingDimensions("Snowflake/snowflake-arctic-embed-xs"), 384);
});

test("resolveLocalExecutionDevice prefers environment override over config and platform defaults", () => {
  const fromEnv = resolveLocalExecutionDevice(
    createEmbedding({ device: "dml" }),
    {
      env: {
        CLAW_EMBEDDING_LOCAL_DEVICE: "cpu",
      },
      platform: "win32",
      cudaAvailable: true,
    },
  );
  const fromConfig = resolveLocalExecutionDevice(
    createEmbedding({ device: "wasm" }),
    {
      env: {},
      platform: "win32",
      cudaAvailable: true,
    },
  );
  const fromDefault = resolveLocalExecutionDevice(
    createEmbedding(),
    {
      env: {},
      platform: "linux",
      cudaAvailable: false,
    },
  );

  assert.equal(fromEnv, "cpu");
  assert.equal(fromConfig, "wasm");
  assert.equal(fromDefault, "cpu");
});

test("buildLocalDeviceAttemptOrder retries cpu after gpu-class devices only", () => {
  assert.deepEqual(buildLocalDeviceAttemptOrder("dml"), ["dml", "cpu"]);
  assert.deepEqual(buildLocalDeviceAttemptOrder("cuda"), ["cuda", "cpu"]);
  assert.deepEqual(buildLocalDeviceAttemptOrder("cpu"), ["cpu"]);
  assert.deepEqual(buildLocalDeviceAttemptOrder("wasm"), ["wasm"]);
});

test("resolveLocalTokenizerMaxLength clamps tokenizer max length to the model limit", () => {
  assert.equal(resolveLocalTokenizerMaxLength(32768, 8192), 8192);
  assert.equal(resolveLocalTokenizerMaxLength(4096, 8192, 2048), 2048);
  assert.equal(resolveLocalTokenizerMaxLength(null, 8192, 2048), 2048);
  assert.equal(resolveLocalTokenizerMaxLength(32768, null, 2048), 2048);
  assert.equal(resolveLocalTokenizerMaxLength(0, 0), null);
});

test("runLocalEmbeddingWithFallback retries cpu after gpu runtime failure", async () => {
  const attempts: string[] = [];
  const result = await runLocalEmbeddingWithFallback({
    texts: ["alpha", "beta"],
    dimensions: 3,
    requestedDevice: "dml",
    createExtractor: async (device) => {
      attempts.push(device);
      if (device === "dml") {
        return async () => {
          throw new Error("DirectML execution failed");
        };
      }
      return async () => ({
        data: [1, 2, 3, 4, 5, 6],
      });
    },
  });

  assert.deepEqual(attempts, ["dml", "cpu"]);
  assert.equal(result.device, "cpu");
  assert.deepEqual(result.vectors, [
    [1, 2, 3],
    [4, 5, 6],
  ]);
});

test("runLocalEmbeddingWithFallback honors explicit cpu selection without gpu attempt", async () => {
  const attempts: string[] = [];
  const result = await runLocalEmbeddingWithFallback({
    texts: ["alpha"],
    dimensions: 2,
    requestedDevice: "cpu",
    createExtractor: async (device) => {
      attempts.push(device);
      return async () => ({
        data: [9, 8],
      });
    },
  });

  assert.deepEqual(attempts, ["cpu"]);
  assert.equal(result.device, "cpu");
  assert.deepEqual(result.vectors, [[9, 8]]);
});

test("runLocalEmbeddingWithFallback splits large text sets into bounded batches", async () => {
  const batchInputs: string[][] = [];
  const texts = Array.from({ length: 35 }, (_, index) => `doc-${index}`);
  const result = await runLocalEmbeddingWithFallback({
    texts,
    dimensions: 2,
    requestedDevice: "cpu",
    createExtractor: async () =>
      async (batch) => {
        const batchTexts = Array.isArray(batch) ? batch : [batch];
        batchInputs.push(batchTexts);
        const flattened = batchTexts.flatMap((_, index) => [index + 1, index + 101]);
        return {
          data: flattened,
        };
      },
  });

  assert.equal(batchInputs.length, 9);
  assert.equal(batchInputs[0]?.length, 4);
  assert.equal(batchInputs[7]?.length, 4);
  assert.equal(batchInputs[8]?.length, 3);
  assert.equal(result.vectors.length, 35);
  assert.deepEqual(result.vectors[0], [1, 101]);
  assert.deepEqual(result.vectors[3], [4, 104]);
  assert.deepEqual(result.vectors[31], [4, 104]);
  assert.deepEqual(result.vectors[32], [1, 101]);
  assert.deepEqual(result.vectors[34], [3, 103]);
});

test("createLocalEmbeddingSession reuses one extractor across multiple runs", async () => {
  let createCount = 0;
  let disposeCount = 0;
  const session = await createLocalEmbeddingSession({
    dimensions: 2,
    requestedDevice: "cpu",
    createExtractor: async () => {
      createCount += 1;
      const extractor = (async (input: string[] | string) => {
        const texts = Array.isArray(input) ? input : [input];
        return { data: texts.flatMap((text) => [text.length, text.length + 1]) };
      }) as Awaited<ReturnType<Parameters<typeof createLocalEmbeddingSession>[0]["createExtractor"]>>;
      extractor.dispose = async () => {
        disposeCount += 1;
      };
      return extractor;
    },
  });

  const first = await session.run(["a"]);
  const second = await session.run(["bb"]);
  await session.dispose();
  await session.dispose();

  assert.equal(createCount, 1);
  assert.equal(disposeCount, 1);
  assert.deepEqual(first.vectors, [[1, 2]]);
  assert.deepEqual(second.vectors, [[2, 3]]);
});
