---
name: update
description: Use when a newer claw-kit version is detected in Codex or the user asks to refresh the published claw CLI and official Codex plugin installation.
---
# update

Use this skill to refresh claw-kit on the Codex host. The loaded adapter already determines the platform; do not ask the user to choose a host route.

## Direct fallback

If the workspace has no `.claw` directory or claw-kit is unavailable, read
`non-claw-fallback.md` and follow the Codex update instructions directly. Do
not treat claw-kit as a prerequisite or claim that its unavailability prevents
the update from proceeding.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- When claw-kit is available, direct request: run `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "update"`.
- When claw-kit is available, active parent task: run `claw subplan create --template-file "<skill-dir>/TEMPLATE.json"` and let canonical session focus supply its parent plan/task; preserve the root objective and consume the driver-owned Goal/progress effects.
- When claw-kit is available, batch request: create one root task per target and run this template as the update task's subplan.

## Contract

- Refresh the published global CLI first, then the official Codex plugin from the `chanyuenpang/claw-kit` GitHub marketplace.
- Treat the CLI and Codex plugin as one update unit; verify both before reporting success.
- Enable `claw-kit@claw-kit` and disable local/beta identities when switching back to the published version.
- Never use unpublished workspace files or a local marketplace as the Codex update source.
- Confirm installed CLI and plugin versions; no separate cache audit or loaded-session proof is required for update completion.
- Artifact installation validates skills against that artifact's `skill-inputs.json`, including declared SKILL.md files, without a fixed count. Update itself needs only download, installation and CLI/plugin version confirmation; do not add a per-file installation audit.
- During release closeout, publish and verify the target version before invoking this skill.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md` whenever
  the claw harness is unavailable.

## References

- Fallback: `non-claw-fallback.md`
- Coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
