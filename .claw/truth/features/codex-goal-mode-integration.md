# Codex Goal mode integration

<!-- state: current -->
## Current behavior

- Codex Goal mode is a host-level thread feature, not a `claw-kit` plugin-owned runtime.
- Official Codex docs describe Goal mode as a persistent thread objective started through `/goal`, with progress controls shown above the composer in the app, and equivalent support in the CLI and IDE surfaces.
- `claw-kit` 只在 plan 首次进入 `process.active` 或从暂停态恢复进入 `process.active` 时返回 Goal lifecycle 合同；`prepare.requirements` 阶段不应提前返回 active goal 建议。
- `prepare.requirements` 即使已经有 `goal.text`，现在也不再返回“立刻启动 active goal”的推荐；这一阶段只负责补全 requirements 并推进到真正的执行态。
- canonical `.claw/project.json` now exposes flat `goalMode` as the project-level gate for this behavior.
- `goalMode` / `goalTool` remain subject to their existing lifecycle and project-policy gates, but Codex Progress is independent from Goal Mode: every nonempty `process.*` plan, including a one- or two-task default root plan, receives a full `update_plan` projection.
- when `goalMode = false`, `workflowGuidance` must suppress both `goalMode` and `goalTool` entirely even if the active plan has a valid `goal.text` and has just entered `process.active`.
- `workflowGuidance` 现在把 Goal lifecycle 拆成两个互补字段：`goalMode` 负责 host 侧 Goal mode 时机和推荐目标，`goalTool` 负责必须执行的真实 Codex goal tool 合同。
- `packages/core/src/templates/plans/default.ts` 的单一 seeded planning bridge 文案也消费同一个 `goalMode` 推荐目标：只要 `goalMode` enabled 且 host 不是显式 `opencode`，就会把 `buildGoalModeObjective(...)` 产出的 recommended objective 追加到 bridge detail，并明确只有 bridge 原子进入 `process.active` 后才启动 Goal Mode；Codex 默认 no-host 路径按 Codex-compatible 处理，显式 `host: "opencode"` 保留不含 Codex objective 的 detail，而 `goalMode = false` 只输出 base detail。默认 bridge 与 legacy 双任务兼容的完整生命周期事实由 `cli-guided-workflow.md` 拥有。
- 当 plan 首次进入 `process.active` 时，`workflowGuidance.goalMode` 仍携带：
  - `recommendedObjective`
  - `allowOverwrite = true`
  - `setWhen = on_enter_process_active`
  - `ifNoActiveGoal = true`
  - `doNotOverwriteExisting = true`
  - `supportedSurfaces = ["/goal", "create_goal"]`
- 同一时刻还会返回 `workflowGuidance.goalTool = { tool: "create_goal", objective: ... }`，并且 objective 直接取自 canonical `plan.goal.text` 派生的 goal 文本。
- 当 plan 从 `process.wait` 或 `process.discussing` 恢复到 `process.active` 时，`goalMode.setWhen = on_resume_process_active`，同时 `goalTool.tool` 仍是 `create_goal`；恢复语义是“重新创建 active thread goal”，而不是沿用旧的 pause goal mode 想象操作。
- `process.wait` 与 `process.discussing` 的 cross-host compatibility metadata `workflowGuidance.goalTool` 是 `update_goal(status="blocked")`；Codex hostActions 保持同一 `blocked` Goal 语义，同时继续投影原有任务状态的 Progress。暂停执行并不清空 Progress，也不引入虚构的 “paused progress” task 状态。
- 每个 `end.*` 状态都会先发出标记为 `:clear_progress` 的 `update_plan({ plan: [] })`，再完成 root Goal；它适用于 `end.completed`、`end.closed` 与 `end.leave`，而非只限 completed。
- The recommended objective is still derived from canonical `plan.goal.text`.
- `goalMode` 与 `goalTool` 只有在 `goal.text` 已存在时才成立，因为 harness 本身禁止没有 goal 的 plan 离开 `prepare.requirements`。
- Active `@claw-kit` threads are still pre-authorized to use Goal mode when the workflow later returns these contracts, so no extra per-turn authorization gate should block it.
- Codex agent 只运行固定 code-mode consumer，不自行检查 Goal state，也不解析 Goal tool error；CLI 仍根据已提交的 canonical plan status 决定请求哪一种 Goal action，而固定 driver/consumer 在每次真实 Goal mutation 前立即调用 `get_goal`：`create_goal` 只在没有 nonterminal Goal 时执行；若已有 Goal，则保留它并返回可见 recovery note，不改变 Goal 状态。`update_goal(status="blocked")` 只在 active Goal 存在时执行；`update_goal(status="complete")` 可从 active 或 blocked Goal 执行，其他缺失、已 complete 或未知状态均作为 no-op。恢复到 active 的 plan 由 SessionStart 指示固定 driver 运行一次 `plan sync`，以恢复 progress projection，并仅在没有 nonterminal Goal 时创建 Goal。普通 `process.active` 进度不产生 Goal action，只有首次进入或从暂停态恢复进入 `process.active` 才请求 `create_goal`。

