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

### 0.1.85 local embedding 对照基线

- local embedding 模型的项目检索质量必须通过完整 `claw search` 路径评估，而不是用 raw embedding cosine、lexical fast path 或 cache hit 代替语义检索结论。完整路径包括中文 query planner、keyword fallback、document-signal candidate route、vector recall 和 unified rerank。
- `0.1.85` Windows/CPU 基线在隔离 worktree 中对同一份 `100` 文档、`214` chunks 语料运行两轮 `Snowflake/snowflake-arctic-embed-m-v2.0` 与 `Snowflake/snowflake-arctic-embed-xs` A/B；两轮逐 query rank 完全一致，全部 `24` 条质量查询均走 `hybrid` route，另有 `3` 条 exact-filename lexical controls 单独统计。
- 在该版本化基线中，`xs` 的中文 Recall@5 从 `0.7333` 降至 `0.3333`，中文 MRR@10 从 `0.5762` 降至 `0.3557`，并产生 `7` 条关键中文 Top-5 漏召回，因此没有通过预设的相对 Recall@5 `95%`、相对 MRR@10 `90%`、关键漏召回 `0` 条质量门禁。
- 同一基线中，`xs` 的英文与中英混合结果接近持平，模型缓存从约 `1.24 GB` 降至 `91 MB`，query daemon working set 从约 `3.28 GB` 降至 `228 MB`，冷查询从约 `5.15 s` 降至 `0.88 s`；但端到端热查询中位数只改善约 `11%–20%`。这些数值是该语料、机器与 `0.1.85` revision 的历史观测，不是跨环境 SLA。
- 可重跑资产由 `scripts/search-model-comparison-benchmark.mjs`、`benchmarks/search/model-comparison-corpus.json`、两份 `benchmarks/search/0.1.85-model-comparison-windows*.json` 原始结果和 `docs/search-model-comparison-results.md` 组成。默认模型与 fallback policy 的当前决策只由 `../adr/search-index-refresh-and-openai-embeddings.md` 拥有，本节只维护评估方法和版本化结果。

### 2026-07-19 小型中文/多语言候选预筛选（实验前历史状态）

- 在该预筛选时点，这轮只根据 local ONNX runtime 约束与官方模型资料筛选候选，没有下载候选模型、修改默认配置或重建现有索引；当时的候选质量尚未验证，后续仍必须沿用完整 `claw search` 中文查询集，而不是以模型卡指标或 raw embedding 脚本代替。
- 当前实现锚点 `packages/core/src/embedding-local-runtime.ts` 仍固定 `feature-extraction`、FP32、mean pooling、归一化和查询/文档共用同一种输入；`packages/core/src/embedding-defaults.ts` 只识别默认 `m-v2.0 = 768` 与 legacy `xs = 384`，其他未知 local model 会回落到 `384` 维，除非显式设置 `memory.embedding.outputDimensionality`。
- 在该预筛选时点，可直接进入既有链路 smoke test 的候选是 `jinaai/jina-embeddings-v2-base-zh`、`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` 和 `shibing624/text2vec-base-chinese`。研究记录将 Jina 列为中英双语、`161M` 参数、`8192` token、`768` 维、mean pooling，官方提供 Transformers.js 用法；MiniLM 列为 `50` 种语言、`128` token、`384` 维、mean pooling；text2vec 列为中文、mean pooling、`768` 维。Jina 与 text2vec 都需要显式声明输出维度。
- 需要 adapter 后才适合公平测试的候选是 `intfloat/multilingual-e5-small` 与 `thenlper/gte-small-zh`：E5 要求非对称 `query: ` / `passage: ` 前缀；GTE 使用 CLS pooling、`512` 维，并且还需要经过验证的 ONNX package。当前 runtime 不支持这些模型合同。
- `google/embeddinggemma-300m` 在该研究时点约 `1.2 GB` 且需要非对称提示词，对缩小当前约 `1.24 GB` 缓存的目标收益不足；`jinaai/jina-embeddings-v5-text-nano-retrieval` 需要 last-token pooling 和提示词，且模型卡许可为 `CC BY-NC 4.0`，因此两者未进入当前通用默认候选。
- 上述模型能力、体积与许可是 `2026-07-19` 研究材料的版本化预筛选证据，不是当前运行时兼容性或搜索质量的实测结果。候选测试顺序、默认模型不变和 adapter 投资顺序由 `../adr/search-index-refresh-and-openai-embeddings.md` 唯一拥有。

### 2026-07-19 Qwen embedding 适配性复核

