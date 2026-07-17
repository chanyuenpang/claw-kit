# Codex Goal mode integration

- Codex Goal mode is a host-level thread feature, not a `claw-kit` plugin-owned runtime.
- Official Codex docs describe Goal mode as a persistent thread objective started through `/goal`, with progress controls shown above the composer in the app, and equivalent support in the CLI and IDE surfaces.
- `claw-kit` 只在 plan 首次进入 `process.active` 或从暂停态恢复进入 `process.active` 时返回 Goal lifecycle 合同；`prepare.requirements` 阶段不应提前返回 active goal 建议。
- `prepare.requirements` 即使已经有 `goal.text`，现在也不再返回“立刻启动 active goal”的推荐；这一阶段只负责补全 requirements 并推进到真正的执行态。
- canonical `.claw/project.json` now exposes flat `goalMode` as the project-level gate for this behavior.
- when `goalMode = false`, `workflowGuidance` must suppress both `goalMode` and `goalTool` entirely even if the active plan has a valid `goal.text` and has just entered `process.active`.
- `workflowGuidance` 现在把 Goal lifecycle 拆成两个互补字段：`goalMode` 负责 host 侧 Goal mode 时机和推荐目标，`goalTool` 负责必须执行的真实 Codex goal tool 合同。
- `packages/core/src/templates/plans/default.ts` 的 seeded activation task 文案现在也消费同一个 `goalMode` 推荐目标：只要 `goalMode` enabled 且 host 不是显式 `opencode`，就会把 `buildGoalModeObjective(...)` 产出的 recommended objective 追加到 activation task detail；Codex 默认 no-host 路径按 Codex-compatible 处理并拿到这段 objective，显式 `host: "opencode"` 继续保留简洁 activation detail，而 `goalMode = false` 只输出 base detail。
- 当 plan 首次进入 `process.active` 时，`workflowGuidance.goalMode` 仍携带：
  - `recommendedObjective`
  - `allowOverwrite = true`
  - `setWhen = on_enter_process_active`
  - `ifNoActiveGoal = true`
  - `doNotOverwriteExisting = true`
  - `supportedSurfaces = ["/goal", "create_goal"]`
- 同一时刻还会返回 `workflowGuidance.goalTool = { tool: "create_goal", objective: ... }`，并且 objective 直接取自 canonical `plan.goal.text` 派生的 goal 文本。
- 当 plan 从 `process.wait` 或 `process.discussing` 恢复到 `process.active` 时，`goalMode.setWhen = on_resume_process_active`，同时 `goalTool.tool` 仍是 `create_goal`；恢复语义是“重新创建 active thread goal”，而不是沿用旧的 pause goal mode 想象操作。
- `process.wait` 与 `process.discussing` 的 cross-host compatibility metadata `workflowGuidance.goalTool` 仍是 `update_goal` 且 `status = blocked`；Codex CLI 的 `buildHostActions` 再根据 committed `planStatus` 投影为 schema-v1 `update_goal({ status: "complete" })`，用于真正结束当前 Codex active Goal。两层不能混写：`blocked` 保留跨 host 语义，而真实 Codex Host 中 blocked Goal 仍是 unfinished，会阻止后续 `create_goal`。
- `end.completed` 现在明确返回 `goalTool.tool = update_goal` 且 `status = complete`，用于在 plan 完成时关闭当前 active thread goal。
- The recommended objective is still derived from canonical `plan.goal.text`.
- `goalMode` 与 `goalTool` 只有在 `goal.text` 已存在时才成立，因为 harness 本身禁止没有 goal 的 plan 离开 `prepare.requirements`。
- Active `@claw-kit` threads are still pre-authorized to use Goal mode when the workflow later returns these contracts, so no extra per-turn authorization gate should block it.
- Codex agent 只运行固定 code-mode consumer，不检查 Goal state，也不解析 Goal tool error；Goal action 完全由已提交的 canonical plan status 决定。普通 `process.active` 进度不产生 Goal action，只有首次进入或从暂停态恢复进入 `process.active` 才产生 `create_goal`。

## 0.1.75 真实 Host 生命周期边界

