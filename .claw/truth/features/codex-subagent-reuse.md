# Codex subagent reuse

## Status

Current

<!-- state: current -->
## 当前行为

本文拥有 Codex `researcher` 的调查派发与复用规则；旧 `truth-writer` / `adr-writer` 复用仅是历史证据。knowledge finalization 的固定名 `knowledge_finalizer` 复用与 fallback 创建由 `codex-knowledge-capture-boundary.md` 拥有。

- Codex researcher 用于需要独立、多步证据收集与综合的复杂窄问题，可涉及代码、行为、架构或项目 Truth/ADR；直接事实查询、普通搜索与常规项目 recall 不触发 researcher。
- 普通项目 recall、canonical Truth/ADR lookup 与历史上下文查询由主 agent 直接运行 `claw search`；这些文档召回本身不触发或派发 `researcher`。
- 选用 researcher 时，Codex 主代理按 native agent route 派发自包含窄任务，并在依赖结果之前完成收集；assigned researcher 直接执行，不再委派。
- `researcher` 被派发后，调查执行顺序先用 `claw search --query "<topic>"` 恢复与代码问题相关的项目上下文，再按项目配置使用 GitNexus 或其他代码索引，最后检查精确源码与关系锚点。这里的 `claw search` 是已派发代码调查的第一步，不把普通项目 recall 扩大为 researcher trigger。
- 主 agent 优先复用当前宿主支持且身份明确的同线程、同角色 researcher；无合适可复用实例时新建窄上下文 agent。实际工具 schema 与授权优先，不从无关任务文本推断角色。
- dispatch 只发送 exact question、working directory、known target paths、relevant constraints、`claw-kit:researcher` 要求等窄 brief 与增量上下文，不复制完整线程上下文。
- researcher 源码与分发由 [shared-source Truth](<shared-planning-skill-source.md>) 拥有；`delegateSubagents` YAML 是角色 prompt metadata，不是 literal tool args，也不是 core/CLI typed guidance。Codex 可执行映射由相邻 `references/host-execution.md` 拥有；安装 entry 随隔离 artifact 组装。
- entry 明确 main agent 与 assigned researcher 两种角色；新派发或复用之前简短披露角色与任务，worker 不递归消费主代理路由。宿主细节不靠 YAML 猜测。
- 如果 `.claw/project.json` 中 canonical `gitnexus = true`，且问题涉及代码关系或当前实现行为，`researcher` 应先发现并使用 GitNexus 相关能力；不要假设 GitNexus tool 已经可见。
- 对依赖 research 结果的主流程，host 必须等待 `researcher` 返回，不能跳过 research gate 继续后续步骤。
- researcher subagent 直接执行调查，禁止递归派发另一个 researcher；详细检索留在 subagent context，只向主线程回传结论、证据锚点、不确定性与建议下一步。
- `plan-review` 不再是单独的 workflow gate；如存在 review specialist，也不应再把它建模成 planning 外的一道必经关卡。
- 复用不会放宽 researcher 的窄调查 brief、`worker: readonly` 角色标记与紧凑返回合同。
- 历史 `Truth & ADR` writer dispatch 曾要求优先复用同线程 specialist；该规则不再定义当前 knowledge finalization。

## Current code anchors

- `.agents/skills/researcher/SKILL.md`
- `.agents/skills/researcher/references/host-execution.md`

- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
