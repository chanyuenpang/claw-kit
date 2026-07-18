# Template Guidance Routing

## 结论

- seed plan 现在会持久化 `plan.templateId` 和模板专属的 `plan.configOverride`，因此 runtime 可以从 plan 状态重新解析出最初的 template。
- `plan.configOverride` 只属于 template-seeded plan，不是通用 plan patch；它会通过同一条 effective-config merge path 影响 `autoUpdate`、`goalMode`、`knowledgeWriter` 与 `externalPlanningSkill`。
- template guidance 定义在 task skeleton 里，真实入口是 `guidance.onDone`，可选的选择项定义在 `guidance.onDone.choices`；numeric task id 保持不变。
- `guidance.onDone.default` 即使没有 choices 也可以影响默认 workflow guidance；路由对象现在统一使用 `mergeMode: "override" | "replace"`。
- `guidance.onDone.choices` 只适用于真实 route-selection event：不同 choice 必须改变紧邻的 downstream task 或 route。若多个标签都进入同一个 `nextTaskId`、只改变建议文本，应改用 `guidance.onDone.default`，并由执行者从证据推断形态。
- `mergeMode: "override"` 会在保留默认 guidance 骨架的前提下追加或覆盖指定字段；`mergeMode: "replace"` 会完整抛弃默认 guidance，直接使用模板给出的 guidance。
- `delegateTruth` 只作为旧 template cache 的 inert compatibility metadata 被 schema 接受；current templates 与 workflow guidance 不使用它，也不存在默认 per-task writer delegation。
- 任何把 task 推进到 `done` 的编辑路径都会按绑定的 template 重新校验。
- 如果 template 定义了 `guidance.onDone.choices`，那么 task 完成时必须提供 `choiceId`，否则会失败并给出带可选 choice 列表的定向错误。
- 如果 task 提供了 `choiceId`，但绑定 template 没有 `onDone` choices，则该值会被拒绝。
- `choiceId` 如果不在允许列表中，也会被拒绝，并返回可接受的 choice ids。
- CLI 现在同时支持 route-aware completion surfaces：`claw task done --id <number> [--choice <choice-id>]`，以及 `claw task edit --id <number> --status done --choice <choice-id>`；两者都会在同一套校验下持久化 `task.choiceId`。

## 真实代码锚点

- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/effective-config.ts`
- `packages/core/src/types.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `docs/template-authoring-guide.md`
