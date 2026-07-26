# ADR: Task plan storage and direct session binding

## Status

Accepted

## Context

早期 task directory 同时保存 `meta.json`、`plan.json` 与 `plans/*.json`。`meta.json` 镜像 active plan、status、rules、task type 和 session ownership 等可由 plan 或运行态推导的信息，导致 plan lifecycle、SessionStart recovery、subplan navigation 与 retention 需要长期维护重复状态。依靠扫描 task directories 推断当前 active plan 还会让恢复结果受目录残留和遍历顺序影响。

## Decision

- task directory 只保存固定 root `plan.json` 与平铺的 subplan JSON；不再生成 `meta.json` 或 `plans/`。
- subplan 文件名使用 task name/title slug。目标文件已存在时以 `PLAN_ALREADY_EXISTS` 失败，不覆盖，也不自动追加后缀。
- project-level session registry 直接把 `sessionKey` 映射到 `.claw`-relative `planPath`；registry value 不复制 `taskName`、`planFile`、`boundAt`、`activePlan` 或更新时间。
- `claw context` 只读取当前 session binding；没有 binding 时不扫描 task directories，也不推断 active plan。
- 创建 subplan 后把 session binding 切到 child；subplan 完成后切回 `parentPlan`，一级 subplan 的 parent 是 `plan.json`；root plan 完成后删除 binding。
- 每次 plan 写入都会刷新 `updatedAt`，它表示计划活跃度；daily maintenance 用它归档早于昨天的无日期 legacy task，缺失或无效时回退 `plan.json` 修改时间。`completedAt` 仍表示完成事件，并定义直接 retention 的一小时延迟资格；日期分组 task 的每日归档资格由目录本地日决定。
- legacy `meta.json` 与 `plans/*.json` 只在 protocol recovery 中迁移一次。迁移先检查平铺名称冲突，不长期双写；完成状态写入 `.claw/runtime/maintenance.json` 的 `migrations.taskLayoutV2At`。迁移与 daily maintenance 共用该文件锁，合并写入时保留彼此字段；旧 `task-layout-v2.complete` marker 会自动收敛并删除，避免后续启动重复扫描 task directories。

## Alternatives Considered

- 保留 `meta.json` 作为 plan 状态镜像：拒绝，因为同一 lifecycle state 会出现多个写入源并产生漂移。
- 在缺少 session binding 时扫描 task directories 猜测 active plan：拒绝，因为恢复不再是 session-scoped 的确定性映射。
- subplan 重名时覆盖或自动加后缀：拒绝，因为会隐藏调用方命名冲突并破坏稳定 `planPath`。

## Consequences

- canonical active workflow lookup 收敛为 `sessionKey -> planPath`，context recovery 与 subplan 返回路径都由显式 binding 决定。
- task directory 结构更小，root/subplan ownership 由 `plan.json`、`parentPlan` 与 binding 表达，不再依赖 metadata mirror。
- 无 binding 的 session 不会意外恢复其他 session 或 stale task 的计划。
- flat subplan namespace 要求名称唯一；迁移 preflight 以明确失败替代静默覆盖。
- 旧 layout 仍可一次性迁移，但 migration state 初始化也是新项目 protocol 的一部分，避免 fresh project 被误报为 startup correction。
- 每日维护日期标记与迁移状态共存于一个锁保护的 runtime 文件；两条写入路径必须保持字段合并，不能互相覆盖。

## Related Code

- `packages/core/src/context.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/core/src/task-retention.ts`
- `packages/core/src/task-layout-migration.ts`
- `packages/core/src/daily-maintenance.ts`
- `packages/core/src/switch-task.ts`
- `.claw/tasks/精简-task-目录并移除-meta.json/plan.json`

## Search Terms

- `sessionKey -> planPath`
- `session registry`
- `meta.json removal`
- `flat subplan JSON`
- `PLAN_ALREADY_EXISTS`
- `parentPlan rebind`
- `root plan.json`
- `protocol recovery migration`
- `maintenance.json`
- `taskLayoutV2At`
- `completedAt`
- `updatedAt`