## 0.1.75 真实 Host 生命周期边界

- `0.1.75` 的 complete-then-create 观察是旧版 Host 行为证据，不再定义当前暂停语义。
- 当前 Codex hostActions 合同将 Goal 与 Progress 分开：`process.wait` / `process.discussing` 发出 `update_goal({ status: "blocked" })` 并保留完整 Progress；首次进入或从暂停态恢复进入 `process.active` 产生 `create_goal({ objective })`；每个 `end.*` 先清空 Progress、再完成 Goal。这里描述的是 CLI 根据 committed plan status 生成的 native schema-v1 Codex hostActions，不改变 core `workflowGuidance.goalTool` 的跨 host 语义。
- unpublished-build live evidence 为：active → wait mutation 返回 `update_goal complete`，下一次独立 `get_goal` 返回 `null`；wait → active mutation返回 `create_goal`，下一次独立 `get_goal` 返回 active Goal。这证明完成与重建必须跨独立 code-mode calls 结算，不能合并为同一次调用。
- 完整测试通过，且 `0.1.75` 的 registry、全局 CLI、Codex plugin source / cache 都已验证；本节记录的是发布前真实 Host 验收后形成的最终生命周期合同。

## 0.1.83 knowledge-writer harness 历史边界与当前修复

- `0.1.83` 的版本化实测曾确认：父 plan 已占用 thread Goal 时，`subplan.create` 的 canonical mutation 先成功落盘，随后同一次 driver 调用尝试 `create_goal` 才被 Host 拒绝。该结果仍是“host-action 失败不代表 plan mutation 回滚、不得盲目重放”的历史证据。
- 当前 `subplan.create` 只切换 focused plan 与 Progress 投影，不关闭或创建 Goal；根 `plan.json` 的 goal.text 始终是同一 task 的 Codex thread Goal owner。
- child plan 后续进入、继续或恢复 `process.active` 时，仍由 focused child 决定 lifecycle 和 Progress；若 Host Goal 缺失，独立 mutation 只会用 root objective 创建它，绝不使用 child goal.text。已有 active Goal 继续由 fixed driver 保留。
- 对应决策 owner 是 `.claw/truth/adr/codex-goal-mode-thread-contract.md`。

## 0.1.86 installed Host 历史偏差与 0.1.99 发布修复

- `0.1.86` 同版本线的真实 installed lifecycle 曾执行 `process.active -> process.wait -> process.active -> end.completed`。`plan.wait` 的 canonical 状态与 compact `stage="paused"` 正常，但后续 `plan.resume` 在已把 canonical plan 恢复为 `process.active` 后调用 `create_goal`，Host 返回 `cannot create a new goal because this thread has an unfinished goal; complete the existing goal first`。只读检查确认原 Goal 仍 active，因此没有重放 resume；这是修复前的版本化 Host 证据。
- 同一轮 root closeout 已把 plan 持久化为 `end.completed`，随后暴露的重复 Goal close 指示在 Goal 已为空时返回 `cannot update goal because this thread has no goal`。terminal `nextsteps` 重复已消费 action 的 compact-result 缺陷由 `cli-guided-workflow.md` 唯一拥有；本文只保留 Goal 状态幂等问题的历史事实与当前行为。
- `0.1.99` 的跨调用 close-then-create 方案已被后续合同取代：当前固定程序保留任何非终态 Goal，只有没有 nonterminal Goal 时才创建 Goal。恢复 active plan 时，SessionStart 要求通过 fixed driver 运行一次 `plan sync`，以重建 progress projection 并在 Goal 缺失时创建它；agent 不得在程序外单独调用 `get_goal`。当前 driver/cache identity 由 `codex-workflow-guidance-consumption.md` 唯一拥有。
- canonical mutation 仍可能先于 Host action 失败，因此不得重放已持久化的 transition。当前程序化消费决策由 `.claw/truth/adr/codex-plan-mutations-use-fixed-code-mode-consumer.md` 拥有；thread-level 生命周期决策仍由 `.claw/truth/adr/codex-goal-mode-thread-contract.md` 拥有。

## 真实代码锚点

