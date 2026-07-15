# ADR: plan edit 串行化与 mixed task patch guard

## Status

Accepted

## Context

`claw plan edit` 原先会在命令开始时先读取 canonical `plan.json`，后续再尝试写回。这个模型在同一 plan 的重叠 edit 请求下容易出现两个长期不适合保留的行为：

- 后发请求基于旧快照计算，最终在提交阶段以 `PLAN_STALE_EDIT` 失败，调用方必须自己串行化
- `patch.tasks` 采用 replacement 语义，如果再混用 `taskId` / `taskStatus` 这一类 task progress 更新，容易先把原任务列表替换掉，再暴露误导性的 task-not-found 失败

这两类问题都属于 plan lifecycle 自己的 correctness surface，不应该继续外包给 host 或上层调用方兜底。

## Decision

- 同一 plan 的 `claw plan edit` 在共享 CLI/core 路径先进入 ticket-queue 串行门，再读取最新 canonical plan 并执行各自那一轮 edit。
- 串行化只保证顺序执行，不做 edit payload 合并；每条请求继续保留自己的独立结果合同、`workflowGuidance` 和错误语义。
- `patch.tasks` 不能与 `taskId` / `taskStatus` 出现在同一条 `claw plan edit` 中；遇到这类 mixed input，直接以明确错误拒绝，而不是继续允许 replacement 语义制造误导性失败。

## Consequences

- 连续或重叠的 `claw plan edit` 不再要求调用方自己手动串行化，queued 请求会在各自轮次开始时重读最新 canonical state。
- `PLAN_STALE_EDIT` 的出现边界缩小到真正的跨生命周期竞争，而不是普通的重叠 edit 调用。
- `claw plan edit` 的并发行为收敛到共享 CLI/core correctness surface，而不是依赖各个 host 再各自补队列逻辑。
- mixed `patch.tasks` / task-status 输入失败会更早、更清楚，agent 不会再因为 replacement 语义被误导成普通 task lookup 问题。

## Related Code

- `packages/core/src/io.ts`
- `packages/core/src/plan.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`

## Search Terms

- `plan edit`
- `PLAN_STALE_EDIT`
- `patch.tasks`
- `taskStatus`
- `ticket queue`
- `withSerializedAccess`
- `mixed task patch`
