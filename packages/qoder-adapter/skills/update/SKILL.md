---
name: update
description: Use when a newer claw-kit version is detected in Qoder or the user asks to refresh the published claw CLI and installed Qoder plugin surfaces.
---
# update

Use this skill to refresh claw-kit on the Qoder host. The loaded adapter already determines the platform; do not ask the user to choose a host route.

## No-.claw fallback

If the workspace has no `.claw` directory, follow the Qoder update instructions directly: rebuild the CLI from source and re-sync the adapter skills.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Direct request: run `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "update"`.
- Active parent task: run `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`.
- Batch request: create one root task per target and run this template as the update task's subplan.

## Contract

- Refresh the global CLI and installed Qoder plugin surfaces together.
- Inside the claw-kit repository, rebuild and reinstall the CLI first, then sync shared skills to the qoder-adapter and reload skills in Qoder.
- Verify the global CLI version, shared skill sync status, and workflow guidance config.
- Do not edit installed Qoder copies directly or claim success from only one refreshed surface.
- During release closeout, publish and verify the target version before invoking this skill.
- Keep execution details in `TEMPLATE.json`.

## References

- Coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
