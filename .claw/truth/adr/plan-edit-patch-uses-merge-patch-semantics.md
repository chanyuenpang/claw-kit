# ADR: plan edit patch uses merge-patch semantics

## Status

Accepted

## Context

`claw plan edit --patch` 过去使用的是 project-specific 的字段覆盖逻辑：部分字段做直接 replacement，`requirements` / `tasks` 又夹带了额外 normalize 语义。这让 `patch` 这个名字与使用者心智长期错位，尤其容易让 agent 误以为：

- `patch` 是通用 JSON patch / merge-patch 风格入口
- `tasks` 等数组可能支持局部增删改，而不是整体 replacement

在实际使用里，这种命名与语义错位比“功能不够强”更容易制造误操作，因为 agent 看到 `patch` 时默认期待本身就是错的。

## Decision

- `claw plan edit --patch` 统一采用 merge-patch 心智。
- 对象字段递归合并。
- `null` 表示删除对象字段。
- 数组字段整体替换，不做按元素 merge，也不做按 `id` 的项目特化 merge。
- `taskId` / `taskStatus` 继续保留为 task progress 的专用快捷入口；如果 `patch.tasks` 与它们同时出现，直接拒绝这组冲突意图。

## Consequences

- agent 看到 `patch` 时的默认期待与真实行为重新对齐，不需要再记忆一套定制覆盖规则。
- 删除语义统一为 `null` 删除对象字段；数组要修改时，调用方需要提交替换后的整段数组。
- `tasks`、`references`、`rules` 等数组不会再暗含项目特化 merge 规则，减少隐式行为和错误推断。
- `patch.tasks` 与 `taskId` / `taskStatus` 的混用继续是显式错误，因为数组整体替换与单任务进度更新代表两种冲突操作。

## Related Code

- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`

## Search Terms

- `merge patch`
- `plan edit patch`
- `null deletes`
- `arrays replace`
- `patch.tasks`
- `taskStatus`
