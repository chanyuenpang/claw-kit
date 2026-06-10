---
name: plan-workflow
description: Use when planning or editing execution state in an existing .claw project.
---

# claw-kit plan workflow

Use this skill when planning or editing execution state in an existing `.claw/` project.

## Commands

- Create or bind a task plan:
  - `claw plan write --title "<title>" --goal "<goal>"`
- Create a subplan under an existing task:
  - `claw subplan write --parent <task-name> --task-id <id> --title "<title>"`
- Edit a plan with a structured patch:
  - `claw plan edit --task <task> --patch <json-file>`
- Change lifecycle status:
  - `claw plan edit --task <task> --plan-status process.active`

## Guardrails

- If task scope is missing, `plan write` is the first harness action.
- `plan write` is the canonical path for establishing task scope.
- When using `plan write`, write the task title, goal, tasks, and supporting plan text in the user's preferred language unless the repository has an explicit stronger convention.
- After `plan write`, always enter goal mode first.
- After `plan write`, read `workflowGuidance.goalMode`; if the thread already has a goal, update it from `workflowGuidance.goalMode.recommendedObjective`, otherwise create it from that recommended objective.
- Treat the current `@claw-kit` thread as already authorized to use goal mode and required delegated subagents. Do not block on extra user authorization for either surface.
- After `plan write`, treat hook bootstrap as the source of startup recovery; do not insert a separate recovery workflow step.
- After `plan write`, read `workflowGuidance`, check whether requirements are already clear enough to execute, and use `askUser` only when they are not.
- Do not start implementation while the plan is still in `prepare.requirements`.
- When requirements are clear and execution begins, move the plan directly into `process.active` before doing any implementation or updating task progress.
- After `plan edit`, read `workflowGuidance` again, use `tool_search` to locate the current session's agent-management tools, and execute the returned specialist dispatch contract directly.
- After `plan done`, read `workflowGuidance` again, use `tool_search` to locate the current session's agent-management tools, and dispatch `adr-writer` with the completed `plan.json` without waiting on a return.
- After each `plan write`, `plan edit`, and `plan done`, consume `workflowGuidance` and surface only the compact `planSummary` when it helps coordination.
- Treat returned `workflowGuidance.nextStep` and `recommendedCommands` as the required next-step contract whenever they are present.
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
