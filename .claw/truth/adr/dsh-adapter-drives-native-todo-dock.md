# ADR: DSH adapter drives the native todo dock from the update_plan projection

## Status

Accepted

## Context

DSH（DeepSeek Harness）是 claw-kit 的一等 invocation host。`claw_run` 消费 CLI 的
`hostActions`（`update_plan`）投影进度后，需要让用户在 DSH 原生 GUI 中看到计划步骤
进度。Apps SDK / app / widget / chat-rendering 路线已被 `abandon-apps-sdk-widget-route.md`
放弃，DSH 的进度展示必须在 CLI-driven `.claw` harness 边界内选择宿主原生 seam。
0.2.25-rc.5 验证计划（`Todo-driver-verification`，goal `verify todo-driven progress UI
after rc.5`）确认 adapter 已把 plan 任务映射为 DSH 原生 todo dock 的 `todo/write`
事件，且无需 CLI 改动。

## Decision

- DSH adapter 用 DSH 原生 todo dock（`conversation.input.dock` id=`todo`）展示计划进度，
  数据源是 `update_plan` hostAction 的完整 plan 投影，缺失时回退 compact `tasks`。
- 经 `exec.agent.session.append("todo/write", { todos })` 整表替换、last-write-wins，
  与模型侧 `todo_write` 工具同一 seam；fail-open，进度同步不破坏已落定 mutation。
- 不做 CLI 改动：`update_plan` 已携带完整 plan 数组（`codex-workflow-guidance-consumption.md`
  合同），CLI 不输出独立 todo payload。
- 不恢复 Apps SDK widget / app / render 路线：todo dock 是宿主原生 seam，不是自定义
  UI surface；该行为由 `.claw/truth/features/dsh-todo-dock-integration.md` 拥有。

## Alternatives

- Apps SDK widget / app surface：拒绝。`abandon-apps-sdk-widget-route.md` 已确立
  CLI-driven harness 边界，不因 DSH 恢复自建 UI 路线。
- CLI 输出独立 todo payload：拒绝。`update_plan` 已携带完整 plan 投影，额外 payload
  是重复双写且需要 CLI 改动（验证结论：no CLI change needed）。
- 不提供进度 UI：拒绝。用户需要可见的计划步骤进度；DSH 原生 dock 零自建 surface。

## Consequences

- DSH 用户直接在原生 todo dock 看到计划进度；plan/task 状态与 CLI canonical 状态一致
  （数据源同一份 `update_plan` 投影）。
- 整表替换 last-write-wins：每次 mutation 后 UI 以最新完整投影为准，无增量合并语义；
  状态收敛为 completed / in_progress / pending。
- 未来如需更丰富的宿主展示层，需作为新的显式架构决策提出；todo dock 路线不视为
  widget 路线的复活。

## Related Code

- `packages/dsh-adapter/src/index.ts`（todo sync）
- `.claw/truth/features/dsh-todo-dock-integration.md`（Truth owner）
- `codex-workflow-guidance-consumption.md`（`update_plan` 完整投影合同）
- `abandon-apps-sdk-widget-route.md`（Apps SDK 路线放弃决策）

## Search Terms

- `todo dock`
- `todo/write`
- `update_plan`
- `native todo`
- `DSH progress surface`
