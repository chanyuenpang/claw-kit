---
name: test-claw-kit
description: Run claw-kit release-candidate and pre-release version testing without releasing. Use when the repository owner asks to build, check, test, package-smoke, or locally validate a claw-kit CLI or platform-plugin candidate before deciding whether it is ready for release.
---
# test-claw-kit

Verify the current claw-kit workspace as a release candidate, preserve exact failure evidence, and stop before every release action.

## Route By Task Ownership

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Whole task: when this skill fully owns the candidate test, use `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "test-claw-kit"`.
- Independent stage: when candidate testing is one independently owned stage of a broader workflow, use `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`. On Goal Mode hosts, consume the returned handoff so the active parent goal completes before the child plan creates its own goal.
- Mixed stage: when this skill contributes only part of another stage, do not create its template plan. Read `FALLBACK.md` and apply the relevant checks inside the owning workflow.
- Unavailable claw tooling: read `FALLBACK.md` and run the direct workflow.

After plan or subplan creation, follow the returned `workflowGuidance`.

## Hard Boundary

This skill never changes versions, commits, pushes, tags, publishes npm or GitHub artifacts, invokes `release-claw-kit` or an artifact-specific `release-*` skill, or claims published-source verification. Local candidate installation is allowed only when the user explicitly requests it, and must use a development identity without deleting the official installation.

## References

- Fallback: `FALLBACK.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
