# Template Guidance Routing

## 结论

- seed plan 现在会持久化 `plan.templateId` 和模板专属的 `plan.configOverride`，因此 runtime 可以从 plan 状态重新解析出最初的 template。
- `plan.configOverride` 只属于 template-seeded plan，不是通用 plan patch；它会通过同一条 effective-config merge path 影响 workflow 行为，包括 `goalMode`、`truthDispatch`，以及外部 planning / writer skill routing。
- template guidance 定义在 task skeleton 里，真实入口是 `guidance.onDone`，可选的选择项定义在 `guidance.onDone.choices`；numeric task id 保持不变。
- `guidance.onDone.default` 即使没有 choices 也可以影响默认 workflow guidance；路由对象现在统一使用 `mergeMode: "override" | "replace"`。
- `mergeMode: "override"` 会在保留默认 guidance 骨架的前提下追加或覆盖指定字段；`mergeMode: "replace"` 会完整抛弃默认 guidance，直接使用模板给出的 guidance。
- route guidance 可以用 `delegateTruth: false` 局部屏蔽默认的 per-task `truth-writer` delegation；默认模板的 task 1 / task 2 就通过这条能力避免额外 truth dispatch。
- 任何把 task 推进到 `done` 的编辑路径都会按绑定的 template 重新校验。
- 如果 template 定义了 `guidance.onDone.choices`，那么 task 完成时必须提供 `choiceId`，否则会失败并给出带可选 choice 列表的定向错误。
- 如果 task 提供了 `choiceId`，但绑定 template 没有 `onDone` choices，则该值会被拒绝。
- `choiceId` 如果不在允许列表中，也会被拒绝，并返回可接受的 choice ids。
- CLI 现在同时支持 route-aware completion surfaces：`claw task done --task <name> --id <number> [--choice <choice-id>]`，以及通用 edit 路径里的 `--task-choice`；两者都会在同一套校验下持久化 `task.choiceId`。

## 真实代码锚点

- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/effective-config.ts`
- `packages/core/src/types.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
