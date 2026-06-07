# Codex Goal mode integration

- Codex Goal mode is a host-level thread feature, not a `claw-kit` plugin-owned runtime.
- Official Codex docs describe Goal mode as a persistent thread objective started through `/goal`, with progress controls shown above the composer in the app, and equivalent support in the CLI and IDE surfaces.
- `claw-kit` can still integrate with Goal mode by returning a structured recommendation when a plan first enters `process.active`.
- In `workflowGuidance`, `goalMode` now carries:
  - `recommendedObjective`
  - `setWhen = on_enter_process_active`
  - `ifNoActiveGoal = true`
  - `doNotOverwriteExisting = true`
  - `supportedSurfaces = [\"/goal\", \"create_goal\"]`
- The recommended objective is taken directly from canonical `plan.goal.text`.
- The Codex adapter should check whether the current thread already has an active goal before setting one from the active plan.
