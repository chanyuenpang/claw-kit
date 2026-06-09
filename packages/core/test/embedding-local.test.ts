import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalDeviceAttemptOrder,
  resolveLocalExecutionDevice,
  runLocalEmbeddingWithFallback,
} from "../src/embedding-local.js";
import type { MemoryEmbeddingConfig } from "../src/types.js";

function createEmbedding(local: MemoryEmbeddingConfig["local"] = {}): MemoryEmbeddingConfig {
  return {
    provider: "local",
    model: "Snowflake/snowflake-arctic-embed-xs",
    local,
    store: {
      vector: {
        enabled: true,
      },
    },
  };
}

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

  assert.equal(batchInputs.length, 2);
  assert.equal(batchInputs[0]?.length, 32);
  assert.equal(batchInputs[1]?.length, 3);
  assert.equal(result.vectors.length, 35);
  assert.deepEqual(result.vectors[0], [1, 101]);
  assert.deepEqual(result.vectors[31], [32, 132]);
  assert.deepEqual(result.vectors[32], [1, 101]);
  assert.deepEqual(result.vectors[34], [3, 103]);
});
