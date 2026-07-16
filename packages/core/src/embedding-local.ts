import type { MemoryEmbeddingConfig } from "./types.js";

export type LocalExecutionDevice = "dml" | "cuda" | "cpu" | "wasm";

export type LocalEmbeddingResult = {
  dimensions: number;
  vectors: number[][];
  device: LocalExecutionDevice;
};

export type LocalExtractor = {
  (input: string[] | string, options: { pooling: "mean"; normalize: true }): Promise<{ data: ArrayLike<number> }>;
  dispose?: () => Promise<void> | void;
};

type ResolveLocalDeviceOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  cudaAvailable?: boolean;
};

type RunLocalEmbeddingOptions = {
  texts: string[];
  dimensions: number;
  requestedDevice: LocalExecutionDevice;
  createExtractor: (device: LocalExecutionDevice) => Promise<LocalExtractor>;
};

export type LocalEmbeddingSession = {
  readonly dimensions: number;
  readonly device: LocalExecutionDevice;
  run: (texts: string[]) => Promise<LocalEmbeddingResult>;
  dispose: () => Promise<void>;
};

type CreateLocalEmbeddingSessionOptions = Omit<RunLocalEmbeddingOptions, "texts">;

const DEFAULT_LOCAL_EMBEDDING_BATCH_SIZE = 4;

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function resolveLocalTokenizerMaxLength(
  tokenizerMaxLength: unknown,
  modelMaxPositionEmbeddings: unknown,
  requestedMaxLength?: unknown,
): number | null {
  const normalizedTokenizerMaxLength = parsePositiveInteger(tokenizerMaxLength);
  const normalizedModelMaxPositionEmbeddings = parsePositiveInteger(modelMaxPositionEmbeddings);
  const normalizedRequestedMaxLength = parsePositiveInteger(requestedMaxLength);
  const candidates = [
    normalizedTokenizerMaxLength,
    normalizedModelMaxPositionEmbeddings,
    normalizedRequestedMaxLength,
  ].filter((value): value is number => value !== null);
  if (candidates.length > 0) {
    return Math.min(...candidates);
  }
  return null;
}

export function parseLocalExecutionDevice(value: string | null | undefined): LocalExecutionDevice | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "dml" || normalized === "cuda" || normalized === "cpu" || normalized === "wasm") {
    return normalized;
  }
  return null;
}

export function resolveLocalExecutionDevice(
  embedding: MemoryEmbeddingConfig,
  options: ResolveLocalDeviceOptions = {},
): LocalExecutionDevice {
  const env = options.env ?? process.env;
  const envOverride =
    parseLocalExecutionDevice(env.CLAW_EMBEDDING_LOCAL_DEVICE) ??
    parseLocalExecutionDevice(env.CLAW_EMBEDDING_DEVICE);
  if (envOverride) {
    return envOverride;
  }

  const configuredDevice = parseLocalExecutionDevice(embedding.local?.device);
  if (configuredDevice) {
    return configuredDevice;
  }

  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    return "dml";
  }
  return options.cudaAvailable ? "cuda" : "cpu";
}

export function buildLocalDeviceAttemptOrder(requestedDevice: LocalExecutionDevice): LocalExecutionDevice[] {
  return requestedDevice === "dml" || requestedDevice === "cuda"
    ? [requestedDevice, "cpu"]
    : [requestedDevice];
}

export async function runLocalEmbeddingWithFallback(
  options: RunLocalEmbeddingOptions,
): Promise<LocalEmbeddingResult> {
  const session = await createLocalEmbeddingSession(options);
  try {
    return await session.run(options.texts);
  } finally {
    await session.dispose();
  }
}

export async function createLocalEmbeddingSession(
  options: CreateLocalEmbeddingSessionOptions,
): Promise<LocalEmbeddingSession> {
  const devicesToTry = buildLocalDeviceAttemptOrder(options.requestedDevice);
  let deviceIndex = 0;
  let activeDevice = devicesToTry[0] ?? options.requestedDevice;
  let extractor: LocalExtractor | null = null;
  let disposed = false;

  const disposeExtractor = async (): Promise<void> => {
    const current = extractor;
    extractor = null;
    if (current?.dispose) {
      await current.dispose();
    }
  };

  const run = async (texts: string[]): Promise<LocalEmbeddingResult> => {
    let lastError: unknown = null;
    while (deviceIndex < devicesToTry.length) {
      const device = devicesToTry[deviceIndex] ?? options.requestedDevice;
      try {
        if (disposed) {
          throw new Error("Local embedding session has been disposed.");
        }
        extractor ??= await options.createExtractor(device);
        activeDevice = device;
        const vectors: number[][] = [];
        for (let index = 0; index < texts.length; index += DEFAULT_LOCAL_EMBEDDING_BATCH_SIZE) {
          const batch = texts.slice(index, index + DEFAULT_LOCAL_EMBEDDING_BATCH_SIZE);
          const result = await extractor(batch, {
            pooling: "mean",
            normalize: true,
          });
          const rawData = Array.from(result.data as ArrayLike<number>);
          const inferredDimensions = batch.length > 0 ? Math.floor(rawData.length / batch.length) : 0;
          const dimensions = options.dimensions > 0 ? options.dimensions : inferredDimensions;
          vectors.push(...batch.map((_, textIndex) => {
            const start = textIndex * inferredDimensions;
            const end = start + Math.min(dimensions, inferredDimensions);
            const vector = rawData.slice(start, end);
            if (vector.length < dimensions) {
              vector.push(...Array.from({ length: dimensions - vector.length }, () => 0));
            }
            return vector;
          }));
        }
        return {
          dimensions: options.dimensions,
          vectors,
          device,
        };
      } catch (error) {
        lastError = error;
        await disposeExtractor();
        deviceIndex += 1;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to initialize local embedding model.");
  };

  return {
    dimensions: options.dimensions,
    get device() {
      return activeDevice;
    },
    run,
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      await disposeExtractor();
    },
  };
}
