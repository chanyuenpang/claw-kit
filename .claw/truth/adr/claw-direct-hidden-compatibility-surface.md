# ADR: `claw direct` 作为隐藏兼容入口

## Status

Accepted

## Context

`claw-kit` 的默认入口已经收敛到 `using-claw-kit` 对 project plan 与 direct work 的二元判断；CLI 仍需要保留一个兼容旧流程的 `claw direct` 命令。
如果把 `direct` 公开成与 planning 并列的常规 workflow 概念，就会让 task scope、plan create 和 seeded task 1 的边界再次变模糊。

## Decision

- `claw direct` 保持为隐藏兼容命令，不作为公开的 workflow concept 宣传
- `claw direct` 只保留命令级兼容语义；默认入口的 direct work 不要求先调用该命令，也不按复杂度分数触发
- `claw direct` 的可见合同继续保持轻量：跳过正式 claw workflow，不要求 `workflowGuidance`，也不把 `claw search` 当作这条兼容路径的默认前置动作
- `claw direct` 不建立 formal plan、knowledge registry 或 writer job；如需 durable deposition，应进入 project-scoped plan lifecycle

## Consequences

- 既保留旧 round 的兼容性，又不污染 `plan create` 作为 task scope 唯一入口的约定
- 文档、技能和提示词不应把 `claw direct` 提升成与 project plan 并列的公开 workflow surface
- 默认入口决策由 `using-claw-kit-session-entry.md` 拥有；本 ADR 只拥有隐藏兼容命令的边界
- 后续如果要把 `direct` 提升为显式公开概念，仍需要新的单独决策

## Related Code

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/test/core.test.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `CHANGELOG.md`
