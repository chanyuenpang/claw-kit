---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

# receiving-code-review

This claw skill recompiles the installed superpowers `receiving-code-review` workflow into a template-backed review-response path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-receiving-code-review --title "receiving-code-review"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-receiving-code-review` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this before implementing review feedback, especially when the suggestion source, scope, or correctness is uncertain.
- Preserve the source sequence: read feedback fully, understand it, verify against codebase reality, evaluate whether it is sound for this codebase, then either acknowledge technically, push back, or implement.
- The converted workflow must keep the source's strongest constraints visible: no performative agreement, no partial implementation when items are unclear, and no blind acceptance of external reviewer suggestions.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/receiving-code-review/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/receiving-code-review/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/receiving-code-review/CONTENT-COVERAGE.md)

## Notes

- This conversion is only successful if the visible template exposes the source's verification-before-implementation contract and the main pushback branches.
- The acknowledgement rules, YAGNI skepticism, and GitHub-thread reply constraint are workflow behavior, not optional commentary.