- 真实当前 Codex Host 验证确认：状态为 `blocked` 的 Goal 仍是 unfinished，因此会阻止 `create_goal`。把旧 Goal 标记 complete 并在同一个 code-mode call 内创建新 Goal 也不安全；Codex 在 call 结束时结算 completion，会把同一 call 中刚创建的新 Goal 一并清除。
- 最终 Codex hostActions 合同按独立 plan mutation 消费：`process.wait` / `process.discussing` 产生 `update_goal({ status: "complete" })`；首次进入或从暂停态恢复进入 `process.active` 产生 `create_goal({ objective })`；`end.completed` 产生 `update_goal({ status: "complete" })`；普通 active progress 不产生 Goal action。这里描述的是 CLI 根据 committed plan status 生成的 native schema-v1 Codex hostActions，不改变 core `workflowGuidance.goalTool` 的 cross-host compatibility 值。
- unpublished-build live evidence 为：active → wait mutation 返回 `update_goal complete`，下一次独立 `get_goal` 返回 `null`；wait → active mutation返回 `create_goal`，下一次独立 `get_goal` 返回 active Goal。这证明完成与重建必须跨独立 code-mode calls 结算，不能合并为同一次调用。
- 完整测试通过，且 `0.1.75` 的 registry、全局 CLI、Codex plugin source / cache 都已验证；本节记录的是发布前真实 Host 验收后形成的最终生命周期合同。

## 真实代码锚点

- `packages/core/src/workflow-guidance.config.json`
  - `process.active.firstEntry` 与 `process.active.resumedActive` 同时声明 `goalTool.tool = create_goal`
  - `process.wait` 与 `process.discussing` 声明 cross-host `goalTool.tool = update_goal` 且 `status = blocked`
  - `end.completed` 声明 `goalTool.tool = update_goal` 且 `status = complete`
- `packages/core/src/workflow-guidance.ts`
  - `buildGoalMode()` 继续定义 `allowOverwrite = true`、`ifNoActiveGoal = true`、`supportedSurfaces`
  - `buildGoalModeObjective()` 负责把 `recommendedObjective` 渲染成可复用的 activation task 文案片段
  - `buildGoalTool()` 负责把 `create_goal` / `update_goal` 模板实例化成真实 workflowGuidance 合同
  - `buildPlanWorkflowGuidance()` 只在 `justEnteredProcess` 或 `resumedIntoActive` 时返回 active-entry `goalMode` / `goalTool`；wait/discussing 返回 compatibility `update_goal(blocked)`，completed 返回 `update_goal(complete)`；当 `goalMode = false` 时继续 suppress 这些合同
- `packages/core/src/types.ts`
  - `WorkflowGuidance` 现在把 `goalTool` 作为稳定类型字段暴露给 downstream consumer
  - project workflow schema declares flat `goalMode`
- `packages/core/src/plan.ts`
  - `validatePlanDocument()` 要求 `goal.text` 缺失时 plan 不能离开 `prepare.requirements`
- `packages/cli/src/cli.ts`
  - compact plan result 会把 `workflowGuidance.goalTool` 原样透传到 CLI JSON
  - `buildHostActions()` 根据 committed `planStatus` 把 wait/discussing 的 Codex native action 投影为 schema-v1 `update_goal({ status: "complete" })`，不改写 compatibility `goalTool.status = blocked`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
  - Codex adapter 文档已改成直接消费 `create_goal` / `update_goal`，不再描述虚构的 pause goal mode
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
  - 两个 skill 都要求 host 执行真实 goal tool 合同，而不是自己发明 lifecycle 操作
- `packages/core/test/core.test.ts`
  - core 回归覆盖 requirements 不返回 active-goal 推荐、首次 active / resumed active 返回 `create_goal`、wait/discussing 的 compatibility `goalTool` 返回 `update_goal(blocked)`，completed 返回 `update_goal(complete)`
- `packages/cli/test/cli.test.ts`
  - CLI 回归覆盖 wait/discussing 的 Codex hostAction 投影为 schema-v1 `update_goal(complete)`，以及 active/resumed active 的 `create_goal`、普通 active progress 不产生 Goal action
  - 覆盖 `goalMode = false` 时 suppress `goalMode` / `goalTool`
