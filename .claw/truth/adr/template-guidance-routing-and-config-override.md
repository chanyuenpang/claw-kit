# ADR: template guidance routing and config override

## Status

Accepted

## Context

这轮 `template-guidance-routing-and-config-override` 的 completed plan 已经把模板路由、模板级覆盖和 route-aware completion 一起落地为长期合同。这个变化不是单纯的实现细节：它决定了 runtime plan 需要保存哪些模板元数据、done 入口如何校验路由选择、以及模板专属 guidance 应该在哪一层参与运行时决策。

如果不把这些语义写进 canonical ADR，后续很容易出现三类漂移：

- 只依赖内存中的模板上下文，导致 `plan.json` 不能独立重放
- 把模板级 `configOverride` 当成创建输入的一部分，破坏模板侧的权责边界
- 让 route-aware completion 在不同写入口里各自实现，造成 `choiceId` 校验不一致

## Decision

- runtime plan 必须持久化 `plan.templateId`；通过精确文件创建时还必须持久化 `plan.templateFile`，使后续 done validation 与 guidance 始终返回同一个 template 文件
- task completion 与 plan editing 必须继续按 runtime plan 持久化的模板身份解析启动时的合同；已安装模板的后续版本升级只影响新计划，不能悄悄改写 active plan 的 guidance 或完成规则
- skill-backed workflow 使用相邻 `TEMPLATE.json` 的 `--template-file` 入口；`--template <id>` 继续作为兼容的 id discovery，不能作为同名跨 adapter template 的权威来源
- runtime plan 必须持久化模板作用域内的 `plan.configOverride`
- 模板专属 guidance 继续由模板定义，尤其是 `guidance.onDone` 和 `guidance.onDone.choices`
- template task 还可以通过 `guidance.onPlanStart` 声明 plan-start 时允许的 task completion 与目标状态；core 只按 runtime plan 持久化的 `templateId` / `templateFile` 解析 current task 的声明，不从 task 文案、语言或 skeleton shape 推断模板身份
- `claw plan start` 保持全局可调用的可选 shorthand；`guidance.onPlanStart` 只拥有 current task 是否推荐并声明这条 delivery transition，不把命令变成模板必经步骤。没有该声明时，runtime 不推荐 `plan start`，但普通 plan/task mutation 与显式 CLI surface 继续有效
- `guidance.onDone.default` 与 `guidance.onDone.choices.<choiceId>` 都可以修改返回的 workflow guidance，并通过 `mergeMode: "override" | "replace"` 声明是叠加默认 guidance 还是完整替换
- `guidance.onDone.choices` 只用于会改变紧邻 downstream task 或 route 的真实选择；多个标签若共享同一 `nextTaskId`、只改变提示文本，不构成 choice，应使用 default guidance
- `delegateTruth` 只作为旧 template cache 的 inert compatibility metadata 被接受；current template guidance 不拥有 knowledge writer delegation
- `guidance.onDone.choices` 是 route-aware completion 的唯一权威来源；当模板定义了 choices 时，任何进入 `done` 的写路径都必须提供有效 `choiceId`
- `claw task done --choice` 和 `claw task edit --status done --choice` 共享同一套 done-transition 校验
- route-aware guidance 必须把允许值只暴露在 `nextTask.completionChoices` 这一结构化值来源中；`commandHints` 只生成一条参数化的 `claw task done --id <id> --choice <choice>` 模板，`nextsteps` 只要求选择而不重复枚举允许值，并且不得返回必然失败的无 choice done 命令
- 面向调用者的缺失 choice 错误使用 CLI flag `--choice` 与可执行 recovery command；`choiceId` 只作为 plan 中的持久化字段名
- template-only guidance 不进入 agent-facing runtime task content，避免把模板内部路由细节泄漏到通用任务文本里
- `guidance.onPlanStart` 与 `guidance.onDone` 都属于 template-owned declarative metadata；前者拥有 plan-start transition，后者拥有 task-done routing，二者不能互相替代
- 模板级 `configOverride` 只应从 template 载入并写入 runtime plan，不应通过 plan 创建输入注入
- template guidance 可以按 canonical key 或嵌套点路径渲染 effective project config 的标量叶子值；自定义变量只允许放入 `var` 命名空间并通过 `var.*` 引用，避免削弱 protocol repair 对未知或废弃顶层字段的清理。runtime 内建变量在同名冲突时优先

## Consequences

- 运行时 plan 可以在没有 sidecar 状态的情况下重新解析同一个模板文件、模板路由和模板级覆盖
- active plan 的模板合同不会随已安装模板版本推进而漂移，升级后的规则从新计划开始生效
- `goalMode` 与 `knowledgeWriter` 等 current effective behavior 可以通过 `configOverride` 在统一 runtime contract 下覆盖；旧 `truthDispatch` 只属于兼容输入
- 路由完成的校验面收敛为一条规则，`choiceId` 不会因为入口不同而产生分叉
- 调用者无需从 template JSON 或内部字段名反推 route；compact guidance 本身提供 choices 与可复制执行的命令
- 模板文案和任务执行文案保持分离，agent 看到的是可执行计划，而不是模板内部实现痕迹
- 后续新增 route-aware template 时，可以复用同一条 completion contract，而不用重新发明一套 done validation
- 模板作者必须用至少一个不同 `nextTaskId` 的正例表达真实分支，并把“所有选项进入同一 task”的形态作为反例，避免为非分支引入强制 `choiceId`
- 可直接执行的模板通常应从 `process.active` 开始并省略 `guidance.onPlanStart`；只有真实 discussion-to-execution delivery task 需要选择这条 shorthand

## Related Code

- `.claw/tasks/template-guidance-routing-and-config-override/plan.json`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `docs/template-authoring-guide.md`

## Search Terms

- `templateId`
- `templateFile`
- `--template-file`
- `project config placeholders`
- `configOverride`
- `guidance.onDone`
- `choiceId`
- `mergeMode`
- `claw task done`
- `claw task edit --choice`
- `route-aware completion`
