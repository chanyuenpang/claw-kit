# ADR: Codex adapter follows workflowGuidance

## Status

Accepted

## Context

`claw-kit` CLI 已经从计划命令返回结构化 `workflowGuidance`，但 Codex 适配器如果继续依赖宽泛提示词启发式，仍可能引入过时的独立 `plan-review` 循环、错过编辑后的即时 render，或在完成计划前后错误安排沉淀步骤。

## Decision

让 Codex 适配器把 `workflowGuidance` 作为主要路由契约，并跟随合并后的 planning flow：

- 显式消费 `delegateSubagents`、`askUser`、`recommendedCommands`、`nextStep`
- 不再假定存在独立的 `plan-review` 生命周期关口
- 在 `plan write`、`plan edit`、`plan done` 后直接使用返回的可见 plan render 更新聊天状态
- 任务执行中的知识沉淀继续走 `truth-writer`
- 完成态计划的 durable decisions 继续走 `adr-writer`

## Consequences

- Codex 适配器行为与 CLI 生命周期契约保持一致，而不是被 prompt drift 拉偏
- 计划更新、聊天渲染和 specialist 委派共享同一条流程语义
- 适配器技能与参考文档需要持续围绕 merged planning flow 维护，而不是保留已经废弃的独立 review 路径

## Related Code

- `packages/codex-adapter/skills/bootstrap/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/plan-view-consumption.md`

## Search Terms

- `workflowGuidance`
- `delegateSubagents`
- `nextStep`
- `plan render`
- `merged planning flow`
