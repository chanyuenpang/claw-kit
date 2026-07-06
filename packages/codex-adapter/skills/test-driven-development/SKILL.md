---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# test-driven-development

This claw skill recompiles the installed superpowers `test-driven-development` workflow into a template-backed red-green-refactor path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-test-driven-development --title "test-driven-development"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-test-driven-development` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this before writing implementation code for features, bug fixes, refactors, or behavior changes.
- Preserve the source iron law: no production code without a failing test first.
- The converted workflow must keep the true order visible: write failing test, verify it fails for the right reason, write minimal code, verify green, refactor while staying green, then repeat.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/test-driven-development/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/test-driven-development/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/test-driven-development/CONTENT-COVERAGE.md)
- Anti-pattern reference: [testing-anti-patterns.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/test-driven-development/testing-anti-patterns.md)

## Notes

- This conversion is only successful if the visible template preserves the mandatory verification checkpoints and the source's "delete code and start over" stop condition when implementation happened before the failing test.
- Good-test qualities, rationalization traps, and anti-pattern routing remain workflow behavior, not optional commentary.
