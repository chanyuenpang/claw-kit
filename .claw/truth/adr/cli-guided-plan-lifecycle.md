# ADR: CLI-guided plan lifecycle

## Status

Accepted

## Context

`claw-kit` 采用 prompt-first 的 Codex 工作流，agent 需要依据 CLI 返回结果遵守 `.claw` harness 规则。早期生命周期中存在独立的 `plan-review` 流程和偏冗长的计划变更输出，容易让适配器绕开规划语义、延迟界面刷新，或者把完成态沉淀步骤提前到计划真正结束之前。

## Decision

把规划质量规则并入核心 planning 语义，并让计划变更命令输出保持紧凑、render-first：

- 不再把独立 `plan-review` 作为核心生命周期阶段
- `claw plan write`、`claw plan edit`、`claw plan done` 的结果只保留成功信息、下一步、委派 specialist，以及可见计划渲染
- 执行中的知识沉淀继续委派给 `truth-writer`
- `end.completed` 后再使用完成态 `plan.json` 作为 `adr-writer` 的沉淀 bundle

## Consequences

- Codex agent 可以直接从 CLI 结果拿到紧凑且顺序正确的下一步契约
- 规划语义与展示语义保持一致，计划编辑后无需额外拼装另一套状态
- `truth-writer` 与 `adr-writer` 仍保留为完成期 specialist，而不是把 ADR 写作提前到计划仍开放时处理

## Related Code

- `packages/core/src/plan.ts`
- `packages/core/src/plan-view.ts`
- `packages/cli/src/cli.ts`

## Search Terms

- `workflowGuidance`
- `plan write`
- `plan edit`
- `plan done`
- `render-first`
