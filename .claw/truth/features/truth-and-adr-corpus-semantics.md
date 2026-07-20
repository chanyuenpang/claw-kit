# Truth 与 ADR corpus 语义和证据生命周期

<!-- state: current -->
## 当前结论

- Canonical Truth 与 ADR 是经过 writer 压缩后受信任的项目记忆，不是原始证据 archive。每条 material current fact 或 decision 只有一个 current owner；当前实现仍然优先于旧 report wording。
- Truth 保存当前行为、约束、实现锚点与仍有解释价值的近期演化；ADR 保存 durable decision、context、rationale、alternatives、tradeoffs、consequences 与重要反转。被裁剪的原始 plan/report 或 evolution history 不具备 claw 层恢复保证，Git 历史的偶然可恢复性也不属于知识治理合同。
- 文档类型由 canonical path 推断：`adr/` 下是 ADR，其余 Truth root 下是 Truth，不写 document-kind 字段。Truth 默认 `current`，ADR 默认 `accepted`；只有非默认 document state 才在标题后写 `<!-- document-state: ... -->`。Section state 与 evolution checkpoint 分别使用 renderer-hidden 的 `<!-- state: ... -->` 和 `<!-- dated: YYYY-MM-DD -->`，可见标题保持自然语言。
- Dated section 表示文档内的演化顺序和查询线索，不是 time-to-live。同一天可以有多个 checkpoint，顺序以文档排列为准；writer 只为回退、兼容性、功能反复或认知演化等仍有解释价值的变化保留 history，不为普通进度或每次修改追加 dated section。
- `knowledgeWriter.datedSectionsToKeep` 控制每份本次内置 writer 改动的 canonical 文档最多保留多少个完整 dated evolution sections，默认值是 `6`。它是 `knowledgeWriter` 的直接选项；旧的 `knowledgeWriter.retention` 嵌套对象不受支持。超限时 finalizer 只按文档顺序删除最早的完整 dated sections；external writer 跳过该 automation。current Truth、accepted ADR、单个 dated section 的内容没有行数、段落数、字符数或年龄上限，也不会为被删 history 建立证据 archive。
- Governance 只检查本轮内置 writer 实际改动的 `.claw/truth/**/*.md`，不批量迁移旧 corpus。外部 writer 不进入该 snapshot/compaction 路径；其治理边界由 `external-writer-skill-config.md` 拥有。没有统一 metadata 的 legacy owner 保持向后兼容，下一次被内置 writer 实质修改时再迁移；结构边界不完整的 legacy history 不允许被程序机械裁剪。
- Project recall 继续索引 `.claw/truth` 下除 `summary.md` 外的 Markdown，并在 hybrid/vector 路径中使用 heading-aware chunk metadata。每个 canonical chunk 保存 `documentKind`、`documentState`、effective section `state`、`dated` 与 `headingPath`；长 section 的每个 token window 都带以通用 `[knowledge:...]` 开头的 context prefix 和 heading breadcrumb。
- Temporal intent 在同文档 chunk collapse 前以 soft ranking 生效，不做 recall-time hard filter：普通查询轻度偏向 current/accepted，明确的当前查询进一步压低 historical/superseded，历史、原因、回退或指定日期查询提升相应 historical/superseded/dated chunk。当前 index compatibility version 由 `../adr/search-index-refresh-and-openai-embeddings.md` 唯一拥有；采用新 grammar 后，既有项目需显式运行一次 `claw search index --refresh`。
- Source plan 与相邻 report 仍按 task archive/retention 管理，共享默认只保留 `9` 个 archived tasks；该窗口是有意的短期工作缓冲，不是 canonical knowledge 的证据保存承诺。具体 task retention 合同由 `task-layout-and-session-bindings.md` 拥有。

<!-- state: current -->
## 程序治理与模型治理边界

- 内置 writer 负责 evidence qualification、current/history 语义判断、owner 选择、Truth→ADR 固定顺序、需要保留的 evolution、语义压缩或 topic splitting，以及跨 Truth/ADR 的 one-owner consistency；每个被本轮 writer 实际写入的 Truth 或 ADR owner 都必须先按 `knowledge-format.md` 检查，并在同一次知识编辑中修复不合规结构，未触及文档不做批量迁移。外部 skill 不继承这些内置规则。
- Runtime 只为内置 writer 解析统一格式、识别本次 changed canonical files、按 `datedSectionsToKeep` 删除最早完整 evolution sections并报告裁剪结果；编码归一化与 recall refresh sequencing 对内置和外部 writer 都继续执行，search 仍按当前 compatibility contract 重建带状态信息的 vector chunks。
- Finalizer runtime 检查 host session 中至少一个 session workflow 是否进入 `end.completed`、包含 task 且全部完成，不要求内置 template identity；同时负责 job/report 幂等、编码归一化与 recall refresh sequencing。外部 writer 行为由 `external-writer-skill-config.md` 唯一拥有；内置 Writer lifecycle 与 Truth→ADR orchestration 的决策 owner 是 `../adr/hook-owned-two-phase-knowledge-finalization.md`；bounded evolution 的治理决策 owner 是 `../adr/bounded-truth-and-adr-evolution-governance.md`；搜索/index 决策由 `../adr/search-index-refresh-and-openai-embeddings.md` 拥有。

<!-- state: history -->
## 演化历史

<!-- dated: 2026-07-19 -->
### 统一状态、演化治理与 temporal search 之前

此前 canonical corpus 依赖自然语言 status 与 writer 的 one-owner review：runtime 不解析统一的 Truth/ADR state 或 dated section，也不做 changed-document history compaction；project search 按文件收敛 chunk candidates，但没有 section-level current、historical、superseded 或 date ranking。该状态随后由固定 Markdown grammar、dated-section governance 与 heading-aware temporal search 取代。

<!-- dated: 2026-07-20 -->
### 可见工具专属 metadata 退役

首版统一 grammar 曾在 frontmatter 使用工具专属 document kind/state 字段，并把 section state 与 dated checkpoint 写进可见 heading token。当前格式已改为 path inference 和 renderer-hidden generic comments；旧 grammar 不再解析，也不保留 compatibility tests。

<!-- state: current -->
## 关联代码与文档

- `shared/skills/knowledge-writer/knowledge-format.md`
- `shared/skills/knowledge-writer/`
- `packages/core/src/knowledge-document.ts`
- `packages/core/src/knowledge-governance.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/memory.ts`
- `packages/cli/src/cli.ts`
- `codex-knowledge-capture-boundary.md`
- `external-writer-skill-config.md`
- `task-layout-and-session-bindings.md`
- `../adr/bounded-truth-and-adr-evolution-governance.md`
- `../adr/hook-owned-two-phase-knowledge-finalization.md`
- `../adr/search-index-refresh-and-openai-embeddings.md`

## 关键检索词

`Truth corpus`、`ADR state`、`document-state`、`state: history`、`datedSectionsToKeep`、`evolution checkpoint`、`one current owner`、`canonical compaction`、`knowledge context prefix`、`temporal search`、`source evidence retention`
