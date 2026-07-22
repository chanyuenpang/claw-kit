# ADR: Windows task retention pruning uses explicit recursion

## Status

Accepted

## Context

`claw-kit` 的 task retention 会把完成任务归档到 `.claw/archive/tasks/`，并按 `maxTasksToKeep` 清理最旧的 archived task。

异步 knowledge finalizer 要求 completed plan 在 foreground `claw plan done` 返回后继续保持原路径可读；立即移动当前 task directory 会让 Stop 之后排队的 combined writer 首次读取与归档发生竞态。

在 Windows closeout 中，包含非 ASCII 名称的 archived task directory 不能依赖 `fs.rmSync(..., { recursive: true })` 作为唯一删除路径；这个路径可能失败或提前终止，导致 release closeout 后仍留下应该被 pruning 的历史任务目录。

## Decision

- Task retention pruning 使用显式递归删除函数 `removeDirectoryTreeSync`。
- 删除目录时先递归遍历子项，文件和 symlink 使用 `fs.unlinkSync`，子目录完成后使用 `fs.rmdirSync`。
- `fs.rmSync(..., { recursive: true })` 不作为 Windows archive pruning 的核心删除机制。
- Regression coverage 必须包含非 ASCII archived task name，确保 `.claw/archive/tasks/` 中的中文路径可以被正确 pruning。
- 进入 `end.completed` 时写入稳定的 `completedAt`；`claw plan done` 不立即移动当前 task directory。
- 直接 task retention 的 archive eligibility 只有一个语义条件：`completedAt` 有效且距可注入的当前时间至少一小时。`status`、current-task identity 与 writer receipt 都不是这条路径的 eligibility 条件。
- 直接 retention 中未设置、无效或未满一小时的 `completedAt` 均不触发归档；固定阈值使用毫秒常量与可注入 `now` 测试 seam。每日 maintenance 的无日期 legacy cleanup 是独立路径，按 `plan.updatedAt` 判断活跃度，缺失或无效时才回退 `plan.json` 修改时间。
- eligible task directory 移入 `.claw/archive/tasks/` 后，现有 `maxTasksToKeep` pruning 继续执行。

## Consequences

- Windows release closeout 不会因为非 ASCII archived task directory 而留下 stale task residue。
- `maxTasksToKeep` 的语义对 ASCII 与非 ASCII task names 保持一致。
- Task retention 的删除行为更显式，后续排查 archive residue 时可以直接查看递归 unlink/rmdir 路径。
- foreground closeout 不必等待异步 knowledge finalization，同时 combined writer 在一小时窗口内仍可从原 `planPath` 读取 completed plan。
- 直接 retention 的归档时机由计划数据中的 `completedAt` 决定，不依赖额外 receipt 状态；代价是刚完成的 task 会在 active tasks 目录保留到后续 retention sweep。每日 legacy cleanup 以最后计划活动时间处理没有完成时间的历史计划。

## Related Code

- `packages/core/src/task-retention.ts`
- `packages/core/test/core.test.ts`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`
- `.claw/tasks/用不可变-snapshot-修复-ADR-异步归档竞态/plan.json`

## Search Terms

- `task-retention`
- `maxTasksToKeep`
- `non-ASCII`
- `fs.rmSync`
- `unlinkSync`
- `rmdirSync`
- `archive/tasks`
- `completedAt`
- `one-hour delayed archive`
- `archive eligibility`
- `injectable now`
- `asynchronous ADR writer`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-22 -->
### Narrowed the completedAt-only rule to direct retention

早期规则把所有 active task archive eligibility 都归为 `completedAt`，因而无法表达每日维护对无日期 legacy task 的回收。直接 retention 保留该完成时间规则；每日 legacy cleanup 改由 `updatedAt`，并对历史文件使用修改时间回退。
