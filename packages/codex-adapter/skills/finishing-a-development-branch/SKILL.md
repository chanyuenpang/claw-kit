---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# finishing-a-development-branch

This claw skill recompiles the installed superpowers `finishing-a-development-branch` workflow into a template-backed completion path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-finishing-a-development-branch --title "finishing-a-development-branch"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-finishing-a-development-branch` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this only when implementation is already complete and you are deciding how to integrate, preserve, or discard that completed work.
- Preserve the source ordering: verify tests first, detect environment before offering choices, present the exact menu shape, execute the chosen option safely, and apply cleanup only when ownership rules allow it.
- The converted workflow must keep the source's hard safety constraints explicit: no merge or PR path with failing tests, no discard without typed confirmation, and no host-owned worktree cleanup.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/finishing-a-development-branch/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/finishing-a-development-branch/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/finishing-a-development-branch/CONTENT-COVERAGE.md)

## Notes

- This conversion is only successful if the visible template exposes the menu branches, safety gates, and workspace-ownership cleanup rules from the source skill.
- The exact menu wording, option count, and cleanup provenance details remain first-class behavior, not fallback-only trivia.
