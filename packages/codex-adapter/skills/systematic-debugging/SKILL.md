---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

# systematic-debugging

This claw skill recompiles the installed superpowers `systematic-debugging` workflow into a template-backed root-cause-first debugging path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-systematic-debugging --title "systematic-debugging"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-systematic-debugging` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this before proposing or implementing fixes for bugs, test failures, build failures, integration issues, performance problems, or unexpected behavior.
- Preserve the source's iron law: no fixes before root cause investigation.
- The converted workflow must keep the four debugging phases explicit and preserve the hard stop rules around guessing, bundling fixes, and continuing after repeated failed fixes without questioning the architecture.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/systematic-debugging/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/systematic-debugging/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/systematic-debugging/CONTENT-COVERAGE.md)
- Root-cause tracing reference: [root-cause-tracing.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/systematic-debugging/root-cause-tracing.md)
- Defense-in-depth reference: [defense-in-depth.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/systematic-debugging/defense-in-depth.md)
- Condition-based waiting reference: [condition-based-waiting.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/systematic-debugging/condition-based-waiting.md)

## Notes

- This conversion is only successful if the visible template enforces the phase order and stop conditions instead of collapsing them into a generic debugging checklist.
- Supporting techniques like root-cause tracing and condition-based waiting remain first-class runtime references because the source skill treats them as part of the debugging method, not optional reading.
