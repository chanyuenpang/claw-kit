---
name: update
description: Use when a newer claw-kit version is detected in Cindy or the user asks to refresh the published claw CLI and Cindy plugin installation.
---
# update

Use this skill to refresh claw-kit on Cindy. The loaded adapter already determines the platform; do not route to Codex or ask the user to choose a host.

## No-.claw fallback

If the workspace has no `.claw` directory, read `non-claw-fallback.md` and
follow the direct Cindy update instructions.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Direct request: use Ghost operation `plan.create` with the update template and title.
- Active parent task: use `subplan.create` with the parent task and task id, and consume its goal handoff before the update subplan creates its own goal.
- Batch request: create one root task per target and run this template as the update task's subplan.

## Contract

- Refresh the published global CLI first, then the Cindy `.cindy` plugin package.
- Treat the CLI and Cindy plugin as one update unit; verify both before reporting success.
- Require the installed Cindy plugin id `claw-kit` to be enabled and running.
- Never claim that a workspace `.cindy` file is installed until Cindy's update confirmation has been accepted.
- A cached package alone is not activation proof. Verify the installed plugin version, enabled state, and runtime state.
- During release closeout, publish and verify the target version before invoking this skill.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md` only outside the claw harness.

## References

- Fallback: `non-claw-fallback.md`
- Coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`

