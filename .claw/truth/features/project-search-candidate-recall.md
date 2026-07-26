# Project Search Candidate Recall

<!-- state: current -->
## 结论

- `claw-kit` 的 project-level `claw search --query` 已从单次 keyword/vector 合并，演进为裁剪版 OpenClaw 风格的 multi-route candidate recall。
- 这一轮的重点不是替换 embedding，而是把 `query planner`、`keyword recall`、`document-signal route` 和 `unified rerank` 组合起来，提升项目文档 recall 质量。
- `claw search` 仍然只做 project-scoped 文档 recall，不扩展成代码搜索，也没有放宽 vector-required 可用性契约。

## 长期行为

- project search 会先生成 widened candidate pool，而不是只依赖一次 FTS `MATCH` 加向量排序。
- keyword route 会保留 multi-term exact query，并为拆出的 term 增加 fallback query，避免候选集过早收缩。
- 这套 `query planner` 对中文多词查询同样生效，例如 `搜打撤 哈基宝` 会同时走 exact multi-term route 与逐词 fallback route。
- query embedding 保留用户输入的原始查询文本；关键词清洗只服务于 lexical route，不能用清洗后的强词串替代 Jina 所需的句法与实体上下文。
- project search 额外加入了 `document-signal` candidate route，用文档内容、文件名和路径信号把可能相关的主题文档先纳入候选。
- 当前三路 RRF 融合权重为 vector `0.50`、keyword `0.30`、document signal `0.20`；继续降低 vector 权重会损害版本化 tiny-world 查询集的 Recall@5。
- 最终排序改成 coverage-aware rerank，会同时考虑 `strong term coverage`、`filename/path`、标题、文档类型、多 route 命中与 matched-character density，并对 plan、index-like、chapter 和 overview 文档施加 query-aware 降权。
- 唯一显式文件名查询可以走 lexical fast path；不满足唯一性和置信门禁的查询仍走完整 hybrid 路径。该性能路径与具体门禁由 `../adr/workflow-cost-optimization-route.md` 唯一拥有，本文只记录它与排序链路的边界。
- 这让聚焦主题的文档更容易排在泛索引文档前面，也让不同强词分散在不同文档里的多词查询，仍能在顶部结果里保留覆盖面。
- Canonical Truth/ADR chunk 消费 path-inferred document kind、generic hidden state/date markers 与 heading breadcrumb，并在 per-document collapse 前做 temporal soft ranking；不在 recall 前硬过滤 historical 或 superseded。当前 grammar 与 index compatibility version 分别由 `truth-and-adr-corpus-semantics.md` 和 `../adr/search-index-refresh-and-openai-embeddings.md` 唯一拥有，本文不重复具体 marker 或 version。

## OpenClaw 参考范围

- 这次实现明确参考了 `openclaw-dev` 的 memory search 设计。
- 迁移范围聚焦在 `multi-route candidate recall`、`widened candidate pool`、`document-signal route` 和 `unified rerank`。
- 没有把 OpenClaw 更大的 memory/session abstraction 整体搬进 `claw-kit`；这里只保留对当前 project-document recall 最有价值的最小子集。

## 真实代码锚点

- 主实现入口：`packages/core/src/memory.ts` 与 `packages/core/src/memory-query.ts`
- 关键行为包括 `buildProjectQueryIntent`、`searchProjectMemoryHybrid`、`searchProjectMemoryKeywords`、`searchProjectMemorySignals`、`tryProjectLexicalFastPath`、`rerankProjectSearchCandidates` 和 `buildProjectSearchSignals`。

<!-- state: history -->
## 版本化验证历史

- `packages/core/test/core.test.ts` 针对这轮 candidate recall 与 rerank 行为通过 `50/50`。
- `npm run check` 已通过。
- live `NeonSpark` 检索验证表明，多词中文检索不再把 `contents.md` 排在更聚焦的主题文档前面，conversational `搜打撤` 查询仍会优先命中 system design 类文档。

<!-- dated: 2026-07-19 -->
### 2026-07-19 Qwen embedding 适配性复核

