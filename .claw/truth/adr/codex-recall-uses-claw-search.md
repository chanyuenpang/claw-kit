# ADR: Codex recall uses claw search

## Status

Accepted

## Context

完成的 `codex-claw-search-flow` plan 确认：Codex-facing recall 不应继续暴露为 OpenClaw-style `claw memory search`。在 Codex 工作流中，agent 需要一个更直接的项目上下文检索入口，并且可以在 `claw plan write` 前先恢复相关历史、docs、truth 或任务上下文。

同时，底层 memory/index 机制仍然有兼容价值：`claw plan done` 仍会刷新可重建索引，既有 `.claw` 项目也可能依赖 `claw memory ...` 做调试或索引管理。

## Decision

Codex-facing recall 的推荐命令统一为：

```sh
claw search
```

Codex workflow 允许在 `claw plan write` 前先运行 `claw search`，用于恢复相关项目上下文，再生成计划。

`claw memory ...` 不再作为 Codex-facing recall 的推荐入口，只保留为 legacy/debug surface 和 index 管理入口。memory/index internals 暂不移除。

## Consequences

- Codex agent 面向用户和技能文档时使用更清晰的 `claw search` 术语，避免把 recall 流程暴露成 OpenClaw memory 细节。
- planning flow 可以先检索项目上下文，再写入 canonical plan，减少低上下文计划和重复发现。
- 既有 `.claw` 项目、索引刷新和调试路径继续可用，不需要立即迁移或删除 `claw memory ...`。
- 后续若要移除 legacy memory surface，需要新的显式决策，并确认 index 管理替代入口。

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/codex-adapter/skills/`
- `.claw/tasks/codex-claw-search-flow/plan.json`

## Search Terms

- `claw search`
- `claw memory search`
- `claw memory ...`
- `plan write`
- `recall`
- `memory index`
- `index management`
