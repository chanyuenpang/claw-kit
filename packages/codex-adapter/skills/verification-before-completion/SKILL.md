---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# verification-before-completion

This claw skill wraps the installed superpowers skill into a template-backed workflow for the local claw-kit workspace.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-verification-before-completion --title "verification-before-completion"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-verification-before-completion` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Local References

- Adjacent fallback: `SUPERPOWERS-FALLBACK.md`
- Compiled knowledge: `CLAW-KNOWLEDGE.md`
- Coverage map: `CONTENT-COVERAGE.md`

## Notes

- This converted package preserves the original superpowers content beside the claw entry instead of replacing it with a summary-only surface.
- Any copied `references/`, `agents/`, or sibling helper files remain part of this skill package and should be used when the fallback or compiled knowledge points at them.