- `packages/core/src/workflow-guidance.config.json`
  - `process.active.firstEntry` 与 `process.active.resumedActive` 同时声明 `goalTool.tool = create_goal`
  - `process.wait` 与 `process.discussing` 声明 cross-host `goalTool.tool = update_goal` 且 `status = blocked`
  - `end.completed` 声明 `goalTool.tool = update_goal` 且 `status = complete`
- `packages/core/src/workflow-guidance.ts`
  - `shouldUsePlanHostIntegration()` is the shared task-count and lifecycle predicate; `buildPlanWorkflowGuidance()` applies it to Goal-mode guidance.
  - `buildGoalMode()` 继续定义 `allowOverwrite = true`、`ifNoActiveGoal = true`、`supportedSurfaces`
  - `buildGoalModeObjective()` 负责把 `recommendedObjective` 渲染成可复用的 planning-bridge 文案片段
  - `buildGoalTool()` 负责把 `create_goal` / `update_goal` 模板实例化成真实 workflowGuidance 合同
  - `buildPlanWorkflowGuidance()` 只在 `justEnteredProcess` 或 `resumedIntoActive` 时返回 active-entry `goalMode` / `goalTool`；wait/discussing 返回 compatibility `update_goal(blocked)`，completed 返回 `update_goal(complete)`；当 `goalMode = false` 时继续 suppress 这些合同
- `packages/core/src/types.ts`
  - `WorkflowGuidance` 现在把 `goalTool` 作为稳定类型字段暴露给 downstream consumer
  - project workflow schema declares flat `goalMode`
- `packages/core/src/plan.ts`
  - `validatePlanDocument()` 要求 `goal.text` 缺失时 plan 不能离开 `prepare.requirements`
- `packages/cli/src/cli.ts`
  - compact plan result 会把 `workflowGuidance.goalTool` 原样透传到 CLI JSON
  - Codex process projection 对所有非空 plan 同步完整 Progress；Goal Mode gating 不会抑制该投影。
  - `buildHostActions()` 保持 wait/discussing 的 native `update_goal({ status: "blocked" })`，并在所有 `end.*` 输出受 `:clear_progress` action-id 标记的空 Progress 投影后完成 Goal。
  - `subplan.create` 只切换 focused plan 并投影 child `update_plan`；它不生成 `update_goal` 或 `create_goal`，因此不会把根 Goal 当作 child handoff 的一部分
- `packages/cli/src/codex-driver.ts`
- fixed driver 在 `create_goal` / `update_goal` 前立即读取 Goal snapshot；`create_goal` 遇到非终态 Goal 时保留该 Goal、返回 recovery note 并将 action id 记为已消费；`blocked` 只从 active 执行，`complete` 可从 active 或 blocked 执行，其他状态跳过重复转换
- `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs`
  - bundled consumer 与 driver 保持相同的 Goal action 幂等规则，并在 `get_goal` 不可用时 fail closed
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
  - Codex adapter 文档已改成直接消费 `create_goal` / `update_goal`，不再描述虚构的 pause goal mode
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
  - 两个 skill 都要求 host 执行真实 goal tool 合同，而不是自己发明 lifecycle 操作；Goal snapshot 只允许由固定 driver/consumer 读取
- `packages/core/test/core.test.ts`
  - core 回归覆盖 requirements 不返回 active-goal 推荐、首次 active / resumed active 返回 `create_goal`、wait/discussing 的 compatibility `goalTool` 返回 `update_goal(blocked)`，completed 返回 `update_goal(complete)`
- `packages/cli/test/cli.test.ts`
  - CLI 回归覆盖所有非空 process plan 的 Progress、wait/discussing 的 `update_goal(blocked)`、active/resumed active 的 `create_goal`，以及所有 end 状态的 Progress 清空与 Goal 完成顺序
  - 覆盖 `goalMode = false` 时 suppress `goalMode` / `goalTool`
  - covers lightweight default plans, three-task plans, template-backed plans, and subplans at the host-integration boundary.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-26 -->
### Progress is independent from Goal Mode

The Codex projection now keeps Progress visible while a canonical plan is in `process.wait` or `process.discussing`; only Goal becomes blocked so the agent stops advancing. Every terminal `end.*` status clears Progress and completes Goal. This supersedes the older complete-on-pause behavior without adding a separate Progress pause state.

<!-- dated: 2026-08-06 -->
### Recovery preserves an existing nonterminal Goal

The former recovery route closed a nonterminal Goal and requested a second call to recreate it. The current fixed consumer instead preserves the existing Goal. Session recovery runs `plan sync` once to restore the progress projection and creates a Goal only when none is nonterminal; this prevents recovery from replacing a still-valid thread objective.