- 这次复核只检查官方模型资料与当前代码，没有下载模型、修改配置或重建索引。结论是：此前未在候选说明中提到 Qwen 属于覆盖不完整，但没有把它列入可直接测试的小模型前三名符合当时的资源与 runtime 约束。
- 当时最小的官方型号 `Qwen3-Embedding-0.6B` 有 `600M` 参数、`1024` 维输出、`32K` 上下文和 `100+` 语言覆盖，并支持 `32`–`1024` 维 MRL。官方 BF16 权重约 `1.19 GB`，没有官方 ONNX artifact；如果继续走当前固定 FP32 路径，权重体积理论估算可能接近 `2.4 GB`，因此它不是用来直接降低当前 CPU、内存与下载体积的零改动小模型。
- Qwen 的模型合同要求 last-token pooling；查询侧推荐 `Instruct: <检索任务描述>\nQuery:<用户查询>`，文档侧不加 instruction，并需要正确处理 left padding / EOS。当前 local runtime 仍固定 mean pooling，并让 query 与 document 共用相同输入格式，所以只替换 model id 会形成错误或不公平的对照。
- 当前 runtime 还会让 extractor 先归一化完整向量，再按 `outputDimensionality` 截断；公平使用 Qwen MRL 需要截断后重新归一化。未知 local model 仍默认解析为 `384` 维，因此 Qwen 还必须显式声明 `1024` 维或经过验证的 MRL 目标维度。
- 这些是 `2026-07-19` 官方资料与代码锚点共同限定的兼容性结论，不是 Qwen 在 `claw search` 上的质量实测。当前事实锚点是 `packages/core/src/embedding-local-runtime.ts`、`packages/core/src/embedding-local.ts` 与 `packages/core/src/embedding-defaults.ts`；候选优先级和 adapter 投资决策仍只由 `../adr/search-index-refresh-and-openai-embeddings.md` 拥有。

<!-- dated: 2026-07-19 -->
### 0.1.85 Jina 中文候选完整实验与复跑

- 后续隔离 Windows/CPU 实验用真实 `claw search` 完整执行同一组 `24` 条质量查询和 `3` 条 lexical controls，并在一份 `100` 文档、`214` chunks 快照上把 `jinaai/jina-embeddings-v2-base-zh` 显式配置为 `768` 维。首次完整 refresh 用时 `325.9 s`，终态为 `pendingFileCount=0`、`vectorIndex.dimensions=768`、`vectorIndex.chunkCount=214`。
- Jina 的全部 Recall@5 为 `0.9167`，高于同轮 `m-v2.0` 的 `0.8750`；全部 MRR@10 为 `0.6632`，高于 `0.6333`。纯中文 Recall@5 从 `0.8000` 提升到 `0.8667`，纯中文 MRR@10 从 `0.5800` 提升到 `0.6333`，关键 Top-5 漏召回从 `1` 条降到 `0` 条，因此通过相对 Recall、相对 MRR 和关键漏召回三项门禁。
- 同一实验中，Jina 模型缓存为 `643,246,279 B`，是大模型的 `51.7%`；query daemon working set 为 `1,908,273,152 B`，是 `58.2%`；冷查询 `1,612 ms`，是 `34.8%`；热质量查询中位数 `411 ms`，是 `66.9%`。这些数值只属于该机器、语料、快照和 `0.1.85` revision，不是跨环境 SLA。
- 完整缓存后的第二次独立 Jina refresh 使用当时最新的 `100` 文档、`215` chunks 快照，耗时 `306.9 s`；SQL 终态为 `100` 篇文档、`215` 个向量、`100` 个源文档全部覆盖、`768` 维且 `pendingFileCount=0`。随后同样通过真实 `claw search` 执行全部 `27` 条查询。
- Run 1 与 Run 2 的语料 SHA-256 不同，chunk 数也从 `214` 增为 `215`，但 `27/27` 条查询的目标文档排名和 Top-1 路径完全一致；全部 Recall@5 仍为 `0.9167`、全部 MRR@10 仍为 `0.6632`、中文 Recall@5 仍为 `0.8667`、中文 MRR@10 仍为 `0.6333`，关键 Top-5 漏召回仍为 `0`。这确认了该语料与 `0.1.85` Windows/CPU 实验边界内的质量重复性，但不是跨环境 SLA。
- Run 2 的热质量查询中位数为 `439 ms`，query daemon 峰值 working set 约 `1.89 GB`；完成缓存没有再次出现模型加载错误，因此这次复跑本身没有覆盖首次下载路径。后续默认切换 closeout 通过 timeout/fallback 修复关闭了 rollout gate，当前决策由 `../adr/search-index-refresh-and-openai-embeddings.md` 与 `../adr/refresh-local-embedding-onnx-cache.md` 共同保持一致。
- 两轮结果把 Jina 从“仅预筛选、质量未知”推进为质量与重复性均已通过完整门禁的 leading smaller-default candidate；这是默认切换前的版本化阶段，不再代表当前 shipped-default 状态。
- 版本化证据保存在 `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows.json` 与 `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows-run2.json`，实验方法和对照汇总保存在 `docs/search-model-comparison-results.md`，可重跑入口为 `scripts/search-model-comparison-benchmark.mjs`。

