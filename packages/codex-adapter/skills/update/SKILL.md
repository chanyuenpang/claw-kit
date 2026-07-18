---
name: update
description: Use when a newer claw-kit version is detected in Codex or the user asks to refresh the published claw CLI and official Codex plugin installation.
---
# update

Use this skill to refresh claw-kit on the Codex host. The loaded adapter already determines the platform; do not ask the user to choose a host route.

## No-.claw fallback

If the workspace has no `.claw` directory, read `non-claw-fallback.md` and follow the Codex update instructions directly.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Direct request: run `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "update"`.
- Active parent task: run `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`.
- Batch request: create one root task per target and run this template as the update task's subplan.

## Contract

- Refresh the published global CLI first, then the official Codex plugin from the `chanyuenpang/claw-kit` GitHub marketplace.
- Treat the CLI and Codex plugin as one update unit; verify both before reporting success.
- Require `claw-kit@claw-kit` to be enabled and any `claw-kit@claw-kit-local` identity to be disabled.
- Never use unpublished workspace files or a local marketplace as the Codex update source.
- A cache directory alone is not activation proof. Verify the marketplace source, enabled identity, and matching manifest versions.
- During release closeout, publish and verify the target version before invoking this skill.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md` only outside the claw harness.

## References

- Fallback: `non-claw-fallback.md`
- Coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
