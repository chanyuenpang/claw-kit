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

- runtime plan 必须持久化 `plan.templateId`
- runtime plan 必须持久化模板作用域内的 `plan.configOverride`
- 模板专属 guidance 继续由模板定义，尤其是 `guidance.onDone` 和 `guidance.onDone.choices`
- `guidance.onDone.default` 与 `guidance.onDone.choices.<choiceId>` 都可以修改返回的 workflow guidance，并通过 `mergeMode: "override" | "replace"` 声明是叠加默认 guidance 还是完整替换
- `guidance.onDone.choices` 只用于会改变紧邻 downstream task 或 route 的真实选择；多个标签若共享同一 `nextTaskId`、只改变提示文本，不构成 choice，应使用 default guidance
- `delegateTruth` 只作为旧 template cache 的 inert compatibility metadata 被接受；current template guidance 不拥有 knowledge writer delegation
- `guidance.onDone.choices` 是 route-aware completion 的唯一权威来源；当模板定义了 choices 时，任何进入 `done` 的写路径都必须提供有效 `choiceId`
- `claw task done --choice` 和 `claw task edit --status done --choice` 共享同一套 done-transition 校验
- template-only guidance 不进入 agent-facing runtime task content，避免把模板内部路由细节泄漏到通用任务文本里
- 模板级 `configOverride` 只应从 template 载入并写入 runtime plan，不应通过 plan 创建输入注入

## Consequences

- 运行时 plan 可以在没有 sidecar 状态的情况下重新解析模板路由和模板级覆盖
- `goalMode` 与 `knowledgeWriter` 等 current effective behavior 可以通过 `configOverride` 在统一 runtime contract 下覆盖；旧 `truthDispatch` 只属于兼容输入
- 路由完成的校验面收敛为一条规则，`choiceId` 不会因为入口不同而产生分叉
- 模板文案和任务执行文案保持分离，agent 看到的是可执行计划，而不是模板内部实现痕迹
- 后续新增 route-aware template 时，可以复用同一条 completion contract，而不用重新发明一套 done validation
- 模板作者必须用至少一个不同 `nextTaskId` 的正例表达真实分支，并把“所有选项进入同一 task”的形态作为反例，避免为非分支引入强制 `choiceId`

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
- `configOverride`
- `guidance.onDone`
- `choiceId`
- `mergeMode`
- `claw task done`
- `claw task edit --choice`
- `route-aware completion`
