---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment
---

# writing-skills

This claw skill wraps the installed superpowers skill into a template-backed workflow for the local claw-kit workspace.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-writing-skills --title "writing-skills"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-writing-skills` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Local References

- Adjacent fallback: `SUPERPOWERS-FALLBACK.md`
- Compiled knowledge: `CLAW-KNOWLEDGE.md`
- Coverage map: `CONTENT-COVERAGE.md`

## Notes

- This converted package preserves the original superpowers content beside the claw entry instead of replacing it with a summary-only surface.
- Any copied `references/`, `agents/`, or sibling helper files remain part of this skill package and should be used when the fallback or compiled knowledge points at them.
