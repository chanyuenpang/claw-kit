# Task layout 与 session bindings

<!-- state: current -->
## 结论

- active workflow 的 canonical lookup 是 project-level binding：由 `sessionKey` 映射到 `.claw`-relative `planPath`。`claw context` 必须只按这条显式绑定恢复当前 workflow，不能扫描 task 目录来猜测 active plan。
- 新建 project task 的 canonical layout 是 `.claw/tasks/YYYY-MM-DD/<task>/` 下的 root `plan.json`，以及与它同层的 flat subplan JSON files；不再使用每个 task 下的 `plans/` 子目录。读取、session binding、归档、finalization 与 retention 都必须兼容旧的平铺 `.claw/tasks/<task>/` layout。目标 subplan 文件名发生碰撞时必须显式失败，不能覆盖已有 plan。
- session binding 跟随执行焦点切换：`subplan create` 绑定 child plan；child 完成后绑定其 `parentPlan`；root plan 完成后解除当前 session binding。
- 对日期分组 task，daily maintenance 按目录日期决定归档：每个本地日首次 `claw context` 会移动早于昨天的整个 `.claw/tasks/YYYY-MM-DD/` 目录，保留今天和昨天的目录；该路径不读取 `completedAt`，因此也会归档缺少该字段的旧日期目录。无日期的 legacy flat task 则按 `plan.updatedAt` 判断是否早于昨天；缺少或无效字段时回退到 `plan.json` 的修改时间。直接 retention 仍以 `completedAt` 的一小时延迟处理 eligible legacy task，archive pruning 按归档记录的 `completedAt` 排序。
- task archive 以整个 task directory 为单位，并保留日期分组；source plan 的相邻 `.report` 与 task 私有 `.runtime/knowledge-finalization/` jobs 会随计划一起移入 `.claw/archive/tasks/`，并仅在该 archived task 被 retention pruning 时删除。新的 finalization job 不写入集中 runtime jobs 目录；读取仍兼容旧路径中的可重试 job。`maxTasksToKeep` 的共享默认值是 `9`，新项目和缺失/无效字段的配置归一化必须使用同一默认值。
- legacy `meta.json` 与 `plans/` layout 的迁移只运行一次；完成状态存入 `.claw/runtime/maintenance.json` 的 `migrations.taskLayoutV2At`。迁移与 daily maintenance 共用该文件锁，写入时保留对方字段。旧版 `.claw/runtime/task-layout-v2.complete` 会在下次 protocol ensure 时自动收敛到该字段并删除。该 guard 防止后续 context/CLI 调用重复搬运已经迁移的 task 文件。
- 每个本地日首次 `claw context` 对项目和有效的用户级 session runtime 各执行一次锁保护的惰性维护：清空 `.claw/runtime/tmp/`、移除遗留 `.claw/tmp/`、将早于昨天的日期目录整体归档，并按 `updatedAt`（缺失时按 `plan.json` 修改时间）归档早于昨天的无日期 legacy task；随后按 `maxTasksToKeep` 裁剪 archive，删除 `.claw/tasks/` 与 `.claw/archive/tasks/` 下所有空的 `YYYY-MM-DD` 目录，并递归清理 `.claw/logs/` 中修改日期早于昨天的文件和清空后的日志子目录。日志清理保留今天和昨天的文件，并跳过名为 `inflight.lock` 的整棵目录。session 侧同时清除默认 TTL 为七天的过期或无效 workflow；当前 session workflow 不会被清理。系统临时目录中的 daemon 状态和用户级模型缓存不属于该维护范围。维护成功后才写入对应的 `maintenance.json` 日期标记；同日后续调用跳过。
- 同一项目维护还会移除指向 active tasks 之外或不存在 plan 的 session binding；清理遗留集中 finalizer jobs 时，删除已成功、损坏或不再关联 active plan 的记录，并删除缺少 active plan 的 knowledge session registry。仍关联 active plan 的 running 或可重试记录不在此清理范围内。
- process-backed session runtime 以 `(canonicalWorkdir, agentSessionId)` 作为隔离键。每个 session 固定一个不可原地变更的 workdir，并保存零或一个 `currentPlan`；`claw session open <dir> <session-id>` 负责 create-or-open，调用方切换目录时打开另一复合键 session，而不是修改现有 session。
- terminal 或 Node client 的 soft close 只结束 live attachment，不删除 retained session 或 canonical plan。retained record 按最后 `updatedAt` 保留七天；daemon 重启后仍可由同一 open 命令恢复。打开已有且需要恢复 current plan 的 session 时，`currentPlan` 只复用 `plan show --simple` 的最小 `{status, goal, tasks[].title, rules}` 投影；新 session、无 binding 或不需要恢复时省略该字段。
- session 内 mutation 串行执行并隐式继承 workdir、agent session identity、host metadata 与 current-plan target。`search --dir <dir>` 只为单次搜索临时覆盖目录，不改变 session workdir、currentPlan 或 session identity。
- 连接中断不自动重放 mutation，也不建立 durable response/host-action outbox。client 把 in-flight outcome 标记为 unknown，返回精确的 `claw session open <dir> <session-id>` 恢复命令；重连后由 agent 使用 conditional simple view 或 `plan show --simple` 检查 canonical state。

## 长期行为与边界

