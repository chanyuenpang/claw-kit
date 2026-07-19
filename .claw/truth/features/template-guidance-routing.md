# Template Guidance Routing

## 结论

- seed plan 现在会持久化 `plan.templateId`、可选的精确 `plan.templateFile` 和模板专属的 `plan.configOverride`，因此 runtime 可以从 plan 状态重新解析出最初的 template。skill-backed 入口应使用相邻 `TEMPLATE.json` 的精确文件路径；裸 `--template <id>` 仅保留为兼容查找面。
- `plan.configOverride` 只属于 template-seeded plan，不是通用 plan patch；它会通过同一条 effective-config merge path 影响 `autoUpdate`、`goalMode`、`knowledgeWriter` 与 `externalPlanningSkill`。
- template guidance 定义在 task skeleton 里，真实入口是 `guidance.onDone`，可选的选择项定义在 `guidance.onDone.choices`；numeric task id 保持不变。
- template task 还可以声明 `guidance.onPlanStart`，由 `claw plan start` 在提交 planning 结果时应用该 task 的内部 transition。CLI 命令始终可用，但 initial workflow guidance 只有在 current task 实际声明 `guidance.onPlanStart` 时才推荐它；未声明只是不推荐，不会禁用普通 plan/task mutation 或全局命令。
- `guidance.onDone.default` 即使没有 choices 也可以影响默认 workflow guidance；路由对象现在统一使用 `mergeMode: "override" | "replace"`。
- `guidance.onDone.choices` 只适用于真实 route-selection event：不同 choice 必须改变紧邻的 downstream task 或 route。若多个标签都进入同一个 `nextTaskId`、只改变建议文本，应改用 `guidance.onDone.default`，并由执行者从证据推断形态。
- `mergeMode: "override"` 会在保留默认 guidance 骨架的前提下追加或覆盖指定字段；`mergeMode: "replace"` 会完整抛弃默认 guidance，直接使用模板给出的 guidance。
- template guidance 字符串可直接引用 effective `project.json` / `project-override.json` 的 canonical 叶子值，例如 `{{externalPlanningSkill}}`、`{{memory.embedding.model}}`。自定义变量必须声明在显式 `var` 命名空间并以 `{{var.releaseChannel}}` 形式引用，使 protocol repair 仍可清理未知或废弃的顶层配置字段。嵌套对象使用点路径；字符串、数字和布尔值可渲染，未知或不可直接渲染的值会报配置错误。
- `delegateTruth` 只作为旧 template cache 的 inert compatibility metadata 被 schema 接受；current templates 与 workflow guidance 不使用它，也不存在默认 per-task writer delegation。
- 任何把 task 推进到 `done` 的编辑路径都会按绑定的 template 重新校验。
- 如果 template 定义了 `guidance.onDone.choices`，那么 task 完成时必须提供 `choiceId`，否则会失败并给出带可选 choice 列表的定向错误。
- 如果 task 提供了 `choiceId`，但绑定 template 没有 `onDone` choices，则该值会被拒绝。
- `choiceId` 如果不在允许列表中，也会被拒绝，并返回可接受的 choice ids。
- CLI 现在同时支持 route-aware completion surfaces：`claw task done --id <number> [--choice <choice-id>]`，以及 `claw task edit --id <number> --status done --choice <choice-id>`；两者都会在同一套校验下持久化 `task.choiceId`。
- 当 next task 定义 choices 时，agent-facing `workflowGuidance.nextTask.completionChoices` 是合法 choice ids 的唯一结构化值来源；`recommendedCommands` 只给一条参数化的 `claw task done --id <id> --choice <choice>` 模板，`nextsteps` 不重复枚举 ids，并删除缺少 choice 的通用 done 命令。缺少 route 的错误仍使用公开 `--choice` 语法并列出合法值；compact CLI surface 的当前事实由 `.claw/truth/features/cli-guided-workflow.md` 详细拥有。

## 真实代码锚点

- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/effective-config.ts`
- `packages/core/src/types.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `docs/template-authoring-guide.md`
