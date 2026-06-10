# Codex Goal mode integration

- Codex Goal mode is a host-level thread feature, not a `claw-kit` plugin-owned runtime.
- Official Codex docs describe Goal mode as a persistent thread objective started through `/goal`, with progress controls shown above the composer in the app, and equivalent support in the CLI and IDE surfaces.
- `claw-kit` integrates with Goal mode by returning a structured recommendation during `plan write`, before execution begins.
- In `workflowGuidance`, `goalMode` now carries:
  - `recommendedObjective`
  - `allowOverwrite = true`
- The required follow-up after `plan write` is to enter Goal mode first.
- If the current thread already has a goal, update it from `recommendedObjective`; otherwise create a new goal from `recommendedObjective`.
- When canonical `plan.goal.text` is non-empty, the recommended objective is `按照 claw 流程，推进任务，更新plan，完成：<plan.goal.text>`; otherwise it falls back to `按照 claw 流程，推进任务，更新plan。`
- In active `@claw-kit` threads, Goal mode use is already authorized by the startup contract and should not wait on an extra per-turn authorization prompt.
