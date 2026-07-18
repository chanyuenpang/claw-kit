# ADR: Codex adapter follows workflowGuidance

## Status

Accepted

## Context

`claw-kit` CLI 已经从计划命令返回结构化 `workflowGuidance`，但 Codex 适配器如果继续依赖宽泛提示词启发式，仍可能引入过时的独立 `plan-review` 循环、错过编辑后的即时 render，或在完成计划前后错误安排沉淀步骤。

`0.1.49` 曾通过 `delegateSubagents` 表达 knowledge writer dispatch；该部分现已由 `hook-owned-two-phase-knowledge-finalization.md` 取代。`workflowGuidance` 仍是 foreground plan 的 mandatory next-step contract，但不再拥有 Truth/ADR writer 派发。

## Decision

让 Codex 适配器把 `workflowGuidance` 作为主要路由契约，并跟随合并后的 planning flow：

- 显式消费 `askUser`、`recommendedCommands`、`nextStep` 与 host-specific progress actions；仅在当前 task 明确需要 researcher 等执行型 specialist 时消费对应 delegation
- knowledge writer 不属于 main-agent delegation surface；foreground 只完成 plan lifecycle，Stop/session-idle sidecar 独立排队两阶段 finalization
- 不再假定存在独立的 `plan-review` 生命周期关口
- 不再保留 standalone `bootstrap` 或 `plan-workflow` 作为与 `planning` 并列的可见主流程 surface
- 在 `plan write`、`plan edit`、`plan done` 后直接使用返回的可见 plan render 更新聊天状态
- 完成态计划的 Truth 与 durable decisions 由 hook-owned finalizer 顺序交给 focused writers

## Consequences

- Codex 适配器行为与 CLI 生命周期契约保持一致，而不是被 prompt drift 拉偏
- 计划更新、聊天渲染和执行型 specialist 委派共享 foreground 流程语义
- 适配器技能与参考文档需要持续围绕 merged planning flow 维护，而不是保留已经废弃的独立 review、bootstrap 或 legacy plan-surface 路径
- knowledge finalization 与 `workflowGuidance` ownership 分离，避免 agent 因旧的 value-gated/required dispatch 文案重复派发 writer

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/plan-view-consumption.md`
- `packages/core/src/workflow-guidance.config.json`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`

## Search Terms

- `workflowGuidance`
- `hook-owned finalization`
- `truth-writer`
- `nextStep`
- `plan render`
- `merged planning flow`
- `planning`
