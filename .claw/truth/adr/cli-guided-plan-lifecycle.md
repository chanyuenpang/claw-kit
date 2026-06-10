# ADR: CLI-guided plan lifecycle

## Status

Accepted

## Context

`claw-kit` 采用 prompt-first 的 Codex 工作流，agent 需要依据 CLI 返回结果遵守 `.claw` harness 规则。早期生命周期中存在独立的 `plan-review` 流程和偏冗长的计划变更输出，容易让适配器绕开规划语义、延迟界面刷新，或者把完成态沉淀步骤提前到计划真正结束之前。

## Decision

把规划质量规则并入核心 planning 语义，并让对外 workflow contract 保持紧凑、render-first：

- 不再把独立 `plan-review` 作为核心生命周期阶段
- root `claw plan write` 把最简 positional title 入口作为正式外部契约：`claw plan write "<title>"`，并允许 `--goal` 省略，先建立 task scope 再补全计划内容
- `claw plan write`、`claw plan edit`、`claw plan done` 的结果只保留成功信息、下一步、委派 specialist，以及可见计划渲染
- `prepare.requirements` 的 guidance 先要求补齐 `goal.text` 与计划字段，再根据需求是否清晰决定是否切到 `process.active`；不再把 goal mode 作为这个阶段的第一动作
- `process.active` 成为由 `goal.text` 驱动的显式执行门：`plan.goal.text` 未填写时，计划不能离开 `prepare.requirements`
- 执行中的知识沉淀继续委派给 `truth-writer`
- `end.completed` 后再使用完成态 `plan.json` 作为 `adr-writer` 的沉淀 bundle

## Consequences

- Codex agent 可以直接从 CLI 结果拿到紧凑且顺序正确的下一步契约
- agent 被允许用最小参数先绑定任务，不必因为初始命令缺少完整 `goal` 而卡在 `plan write` 入口
- `prepare.requirements -> process.active` 的推进条件更明确：需求完整时应立即激活，需求不完整时才继续澄清
- 对外 plan-write / plan-status 合同更稳定，像 `release-0-1-25` 这样的版本发布可以把这组行为当作 release-worthy surface change
- 规划语义与展示语义保持一致，计划编辑后无需额外拼装另一套状态
- 生命周期门禁从文案建议上升为实际约束，避免无目标 active plan 进入执行态
- `truth-writer` 与 `adr-writer` 仍保留为完成期 specialist，而不是把 ADR 写作提前到计划仍开放时处理
- 历史版本实跑对比说明，workflow feel 的主要回退点并不是 `plan write` 本身必然更重；新版 `plan write` 反而已经比部分旧版更窄、更干净
- 真正的回退来自 task 建立与推进被拆散到多个可见 surface：如果 startup recovery 先占据入口，而 `process.active` 又不够突出，`plan write` 就不再像唯一 task-scope 入口，主 agent 也更容易遗漏“计划后立即切到 active 执行”这一动作
- 因而这份 ADR 的 durable 含义不是单独继续压缩 `plan write`，而是保持 `plan write -> process.active` 作为最显眼、最连续的主流程链路，避免被并列 surface 稀释

## Related Code

- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/plan-view.ts`
- `packages/cli/src/cli.ts`

## Search Terms

- `workflowGuidance`
- `plan write`
- `prepare.requirements`
- `process.active`
- `goal.text`
- `plan edit`
- `plan done`
- `render-first`
