---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project; this is the main-agent contract for guidance and lifecycle handling.
---
# using-claw-kit

If the request is not expected to produce reusable project knowledge, skip this skill and work directly.

## First Action

1. By default, run `claw plan create "<title>"`.
2. If a template-backed workflow skill fully owns the request, follow that skill's entry route so it supplies its adjacent template file.
3. Follow the returned `workflowGuidance` as the only lifecycle contract. Use its stage and current task to determine the current work; `commandHints` are command lookup aids, not required next mutations.

## Lifecycle semantics

A plan is the task's container, not a frozen script: even while `process.active` is advancing, adapt its requirements, scope, and tasks to new user needs. Keep the plan current rather than forcing changed work through stale tasks.

- For a complex sub-task with an independently manageable scope, prefer `claw subplan create` to hand it off into a smaller task boundary instead of continually expanding the parent plan.

- `process.discussing`: execution is paused for user discussion. It is a stable cross-turn state that can start a plan or be re-entered from `process.active`; do not implement, enter Goal Mode, convert it to `wait`, or close it before the discussion is settled.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: when execution becomes blocked on user input or an external dependency, proactively move the plan to `process.wait`, then stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; record the retrospective and durable key decisions, then close the plan through that guidance.

## Investigation

Use `claw-kit:researcher` for bounded code or implementation investigations when it reduces main-thread context consumption.

## Hard boundaries

- Edit canonical plan state only through claw commands supplied or permitted by returned guidance; never compensate for a failed host action by repeating a canonical transition.
- Do not infer hidden workflow steps from static prose or edit `plan.json` directly.
- Keep claw harness mechanics out of normal thread replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
