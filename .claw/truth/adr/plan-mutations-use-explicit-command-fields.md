# ADR: plan mutations use explicit command fields

## Status

Accepted

## Context

通用 JSON patch 入口要求 agent 先构造临时文件、理解对象与数组的合并语义，再负责清理文件。即使 merge 规则本身明确，这条路径仍把文件生命周期、patch 语义和 plan/task 两种对象混在一次 mutation 中，增加认知成本和失败面。

session binding 已能稳定标识同一 thread 当前拥有的 root plan 或 subplan，因此日常 mutation 也不需要重复传 task name 与 plan path。

## Decision

- 删除通用 patch 和批量 task 文件入口，不保留兼容别名。
- `claw plan edit` 只编辑 plan 字段；标量字段直接设置，数组字段通过可重复参数追加。
- `claw plan remove` 使用与 edit 相同的字段名，按精确值删除数组项。
- task item 使用独立的 `claw task add/edit/remove/done` 命令。
- 所有 mutation 默认作用于 session-bound 当前 plan/subplan；`--task-name` 与 `--plan-file` 仅作为无 binding 时的高级覆盖。
- `--summary` 只表示 `plan.summary`；完成说明使用 `claw plan done --retrospective`；mutation audit 不要求 agent 提供。
- `claw plan start` 用显式 plan 字段和重复的 `--add-task <title> --detail <text>` 分组原子提交 planning 结果，再应用 current template task 的 `guidance.onPlanStart`；具体 activation transition 由 `cli-guided-plan-lifecycle.md` 拥有。

## Consequences

- agent 可以从 `plan/task + edit/remove/done` 的命令树推导常见操作，不需要生成或清理临时 JSON。
- plan 与 task item 的职责边界明确，参数不再跨对象复用。
- root plan 与 subplan 使用完全相同的 mutation 命令；binding 切换决定当前目标。
- 数组删除采用精确值匹配；调用方可先通过 `claw plan show` 获取原值。
- 旧通用输入会作为未知参数失败，避免静默 no-op 或继续诱导 agent 使用旧路径。

## Related Code

- `packages/cli/src/cli.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/session-bindings.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`

## Search Terms

- `explicit plan fields`
- `session-bound mutation`
- `claw plan remove`
- `claw task edit`
- `claw plan done --retrospective`
- `temporary JSON files removed`
