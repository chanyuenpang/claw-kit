# 2026-06-09 plan write title-goal release

- `claw plan write` now supports a minimal root-plan entrypoint: a single title argument, with optional `--goal`.
- The root task scope is derived from the plan title instead of being passed separately.
- `plan write` always starts in `prepare.requirements` and returns a canonical `planSchema` skeleton so agents can learn the structure before patching it.
- If `goal.text` is still empty after `plan write`, the returned guidance must tell the agent to fill the goal first, then complete the remaining plan fields, then move the plan to `process.active` once requirements are clear.
- `claw subplan write` is now a dedicated entrypoint for subplans and derives subplan goal text from the parent task.
- `task meta` now records both `rootPlan` and `activePlan` so subplan navigation keeps a stable root anchor.
