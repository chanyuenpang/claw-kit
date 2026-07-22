# ADR: Lazy daily context maintenance

## Context

项目 task、受管临时文件和用户级 session workflow 会在正常 CLI 使用中累积。立即在每次命令调用时清理会重复扫描和增加干扰；依赖操作系统计划任务则引入安装副作用、后台进程及跨项目调度责任。清理还必须避免活动 session、可重试的 knowledge-finalization job、运行中的 daemon 状态和模型缓存。

## Decision

- `claw context` 在每个本地日的首次调用时执行惰性维护，而不安装或启动后台调度器。
- 项目维护以 `.claw/runtime/maintenance.json` 为日期标记，清空 `.claw/runtime/tmp/`、移除遗留 `.claw/tmp/`，并通过既有 retention contract 归档已完成至少一小时的 task、按 `maxTasksToKeep` 裁剪 archive。
- session workflow 维护在当前生效的用户级 session runtime 根目录使用独立 `.maintenance.json` 标记，按默认七天 TTL 删除过期或无效 workflow，同时排除当前 session。
- 两个标记都在对应维护成功后才更新，并由文件锁保护；失败保留为下次 `claw context` 的重试机会。

## Alternatives Considered

- 操作系统计划任务或常驻后台服务：拒绝，因为它要求额外安装与运行时副作用，且不符合 CLI 的按需执行模型。
- 每次 `claw context` 都无条件清理：拒绝，因为同日重复扫描项目和共享 session runtime 没有相应收益。
- 将系统临时 daemon 状态、用户级模型缓存或全部 runtime 数据纳入 sweep：拒绝，因为这些位置不等同于可安全回收的 workflow 状态，可能影响仍在运行的服务或有效缓存。

## Consequences

- 没有 `claw context` 调用的日子不会启动维护；这不是定时清理保证。
- 项目和用户级 session runtime 分开节流，避免一个项目的 context 调用反复扫描共享 session 状态。
- 失败的维护步骤不会写入当天的日期标记，因此下一次调用仍可尝试。

## Related Code

- `packages/core/src/daily-maintenance.ts`
- `packages/core/src/task-retention.ts`
- `packages/core/src/session-workflows.ts`
- `packages/cli/src/cli.ts`

## Search Terms

- `lazy daily maintenance`
- `maintenance.json`
- `runDailyMaintenance`
- `runtime/tmp`
- `maxTasksToKeep`
- `session workflow TTL`
