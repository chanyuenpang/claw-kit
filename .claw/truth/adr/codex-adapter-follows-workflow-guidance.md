# ADR: Codex adapter follows workflowGuidance

## Status

Accepted

## Context

`claw-kit` CLI 已经从计划命令返回结构化 `workflowGuidance`，但 Codex 适配器如果继续依赖宽泛提示词启发式，仍可能引入过时的独立 `plan-review` 循环、错过编辑后的即时 render，或在完成计划前后错误安排沉淀步骤。

`0.1.49` release 进一步修正了 `delegateSubagents` 的 wording：`workflowGuidance` 仍是 mandatory next-step contract，但返回的 writer entry 不等同于“每一条都必须无条件派发”。required contract 的边界是在真正 dispatch 某个 subagent 时，必须直接遵守该 entry 的结构化字段。

## Decision

让 Codex 适配器把 `workflowGuidance` 作为主要路由契约，并跟随合并后的 planning flow：

- 显式消费 `delegateSubagents`、`askUser`、`recommendedCommands`、`nextStep`
- 在 `@claw-kit` 线程里把 subagent 使用视为已授权，必要时先用 `tool_search` 找到 agent-management 工具，派发时显式附带对应 writer skill，把 truth 的价值判断留给主 agent，只有在完成内容确实可复用时才派发 `truth-writer`，并把 `adr-writer` 作为 root plan 的必经 closeout 步骤
- `delegateSubagents` 的 canonical note 是：`When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.`
- 上述 required semantics 只约束 dispatch-time field honoring；它不把每个返回的 optional `truth-writer` suggestion 都升级成 unconditional dispatch requirement
- 不再假定存在独立的 `plan-review` 生命周期关口
- 不再保留 standalone `bootstrap` 或 `plan-workflow` 作为与 `planning` 并列的可见主流程 surface
- 在 `plan write`、`plan edit`、`plan done` 后直接使用返回的可见 plan render 更新聊天状态
- 任务执行中的知识沉淀继续走 `truth-writer`
- 完成态计划的 durable decisions 继续走 `adr-writer`

## Consequences

- Codex 适配器行为与 CLI 生命周期契约保持一致，而不是被 prompt drift 拉偏
- 计划更新、聊天渲染和 specialist 委派共享同一条流程语义
- 适配器技能与参考文档需要持续围绕 merged planning flow 维护，而不是保留已经废弃的独立 review、bootstrap 或 legacy plan-surface 路径
- truth 的沉淀边界保持紧凑：主 agent 先做价值筛选，truth dispatch 只在必要时发生，而 ADR closeout 仍然是 root plan 的固定动作
- workflowGuidance 的 mandatory 地位与 truth-writer 的 value-gated dispatch 可以同时成立，避免 agent 因措辞误读而过度派发或跳过结构化字段

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/references/plan-view-consumption.md`
- `packages/core/src/workflow-guidance.config.json`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`

## Search Terms

- `workflowGuidance`
- `delegateSubagents`
- `required structured contract`
- `dispatch-time`
- `truth-writer`
- `nextStep`
- `plan render`
- `merged planning flow`
- `planning`
