# Task layout 与 session bindings

## 结论

- active workflow 的 canonical lookup 是 project-level binding：由 `sessionKey` 映射到 `.claw`-relative `planPath`。`claw context` 必须只按这条显式绑定恢复当前 workflow，不能扫描 task 目录来猜测 active plan。
- task 的 canonical layout 是 task 根目录下的 root `plan.json`，以及与它同层的 flat subplan JSON files；不再使用每个 task 下的 `plans/` 子目录。目标 subplan 文件名发生碰撞时必须显式失败，不能覆盖已有 plan。
- session binding 跟随执行焦点切换：`subplan create` 绑定 child plan；child 完成后绑定其 `parentPlan`；root plan 完成后解除当前 session binding。
- `completedAt` 是 task lifecycle 唯一时间戳，统一驱动 delayed archive eligibility 与 archive pruning；不能再从 status、current-task 标记、receipt 或其他时间字段推断 retention 资格。
- task archive 以整个 task directory 为单位，因此 source plan 的相邻 `.report` 会随计划一起移入 `.claw/archive/tasks/`，并仅在该 archived task 被 retention pruning 时删除。`maxTasksToKeep` 的共享默认值是 `9`，新项目和缺失/无效字段的配置归一化必须使用同一默认值。
- legacy `meta.json` 与 `plans/` layout 的迁移只运行一次；完成标记为 `.claw/runtime/task-layout-v2.complete`。该 guard 防止后续 context/CLI 调用重复搬运已经迁移的 task 文件。

## 长期行为与边界

- session binding 保存的是 `.claw`-relative path，不能把 checkout-specific absolute path 写成 canonical identity。
- active lookup 不允许以“扫描到唯一未完成计划”作为 fallback；缺失或无效 binding 应按无可恢复 active workflow 处理。
- flat subplan layout 仍保留 `parentPlan` 链接，child 完成时以该字段恢复父计划；root 没有 parent，因此 completion 解除 binding。
- delayed archive 和 pruning 必须共享 `completedAt` 语义，避免一个路径按完成时间、另一个路径按状态或 receipt 产生不同生命周期判断。
- finalization 不拥有独立的 report 删除生命周期；report 的保留和删除必须跟随 task archive/pruning，避免成功 writer 结果先于 task retention 消失。
- migration guard 属于 project runtime state，不是 task 内容；迁移完成后，旧 `meta.json` / `plans/` 不应继续作为 live lookup surface。

## 关联代码与验证

- project-level binding 与 lookup：`packages/core/src/session-bindings.ts`
- legacy layout 一次性迁移：`packages/core/src/task-layout-migration.ts`
- root/subplan 写入、碰撞、binding 切换与 completion：`packages/core/src/plan.ts`
- `completedAt` retention 与 pruning：`packages/core/src/task-retention.ts`
- retention 共享默认值：`packages/core/src/project-defaults.ts`
- context/CLI routing：`packages/cli/src/cli.ts`
- core 与 CLI tests 覆盖 session lookup 不扫描 task、flat subplan collision、child/parent/root rebinding、`completedAt` retention/pruning，以及 `.claw/runtime/task-layout-v2.complete` guard。

## 关键检索词

`sessionKey`、`planPath`、`session bindings`、`active workflow lookup`、`flat subplan`、`parentPlan`、`completedAt`、`delayed archive`、`archive pruning`、`task-layout-v2.complete`、`meta.json migration`

## Windows task retention 有界重试

- Windows 归档目录 rename 遇到 `EPERM`、`EBUSY` 或 `EACCES` 时，task retention 会按 `50ms`、`150ms`、`300ms` 做有界重试；仅处理这些常见瞬时文件占用错误，不把永久失败变成无限重试。
- 本阶段提交 `14cdbdb` 的 CLI 回归为 `72/72` 通过，覆盖更新后的 retention 行为。
