---
name: planning
description: Use when new work needs a .claw task scope and initial plan.
---

# claw-kit planning

This skill ports the intent of OpenClaw planning into Codex.

## When to use

Use this when the request is more than a tiny one-file change, or when task shape, dependencies, or completion criteria are unclear.

## Planning principles

- Separate responsibilities:
  - implementation
  - verification
  - review
- Prefer atomic tasks:
  - one task, one clear responsibility
  - independently completable
  - no mixed concerns when the workflow would forbid them
- Decompose by:
  - shared foundations first
  - core logic second
  - integration third
  - verification last

## Complexity heuristic

Use formal planning when any of these are true:

- multiple files or modules are involved
- requirements are still fuzzy
- dependencies are unclear
- the user is asking for a real workflow rather than a tiny patch

## Required plan shape

The active task plan should be created with `claw plan write` and should capture:

- `goal.text`
- `tasks`
- `rules`
- `references`
- `keyDecisions` when real decisions already exist

When the task is substantial, align task decomposition with the workflow patterns in `../../references/workflows.md`.

## Recommended workflow coverage

A solid plan should usually represent:

- requirements or framing
- implementation
- verification
- optional review or cleanup when the task warrants it

If the task is investigation-only, align it with the `Research` workflow from `../../references/workflows.md` and prefer an explicit research stage over prematurely mixing research with implementation.

Simple 1-2 task plans can stay lean. Bigger plans should show explicit decomposition.

## How to write

1. Clarify the task boundary.
2. If prior project context is likely relevant, run `claw search --query "<topic>"` before `claw plan write`.
3. Identify affected modules and shared foundations.
4. Break the work into atomic tasks.
5. Put durable constraints into `rules`.
6. Put files, evidence, and search anchors into `references`.
7. Use `claw plan write` to establish the task scope.
8. Write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.
9. Read the returned `workflowGuidance`.
10. Merge the old plan-review quality bar into the plan immediately: improve task atomicity, completion clarity, verification coverage, and workflow fit before advancing it.
11. If `workflowGuidance.askUser` is present, use Codex option-style confirmation to resolve route choices instead of freeform clarification.

If a task or subtask is primarily investigation:

- keep it separate from implementation work
- prefer delegating the investigation to a `researcher` specialist
- keep the main agent focused on coordination, decision-making, and downstream execution

## Guardrails

- Do not use task memory as the primary place for new task context.
- Use `claw search` as the Codex-facing recall command in workflow text.
- Do not jump straight into execution if the plan still lacks key stages.
- Do not merge investigation and implementation into one task when the workflow should preserve a separate research phase.
- Do not treat `prepare.review` as user-settable. It is an internal review gate.
- Keep `plan write` as the canonical task-binding mechanism. Do not invent a second task-scope workflow.
- Treat `workflowGuidance` returned by plan commands as the canonical next-step contract once the plan exists.
