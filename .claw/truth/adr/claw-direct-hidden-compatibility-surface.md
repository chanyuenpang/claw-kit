# ADR: `claw direct` 作为隐藏兼容入口

## Status

Accepted

## Context

`claw-kit` 的主工作流已经收敛到 `using-claw-kit` -> `planning` -> `workflowGuidance`，而低复杂度、无需正式 plan 分解的 round 仍然需要一个兼容旧流程的直达入口。  
如果把 `direct` 公开成与 planning 并列的常规 workflow 概念，就会让 task scope、plan create 和 seeded task 1 的边界再次变模糊。

## Decision

- `claw direct` 保持为隐藏兼容命令，不作为公开的 workflow concept 宣传
- 低复杂度 round 仍然可以走 `direct`，但对外文案与技能说明继续把它视为兼容路径，而不是新的主流程
- `claw direct` 的可见合同继续保持轻量：可在必要时先做 `claw search`，并且只在确实产生可复用知识时派发 `truth-writer`

## Consequences

- 既保留旧 round 的兼容性，又不污染 `plan create` 作为 task scope 唯一入口的约定
- 文档、技能和提示词可以继续把 `direct` 当成低复杂度例外，而不是常规规划 surface
- 后续如果要把 `direct` 提升为显式公开概念，仍需要新的单独决策

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/test/core.test.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `CHANGELOG.md`

