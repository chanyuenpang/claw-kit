# ADR: Search index refresh and embedding providers

## Status

Accepted

## Context

现有 ADR 已经确认 `claw search` 是 Codex-facing 的文档 recall 入口，`.claw/project.json` 是 project memory 配置的 canonical 来源。后续两轮 completed plan 又把 project memory refresh 的长期契约补充完整了：

- 手动刷新继续暴露为项目级 `claw search index --refresh`
- `claw search` 的 external memory paths 只索引 `.md` 文件，不把 recall 面扩成代码搜索
- project memory refresh 既支持 OpenAI embeddings，也支持 GitNexus-inspired 的 local embedding provider
- local provider 需要稳定的默认模型与运行策略，避免每个项目各自漂移
- refresh 不再每次全量重建 sqlite，而是参考 `openclaw-dev:src/agents/project-memory-bootstrap.ts` 的成熟 bootstrap / refresh 语义，在 `claw-kit` 中做裁剪式 sqlite 增量同步
- project-level `claw search --query` 现在也消费 refreshed vectors，并参考 `openclaw-dev` 的 hybrid query 设计迁移最小可用子集
- 多词中文 recall 的改进继续参考 `openclaw-dev` 的 memory search 设计，但核心是 query planner、keyword recall 与 vector fusion，而不是更换 embedding 路线
- 这次 rescue refresh 还要求显式的 CPU 逃生路径，用来覆盖 Windows 上 DirectML / CUDA 初始化失败或首轮真实推理失败的情况，而不是依赖 OpenAI auth 兜底
- 大型项目 refresh 还需要把刷新进度切成可重复推进的批次，而不是一次性吞下整个语料集
- 这次 retrieval quality 迭代继续复用 `openclaw-dev` 的成熟混排思路，但只吸收适合 `claw-kit` 的那部分：共享的中文/多词 keyword term 入口，以及面向 project-scoped hybrid ranking 的文档级 signals。

## Decision

- 将手动重建入口固定为 `claw search index --refresh`，而不是新增另一套 top-level 命令。
- `claw search index --refresh` 对当前项目的 memory sqlite 执行增量同步，而不是每次全量重建。
- 增量判定基于 markdown recall 文档的 `content_hash`：
- 未变更文档复用既有 `docs` row 与 `doc_embeddings`
- 已变更文档替换自身记录并重建对应 embeddings
- 已删除文档清理 `docs`、`docs_fts`、`doc_embeddings`
- 当 `memory.embedding` 配置变化时，重置并重建全部向量，保证 sqlite metadata 与实际 embeddings 一致。
- project search 继续坚持 vector-required 契约；如果向量索引不可用，则保持 disabled，不回退成纯 `FTS` 搜索。
- project-level `claw search --query` 会生成 query embedding，并执行 trimmed hybrid recall，融合 vector candidates 与 `FTS` candidates。
- 对多词查询，project-level `claw search --query` 同时保留 exact multi-term keyword query，以及逐词 fallback query，而不是只执行一次严格的原始 `FTS MATCH`。
- 这套 planner 的目标是避免中文多词 recall 过度依赖“同一条记录同时命中所有词”的语义，让检索行为更接近文档 recall / fuzzy retrieval。
- 如果当前项目缺少 refreshed vector index，project search 返回 `MEMORY_VECTOR_INDEX_REQUIRED`，而不是 silent fallback。
- project memory refresh 从 `.claw/project.json` 读取 embedding 配置，同时支持 OpenAI embeddings 和 GitNexus-inspired local embedding provider。
- 当选择 local provider 时，默认模型与运行策略固定为 `Snowflake/snowflake-arctic-embed-xs`、`384` 维、Windows `DirectML` 优先且回退到 CPU。
- local provider 的设备选择与 fallback 现在由 `packages/core/src/embedding-local.ts` 统一执行：`CLAW_EMBEDDING_LOCAL_DEVICE` / `CLAW_EMBEDDING_DEVICE` 优先于 `.claw/project.json` 的 `memory.embedding.local.device`，再退回平台默认；`dml` / `cuda` 都会在首轮真实推理失败后重试 `cpu`。
- 这让 CPU rescue refresh 同时支持一次性环境覆盖和稳定的 per-project schema 配置。
- 这条 rescue path 只改变本地执行设备和重试策略，不改变 `claw search index --refresh` 的检索契约，也不扩大索引的文档面。
- local embedding inference 现在默认在单个 worker/model session 内分批执行，避免把整个 text set 塞进一次 ONNX 调用。
- 大量向量结果在 worker 侧改为写入临时文件，再通过轻量元数据经由 stdout 返回，避免巨大的 IPC payload。
- 大型项目的默认 refresh 进度上限是每轮最多处理 100 个新增或变更文件，让 backlog 通过重复运行自然推进。
- `packages/core/test/core.test.ts` 新增了中文排序回归用例，并把使用 `CLAW_EMBEDDING_MOCK` 的 project-search / memory-refresh 测试改成串行，避免并发共享环境变量污染。
- `claw context` / protocol auto-repair must backfill that default local embedding config into older project schemas instead of leaving `memory.embedding` empty.
- `claw-kit` 自身项目不把仓库 `docs/` 目录加入 `memory.externalDocPaths`，这样 `claw search` 继续面向 `.claw` memory / truth / ADR 文档，而不是把实现文档目录默认并入 recall。
- `memory.externalDocPaths` / `claw search` external memory paths 只纳入 `.md` 文件，保持 `claw search` 是文档 recall，而不是代码搜索。

