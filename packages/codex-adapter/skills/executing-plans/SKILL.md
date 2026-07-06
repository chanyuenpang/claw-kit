---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# executing-plans

This claw skill recompiles the installed superpowers `executing-plans` workflow into a template-backed execution path for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, read `SUPERPOWERS-FALLBACK.md` directly and follow the original skill instructions from that fallback document and any copied helper files in this package.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-executing-plans --title "executing-plans"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-executing-plans` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the intended use of this skill in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this only when a written implementation plan already exists and the work should be executed in a separate session with review checkpoints.
- If subagents are available and the plan can be decomposed safely, prefer `subagent-driven-development` instead of executing the plan manually through this skill.
- Preserve the source control flow: critical review before execution, exact task-by-task execution, blocker-aware stopping behavior, and required closeout through `finishing-a-development-branch`.
- Do not treat this as a generic "go implement the plan" wrapper; the source skill is specifically about disciplined execution of an existing plan.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/executing-plans/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/executing-plans/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/executing-plans/CONTENT-COVERAGE.md)

## Notes

- This conversion is only successful if the visible template makes the pre-execution review gate, stop conditions, and finish-branch handoff explicit.
- Required adjacent workflows from the source skill remain part of the contract: `using-git-worktrees`, `writing-plans`, and `finishing-a-development-branch`.
