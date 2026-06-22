---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---
# using-claw-kit

Claw-kit is designed to write and reuse truth-doc and ADR-doc in a plan framework.

Use this skill first whenever claw-kit workflow is active.

This is the main-agent entry skill. Keep it compact.
If the user explicitly asks to initialize a non-claw project, route to `../init/SKILL.md`.

## Core execution chain

`user prompt` -> `claw plan write` -> `follow workflowGuidance` -> `claw search (when useful)` -> `plan status: process.active` -> `process task 1` -> `dispatch truth-writer` -> `process task 2` -> `...` -> `all tasks done` -> `update retrospective + keyDecisions` -> `dispatch adr-writer` -> `claw plan done` -> `closeout checks`

1. Read `../planning/SKILL.md`.
2. Create or bind task scope through `claw plan write`.
3. After every `claw plan write`, `claw plan edit`, or `claw plan done`, follow returned `workflowGuidance`.
4. Run `claw search --query "<topic>"` after `claw plan write` when prior context is relevant.
5. Move the plan to `process.active` once requirements are clear.
6. Process one task at a time, update progress with `claw plan edit`.
7. After a completed task, dispatch `truth-writer` when there is reusable context.
8. When all tasks done, update `retrospective` and `keyDecisions`, dispatch `adr-writer`.
9. Close with `claw plan done` after `retrospective.summary` exists.

## First action

Read `../planning/SKILL.md`. If complexity score < 4, use direct claw path.

## Truth and ADR

Dispatch using the `task` tool:
- `task(subagent_type="claw-truth-writer", prompt="<completed task report>")`
- `task(subagent_type="claw-adr-writer", prompt="<completed plan path>")`

Prefer reusing existing same-type subagent. Dispatch `truth-writer` only when reusable truth exists. Treat `adr-writer` as required closeout for root-plan completion.

## Non-negotiable rules

- Follow returned `workflowGuidance`.
- Use `claw search` after `claw plan write`.
- Run ADR deposition before root `claw plan done`.