---
name: update
description: Use when claw-kit needs to refresh the published CLI and the current host plugin install surface after a newer version is detected.
---
<!-- AUTO-GENERATED from shared/skills/update/SKILL.md. Edit the shared source instead. -->
# update

Use this skill when startup recovery or the user explicitly wants to update claw-kit itself.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `non-claw-fallback.md` directly and follow the fallback instructions.

## Entry Routing

- Direct single-target request: use `claw plan create --template update --title "update"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template update` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first. Split the work into one task per target or coherent skill-shaped unit. Each target task should run this skill as an execution-time subplan, not perform the target work directly from the root plan.

Recommended batch task title:

`Run a update subplan, complete refresh the published CLI and the current host plugin install surface after a newer version is detected`

Recommended batch task detail:

`Goal: run the update subplan to complete refresh the published CLI and the current host plugin install surface after a newer version is detected. This task is satisfied by creating and completing that target subplan. First run claw subplan create --parent <root-task-name> --task-id <id> --template update, then follow the returned workflowGuidance inside that subplan until it completes. Record the subplan result in the root plan before marking this task done.`

## High-Signal Reminders

- This skill is for installation refresh work, not for planning and not for editing project workflow state.
- A claw-kit update is complete only when both the global CLI and the current host plugin surface were refreshed and verified.
- On remote Codex machines, use the repository marketplace lifecycle; direct cache installation is a maintainer-development path.
- A newer versioned cache directory is not proof that Codex activated it. Verify the enabled plugin identity and the marketplace source that produced the cache.
- The official third-party Codex identity is `claw-kit@claw-kit`. Detect and resolve an enabled stale same-name identity such as `claw-kit@claw-kit-local` before reporting success.
- Keep route rules and repeated high-signal constraints here. Keep the step-by-step execution contract in `TEMPLATE.json`.

## References

- Fallback: `non-claw-fallback.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