- 这次复核只检查官方模型资料与当前代码，没有下载模型、修改配置或重建索引。结论是：此前未在候选说明中提到 Qwen 属于覆盖不完整，但没有把它列入可直接测试的小模型前三名符合当时的资源与 runtime 约束。
- 当时最小的官方型号 `Qwen3-Embedding-0.6B` 有 `600M` 参数、`1024` 维输出、`32K` 上下文和 `100+` 语言覆盖，并支持 `32`–`1024` 维 MRL。官方 BF16 权重约 `1.19 GB`，没有官方 ONNX artifact；如果继续走当前固定 FP32 路径，权重体积理论估算可能接近 `2.4 GB`，因此它不是用来直接降低当前 CPU、内存与下载体积的零改动小模型。
- Qwen 的模型合同要求 last-token pooling；查询侧推荐 `Instruct: <检索任务描述>\nQuery:<用户查询>`，文档侧不加 instruction，并需要正确处理 left padding / EOS。当前 local runtime 仍固定 mean pooling，并让 query 与 document 共用相同输入格式，所以只替换 model id 会形成错误或不公平的对照。
- 当前 runtime 还会让 extractor 先归一化完整向量，再按 `outputDimensionality` 截断；公平使用 Qwen MRL 需要截断后重新归一化。未知 local model 仍默认解析为 `384` 维，因此 Qwen 还必须显式声明 `1024` 维或经过验证的 MRL 目标维度。
- 这些是 `2026-07-19` 官方资料与代码锚点共同限定的兼容性结论，不是 Qwen 在 `claw search` 上的质量实测。当前事实锚点是 `packages/core/src/embedding-local-runtime.ts`、`packages/core/src/embedding-local.ts` 与 `packages/core/src/embedding-defaults.ts`；候选优先级和 adapter 投资决策仍只由 `../adr/search-index-refresh-and-openai-embeddings.md` 拥有。

### 0.1.85 Jina 中文候选完整实验与复跑

- 后续隔离 Windows/CPU 实验用真实 `claw search` 完整执行同一组 `24` 条质量查询和 `3` 条 lexical controls，并在一份 `100` 文档、`214` chunks 快照上把 `jinaai/jina-embeddings-v2-base-zh` 显式配置为 `768` 维。首次完整 refresh 用时 `325.9 s`，终态为 `pendingFileCount=0`、`vectorIndex.dimensions=768`、`vectorIndex.chunkCount=214`。
- Jina 的全部 Recall@5 为 `0.9167`，高于同轮 `m-v2.0` 的 `0.8750`；全部 MRR@10 为 `0.6632`，高于 `0.6333`。纯中文 Recall@5 从 `0.8000` 提升到 `0.8667`，纯中文 MRR@10 从 `0.5800` 提升到 `0.6333`，关键 Top-5 漏召回从 `1` 条降到 `0` 条，因此通过相对 Recall、相对 MRR 和关键漏召回三项门禁。
- 同一实验中，Jina 模型缓存为 `643,246,279 B`，是大模型的 `51.7%`；query daemon working set 为 `1,908,273,152 B`，是 `58.2%`；冷查询 `1,612 ms`，是 `34.8%`；热质量查询中位数 `411 ms`，是 `66.9%`。这些数值只属于该机器、语料、快照和 `0.1.85` revision，不是跨环境 SLA。
- 完整缓存后的第二次独立 Jina refresh 使用当时最新的 `100` 文档、`215` chunks 快照，耗时 `306.9 s`；SQL 终态为 `100` 篇文档、`215` 个向量、`100` 个源文档全部覆盖、`768` 维且 `pendingFileCount=0`。随后同样通过真实 `claw search` 执行全部 `27` 条查询。
- Run 1 与 Run 2 的语料 SHA-256 不同，chunk 数也从 `214` 增为 `215`，但 `27/27` 条查询的目标文档排名和 Top-1 路径完全一致；全部 Recall@5 仍为 `0.9167`、全部 MRR@10 仍为 `0.6632`、中文 Recall@5 仍为 `0.8667`、中文 MRR@10 仍为 `0.6333`，关键 Top-5 漏召回仍为 `0`。这确认了该语料与 `0.1.85` Windows/CPU 实验边界内的质量重复性，但不是跨环境 SLA。
- Run 2 的热质量查询中位数为 `439 ms`，query daemon 峰值 working set 约 `1.89 GB`；完成缓存没有再次出现模型加载错误，因此这次复跑本身没有覆盖首次下载路径。后续默认切换 closeout 通过 timeout/fallback 修复关闭了 rollout gate，当前决策由 `../adr/search-index-refresh-and-openai-embeddings.md` 与 `../adr/refresh-local-embedding-onnx-cache.md` 共同保持一致。
- 两轮结果把 Jina 从“仅预筛选、质量未知”推进为质量与重复性均已通过完整门禁的 leading smaller-default candidate；这是默认切换前的版本化阶段，不再代表当前 shipped-default 状态。
- 版本化证据保存在 `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows.json` 与 `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows-run2.json`，实验方法和对照汇总保存在 `docs/search-model-comparison-results.md`，可重跑入口为 `scripts/search-model-comparison-benchmark.mjs`。

