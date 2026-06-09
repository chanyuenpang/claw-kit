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
