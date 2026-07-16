# ADR: Codex recall uses claw search

## Status

Accepted

## Context

完成的 `codex-claw-search-flow` plan 确认：Codex-facing recall 不应继续暴露为 OpenClaw-style `claw memory search`。在 Codex 工作流中，agent 需要一个更直接的项目上下文检索入口，并且应在 `claw plan write` 之后、已有 task scope 的前提下恢复相关历史、docs、truth 或任务上下文。

同时，底层 memory/index 机制仍然有兼容价值：`claw plan done` 仍会刷新可重建索引，既有 `.claw` 项目也可能依赖 `claw memory ...` 做调试或索引管理。

完成的 `修复-search-首次响应并优化-guidance-参数提示` plan 进一步确认：template create 时的项目 recall 应是一次直接、带参数的 search query，而不是 researcher dispatch 的隐式入口。search 的公开 CLI 也需要稳定区分成功 help 与参数错误，便于 host 和脚本可靠消费输出流。

## Decision

Codex-facing recall 的推荐命令统一为：

```sh
claw search --query "<topic>"
```

root、template 与 subplan create guidance 在进入 planning 前先提示一次直接 query，用于召回相关 truth、ADR、docs 或历史任务上下文。该 template recall 不派发、暗示或升级为 researcher 流程；需要代码调查或更深分析时，researcher 在自己的独立工作流中运行同一 query 语法。

search CLI 的帮助与错误流合同为：

- `claw search --help`、`claw help search` 与无其他参数的精确 `claw search help` 都是成功 help，exit `0` 并把 usage 写入 stdout。
- `claw search --query help` 始终把 `help` 当作真实 query，不触发 help alias。
- 缺少 query 是参数错误，写入 stderr，并直接提示可执行的 `claw search --query "<topic>"`。

`claw memory ...` 不再作为 Codex-facing recall 的推荐入口，只保留为 legacy/debug surface 和 index 管理入口。memory/index internals 暂不移除。

## Consequences

- Codex agent 面向用户和技能文档时使用更清晰的 `claw search` 术语，避免把 recall 流程暴露成 OpenClaw memory 细节。
- template create 可以用一次明确 query 在 planning 前恢复项目知识，同时保持 recall 与 research 的职责边界。
- 成功 help 与参数错误使用不同输出流；脚本可从 stdout 消费 usage，并从 stderr 识别缺参失败。
- 既有 `.claw` 项目、索引刷新和调试路径继续可用，不需要立即迁移或删除 `claw memory ...`。
- 后续若要移除 legacy memory surface，需要新的显式决策，并确认 index 管理替代入口。

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/codex-adapter/skills/`
- `.claw/tasks/codex-claw-search-flow/plan.json`
- `.claw/tasks/修复-search-首次响应并优化-guidance-参数提示/plan.json`

## Search Terms

- `claw search`
- `claw search --query "<topic>"`
- `claw search help`
- `search help stdout`
- `missing query stderr`
- `template recall`
- `claw memory search`
- `claw memory ...`
- `plan write`
- `recall`
- `memory index`
- `index management`