- session binding 保存的是 `.claw`-relative path，不能把 checkout-specific absolute path 写成 canonical identity。
- active lookup 不允许以“扫描到唯一未完成计划”作为 fallback；缺失或无效 binding 应按无可恢复 active workflow 处理。
- flat subplan layout 仍保留 `parentPlan` 链接，child 完成时以该字段恢复父计划；root 没有 parent，因此 completion 解除 binding。
- 日期 task 的 daily archive 以目录本地日为唯一 eligibility 条件，且会移动整个日期目录；无日期 legacy task 的 daily archive 以 `updatedAt` 为活跃度时间，缺失时以 `plan.json` 修改时间回退。`completedAt` 仍只定义直接 retention 的一小时延迟资格，不替代每日 legacy cleanup 的活跃度判断。
- finalization 不拥有独立的 report 删除生命周期；report 的保留和删除必须跟随 task archive/pruning，避免成功 writer 结果先于 task retention 消失。
- daily maintenance 是由 `claw context` 触发的惰性操作，不是后台定时器；失败的维护步骤不会更新其日期标记，以便后续调用重试。项目和 session runtime 使用独立标记，避免每个项目重复扫描同一批 session workflow。
- 空日期目录清理不使用日期保留窗口，只以目录名匹配 `YYYY-MM-DD` 且目录当前为空为资格；日志清理按文件修改时间的本地日期判断，保留今天和昨天。`inflight.lock` 目录是运行中 completion refresh 的保护边界，维护不得进入或删除其内容。
- migration guard 属于 project runtime state，不是 task 内容；迁移完成后，旧 `meta.json` / `plans/` 不应继续作为 live lookup surface。
- session daemon 是本地执行优化与 retained context owner，不拥有 canonical plan state。Node client 的 `command()` 只返回业务 `output`；需要承接 host integration 的 adapter 使用 versioned `commandEnvelope()`，取得同一 mutation 的 `hostActions`、`postCommitEffects` 与 `knowledgeDispatch`。

## 关联代码与验证

- project-level binding 与 lookup：`packages/core/src/session-bindings.ts`
- legacy layout 一次性迁移：`packages/core/src/task-layout-migration.ts`
- root/subplan 写入、碰撞、binding 切换与 completion：`packages/core/src/plan.ts`
- `completedAt` retention 与 pruning：`packages/core/src/task-retention.ts`
- 日期 task lookup 与列举：`packages/core/src/context.ts`
- 每日维护及日期标记：`packages/core/src/daily-maintenance.ts`
- stale binding 回收：`packages/core/src/session-bindings.ts`
- 遗留 finalizer job 与 knowledge session registry 回收：`packages/core/src/knowledge-sidecar.ts`
- session workflow TTL sweep：`packages/core/src/session-workflows.ts`
- task 私有 finalization jobs 与旧路径 retry compatibility：`packages/core/src/knowledge-sidecar.ts`
- retention 共享默认值：`packages/core/src/project-defaults.ts`
- context/CLI routing：`packages/cli/src/cli.ts`
- session protocol/client：`packages/client/src/protocol.ts`、`packages/client/src/index.ts`
- session daemon、registry 与 command service：`packages/cli/src/session-daemon.ts`、`packages/cli/src/session-registry-v2.ts`、`packages/cli/src/command-service.ts`
- core 与 CLI tests 覆盖日期 task 与旧平铺 task lookup、session lookup 不扫描 task、flat subplan collision、child/parent/root rebinding、`completedAt` retention/pruning、每日维护的空日期目录与日志清理、`inflight.lock` 保留，以及 `maintenance.json` 的 task-layout migration guard。

## 关键检索词

`sessionKey`、`planPath`、`session bindings`、`active workflow lookup`、`agentSessionId canonicalWorkdir`、`claw session open`、`currentPlan`、`commandEnvelope`、`SESSION_CONNECTION_LOST`、`search --dir`、`YYYY-MM-DD`、`flat subplan`、`parentPlan`、`updatedAt`、`completedAt`、`legacy task`、`delayed archive`、`archive pruning`、`maintenance.json`、`runtime/tmp`、`logs`、`completion-refresh`、`inflight.lock`、`knowledge-finalization`、`taskLayoutV2At`、`meta.json migration`

## Windows task retention 有界重试

- Windows 归档目录 rename 遇到 `EPERM`、`EBUSY` 或 `EACCES` 时，task retention 会按 `50ms`、`150ms`、`300ms` 做有界重试；仅处理这些常见瞬时文件占用错误，不把永久失败变成无限重试。
- 本阶段提交 `14cdbdb` 的 CLI 回归为 `72/72` 通过，覆盖更新后的 retention 行为。

<!-- state: history -->
## 演化历史

<!-- dated: 2026-07-22 -->
### Date-scoped tasks and lazy daily maintenance

此前新 project task 只使用平铺 `.claw/tasks/<task>/` 路径，完成 task 的归档、临时目录回收和过期 session 清理不由 `claw context` 的每日入口统一触发；新的 task 内 finalization job 也不在该 layout 中。旧平铺 task 和集中 job 路径保留读取或重试兼容，以免升级时丢失可恢复工作。

<!-- dated: 2026-07-22 -->
### Legacy daily cleanup now uses plan activity

无日期 legacy task 曾只依赖 `completedAt` 的一小时延迟归档，导致旧计划缺少完成时间时无法由每日维护回收。每日 cleanup 现在以 `plan.updatedAt` 判断活跃度，并为历史 `plan.json` 回退文件修改时间；`completedAt` 仍保留给直接 retention 的完成延迟语义。

<!-- dated: 2026-07-30 -->
### Empty dated directories and project logs joined daily maintenance

此前 daily maintenance 会归档或裁剪 task、清理受管临时目录和遗留 knowledge runtime，但不会统一删除空日期目录，`.claw/logs/completion-refresh/` 也没有 retention。当前项目维护在同一每日入口删除 task/archive 下的空日期目录，并清理早于昨天的日志，同时以 `inflight.lock` 目录保护运行中的 refresh。
