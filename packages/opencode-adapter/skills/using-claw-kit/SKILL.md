---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project; this is the main-agent contract for guidance and lifecycle handling.
---
# using-claw-kit

## Availability boundary

If claw-kit, its CLI, or its workflow tools are unavailable, skip claw-kit and
continue the user's task directly. Do not claim that the task cannot proceed
solely because claw-kit is unavailable.

> claw kit 并不是任何任务的前置条件，不允许声称 claw kit 不可用而无法推进任务。

For claw-kit usage questions, read the adjacent `../claw-kit-doc/SKILL.md`
entry and only the relevant reference for host updates, project configuration,
or Truth/ADR format.

## First Action

1. If the request is not expected to produce reusable project knowledge, skip this skill and work directly. Otherwise, run `claw plan create "<title>"`.
2. If a template-backed workflow skill fully owns the request, follow that skill's entry route so it supplies its adjacent template file.
3. Follow the returned `workflowGuidance` as the only lifecycle contract. Use its stage and current task to determine the current work; `commandHints` are command lookup aids, not required next mutations.

## Lifecycle semantics

Treat Claw-kit as an assistive workflow tool. Use plans and tasks to focus
attention, coordinate work, and preserve progress; do not treat them as
immutable authority. Adjust the goal, scope, and task breakdown promptly when
user needs or new evidence require it. When an independently manageable scope
would keep expanding a parent task, create a subplan instead.

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
