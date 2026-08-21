# DSH native todo dock integration

<!-- state: current -->
## Current behavior

`@veewo/dsh-adapter` 的 `claw_run` 工具把 claw plan 的任务进度映射为 DSH 原生 todo dock
（`conversation.input.dock` id=`todo`）的 `todo/write` 事件，使 DSH GUI 显示计划步骤
进度条。实现锚点：`packages/dsh-adapter/src/index.ts` 的 todo sync 块（提交
`feat(dsh): drive DSH todo dock from claw plan progress` /
`fix(dsh): drive todo from update_plan projection`）。

- 数据源优先级：优先取 `update_plan` hostAction 的完整 plan 文档
  （`projection.input.plan`，每次 plan mutation 包括 `task.done` 都携带）；回退到 compact
  输出 `output.tasks`（`plan.show --simple` 携带 `{status, goal, tasks}`）。
- 写入方式：整表替换、last-write-wins；经 `exec.agent.session.append("todo/write",
  { todos })`，与模型侧 `todo_write` 工具使用同一 seam；`exec.agent` 带 `session.append`
  时才写入。
- 状态映射：`done`/`completed` → `completed`；`in_progress`/`active` → `in_progress`；
  其余 → `pending`；空标题任务跳过；无有效 todo 时不写事件。
- Fail-open：todo sync 的任何异常都不能破坏已落定的 mutation；`exec.agent` 缺失或
  session 无 append 时静默跳过，GUI 进度条不更新但 mutation 不受影响。
- 无 CLI 改动：`update_plan` hostAction 已携带完整 plan 投影（完整数组合同由
  `codex-workflow-guidance-consumption.md` 拥有），adapter 直接消费，CLI 不输出独立
  todo payload（`packages/cli` 无 todo 代码）。

## Verification

0.2.25-rc.5（现发布为 `@veewo/dsh-adapter@0.2.25.5`）端到端验证（plan
`Todo-driver-verification`，goal `verify todo-driven progress UI after rc.5`）：
`plan.start` 后 `todo/write` 显示 3 步（1 completed + 1 in_progress + 1 pending）；
`task.done` 后实时更新（T1 completed、T2 in_progress）；会话日志经多帧 zstd decode
确认 16 次 `todo/write` 事件。决策与边界见 `../adr/dsh-adapter-drives-native-todo-dock.md`。

## Related code

- `packages/dsh-adapter/src/index.ts`（todo sync：`exec.agent.session.append("todo/write", ...)`）
- `codex-workflow-guidance-consumption.md`（`update_plan` 完整投影合同 owner）
- `../adr/dsh-adapter-drives-native-todo-dock.md`（决策 owner）

## Search terms

`todo dock`、`todo/write`、`todo_write`、`conversation.input.dock`、`update_plan`、
`exec.agent.session.append`、`native todo`、`DSH progress`
