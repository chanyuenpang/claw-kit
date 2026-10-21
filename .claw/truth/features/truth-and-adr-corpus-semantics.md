# Truth 与 ADR corpus 语义和证据生命周期

<!-- state: current -->
## 当前结论

- Canonical Truth 与 ADR 是经过 writer 压缩后受信任的项目记忆，不是原始证据 archive。每条 material current fact 或 decision 只有一个 current owner；当前实现仍然优先于旧 report wording。
- Truth 保存当前行为、约束、实现锚点与仍有解释价值的近期演化；ADR 保存 durable decision、context、rationale、alternatives、tradeoffs、consequences 与重要反转。被裁剪的原始 plan/report 或 evolution history 不具备 claw 层恢复保证，Git 历史的偶然可恢复性也不属于知识治理合同。
- 文档类型由 canonical path 推断：`adr/` 下是 ADR，其余 Truth root 下是 Truth，不写 document-kind 字段。Truth 默认 `current`，ADR 默认 `accepted`；只有非默认 document state 才在标题后写 `<!-- document-state: ... -->`。Section state 与 evolution checkpoint 分别使用 renderer-hidden 的 `<!-- state: ... -->` 和 `<!-- dated: YYYY-MM-DD -->`，可见标题保持自然语言。
- Dated section 表示文档内的演化顺序和查询线索，不是 time-to-live。同一天可以有多个 checkpoint，顺序以文档排列为准；writer 只为回退、兼容性、功能反复或认知演化等仍有解释价值的变化保留 history，不为普通进度或每次修改追加 dated section。
- `knowledgeWriter.datedSectionsToKeep` 是内置 writer 的 bounded-evolution 指令，默认每个本轮改动的 canonical owner 保留最多 `6` 个完整 dated sections，不是 finalizer runtime 门禁。旧 nested `knowledgeWriter.retention` 不受支持。只在证据和完整边界允许时移除最早 history；不截断 current/accepted 内容、不覆盖无关编辑，也不建立被删 history archive。外部 skill 不继承该 retention 偏好。
- 所有 writer route 都复用 canonical `knowledge-format.md` 最小格式、事实证据和实现锚点，保留无关编辑及未触及文档。Finalizer 不执行 writer 前快照或 dated-section compaction；不因 legacy corpus 不合规而扩大写集。
- Project recall 继续索引 `.claw/truth` 下除 `summary.md` 外的 Markdown，并在 hybrid/vector 路径中使用 heading-aware chunk metadata。每个 canonical chunk 保存 `documentKind`、`documentState`、effective section `state`、`dated` 与 `headingPath`；长 section 的每个 token window 都带以通用 `[knowledge:...]` 开头的 context prefix 和 heading breadcrumb。
- Temporal intent 在同文档 chunk collapse 前以 soft ranking 生效，不做 recall-time hard filter：普通查询轻度偏向 current/accepted，明确的当前查询进一步压低 historical/superseded，历史、原因、回退或指定日期查询提升相应 historical/superseded/dated chunk。当前 index compatibility version 由 `../adr/search-index-refresh-and-openai-embeddings.md` 唯一拥有；采用新 grammar 后，既有项目需显式运行一次 `claw search index --refresh`。
- Source plan 与相邻 report 仍按 task archive/retention 管理，共享默认只保留 `9` 个 archived tasks；该窗口是有意的短期工作缓冲，不是 canonical knowledge 的证据保存承诺。具体 task retention 合同由 `task-layout-and-session-bindings.md` 拥有。

<!-- state: current -->
## 程序治理与模型治理边界

- 内置 writer 负责 evidence qualification、current/history、owner 选择、必要演化与语义压缩，以及 Truth/ADR one-owner consistency。调查、编辑、复查可按需要往返，不要求 Truth→ADR 固定步骤。外部 skill 可选择方法，但同样遵守 canonical 最小格式、证据和保留无关编辑的边界。
- Runtime 为 recall 解析统一 metadata，不为任何 writer 执行 snapshot/trim 或固定治理 phase 门禁。编码归一化与 recall refresh 是 canonical completion 之后独立报告的 ancillary maintenance；不得将其失败重述为 canonical commit 失败。
- Finalizer runtime 保留 claimant identity、claim token、terminal CAS、报告捕获与 no-replay 安全，不检查任意 session workflow 的 `end.completed`、非空 task 或全部 done。可选 external-doc updater 的失败独立报告，不否定成功的 Truth/ADR 维护。外部合同由 `external-writer-skill-config.md`、lifecycle 由 `../adr/hook-owned-two-phase-knowledge-finalization.md`、bounded evolution 由 `../adr/bounded-truth-and-adr-evolution-governance.md` 拥有。

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

- `.agents/skills/claw-kit-doc/references/knowledge-format.md`（构建时复制到 packaged knowledge-writer resource）
- `packages/core/resources/knowledge-writer/`
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
