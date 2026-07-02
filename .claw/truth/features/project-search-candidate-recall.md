# Project Search Candidate Recall

## 结论

- `claw-kit` 的 project-level `claw search --query` 已从单次 keyword/vector 合并，演进为裁剪版 OpenClaw 风格的 multi-route candidate recall。
- 这一轮的重点不是替换 embedding，而是把 `query planner`、`keyword recall`、`document-signal route` 和 `unified rerank` 组合起来，提升项目文档 recall 质量。
- `claw search` 仍然只做 project-scoped 文档 recall，不扩展成代码搜索，也没有放宽 vector-required 可用性契约。

## 长期行为

- project search 会先生成 widened candidate pool，而不是只依赖一次 FTS `MATCH` 加向量排序。
- keyword route 会保留 multi-term exact query，并为拆出的 term 增加 fallback query，避免候选集过早收缩。
- 这套 `query planner` 对中文多词查询同样生效，例如 `搜打撤 哈基宝` 会同时走 exact multi-term route 与逐词 fallback route。
- project search 额外加入了 `document-signal` candidate route，用文档内容、文件名和路径信号把可能相关的主题文档先纳入候选。
- 最终排序改成 coverage-aware rerank，会同时考虑 `strong term coverage`、`filename/path` 命中、多 route 同时命中的候选，并对 `contents.md`、`summary.md`、`index.md`、`README.md` 这类 index-like 文档做更强降权。
- 这让聚焦主题的文档更容易排在泛索引文档前面，也让不同强词分散在不同文档里的多词查询，仍能在顶部结果里保留覆盖面。

## OpenClaw 参考范围

- 这次实现明确参考了 `openclaw-dev` 的 memory search 设计。
- 迁移范围聚焦在 `multi-route candidate recall`、`widened candidate pool`、`document-signal route` 和 `unified rerank`。
- 没有把 OpenClaw 更大的 memory/session abstraction 整体搬进 `claw-kit`；这里只保留对当前 project-document recall 最有价值的最小子集。

## 真实代码锚点

- 主实现入口：`packages/core/src/memory.ts`
- 关键行为包括 `searchProjectMemoryHybrid`、`searchProjectMemoryKeywords`、`searchProjectMemorySignals`、`rerankProjectSearchCandidates`、`buildProjectSearchSignals` 和 `isIndexLikeDocName`。

## 验证标准

- `packages/core/test/core.test.ts` 针对这轮 candidate recall 与 rerank 行为通过 `50/50`。
- `npm run check` 已通过。
- live `NeonSpark` 检索验证表明，多词中文检索不再把 `contents.md` 排在更聚焦的主题文档前面，conversational `搜打撤` 查询仍会优先命中 system design 类文档。

## 适用提醒

- 这轮提升的是 recall 质量，不是搜索产品边界的变化。
- `claw search` 仍然是项目文档 recall。
- project search 仍然要求已有 vector index，不能退回成纯 FTS fallback。

## Task 3: traditional search ranking mechanics

本轮 completed subtask `Compare-traditional-search-vs-claw-search-for-vector-database-search-ranking` 的 traditional-search 结论应归入当前 `claw search` project recall 事实，而不是另建一套 search 文档。

- project-level search 的主入口仍在 `packages/core/src/memory.ts`：`buildMemoryIndex` 收集 `.claw/memory.md`、`.claw/truth/**/*.md`、`.claw/.knowledge` 下的 `md` / `txt` / `json`，以及 `memory.externalDocPaths` 配置的 markdown 文件；sqlite 存储仍是 `.claw/memory.sqlite` 的 `docs`、`docs_fts`、`doc_embeddings` 与 `index_metadata.vector_index`。
- `buildMemoryIndex` / project sync 使用 `docs.content_hash` 做增量同步；embedding 配置变更会 reset vector rows 和 `vector_index` metadata；markdown 先按段落和目标长度 chunk，再写入 `doc_embeddings`。
- `searchMemory({ scope: "project" })` 仍要求 refreshed vector index，并调 `searchProjectMemoryHybrid`；缺少 `memory.embedding`、`vector_index` metadata 或 stored vectors 时返回 `MEMORY_VECTOR_INDEX_REQUIRED`。
- query intent 来自 `packages/core/src/memory-query.ts` 的 `buildProjectQueryIntent` / `extractProjectKeywordTerms`；query embedding 优先使用 strong query terms 组成的 `embeddingText`。
- `searchProjectMemoryHybrid` 汇总三条候选路线：`doc_embeddings` 上的 vector cosine similarity、`docs_fts` 的 keyword/BM25 route（含 substring fallback），以及 `searchProjectMemorySignals` 的 document-signal route。
- fusion 使用 `reciprocalRankScore(rank, weight)`，当前权重是 vector `0.6`、keyword `0.25`、signal `0.15`；每条 route 的首入候选还会带入 `exactBoost`。
- final rerank 会为尚未覆盖的 strong terms 加 `0.045`、普通 terms 加 `0.01`，并给多 route 命中的候选加 `0.003 * (routeCount - 1)`；分数相同再按 `strongMatchedTermCount`、`matchedTermCount`、`exactBoost` 打破平局。
- `buildProjectSearchSignals` 的 `exactBoost` 同时吸收 strong/weak term hit、term coverage、strong coverage、matched-character density、filename/path hit、phrase match，并扣除 weak-only、missing-strong 与 index-like doc (`contents.md` / `summary.md` / `index.md` / `README.md`) penalty。
- CLI surface 仍在 `packages/cli/src/cli.ts` 的 `runSearch`：`claw search index --refresh` 调 project-scope `buildMemoryIndex`，`claw search` 调 project-scope `searchMemory`。
- `packages/core/test/core.test.ts` 覆盖 vector-required 行为、中文 query intent、strong-term 优先、多词 recall、coverage-aware rerank、filename rescue，以及 vector row metadata。

## Task 4: unrestricted search method comparison

本轮 completed subtask `Compare-traditional-search-vs-claw-search-for-vector-database-search-ranking` 的 unrestricted-search 复核补充的是检索方法分工，而不是新的 ranking 语义。

- `claw search` 适合优先找 canonical truth / ADR context；本轮快速命中 `.claw/truth/features/project-search-candidate-recall.md` 与 `.claw/truth/adr/search-index-refresh-and-openai-embeddings.md`，足以恢复 multi-route candidate recall、unified rerank、vector-required semantics 和 document-signal candidates 的背景。
- GitNexus query/context 更适合找代码图锚点；本轮快速定位 `searchProjectMemoryHybrid`、`rerankProjectSearchCandidates`、`buildMemoryIndex`、`syncProjectMemoryIndex`、`chunkMarkdownContent`，并确认 `searchMemory` 到 `searchProjectMemoryHybrid`、再到 keyword / signal / rerank helper symbols 的调用关系。
- GitNexus 结果可能混入 docs/assets noise，例如 `docs/assets/product-deck.js` symbols；做 ranking 或 numeric truth 结论时，仍应回到 `packages/core/src/memory.ts` / `packages/core/src/memory-query.ts` 用 `rg` 或代码读取确认。
- 当前 exact ranking constants 已在上一节记录：vector / keyword / signal RRF 权重、candidate limit 扩宽规则，以及 final rerank 的 uncovered-term 与 multi-route boosts；后续不要为同一组常量另建重复 truth 文档。