<!-- dated: 2026-07-19 -->
### 2026-07-19 Jina 默认 rollout closeout

- 在上述两轮质量门禁之后，默认切换 closeout 将 `packages/core/src/embedding-defaults.ts` 的 local default 改为 `jinaai/jina-embeddings-v2-base-zh`，默认输出维度保持 `768`；当前默认配置事实由 `project-schema-alignment.md` 唯一拥有，本节只记录 rollout 结果。
- 该 closeout 使用操作系统级缓存 `C:\Users\chany\AppData\Local\claw\models\jinaai\jina-embeddings-v2-base-zh`，记录到 `643,246,279` 字节与 ONNX SHA-256 `4B0E9FA6E5C77CFF56E0C9C673BA1AAD61E793E592FDD4B05690B68826B7D3A2`；这是这台 Windows 机器在该时点的版本化证据，不是跨机器固定路径或永久上游摘要。
- closeout 时 `claw-kit`、`Mission-Control`、`Nocturnel`、`OpenClaw-dev`、`OpenClaw-dev-field-support-clean`、`super-json-editor` 与 `tiny-world` 七个主项目均完成 Jina `768` 维索引，`pendingFileCount = 0`，未发现重复的项目级 Jina cache；七个项目随后都通过真实中文 `claw search` 的 hybrid / persistent-daemon 路径。release、snapshot 与模型评估 worktree 明确不在迁移范围内。

<!-- dated: 2026-07-19 -->
### 2026-07-19 tokenizer-aware 文档分块修正

- local document indexing 现在先保留 `chunkMarkdownContent(...)` 的段落/字符级初分块，再由 `packages/core/src/embedding-worker.ts` 使用实际模型 tokenizer 把每个输入拆成 token windows；普通 query embedding 不进入这条 document-only 分块路径。
- window 目标是 `min(1024, floor(tokenizerMaxTokens * 0.875))`，重叠上限为 `64` tokens。Jina tokenizer 的 `512` token 上限因此得到 `448` token window 与 `64` token overlap；`packages/core/src/embedding-token-chunker.ts` 负责在 Unicode code-point 边界上寻找可前进、且不超过目标 token 数的窗口。
- project index metadata 记录 `embedding_chunking_version = token-aware-v1`。`packages/core/src/memory.ts` 在 stored version 缺失或不同时重置旧 vectors 与 query-embedding cache，并沿用每轮最多 `100` 个文件的 bounded refresh 推进新索引。
- 修正前的当前 `claw-kit` Jina 索引有 `217` 个 vectors，其中 `159` 个（`73.27%`）超过 tokenizer 的 `512` token 上限，token p50 / p90 / max 为 `744 / 1,183 / 2,365`。修正后的同一 `100` 文档索引有 `497` 个 `768` 维 vectors，token p50 / p90 / max 为 `441 / 448 / 448`，超限比例降为 `0`，且 `pendingFileCount = 0`。
- 同一组 `27` 条真实 `claw search` 的版本化 A/B 中，Top-1 从 `0.5417` 升至 `0.6250`，MRR@10 从 `0.6785` 升至 `0.7201`，Recall@5 保持 `0.9167`，关键 Top-5 漏召回保持 `0`。代价是 vectors 增至 `2.29x`，warm wall-time 中位数从 `678.85 ms` 增至 `963.37 ms`，warm engine 中位数从 `418.23 ms` 增至 `644.38 ms`；cold query 约 `2.61 s` 与 `2.58 s`，基本不变。
- 修正后的 full refresh 用时 `344.53 s`、CPU time `2,610.20 s`（平均约 `7.58` 个逻辑核心）、峰值 working set `2.10 GB`。这些指标只属于该机器、语料和 `0.1.85` working revision，不是跨环境 SLA；原始证据在 `benchmarks/search/0.1.85-jina-token-aware-chunking-windows.json`，实验汇总在 `docs/search-model-comparison-results.md`。
- 当前分块行为锚点是 `packages/core/src/embedding-token-chunker.ts`、`packages/core/src/embedding-worker.ts` 与 `packages/core/src/memory.ts`；是否采用该策略、失效语义与取舍由 `../adr/search-index-refresh-and-openai-embeddings.md` 唯一拥有。

<!-- dated: 2026-07-20 -->
### 0.1.86 tiny-world 混合排序五轮收口

