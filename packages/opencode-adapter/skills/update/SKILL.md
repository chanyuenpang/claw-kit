---
name: update
description: Use when a newer claw-kit version is detected in OpenCode or the user asks to refresh the published claw CLI and installed OpenCode plugin surfaces.
---
# update

Use this skill to refresh claw-kit on the OpenCode host. The loaded adapter already determines the platform; do not ask the user to choose a host route.

## No-.claw fallback

If the workspace has no `.claw` directory, read `non-claw-fallback.md` and follow the OpenCode update instructions directly.

## Entry routing

- Direct request: run `claw plan create --template update --title "update"`.
- Active parent task: run `claw subplan create --parent <parent-task-name> --task-id <id> --template update`.
- Batch request: create one root task per target and run this template as the update task's subplan.

## Contract

- Refresh the global CLI and installed OpenCode plugin surfaces together.
- Inside the claw-kit repository, use `npm run install:opencode-plugin`; it rebuilds and reinstalls the CLI before deploying the plugin, skills, agents, and shim.
- Verify the global CLI, plugin payload, discovery copies, agent definitions, workflow guidance, and restart boundary.
- Do not edit installed OpenCode copies directly or claim success from only one refreshed surface.
- During release closeout, publish and verify the target version before invoking this skill.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md` only outside the claw harness.

## References

- Fallback: `non-claw-fallback.md`
- Coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
