# ADR: Lazy daily context maintenance

## Context

项目 task、受管临时文件、运行日志和用户级 session workflow 会在正常 CLI 使用中累积。日期 task 的归档与裁剪仍可能留下空的日期容器，completion refresh 的状态日志也会持续增长。立即在每次命令调用时清理会重复扫描和增加干扰；依赖操作系统计划任务则引入安装副作用、后台进程及跨项目调度责任。清理还必须避免活动 session、可重试的 knowledge-finalization job、运行中的 completion refresh、daemon 状态和模型缓存。

## Decision

- `claw context` 在每个本地日的首次调用时执行惰性维护，而不安装或启动后台调度器。
- 项目维护以 `.claw/runtime/maintenance.json` 为日期标记，清空 `.claw/runtime/tmp/`、移除遗留 `.claw/tmp/`；日期分组 task 按目录日期整体归档，只有早于昨天的 `.claw/tasks/YYYY-MM-DD/` 目录会移动到 archive，今天和昨天目录保留，且不依赖 `completedAt`。无日期 legacy flat task 按 `plan.updatedAt` 是否早于昨天归档；缺少或无效字段时回退 `plan.json` 修改时间。直接 retention 的一小时 `completedAt` 规则仍独立保留；归档后按 `maxTasksToKeep` 裁剪 archive。
- 同一每日项目维护删除 `.claw/tasks/` 与 `.claw/archive/tasks/` 下所有空的 `YYYY-MM-DD` 目录，不对空目录套用日期保留窗口；并递归删除 `.claw/logs/` 中修改日期早于昨天的文件及清空后的子目录，保留今天和昨天的日志。名为 `inflight.lock` 的整棵目录必须跳过，避免清理正在运行的 completion refresh 状态。
- 同一项目维护移除指向不存在或不在 active tasks 下的 plan 的 session binding；并回收遗留集中 finalizer jobs 中已成功、损坏或不再关联 active plan 的记录，以及无 active plan 的 knowledge session registry。仍关联 active plan 的 running 或可重试记录保留。
- session workflow 维护在当前生效的用户级 session runtime 根目录使用独立 `.maintenance.json` 标记，按默认七天 TTL 删除过期或无效 workflow，同时排除当前 session。
- 两个标记都在对应维护成功后才更新，并由文件锁保护；失败保留为下次 `claw context` 的重试机会。

## Alternatives Considered

- 操作系统计划任务或常驻后台服务：拒绝，因为它要求额外安装与运行时副作用，且不符合 CLI 的按需执行模型。
- 每次 `claw context` 都无条件清理：拒绝，因为同日重复扫描项目和共享 session runtime 没有相应收益。
- 让 completion-refresh 日志只随 task retention 删除：拒绝，因为日志位于 project-level `.claw/logs/`，不属于任何单个 task directory，无法由 task archive/pruning 提供有界生命周期。
- 清空全部旧日志目录后再由运行方重建锁：拒绝，因为 `inflight.lock` 是运行中 refresh 的 leader / single-flight 状态；跨入该目录会把垃圾回收与并发正确性耦合。
- 将系统临时 daemon 状态、用户级模型缓存或全部 runtime 数据纳入 sweep：拒绝，因为这些位置不等同于可安全回收的 workflow 状态，可能影响仍在运行的服务或有效缓存。

## Consequences

- 没有 `claw context` 调用的日子不会启动维护；这不是定时清理保证。
- 项目和用户级 session runtime 分开节流，避免一个项目的 context 调用反复扫描共享 session 状态。
- 失败的维护步骤不会写入当天的日期标记，因此下一次调用仍可尝试。
- 日期目录按创建日而非 plan completion 状态归档，因此跨日仍在进行的 task 也会在其目录早于昨天时一并移入 archive；这是日期分组 retention 的明确边界。无日期 legacy task 则以最后的 `updatedAt` 活跃度（缺失时文件修改时间）作为每日 cleanup 边界。
- 空日期目录不再因今天/昨天的归档窗口而残留；日志保留窗口则明确覆盖今天和昨天。运行中的 completion refresh 锁目录可能暂时保留更早内容，这是并发安全优先于即时回收的有意结果。
- legacy runtime cleanup 只回收无效或已完成的遗留记录，避免升级后残留状态持续积累，同时不破坏 active plan 的可重试 finalization。

## Related Code

- `packages/core/src/daily-maintenance.ts`
- `packages/core/src/task-retention.ts`
- `packages/core/src/session-bindings.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/session-workflows.ts`
- `packages/cli/src/cli.ts`

## Search Terms

- `lazy daily maintenance`
- `maintenance.json`
- `runDailyMaintenance`
- `runtime/tmp`
- `maxTasksToKeep`
- `session workflow TTL`
- `updatedAt`
- `legacy task cleanup`
- `empty dated directories`
- `completion-refresh logs`
- `inflight.lock`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-30 -->
### Extended lazy maintenance to empty date containers and project logs

最初决策只统一 task 归档与裁剪、受管临时目录、遗留 knowledge runtime 和 session workflow 的回收，没有为残留空日期目录或 project-level completion-refresh 日志定义生命周期。当前决策把两者纳入既有每日项目维护，同时以两日日志窗口和 `inflight.lock` 整目录跳过约束删除范围。
