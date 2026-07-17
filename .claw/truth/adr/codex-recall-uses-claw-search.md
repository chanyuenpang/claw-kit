# ADR: Codex recall uses claw search

## Status

Accepted

## Context

完成的 `codex-claw-search-flow` plan 确认：Codex-facing recall 不应继续暴露为 OpenClaw-style `claw memory search`。在 Codex 工作流中，agent 需要一个更直接的项目上下文检索入口，并且应在 `claw plan write` 之后、已有 task scope 的前提下恢复相关历史、docs、truth 或任务上下文。

同时，底层 memory/index 机制仍然有兼容价值：`claw plan done` 仍会刷新可重建索引，既有 `.claw` 项目也可能依赖 `claw memory ...` 做调试或索引管理。

完成的 `修复-search-首次响应并优化-guidance-参数提示` plan 进一步确认：template create 时的项目 recall 应是一次直接、带参数的 search query，而不是 researcher dispatch 的隐式入口。search 的公开 CLI 也需要稳定区分成功 help 与参数错误，便于 host 和脚本可靠消费输出流。

完成的 `精简-claw-context-并按能力生成搜索提示` plan 进一步取代了“所有 template create 在 planning 前固定 search”的旧合同。固定 recall 会把可选能力变成每个计划的管理步骤；同时，直接删掉内部完整 context 又会破坏 SessionStart 恢复、协议修复与更新判断。新的边界需要让公开 context 成为轻量能力路由器，同时保留内部完整恢复对象。

## Decision

Codex-facing recall 的推荐命令统一为：

```sh
claw search --query "<topic>"
```

root、template 与 subplan create 不再把 direct query 放入默认 planning task 或强制 `nextsteps`。`claw search` 仍可出现在 `recommendedCommands`，但它只表示可选的项目文档召回能力；planning task 负责分析需求并调用配置的 planning skill 填充可执行 tasks。显式 search skill、researcher 与 knowledge writer 仍可按各自合同使用 `claw search`，需要代码调查时继续走 researcher / GitNexus 边界。

公开 `claw context` 只投影恢复当前工作所需的最小信息：始终保留项目身份与关键路径，按存在性返回 active workflow，并只在实际修正、协议/版本异常、落后或可更新时返回诊断。内部 SessionStart 继续使用完整 context，不因公开字段精简而丢失恢复、修复或更新判断能力。

可选的 `searchGuidance` 归 `claw context` 所有，并只根据 effective config 生成：embedding 启用时提示 `claw search` 缩小文档范围，GitNexus 启用时提示缩小代码范围，两者同时启用时给出两条路径，两者都未启用时省略。context 不为生成提示额外探测索引或运行时健康；真正调用对应搜索能力时再暴露运行问题。

search CLI 的帮助与错误流合同为：

- `claw search --help`、`claw help search` 与无其他参数的精确 `claw search help` 都是成功 help，exit `0` 并把 usage 写入 stdout。
- `claw search --query help` 始终把 `help` 当作真实 query，不触发 help alias。
- 缺少 query 是参数错误，写入 stderr，并直接提示可执行的 `claw search --query "<topic>"`。

`claw memory ...` 不再作为 Codex-facing recall 的推荐入口，只保留为 legacy/debug surface 和 index 管理入口。memory/index internals 暂不移除。

## Consequences

- Codex agent 面向用户和技能文档时使用更清晰的 `claw search` 术语，避免把 recall 流程暴露成 OpenClaw memory 细节。
- template create 不再为所有计划强制支付 recall 成本；需要项目知识时，agent 仍可从 `recommendedCommands`、`searchGuidance` 或显式 search skill 进入直接 query，并保持 recall 与 research 的职责边界。
- 公开 context 更稳定、更小；内部完整对象继续支撑 SessionStart、协议修复与版本更新判断，调用方不需要在最小输出和恢复能力之间二选一。
- search 提示由 effective config 决定而非即时健康探测，因此 context 保持轻量；索引或运行时故障只在真正调用对应能力时报告。
- 成功 help 与参数错误使用不同输出流；脚本可从 stdout 消费 usage，并从 stderr 识别缺参失败。
- 既有 `.claw` 项目、索引刷新和调试路径继续可用，不需要立即迁移或删除 `claw memory ...`。
- 后续若要移除 legacy memory surface，需要新的显式决策，并确认 index 管理替代入口。

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/src/context.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/codex-adapter/skills/`
- `.claw/tasks/codex-claw-search-flow/plan.json`
- `.claw/tasks/修复-search-首次响应并优化-guidance-参数提示/plan.json`
- `.claw/tasks/精简-claw-context-并按能力生成搜索提示/plan.json`

## Search Terms

- `claw search`
- `claw search --query "<topic>"`
- `claw search help`
- `search help stdout`
- `missing query stderr`
- `template recall`
- `optional recommendedCommands`
- `searchGuidance`
- `effective config`
- `minimal public context`
- `internal SessionStart context`
- `embedding GitNexus capability routing`
- `claw memory search`
- `claw memory ...`
- `plan write`
- `recall`
- `memory index`
- `index management`
