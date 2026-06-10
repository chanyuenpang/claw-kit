# ADR: `using-claw-kit` 作为 Codex 单一可见入口

## Context

随着 Codex 适配器把主流程收敛到 `using-claw-kit` + `planning`，旧的 standalone workflow skills 已不再属于 active main-agent path。

当前 checkout 中，startup 恢复已经由 `SessionStart` / `claw context` 的 `startupRecovery` surface 承担；继续把可见主流程建模成 `bootstrap`、reference loading 或其他入口前置步骤，只会让 session entry 与真正的 planning/task-binding 语义并列竞争。

## Decision

把 `using-claw-kit` 固定为 Codex 侧唯一的可见 session-entry skill。

它应当：

- 在 `@claw-kit` 被调用时首先运行
- 把读取 `planning` 作为第一条可见动作
- 让 `planning` 成为可见的 plan-entry surface，并从返回的 `workflowGuidance` 继续主流程
- 不再把 bootstrap、独立 reference loading 或 claw context 恢复表述成用户面前的第一步

## Consequences

- 插件的 session entry surface 收敛为一条明确主线：`using-claw-kit` -> `planning` -> `workflowGuidance`
- startup recovery 继续存在，但它属于 hook/runtime enhancement，而不是用户面前需要单独执行的 workflow 步骤
- manifest、starter prompts、skill 文案和 truth 都可以围绕同一条可见入口维护，而不再保留旧的 bootstrap wording
