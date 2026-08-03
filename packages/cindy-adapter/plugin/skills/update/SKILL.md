---
name: update
description: Use when a newer claw-kit version is detected in Cindy or the user asks to refresh the published claw CLI together with the Cindy plugin from the custom Git marketplace.
---
# update

Use this skill to refresh claw-kit on Cindy. The loaded adapter already determines the platform; do not route to Codex or ask the user to choose a host.

This is the Cindy-owned update implementation. Each supported platform maintains
its own adjacent `update` skill, and each platform skill refreshes the shared
global CLI together with that platform's plugin.

## No-.claw fallback

If the workspace has no `.claw` directory, read `non-claw-fallback.md` and
follow the direct Cindy update instructions.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Direct request: use Ghost operation `plan.create` with the update template and title.
- Active parent task: use `subplan.create` with the parent task and task id, and consume its goal handoff before the update subplan creates its own goal.
- Batch request: create one root task per target and run this template as the update task's subplan.

## Contract

- Refresh the published global CLI first, then the Cindy plugin through its
  custom Git marketplace.
- Use the Git source `chanyuenpang/claw-kit` without a pinned ref so Cindy tracks
  the repository default branch. The marketplace entry `claw-kit-cindy` points
  at `packages/cindy-adapter/plugin` and the plugin id remains `claw-kit`.
- Refresh that marketplace source, review any permission expansion, and use
  Cindy's install/update action. Cindy packages the source locally; do not
  download or open a `.cindy` archive.
- Treat the CLI and Cindy plugin as one update unit; verify both before reporting success.
- Require the installed Cindy plugin id `claw-kit` to be enabled and running.
- On first migration, if a legacy manual install conflicts, do not overwrite it
  silently. Cindy may adopt it only when its raw manifest exactly matches the
  market candidate; otherwise require uninstalling the legacy copy before one
  marketplace install.
- Never claim that refreshed market source is installed until Cindy's permission
  confirmation has been accepted.
- A refreshed Git cache alone is not activation proof. Verify the installed plugin version, enabled state, and runtime state.
- During release closeout, publish and verify the target version before invoking this skill.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md` only outside the claw harness.

## References

- Fallback: `non-claw-fallback.md`
- Coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`

