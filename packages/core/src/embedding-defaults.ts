export const DEFAULT_LOCAL_EMBEDDING_MODEL = "Snowflake/snowflake-arctic-embed-m-v2.0";
export const DEFAULT_LOCAL_EMBEDDING_CACHE_DIR = ".claw/models";
export const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 768;
export const LEGACY_LOCAL_EMBEDDING_DIMENSIONS = 384;

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
