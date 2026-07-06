---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

# dispatching-parallel-agents

This claw skill recompiles the installed superpowers `dispatching-parallel-agents` workflow into a template-backed delegation process for the Codex plugin.

## No-.claw Fallback

If the current workspace does not contain a `.claw` directory, follow [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/SUPERPOWERS-FALLBACK.md) directly.

## Entry Routing

- Direct single-target request: use `claw plan create --template superpowers-dispatching-parallel-agents --title "dispatching-parallel-agents"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template superpowers-dispatching-parallel-agents` when execution reaches a task that explicitly asks to use this skill.
- Batch or mixed request: create a normal root claw plan first, describe the parallel-dispatch need in the relevant task, and instantiate this template only when execution reaches that task.

## Runtime Contract

- Use this only when there are 2+ genuinely independent problem domains.
- The converted workflow must preserve the source distinctions between independent vs related failures, parallel vs sequential dispatch, focused agent prompts, and post-dispatch integration checks.
- Delegation quality matters as much as concurrency: each agent task must be narrow, self-contained, and explicit about expected output.

## Local References

- Compiled knowledge: [CLAW-KNOWLEDGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/CLAW-KNOWLEDGE.md)
- Full source fallback: [SUPERPOWERS-FALLBACK.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/SUPERPOWERS-FALLBACK.md)
- Coverage map: [CONTENT-COVERAGE.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/CONTENT-COVERAGE.md)
- Agent descriptor: [agents/openai.yaml](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/dispatching-parallel-agents/agents/openai.yaml)

## Notes

- This conversion is only successful if the visible template expresses the source decision points instead of only copying example failures into a generic wrapper.