- 这轮在冻结的 tiny-world Jina 索引上使用 `850` 篇文档、`7,131` 个向量、`30` 条质量查询和 `3` 条 lexical controls，保留 embedding 模型与索引内容语义不变，只调整 query understanding、候选融合与 rerank。
- 选定版本相对 `0.1.85` 基线将 Top-1 从 `0.3333` 提升到 `0.3667`、Recall@5 从 `0.6000` 提升到 `0.7667`、Recall@10 从 `0.6667` 提升到 `0.8667`、MRR@10 从 `0.4489` 提升到 `0.5415`，关键 Top-5 漏召回从 `10` 降到 `5`；`3` 条 lexical controls 保持 Top-1 全中。
- 五轮中保留了原始语义查询、标题/路径/文档类型信号、plan/index/chapter/overview 降权、显式文件名快速路由、`0.50/0.30/0.20` 三路融合，以及降低后的 uncovered-term diversity bonus；更激进的标题权重和更低 vector 权重因 Recall 回退被撤销。
- 这些指标只属于 `benchmarks/search/0.1.86-tiny-world-hybrid-ranking-summary-windows.json` 描述的冻结语料、机器与 working revision，不是跨项目 SLA；该轮与另一项 tiny-world Jina refresh 共享 CPU，因此详细报告中的 wall-time 不能和无争用的 `0.1.85` latency 基线直接比较。
- 同日后续 `120` 条 development split 实验曾在尚未解封 holdout 时报告 Top-1 `0.7917`、Recall@5 `0.9333`、MRR@10 `0.8465`，但 supplied closeout 明确把该流程标为暂停且未完成；这些数值只能作为 provisional development evidence，不能替代已完成五轮的同口径指标，也不能证明 holdout 泛化。
- 聚焦测试 `17/17` 与 core 测试 `138/138` 是该 completed closeout revision 的版本化验证结果。当前测试数量会随测试集演进，不应作为永久 suite-size 合同。

<!-- dated: 2026-07-21 -->
### P0/P1 搜索性能优化复测

- 在完成重建的 NeonSpark 索引上，`23,084` 个向量均已回填为 Float32 BLOB；同一 `50` 条标题引导查询的 Recall@1/3/5 为 `96%` / `98%` / `98%`，MRR@5 为 `0.967`，平均 wall time 为 `0.667s`、P95 为 `0.993s`。这些是该索引、查询集和完成时 revision 的版本化结果，不是跨项目 SLA。
- 同轮完成记录中的 core `149/149`、CLI 隔离回归修复后的目标用例、全仓 check 与 `git diff --check` 均为当时的验证证据；测试数量和构建状态不构成永久行为合同。

<!-- state: current -->
## 当前存储与执行路径

- project-level search 的主入口在 `packages/core/src/memory.ts`。`.claw/memory.sqlite` 保留 `doc_embeddings.embedding_json` 作为兼容数据，同时以 `doc_embedding_vectors` 的 `embedding_blob` 保存归一化 Float32 向量；refresh 会回填缺失 BLOB，并以 `embedding_vector_storage = float32-blob-v1` 选择紧凑读取路径。
- `searchProjectMemoryHybrid` 仍汇总 vector、`docs_fts` keyword/BM25（含 substring fallback）与 document-signal 三条候选路线，并保持 vector-required 契约。向量扫描按 source 聚合最佳候选、只在最终候选缺少文本结果时读取 `chunk_text` 构造 snippet，避免对全部向量行提前构造 snippet 或 JSON 解码。
- 当 `CLAW_SEARCH_DAEMON=1` 时，reader 复用有界 SQLite 连接并缓存与 `indexed_at` 对齐的向量行；索引刷新会使缓存失效。`packages/cli/src/search-entry.ts` 先请求有界常驻 reader，reader 不可用时才走本地异步 search 路径。
- search reader 默认空闲 `10` 分钟退出；若设置 `CLAW_EMBEDDING_DAEMON_RUNTIME_DIR`，其运行目录固定在该目录下的 `search-reader`，从而与显式 embedding runtime 的隔离边界保持一致。
- query intent 来自 `packages/core/src/memory-query.ts` 的 `buildProjectQueryIntent` / `extractProjectKeywordTerms`；lexical terms 可以被清洗，但 query embedding 使用原始语义查询文本。fusion 继续使用 vector `0.50`、keyword `0.30`、signal `0.20`，最终 rerank 的现行常量与信号见上文。

## 适用提醒

- 这轮提升的是 recall 执行路径，不改变搜索产品边界：`claw search` 仍是项目文档 recall，不能退回成纯 FTS fallback。
- `claw search` 适合找 canonical Truth/ADR context；源码行为和精确 ranking 常量仍应以 `packages/core/src/memory.ts` 与 `packages/core/src/memory-query.ts` 为准。GitNexus 可用于代码关系线索，但结果可能混入 docs/assets noise。
