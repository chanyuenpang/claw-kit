---
name: release-claw-kit
description: Repository-local workflow for the claw-kit owner to publish or release a new version, verify its CLI and GitHub marketplace artifacts, and refresh the maintainer Codex installation.
---
# release-claw-kit

Run only inside the claw-kit repository. Apply its guarded release protocol, prove the GitHub and npm artifacts, then hand off to the published-source Codex update phase. Treat repository `AGENTS.md` and the checked-out release code as authoritative.

## Route By Task Ownership

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Whole task: when this skill fully owns the current task, use `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "release-claw-kit"`.
- Independent stage: when this skill fully owns one stage of a broader plan, use `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`. On hosts with Goal Mode, consume the returned goal handoff so the active parent goal completes before the child plan creates its own goal; never overwrite the parent goal. A batch is a repeated-stage case: invoke this skill once as a subplan for each stage.
- Mixed stage: when this skill only contributes part of a stage that mixes multiple skills, do not create its template plan. Read `FALLBACK.md` and apply the relevant fallback guidance inside the owning workflow.
- Unavailable claw tooling: when the claw CLI or this template is unavailable, read `FALLBACK.md` and run the direct workflow.

After plan or subplan creation, follow the returned `workflowGuidance`. A release has two completion boundaries: the artifact release must finish before the maintainer installation refresh begins. Do not install unpublished workspace content as a shortcut.

## References

- Release protocol and recovery rules: `references/release-protocol.md`
- Fallback: `FALLBACK.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
