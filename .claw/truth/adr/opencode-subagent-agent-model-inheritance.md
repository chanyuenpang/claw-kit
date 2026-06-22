# ADR: opencode subagent agent 定义继承主 agent 模型

## Status

Accepted

## Context

opencode 适配器的 subagent agent 定义（`packages/opencode-adapter/agents/claw-*.md`，如 `claw-truth-writer`、`claw-adr-writer`、`claw-researcher`）曾各自在前置 frontmatter 硬编码 `model:` 字段。这会让 subagent 固定到某个模型，而不是跟随用户为主 agent 选择的那一个，导致：

1. **模型分叉**：subagent 与主 agent 运行在不同模型上，行为和质量不可预期。
2. **配置漂移**：每新增一个 subagent 都要单独维护 `model:`，且容易与主 agent 的实际模型脱节。

`claw-researcher` 本就没有硬编码 `model:`（直接继承主 agent 模型），证明了继承模式可行且更稳定。

## Decision

opencode subagent agent 定义**不得**在前置 frontmatter 硬编码 `model:` 字段：

- subagent 通过省略 `model:` 继承主 agent 当前使用的模型
- 该约定适用于 `packages/opencode-adapter/agents/` 下所有 subagent agent 定义（`mode: subagent`）
- 与 `claw-researcher` 已有的无 `model:` 写法对齐

## Alternatives

每个 subagent 显式声明 `model:`：会使 subagent 与主 agent 模型长期脱节，新增 subagent 时需重复维护，且无法跟随用户切换主 agent 模型。

## Consequences

- 所有 claw-kit opencode subagent 与主 agent 始终运行在同一模型上，行为一致
- 新增 subagent agent 定义时无需（也不应）重复声明 `model:`
- 若未来确有"某个 subagent 必须固定模型"的真实需求，需在本 ADR 上追加例外说明，而不是默认硬编码

## Related Code

- `packages/opencode-adapter/agents/claw-truth-writer.md`
- `packages/opencode-adapter/agents/claw-adr-writer.md`
- `packages/opencode-adapter/agents/claw-researcher.md`

## Search Terms

- `model:`
- `mode: subagent`
- `claw-truth-writer`
- `claw-adr-writer`
- `claw-researcher`
