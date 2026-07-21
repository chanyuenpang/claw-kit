# Project Schema Alignment

`claw-kit` now treats the current `OpenClaw` declaration fields as canonical in `.claw/project.json`.

<!-- state: current -->
## Canonical Fields

- `contextPaths`
- `memory.externalDocPaths`
- `memory.embedding`
- `planning`
- `autoUpdate`
- `autoCommitKnowledge`
- `externalPlanningSkill`
- `goalMode`
- `knowledgeWriter`
- `gitnexus`

## Current Behavior

- `claw init` writes those fields explicitly when a project is created, so later commands do not need to guess the schema.
- runtime project resolution now loads canonical `.claw/project.json` first, then deep-merges `.claw/project-override.json` on top when that gitignored override file exists.
- `project-override.json` is a full project-surface override layer rather than a narrow patch list: it may override any `project.json` field, but personal overrides should use the same flat canonical workflow fields as `.claw/project.json`.
- override merge keeps explicit `null` as a real project-level value; `null` in `.claw/project-override.json` must not be treated as "missing" and must not fall back to team config or built-in inherited values.
- `contextPaths` is preserved for schema alignment but is not currently consumed by the Codex-first `claw-kit` workflow.
- `memory.externalDocPaths` drives the project search index and supports both:
  - individual files
  - directory paths like `docs/`
