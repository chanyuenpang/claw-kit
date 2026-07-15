---
name: update
description: TODO: describe when to use this claw skill.
---
# update

TODO: Replace this sentence with the skill's concise purpose.

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

## References

- Fallback: `non-claw-fallback.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
- Optional skill-local references: add files under `references/` only when the source skill needs extra material that does not fit cleanly in `SKILL.md` or `TEMPLATE.json`
