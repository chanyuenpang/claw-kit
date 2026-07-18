# ADR: opencode subagent agent 定义继承主 agent 模型

## Status

Accepted

## Context

opencode 适配器的 subagent agent 定义（当前为 `claw-researcher`）不得在 frontmatter 固定运行模型。`claw-knowledge-writer` 现为 `mode: primary`（由 host-aware finalizer 经 `opencode run` 直接启动，见 `hook-owned-two-phase-knowledge-finalization.md`），不再属于 subagent；但它同样不在 frontmatter 硬编码 `model:`，其运行模型由 finalizer job 快照与 runner 决定。硬编码会绕过用户选择和 knowledge job 的显式 writer config，导致：

1. **模型分叉**：subagent 与主 agent 运行在不同模型上，行为和质量不可预期。
2. **配置漂移**：每新增一个 subagent 都要单独维护 `model:`，且容易与主 agent 的实际模型脱节。

`claw-researcher` 本就没有硬编码 `model:`（直接继承主 agent 模型），证明了继承模式可行且更稳定。

## Decision

opencode subagent agent 定义**不得**在前置 frontmatter 硬编码 `model:` 字段：

- subagent 通过省略 `model:` 使用 host 默认；knowledge finalizer 可以通过 runner 的显式 `--model` / variant 应用 job snapshot
- 该约定适用于 `packages/opencode-adapter/agents/` 下所有 subagent agent 定义（`mode: subagent`）
- 与 `claw-researcher` 已有的无 `model:` 写法对齐

## Alternatives

每个 subagent 显式声明 `model:`：会使 subagent 与主 agent 模型长期脱节，新增 subagent 时需重复维护，且无法跟随用户切换主 agent 模型。

## Consequences

- 未显式配置的 opencode subagent 使用 host 默认；knowledge writer 的显式 job model 可由 runner 覆盖，而不会与 agent frontmatter 冲突
- 新增 subagent agent 定义时无需（也不应）重复声明 `model:`
- 若未来确有"某个 subagent 必须固定模型"的真实需求，需在本 ADR 上追加例外说明，而不是默认硬编码

## Related Code

- `packages/opencode-adapter/agents/claw-knowledge-writer.md`
- `packages/opencode-adapter/agents/claw-researcher.md`
- `packages/cli/src/opencode-runner.ts`

## Search Terms

- `model:`
- `mode: subagent`
- `claw-knowledge-writer`
- `claw-researcher`
