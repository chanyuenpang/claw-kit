# Codex Goal mode integration

- Codex Goal mode is a host-level thread feature, not a `claw-kit` plugin-owned runtime.
- Official Codex docs describe Goal mode as a persistent thread objective started through `/goal`, with progress controls shown above the composer in the app, and equivalent support in the CLI and IDE surfaces.
- `claw-kit` 只在 plan 首次进入 `process.active` 后才返回 Goal mode 建议；`plan write` 仍停留在 `prepare.requirements` 时不应返回 `goalMode`。
- In `workflowGuidance`, `goalMode` now carries:
  - `recommendedObjective`
  - `setWhen = on_enter_process_active`
  - `ifNoActiveGoal = true`
  - `doNotOverwriteExisting = true`
  - `supportedSurfaces = [\"/goal\", \"create_goal\"]`
- The recommended objective is taken directly from canonical `plan.goal.text`.
- `goalMode` 只有在 `goal.text` 已存在时才成立，因为 harness 本身禁止没有 goal 的 plan 离开 `prepare.requirements`。
- The Codex adapter should check whether the current thread already has an active goal before setting one from the active plan.

## 真实代码锚点

- `packages/core/src/workflow-guidance.ts`
  - `buildGoalMode()` 定义 `setWhen = on_enter_process_active`、`ifNoActiveGoal = true`、`doNotOverwriteExisting = true`、`supportedSurfaces`
  - `buildPlanWorkflowGuidance()` 只在 `justEnteredProcess && hasGoal` 时返回 `goalMode`
- `packages/core/src/plan.ts`
  - `validatePlanDocument()` 要求 `goal.text` 缺失时 plan 不能离开 `prepare.requirements`
- `packages/cli/test/cli.test.ts`
  - 覆盖 `plan write` 不返回 `goalMode`
  - 覆盖首次进入 `process.active` 后才返回 `goalMode`
