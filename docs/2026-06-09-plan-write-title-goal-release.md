# 2026-06-09 plan write title-goal release

- `claw plan write` now uses a minimal root-plan entrypoint: `--title` and `--goal`.
- The root task scope is derived from the plan title instead of being passed separately.
- `plan write` always starts in `prepare.requirements` and returns a canonical `planSchema` skeleton so agents can learn the structure before patching it.
- `claw subplan write` is now a dedicated entrypoint for subplans and derives subplan goal text from the parent task.
- `task meta` now records both `rootPlan` and `activePlan` so subplan navigation keeps a stable root anchor.
