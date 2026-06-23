# 2026-06-09 plan create title-goal release

- This note has been superseded by `claw plan create`, which supports a minimal root-plan entrypoint: a single title argument, with optional `--goal`.
- The root task scope is derived from the plan title instead of being passed separately.
- The older `prepare.requirements` default flow has been replaced by planning-aware seed templates:
  - planning-enabled projects start in `process.discussing`
  - planning-disabled projects start directly in `process.active`
- If `goal.text` is still empty after `plan create`, the returned guidance must tell the agent to fill the goal first, then complete the remaining plan fields, then move the plan to `process.active` once requirements are clear.
- `claw subplan create` is now a dedicated entrypoint for subplans and derives subplan goal text from the parent task.
- `task meta` now records both `rootPlan` and `activePlan` so subplan navigation keeps a stable root anchor.
