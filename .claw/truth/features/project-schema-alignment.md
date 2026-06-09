# Project Schema Alignment

`claw-kit` now treats the current `OpenClaw` declaration fields as canonical in `.claw/project.json`.

## Canonical Fields

- `contextPaths`
- `memory.externalDocPaths`
- `memory.embedding`
- `gitnexus.enabled`

## Current Behavior

- `claw init` writes those fields explicitly when a project is created, so later commands do not need to guess the schema.
- `contextPaths` is preserved for schema alignment but is not currently consumed by the Codex-first `claw-kit` workflow.
- `memory.externalDocPaths` drives the project search index and supports both:
  - individual files
  - directory paths like `docs/`
- External memory paths only index `.md` files from the configured path set.
- `memory.embedding` now accepts the OpenClaw-compatible subset used by `openclaw-dev`: `provider` (`openai|local`), `model`, `remote.apiKeyEnvVar`, `remote.baseUrl`, `local.modelPath`, `local.modelCacheDir`, `outputDimensionality`, `store.vector.enabled`, and `store.vector.extensionPath`.
- `claw init` and protocol normalization now auto-fill a default local embedding config when `memory.embedding` is missing, using `Snowflake/snowflake-arctic-embed-xs`, `.claw/models`, and `store.vector.enabled = true`.
- `memory.embedding.local.device` 现在是 schema 明确支持的本地设备字段，允许 `dml|cuda|cpu|wasm`；这类显式选择会在 `context.ts`、`project-check.ts` 与 `types.ts` 的协议修复/校验路径里保留下来，而不是被重置掉。
- `buildMemoryIndex` returns the project embedding config and persists `scope`, `indexed_at`, and `embedding_config` into sqlite `index_metadata` so future embedding/vector initialization can reuse stable metadata.
- `claw search index --refresh` 不再默认全量清空 project sqlite index；已有 sqlite store 会被当作增量同步目标。
- project sync 会为 `docs` 记录 `content_hash`，未变更 markdown 文档会复用既有 `docs` row 与 `doc_embeddings`；只有内容变更的文档才会替换对应 `docs` / `docs_fts` / `doc_embeddings` 并重算 embeddings。
- 当 markdown 文档已从 recall surface 删除时，refresh 会把对应记录从 `docs`、`docs_fts`、`doc_embeddings` 清理掉。
- 当 `memory.embedding` 配置变化时，refresh 会重置并重建全部向量，确保 `vectorIndex`、`embedding_config` 和实际 embeddings 保持一致。
- `claw search index --refresh` 现在生成并同步 project-scoped vectors from `memory.embedding` and stores `vectorIndex` metadata in sqlite alongside the embeddings.
- The local embedding provider follows the GitNexus-style setup: default model `Snowflake/snowflake-arctic-embed-xs`, 384 dimensions, and a Windows DirectML-first path that falls back to CPU when DirectML fails.
- 本地设备选择现在通过 `packages/core/src/embedding-local.ts` 统一收敛：环境变量 `CLAW_EMBEDDING_LOCAL_DEVICE` / `CLAW_EMBEDDING_DEVICE` 优先于 `.claw/project.json` 的 `memory.embedding.local.device`，再退回平台默认；GPU 类设备 `dml` / `cuda` 都会带着 `cpu` 的重试序列，保证首轮真实推理失败后还能触发 CPU rescue。
- 这意味着 CPU rescue 既可以来自一次性环境覆盖，也可以来自稳定的 per-project local device 配置。
- `packages/core/src/embedding-worker.ts` is the dedicated worker that builds the embedding outputs.
- `claw context` / protocol repair therefore upgrades older `.claw/project.json` files in-place instead of leaving them on a no-embedding schema.
- In the `claw-kit` repo itself, `memory.externalDocPaths` is intentionally empty, so project recall stays on `.claw` memory/truth Markdown and does not pull `docs/` into the search surface.
- project-level `claw search --query "<topic>"` 除了 query embedding 之外，现在还会先构造 project keyword search plan。
- 对多词 query，planner 会同时保留整句 multi-term `MATCH` 和逐词 fallback query，而不是只把原始 query 直接喂给一次 FTS。
- 这条 planner 对中文多词查询同样有效；例如 `搜打撤 哈基宝` 会展开为 exact multi-term query 加单词级 fallback，从而避免 recall 过度依赖“所有词必须同条命中”。
- project-level hybrid search 会先汇总这些 keyword candidates，再与现有 vector recall 融合，因此提升的是 recall 质量，而不是放弃 vector-required contract。
- `packages/core/src/memory-query.ts` 新增 `extractProjectKeywordTerms()`，让 project search 的 query-term 抽取和 keyword planner 共享同一套中文/多词入口。
- `packages/core/src/memory.ts` 的 project-scoped hybrid search 现在加入 document-level ranking signals，包括 `query term coverage`、`matched-character density / content focus`、`path / filename hits` 和 `exact phrase boost`，用来提高中文精确命中文档的前排优先级，避免 `.claw` memory / truth 或泛噪声文档抢位。
- Project-level search requires vector indexing to be configured and refreshed; missing `memory.embedding`, missing `vector_index` metadata, or missing stored vectors now fail with `MEMORY_VECTOR_INDEX_REQUIRED` instead of silently degrading.
- Task-scope memory search still uses the existing active-plan-plus-task-memory FTS path and does not participate in the hybrid/vector recall flow.
- Codex-facing recall is `claw search --query "<topic>"`; this reads the indexed project context before planning or investigation, and it remains document recall rather than code search.
- `claw memory ...` remains as legacy/debug and low-level index management, not the primary Codex workflow term.
- `claw plan done` rebuilds project/task search indexes and only refreshes GitNexus when `gitnexus.enabled` is `true`.
- When the installed GitNexus CLI does not support `--no-ai-context`, `claw plan done` falls back to plain `gitnexus analyze`.
- The hybrid project query path is adapted from the more mature `openclaw-dev` memory query design, but only the minimal `claw-kit` subset was adopted.
- 这次 multi-term 中文 recall 的迁移同样参考 `openclaw-dev` 的 memory search 设计，但在 `claw-kit` 中只搬运了适合当前项目的 query planner + keyword recall + vector fusion 最小子集。
- incremental refresh 的存在不改变 project search 的可用性契约：project recall 依然要求 vector index，不能回退成纯 FTS fallback。
- 这套 refresh 语义参考的是 `openclaw-dev` 对已有 sqlite 的 incremental bootstrap / sync 思路，但 `claw-kit` 只搬运了适合当前项目的最小 sqlite 增量迁移子集。

## Evidence

- [packages/core/src/init.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/init.ts)
- [packages/core/src/memory.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/memory.ts)
- [packages/core/src/embedding-worker.ts](D:/Users/chany/Documents/claw-kit/packages/core/src/embedding-worker.ts)
- [packages/cli/src/cli.ts](D:/Users/chany/Documents/claw-kit/packages/cli/src/cli.ts)
- [packages/core/test/core.test.ts](D:/Users/chany/Documents/claw-kit/packages/core/test/core.test.ts)
- [packages/cli/README.md](D:/Users/chany/Documents/claw-kit/packages/cli/README.md)
- [README.md](D:/Users/chany/Documents/claw-kit/README.md)
- [docs/2026-06-06-project-schema-alignment-execution.md](D:/Users/chany/Documents/claw-kit/docs/2026-06-06-project-schema-alignment-execution.md)
