# ADR: `using-claw-kit` 作为 Codex 单一可见入口

## Status

Accepted

## Context

随着 Codex 适配器把主流程收敛到 `using-claw-kit` + `planning`，旧的 standalone workflow skills 已不再属于 active main-agent path。

当前 checkout 中，startup 恢复已经由 `SessionStart` / `claw context` 的 `startupRecovery` surface 承担；继续把可见主流程建模成 `bootstrap`、reference loading、legacy plan skill surfaces 或其他入口前置步骤，只会让 session entry 与真正的 planning/task-binding 语义并列竞争。`0.1.53` 这轮又把入口文案进一步收口为“先 complexity gate、后决定是否进入正式 workflow”，因此 `planning` 不再是所有请求都会先显式进入的第一步。

## Decision

把 `using-claw-kit` 固定为 Codex 侧唯一的可见 session-entry skill。

它应当：

- 在 `@claw-kit` 被调用时首先运行
- 在任何 `claw plan create` 之前先做一次轻量复杂度评分，决定请求是否应该进入正式 `.claw` workflow
- 对 score `< 6` 的低复杂度请求直接跳过 claw workflow：不创建 plan、不运行 `claw search`、也不期待 `workflowGuidance`
- 把 complexity gate 固定为没有既有 task scope 时的第一条可见分流动作，而不是先进入 `planning`
- 只对 score `>= 6` 的请求进入正式 planning surface，并从返回的 `workflowGuidance` 继续主流程
- 不再把 bootstrap、独立 reference loading、legacy plan skills 或 claw context 恢复表述成用户面前的第一步

## Consequences

- 插件的 session entry surface 收敛为两条明确分流：低复杂度请求走 host 直接处理，高复杂度请求走 `using-claw-kit` -> complexity gate -> `planning` -> `workflowGuidance`
- startup recovery 继续存在，但它属于 hook/runtime enhancement，而不是用户面前需要单独执行的 workflow 步骤
- complexity gate 的归属固定在入口层，而不是在 plan 已经创建后再由下游 skill 反向决定是否需要 workflow
- `planning` 的职责边界更稳定：它只负责已经确定要进入正式 `.claw` workflow 的请求，不再承担低复杂度 admission 的第一跳
- manifest、starter prompts、skill 文案和 truth 都可以围绕同一条可见入口维护，而不再保留旧的 bootstrap wording 或多条 plan-surface 分流

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/.codex-plugin/plugin.json`

## Search Terms

- `using-claw-kit`
- `complexity gate`
- `score < 6`
- `skip claw workflow`
- `planning`
- `startupRecovery`
- `session entry`
- `legacy plan skills`