### 2026-07-19 Jina 默认 rollout closeout

- 在上述两轮质量门禁之后，默认切换 closeout 将 `packages/core/src/embedding-defaults.ts` 的 local default 改为 `jinaai/jina-embeddings-v2-base-zh`，默认输出维度保持 `768`；当前默认配置事实由 `project-schema-alignment.md` 唯一拥有，本节只记录 rollout 结果。
- 该 closeout 使用操作系统级缓存 `C:\Users\chany\AppData\Local\claw\models\jinaai\jina-embeddings-v2-base-zh`，记录到 `643,246,279` 字节与 ONNX SHA-256 `4B0E9FA6E5C77CFF56E0C9C673BA1AAD61E793E592FDD4B05690B68826B7D3A2`；这是这台 Windows 机器在该时点的版本化证据，不是跨机器固定路径或永久上游摘要。
- closeout 时 `claw-kit`、`Mission-Control`、`Nocturnel`、`OpenClaw-dev`、`OpenClaw-dev-field-support-clean`、`super-json-editor` 与 `tiny-world` 七个主项目均完成 Jina `768` 维索引，`pendingFileCount = 0`，未发现重复的项目级 Jina cache；七个项目随后都通过真实中文 `claw search` 的 hybrid / persistent-daemon 路径。release、snapshot 与模型评估 worktree 明确不在迁移范围内。

### 2026-07-19 tokenizer-aware 文档分块修正

- local document indexing 现在先保留 `chunkMarkdownContent(...)` 的段落/字符级初分块，再由 `packages/core/src/embedding-worker.ts` 使用实际模型 tokenizer 把每个输入拆成 token windows；普通 query embedding 不进入这条 document-only 分块路径。
- window 目标是 `min(1024, floor(tokenizerMaxTokens * 0.875))`，重叠上限为 `64` tokens。Jina tokenizer 的 `512` token 上限因此得到 `448` token window 与 `64` token overlap；`packages/core/src/embedding-token-chunker.ts` 负责在 Unicode code-point 边界上寻找可前进、且不超过目标 token 数的窗口。
- project index metadata 记录 `embedding_chunking_version = token-aware-v1`。`packages/core/src/memory.ts` 在 stored version 缺失或不同时重置旧 vectors 与 query-embedding cache，并沿用每轮最多 `100` 个文件的 bounded refresh 推进新索引。
- 修正前的当前 `claw-kit` Jina 索引有 `217` 个 vectors，其中 `159` 个（`73.27%`）超过 tokenizer 的 `512` token 上限，token p50 / p90 / max 为 `744 / 1,183 / 2,365`。修正后的同一 `100` 文档索引有 `497` 个 `768` 维 vectors，token p50 / p90 / max 为 `441 / 448 / 448`，超限比例降为 `0`，且 `pendingFileCount = 0`。
- 同一组 `27` 条真实 `claw search` 的版本化 A/B 中，Top-1 从 `0.5417` 升至 `0.6250`，MRR@10 从 `0.6785` 升至 `0.7201`，Recall@5 保持 `0.9167`，关键 Top-5 漏召回保持 `0`。代价是 vectors 增至 `2.29x`，warm wall-time 中位数从 `678.85 ms` 增至 `963.37 ms`，warm engine 中位数从 `418.23 ms` 增至 `644.38 ms`；cold query 约 `2.61 s` 与 `2.58 s`，基本不变。
- 修正后的 full refresh 用时 `344.53 s`、CPU time `2,610.20 s`（平均约 `7.58` 个逻辑核心）、峰值 working set `2.10 GB`。这些指标只属于该机器、语料和 `0.1.85` working revision，不是跨环境 SLA；原始证据在 `benchmarks/search/0.1.85-jina-token-aware-chunking-windows.json`，实验汇总在 `docs/search-model-comparison-results.md`。
- 当前分块行为锚点是 `packages/core/src/embedding-token-chunker.ts`、`packages/core/src/embedding-worker.ts` 与 `packages/core/src/memory.ts`；是否采用该策略、失效语义与取舍由 `../adr/search-index-refresh-and-openai-embeddings.md` 唯一拥有。

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
