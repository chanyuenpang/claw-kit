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
- `claw task done` 只表达 task 状态转换，可选的 route 仍只通过 `--choice` 传递；它不接受 conclusion 参数。task-level conclusion 由 knowledge capture 从成功 `task.done` 前最近一条 assistant message 提取。
- 所有 mutation 默认作用于 session-bound 当前 plan/subplan；`--task-name` 与 `--plan-file` 仅作为无 binding 时的高级覆盖。
- `--summary` 只表示 `plan.summary`；`claw plan edit` 可写入 retrospective、what-worked、issue、follow-up 与 key-decision 等 closeout 字段；`--status end.completed` 仍要求 retrospective。
- `claw plan done --retrospective "<summary>" [--key-decision "<durable decision>"]` 是完整 root-plan closeout 入口；`--retrospective` 必填，`--key-decision` 可重复。它只是把 plan-level closeout 字段和 `end.completed` 组成一次有序 `plan edit` 的快捷入口，不拥有独有的 completion-finalization 分支。任何 workflow origin 位于有效 claw 项目的终态 `plan edit`、该快捷入口与 `plan leave` 都使用同一 dispatcher 排队 completion refresh；scope 只控制 knowledge finalization。
- `claw plan start` 用显式 plan 字段和重复的 `--add-task <title> --detail <text>` 分组原子提交 planning 结果，再应用 current template task 的 `guidance.onPlanStart`；具体 activation transition 由 `cli-guided-plan-lifecycle.md` 拥有。

## Consequences

- agent 可以从 `plan/task + edit/remove/done` 的命令树推导常见操作，不需要生成或清理临时 JSON。
- plan 与 task item 的职责边界明确，参数不再跨对象复用。
- task conclusion 不会被误建模为 mutation 参数；plan retrospective 与 key decisions 继续作为显式、可验证的 plan-level closeout 字段。
- root plan 与 subplan 使用完全相同的 mutation 命令；binding 切换决定当前目标。
- 数组删除采用精确值匹配；调用方可先通过 `claw plan show` 获取原值。
- 有效 claw 项目内 workflow 的不同完成命令入口不会遗漏 memory reindex 或适用的 GitNexus refresh；project scope 保留 task retention，session scope 不触发它。`end.completed`、`end.closed` 与 `end.leave` 的最终状态保持同一收尾派发边界。
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
- `task conclusion transcript extraction`
- `claw plan done --key-decision`
- `temporary JSON files removed`