## Consequences

- 项目 refresh 成为可重复执行的同步操作，未变更文档不会重复写入或重复生成向量。
- 文档变更、删除和 embedding 配置漂移都会被显式收敛到 sqlite 状态同步里，减少 metadata 与向量内容不一致的问题。
- `claw search` 的 recall 面继续保持项目级文档语义，不会因为外部路径或 `FTS` 回退而漂移成通用代码搜索。
- 旧项目在第一次运行 `claw context`、`claw check` 或其他协议修复入口后，会被自动提升到可索引的默认 local embedding schema，不需要手工补 `memory.embedding`。
- 查询阶段与索引阶段共享同一套 vector contract，缺少 refreshed vectors 会显式失败，而不是悄悄降级成较弱的文本检索。
- 中文多词检索不再被单次严格 `MATCH` 语义卡住，keyword planner 可以更稳定地为 hybrid fusion 提供候选集。
- 既有 `.claw` 项目保持同一套 sqlite backend，不需要引入第二套索引存储。

## Related Code

- `packages/core/src/memory.ts`
- `packages/core/src/embedding-worker.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/project.json`
- `.claw/archive/tasks/incremental-memory-index-refresh/plan.json`
- `.claw/archive/tasks/hybrid-vector-project-search/plan.json`
- `.claw/archive/tasks/multi-term-chinese-search-recall/plan.json`
- `.claw/archive/tasks/embedding-refresh-cpu-fallback/plan.json`
- `.claw/archive/tasks/embedding-refresh-batching/plan.json`

## Search Terms

- `claw search index --refresh`
- `incremental refresh`
- `content_hash`
- `docs_fts`
- `doc_embeddings`
- `memory.embedding`
- `vector-required`
- `MEMORY_VECTOR_INDEX_REQUIRED`
- `hybrid recall`
- `query embedding`
- `multi-term Chinese recall`
- `keyword query planner`
- `fuzzy retrieval`
- `Snowflake/snowflake-arctic-embed-xs`
- `DirectML`
- `CLAW_EMBEDDING_LOCAL_DEVICE`
- `CLAW_EMBEDDING_DEVICE`
- `cpu rescue refresh`
- `100-file batch`
- `temp-file handoff`
