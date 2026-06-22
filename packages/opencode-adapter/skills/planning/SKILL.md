---
name: planning
description: Use when new work needs a .claw task scope and initial plan.
---
# claw-kit planning

## Commands

- `claw plan write "<title>" [--goal "<goal>"]`
- `claw direct`
- `claw plan edit --task <task> --patch <json-file>`
- `claw plan edit --task <task> --plan-status process.active`

## When to use

Use this when the request is more than a tiny one-file change, or when task shape is unclear.

## Planning principles

- Treat the plan as a decision memo, not a todo list.
- Separate responsibilities: implementation, verification, review.
- Converge on the round goal before listing actions.
- Write boundaries before steps.
- Prefer atomic tasks.
- Keep stages separable: research, decision, implementation, verification, closure.

## Complexity heuristic

| Dimension | Simple (1) | Medium (2) | Complex (3) |
| --- | --- | --- | --- |
| Files/modules | 1 file | 2-3 files | 4+ files |
| Requirement clarity | fully clear | small unknowns | fuzzy |
| Dependency clarity | isolated | known deps | unclear |
| Workflow shape | tiny patch | short verify | real workflow |

- score < 6: use direct claw path
- score >= 6: enter the planning workflow

## Lifecycle states

- `prepare.requirements`
- `process.active`
- `process.wait`
- `process.discussing`
- `end.completed` (requires `retrospective.summary`)
- `end.closed`

## Guardrails

- If task scope is missing, `plan write` is the first harness action.
- Treat `workflowGuidance` returned by plan commands as the canonical next-step contract.