- External memory paths only index `.md` files from the configured path set.
- `memory.embedding` now accepts the OpenClaw-compatible subset used by `openclaw-dev`: `provider` (`openai|local`), `model`, `remote.apiKeyEnvVar`, `remote.baseUrl`, `local.modelPath`, `local.modelCacheDir`, `outputDimensionality`, `store.vector.enabled`, and `store.vector.extensionPath`.
- canonical `.claw/project.json` carries simple project-level workflow toggles as flat fields: `planning`, `autoUpdate`, `autoCommitKnowledge`, `externalPlanningSkill`, `goalMode`, and `gitnexus`; combined writer configuration is owned by the nested `knowledgeWriter` object.
- `autoUpdate` is an explicit project-level boolean gate with default `true`; projects can set it to `false` when version drift should stay informational only.
- `autoCommitKnowledge` is an explicit project-level boolean gate with default `true`; when set to `false`, successful knowledge finalization still writes and governs Truth/ADR documents, records the result, and queues index refresh, but leaves those document changes uncommitted in the working tree.
- legacy nested inputs such as `workflow.goalMode.enabled`, `workflow.truthDispatch.mode`, and `gitnexus.enabled` are compatibility inputs for protocol repair; repaired canonical files are flattened instead of preserving those nested containers.
- The 2026-06-23 compatibility fixture run remains historical evidence for flattening legacy `workflow.goalMode.enabled`, `workflow.truthDispatch.mode`, and object `gitnexus.enabled`; current repair no longer promotes `truthDispatch` into canonical project output.
- Current repair fills `planning`, `externalPlanningSkill`, and the canonical `knowledgeWriter` object; `knowledgeWriter.externalSkills` is the ordered current writer configuration.
- `claw init` and protocol normalization now auto-fill a minimal default local embedding config when `memory.embedding` is missing, using `jinaai/jina-embeddings-v2-base-zh`; default vector indexing remains runtime-enabled without persisting `store.vector.enabled = true`, `store.vector` is retained only for explicit `enabled: false` or `extensionPath`, and the default cache location is runtime-resolved instead of being persisted into `project.json`.
- `packages/core/src/embedding-defaults.ts` now resolves platform-global cache roots (`%LOCALAPPDATA%\\claw\\models` on Windows, `~/Library/Caches/claw/models` on macOS, and `$XDG_CACHE_HOME/claw/models` or `~/.cache/claw/models` on Linux) and the local/global/fallback cache-selection order for embedding models.
- `packages/core/src/embedding-worker.ts` now resolves cache usage by model id: explicit local cache wins only when that local cache already contains the model; otherwise an existing global cache is reused; if both are missing, downloads go to the explicit local cache when configured, or to the global cache by default.
- `packages/core/src/project-check.ts` 里的 `ensureProjectProtocol -> normalizeProjectConfig` 是既有项目自动迁移的最佳落点，因为它会在协议修复时回写 `project.json`。
- `packages/core/src/context.ts` now owns the runtime project-resolution step that combines canonical config with the optional override layer before downstream workflow guidance reads the result.
- `packages/core/src/init.ts` no longer writes a default `modelCacheDir` into new project config, and `packages/core/src/project-check.ts` removes legacy `.claw/models` during protocol normalization so shared-cache semantics stay implicit while explicit custom paths remain intact.
- 在当前 `claw-kit` 仓库里，这条迁移已经落地为可见结果：`.claw/project.json` 里不再保留 legacy `memory.embedding.local.modelCacheDir = ".claw/models"`，因此仓库配置本身不再把项目内模型缓存目录当作必需契约；运行时仍可能按 fallback / recovery 语义在 `.claw/models` 下保留或重建本地缓存。
- `memory.embedding.local.device` 现在是 schema 明确支持的本地设备字段，允许 `dml|cuda|cpu|wasm`；这类显式选择会在 `context.ts`、`project-check.ts` 与 `types.ts` 的协议修复/校验路径里保留下来，而不是被重置掉。
- `buildMemoryIndex` returns the project embedding config and persists `scope`, `indexed_at`, and `embedding_config` into sqlite `index_metadata` so future embedding/vector initialization can reuse stable metadata.
- `claw search index --refresh` 不再默认全量清空 project sqlite index；已有 sqlite store 会被当作增量同步目标。
- project sync 会为 `docs` 记录 `content_hash`，未变更 markdown 文档会复用既有 `docs` row 与 `doc_embeddings`；只有内容变更的文档才会替换对应 `docs` / `docs_fts` / `doc_embeddings` 并重算 embeddings。
- 如果 `docs` 记录已经存在但 `doc_embeddings` 为空，`packages/core/src/memory.ts` 会在 `insertDocs` 之后再扫描 `listDocsMissingEmbeddings(db)`，并调用 `indexDocEmbeddings` 回填这些旧文档的向量。
- 当 markdown 文档已从 recall surface 删除时，refresh 会把对应记录从 `docs`、`docs_fts`、`doc_embeddings` 清理掉。
- 当 `memory.embedding` 配置变化时，refresh 会重置并重建全部向量，确保 `vectorIndex`、`embedding_config` 和实际 embeddings 保持一致。
- 当 `memory.embedding` 配置变化触发向量 reset 时，refresh 仍保留 bounded batching 合同：`packages/core/src/memory.ts` 中控制文件限流的 `canLimitFiles` 只取决于 `maxFiles > 0`，不会因为 `requiresVectorReset` 而关闭默认的 100 文件节流。
- 因此，embedding 配置切换后的 project refresh 仍可能暂时只包含当前批次的 docs / vectors；后续 refresh 会继续补完剩余文件，而不是一次性整库重建。
- `claw search index --refresh` 现在生成并同步 project-scoped vectors from `memory.embedding` and stores `vectorIndex` metadata in sqlite alongside the embeddings.
- The local embedding provider follows the GitNexus-style setup: default model `jinaai/jina-embeddings-v2-base-zh`, model-derived default dimensions, and a Windows DirectML-first path that falls back to CPU when DirectML fails.
- The active project config in `.claw/project.json` explicitly points local embedding at `jinaai/jina-embeddings-v2-base-zh` with `outputDimensionality: 768` and without pinning a `modelCacheDir`; cache resolution is runtime-driven between local fallback and shared machine-global surfaces.
- 默认 local 维度不再对所有模型一律硬编码成 `384`。当前契约是：
- 默认 `jinaai/jina-embeddings-v2-base-zh` 与显式 `Snowflake/snowflake-arctic-embed-m-v2.0` 都解析为 `768` 维
- 显式 `Snowflake/snowflake-arctic-embed-xs` 继续默认 `384` 维
- 如果 `.claw/project.json` 显式提供 `memory.embedding.outputDimensionality`，它仍然优先覆盖模型推导出的默认维度
- 这套按模型解析默认维度的逻辑由 `packages/core/src/embedding-defaults.ts` 统一提供，并同时被 `packages/core/src/init.ts`、`packages/core/src/project-check.ts`、`packages/core/src/embedding-worker.ts` 和 `packages/core/src/memory.ts` 复用，避免 `claw init`、协议修复、worker 输出和 `vectorIndex` metadata 之间出现维度漂移。
- 本地设备选择现在通过 `packages/core/src/embedding-local.ts` 统一收敛：环境变量 `CLAW_EMBEDDING_LOCAL_DEVICE` / `CLAW_EMBEDDING_DEVICE` 优先于 `.claw/project.json` 的 `memory.embedding.local.device`，再退回平台默认；GPU 类设备 `dml` / `cuda` 都会带着 `cpu` 的重试序列，保证首轮真实推理失败后还能触发 CPU rescue。
- 这意味着 CPU rescue 既可以来自一次性环境覆盖，也可以来自稳定的 per-project local device 配置。
- `packages/core/src/embedding-worker.ts` is the dedicated worker that builds the embedding outputs.
- `claw context` / protocol repair therefore upgrades older `.claw/project.json` files in-place instead of leaving them on a no-embedding schema.
- when workflow defaults are omitted, canonical `project.json` remains the source of truth for `goalMode` and the `knowledgeWriter` configuration; the optional override file only changes the effective runtime result for the current repo checkout.
- In the `claw-kit` repo itself, `memory.externalDocPaths` is intentionally empty, so project recall stays on `.claw` memory/truth Markdown and does not pull `docs/` into the search surface.
- project-level `claw search --query "<topic>"` 会在 vector-required contract 内组合 query embedding、keyword plan 和 document signals；本文只确认这些能力消费 canonical project embedding schema。
- query parsing、三路融合、rerank 常量、lexical fast path 边界与版本化质量结果由 `project-search-candidate-recall.md` 唯一拥有；本 schema 文档不重复维护排序规则。
- Project-level search requires vector indexing to be configured and refreshed; missing `memory.embedding`, missing `vector_index` metadata, or missing stored vectors now fail with `MEMORY_VECTOR_INDEX_REQUIRED` instead of silently degrading.
- Task-scope memory search still uses the existing active-plan-plus-task-memory FTS path and does not participate in the hybrid/vector recall flow.
- Codex-facing recall is `claw search --query "<topic>"`; this reads the indexed project context before planning or investigation, and it remains document recall rather than code search.
- `claw memory ...` remains as legacy/debug and low-level index management, not the primary Codex workflow term.
- `claw plan done` rebuilds project/task search indexes and only refreshes GitNexus when flat `gitnexus` is `true`.
- `claw plan done` 的 GitNexus 预检与自愈链路仍然只认 canonical `gitnexus` boolean，不再使用 `gitnexus.enabled` 作为规范字段；同一条 gate 既控制是否刷新，也控制是否先做前台 install/setup / embeddings self-heal。
- 本文只拥有 canonical `gitnexus` schema gate；GitNexus analyze 的 `--no-ai-context` fallback、Windows access-violation force rebuild 与错误边界由 `local-claw-cli.md` 统一拥有。
- The hybrid project query path is adapted from the more mature `openclaw-dev` memory query design, but its current behavior and migration scope are maintained by `project-search-candidate-recall.md`.
- incremental refresh 的存在不改变 project search 的可用性契约：project recall 依然要求 vector index，不能回退成纯 FTS fallback。
- 这套 refresh 语义参考的是 `openclaw-dev` 对已有 sqlite 的 incremental bootstrap / sync 思路，但 `claw-kit` 只搬运了适合当前项目的最小 sqlite 增量迁移子集。
- For a local ONNX cache, re-downloading a model artifact after deleting only that versioned cache directory should preserve the SHA256 if the upstream payload is unchanged; a different timestamp alone is not evidence of a different artifact. Current cache ownership and readiness rules are maintained by `../adr/local-embedding-shared-model-cache.md` and `../adr/refresh-local-embedding-onnx-cache.md`.

## Evidence

- `packages/core/src/init.ts`
- `packages/core/src/embedding-defaults.ts`
- `packages/core/src/memory.ts`
- `packages/core/src/embedding-worker.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/context.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- 2026-06-23 temp compatibility fixture root: `C:\Users\chany\AppData\Local\Temp\claw-project-json-compat-2026-06-23T08-56-50-407Z`; `claw check` and `claw context` exited 0 for all four fixture copies.
- `packages/cli/README.md`
- `README.md`
- `docs/2026-06-06-project-schema-alignment-execution.md`
