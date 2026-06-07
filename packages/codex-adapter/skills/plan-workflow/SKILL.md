---
name: plan-workflow
description: Use when planning or editing execution state in an existing .claw project.
---

# claw-kit plan workflow

Use this skill when planning or editing execution state in an existing `.claw/` project.

## Commands

- Inspect current harness context:
  - `claw context`
- Create or bind a task plan:
  - `claw plan write --task <task> --title "<title>" --goal "<goal>"`
- Import a full plan document:
  - `claw plan write --task <task> --content <json-file>`
- Edit a plan with a structured patch:
  - `claw plan edit --task <task> --patch <json-file>`
- Change lifecycle status:
  - `claw plan edit --task <task> --plan-status process.active`

## Guardrails

- If task scope is missing, `plan write` is the first harness action.
- `plan write` is the canonical path for establishing task scope.
- When using `plan write`, write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.
- After `plan write`, read `workflowGuidance.goalMode` and create the thread goal from `workflowGuidance.goalMode.recommendedObjective` using the current host goal surface.
- After `plan write`, read `workflowGuidance`, refine the plan directly until the route is clear, and use `askUser` to confirm the route before advancing the lifecycle.
- When requirements are confirmed and execution begins, move the plan into `process.active` before updating task progress.
- After `plan edit`, read `workflowGuidance` again, use `tool_search` to locate the current session's agent-management tools, and execute the returned specialist dispatch contract directly.
- After `plan done`, read `workflowGuidance` again, use `tool_search` to locate the current session's agent-management tools, and dispatch `adr-writer` with the completed `plan.json` without waiting on a return.
- After each `plan write`, `plan edit`, and `plan done`, consume `workflowGuidance` and surface only the compact `planSummary` when it helps coordination.
- Use two-part lifecycle states:
  - `prepare.requirements`
  - `process.active`
  - `process.wait`
  - `process.discussing`
  - `end.completed`
  - `end.closed`
  - `end.leave`
- Never set `prepare.review` directly.
- `end.completed` requires `retrospective.summary`.
- Once a plan is in `process.active`, do not interrupt it unless there is a real blocker or the user explicitly changes direction.
- Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools, then use them.
