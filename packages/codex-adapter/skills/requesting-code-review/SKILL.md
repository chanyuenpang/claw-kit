---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# requesting-code-review

This claw skill recompiles the installed superpowers `requesting-code-review` workflow into a template-backed reviewer-dispatch path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-requesting-code-review --title "requesting-code-review"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-requesting-code-review` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this when work is ready for review: after a major task, after a major feature, before merge, or at a meaningful checkpoint where early review prevents issue compounding.
- Preserve the source flow: confirm review timing, define the diff boundary with SHAs, dispatch a focused reviewer with explicit context, then act on returned issues by severity.
- The converted workflow must keep the source's hard expectations visible: do not skip review because work looks simple, do not ignore critical issues, and do not proceed past important issues that should block forward progress.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/requesting-code-review/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/requesting-code-review/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/requesting-code-review/CONTENT-COVERAGE.md)
- Reviewer prompt asset: [code-reviewer.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/requesting-code-review/code-reviewer.md)

## Notes

- This conversion is only successful if the visible template makes the review timing, SHA scoping, and issue-severity response policy explicit.
- The code reviewer should receive work-product context, not your session history; that constraint is part of the workflow contract.
