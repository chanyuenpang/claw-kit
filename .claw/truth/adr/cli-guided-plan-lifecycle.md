# ADR: CLI-guided plan lifecycle

## Status

Accepted

## Context

`claw-kit` 采用 prompt-first 的 Codex 工作流，agent 需要依据 CLI 返回结果遵守 `.claw` harness 规则。早期生命周期中存在独立的 `plan-review` 流程和偏冗长的计划变更输出，容易让适配器绕开规划语义、延迟界面刷新，或者把完成态沉淀步骤提前到计划真正结束之前。

## Decision

把规划质量规则并入核心 planning 语义，并让对外 workflow contract 保持紧凑、render-first：

- 不再把独立 `plan-review` 作为核心生命周期阶段
- `planning` 成为唯一可见 planning skill；其他 legacy plan skill surfaces 不再作为 active main-agent workflow surface 保留
- root `claw plan write` 把最简 positional title 入口作为正式外部契约：`claw plan write "<title>"`，并允许 `--goal` 省略，先建立 task scope 再补全计划内容
- `claw plan write`、`claw plan edit`、`claw plan done` 的结果只保留成功信息、下一步、委派 specialist，以及可见计划渲染
- `prepare.requirements` 的 guidance 先要求补齐 `goal.text` 与计划字段，再根据需求是否清晰决定是否切到 `process.active`；不再把 goal mode 作为这个阶段的第一动作
- `process.active` 成为由 `goal.text` 驱动的显式执行门：`plan.goal.text` 未填写时，计划不能离开 `prepare.requirements`
- 执行中的知识沉淀继续委派给 `truth-writer`
- `process.allTasksDone` 是 root plan 的 ADR 沉淀边界：在这里读取 `delegateSubagents`，写完 retrospective 后再把完成态 `plan.json` 交给 `adr-writer`
- `process.allTasksDone` 只有在 retrospective 和 `keyDecisions` 都已更新后，才允许进入 ADR deposition 和 plan completion
- root plan 的 required ADR closeout 保持异步：先把 retrospective 与 durable `keyDecisions` 持久化到 active `plan.json`，再以 `waitForCompletion=false` dispatch `adr-writer`；foreground plan closeout 不等待 ADR deposition
- `truth-writer` 与 `adr-writer` 都不阻塞 foreground closeout；ADR 的 required 含义是必须派发，不是必须等待完成
- `end.completed` 写入稳定的 `completedAt`，但 `claw plan done` 保留当前 task directory 与原 `planPath`，不在本次命令中立即移动计划

## Consequences

- Codex agent 可以直接从 CLI 结果拿到紧凑且顺序正确的下一步契约
- agent 被允许用最小参数先绑定任务，不必因为初始命令缺少完整 `goal` 而卡在 `plan write` 入口
- `prepare.requirements -> process.active` 的推进条件更明确：需求完整时应立即激活，需求不完整时才继续澄清
- 对外 plan-write / plan-status 合同更稳定，像 `release-0-1-25` 这样的版本发布可以把这组行为当作 release-worthy surface change
- 规划语义与展示语义保持一致，计划编辑后无需额外拼装另一套状态
- 生命周期门禁从文案建议上升为实际约束，避免无目标 active plan 进入执行态
- `truth-writer` 与 `adr-writer` 仍保留为完成期 specialist，而不是把 ADR 写作提前到计划仍开放时处理
- root plan 的 ADR 派发位置固定在 `process.allTasksDone`，因此 `claw plan done` 只做 closeout/archive，不再和 ADR dispatch 竞争同一个职责
- root plan closeout 需要先补齐 retrospective 和 `keyDecisions`，再进入 ADR deposition 和完成态收口
- `adr-writer` 可以与 `claw plan done` 并发；completed plan 在原 task 路径至少保留一小时，使异步 writer 不需要等待 foreground，也不需要切换到 archive 路径补救
- ADR deposition 失败不会阻塞本次 plan closeout；required dispatch 与异步完成语义保持分离
- 历史版本实跑对比说明，workflow feel 的主要回退点并不是 `plan write` 本身必然更重；新版 `plan write` 反而已经比部分旧版更窄、更干净
- 真正的回退来自 task 建立与推进被拆散到多个可见 surface：如果 startup recovery 先占据入口，而 `process.active` 又不够突出，`plan write` 就不再像唯一 task-scope 入口，主 agent 也更容易遗漏“计划后立即切到 active 执行”这一动作
- 因而这份 ADR 的 durable 含义不是单独继续压缩 `plan write`，而是保持 `plan write -> process.active` 作为最显眼、最连续的主流程链路，避免被并列 surface 稀释
- 由于 planning contract 已合并，active skill surface 应避免再保留 `plan-workflow`、`plan-review` 一类独立可见入口来分散主线

## Related Code

- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/plan-view.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/core/src/workflow-guidance.config.json`
- `.claw/tasks/实现-claw-search-persistent-embedding-worker/plan.json`
- `.claw/tasks/用不可变-snapshot-修复-ADR-异步归档竞态/plan.json`

## Search Terms

- `workflowGuidance`
- `plan write`
- `prepare.requirements`
- `process.active`
- `goal.text`
- `plan edit`
- `plan done`
- `render-first`
- `planning`
- `required ADR writer`
- `waitForCompletion=false`
- `asynchronous ADR closeout`
- `completedAt`
- `delayed archive`
