---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project; this is the main-agent contract for guidance and lifecycle handling.
---
# using-claw-kit

If the request is not expected to produce reusable project knowledge, skip this skill and work directly.

## First Action

1. By default, run `claw plan create "<title>"`.
2. If a template-backed workflow skill fully owns the request, select it at creation instead: `claw plan create --template <template-id> --title "<title>"`.
3. Follow the returned `workflowGuidance` as the only next-step execution contract.

## Lifecycle semantics

- `process.discussing`: a stable cross-turn state for planning and user collaboration. Do not implement, enter Goal Mode, convert it to `wait`, or close it merely because discussion continues.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: active execution is blocked on user input or an external dependency. Stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; record the retrospective and durable key decisions, then close the plan through that guidance.

## Hard boundaries

- Edit canonical plan state only through claw commands supplied or permitted by returned guidance; never compensate for a failed host action by repeating a canonical transition.
- Do not infer hidden workflow steps from static prose or edit `plan.json` directly.
- Keep claw harness mechanics out of normal thread replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
